// Starting and pausing a Meta campaign from chat.
//
// WHY: asked to activate a campaign, chat said "Meta's final go-live
// switch is on their platform" and pointed at Ads Manager. Invented —
// Meta's API sets campaign status like any other field, and this
// codebase already did it from the dashboard. There was no tool, and the
// model rationalised the gap into a rule, the same way it once invented
// a "security restriction" on saving a website URL.

import { describe, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "child_process";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { resolveCampaign, type CampaignRow } from "@/lib/ads/resolveCampaign";
import { getActionPolicy } from "@/lib/executionPolicy";
import { ALWAYS_REQUIRES_APPROVAL, ACTION_RISK } from "@/lib/publish/types";
import { BUSINESS_BRAIN_TOOLS } from "@/lib/businessBrain/toolRegistry";
import { extractArtifact } from "@/lib/agents/masterBrainV2";
import { isSimpleConfirmation } from "@/lib/chat/cardLayout";

afterEach(() => vi.unstubAllGlobals());

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

const LAVENDER: CampaignRow = { id: "row-1", headline: "Ghar ko do lavender ki shanti", car_type: "Lavender candle", daily_budget: 100, meta_status: "PAUSED", meta_campaign_id: "120254652336640260", meta_adset_id: "120254652336770260", meta_ad_id: "120254652337290260" };
const ROSE: CampaignRow = { id: "row-2", headline: "Rose candle Diwali offer", car_type: "Rose candle", daily_budget: 150, meta_status: "PAUSED", meta_ad_id: "ad-2" };

describe("which campaign — never guessed", () => {
  it("resolves the only campaign there is", () => {
    const r = resolveCampaign([LAVENDER], {});
    expect(r.status === "resolved" && r.campaign.id).toBe("row-1");
  });

  it("resolves a description that matches exactly one", () => {
    const r = resolveCampaign([LAVENDER, ROSE], { description: "lavender" });
    expect(r.status === "resolved" && r.campaign.id).toBe("row-1");
  });

  it("ASKS when a description matches several", () => {
    // A model picking between two similar campaigns is how the wrong ad
    // starts spending. The existing matchCampaign does exactly that —
    // which is why this does not use it.
    const r = resolveCampaign([LAVENDER, ROSE], { description: "candle" });
    expect(r.status).toBe("ambiguous");
    expect(r.status === "ambiguous" && r.candidates.length).toBe(2);
  });

  it("ASKS when nothing is named and there are several", () => {
    expect(resolveCampaign([LAVENDER, ROSE], {}).status).toBe("ambiguous");
  });

  it("accepts a follow-up id only if it was one of the options", () => {
    expect(resolveCampaign([LAVENDER, ROSE], { campaignId: "row-2" }).status).toBe("resolved");
    // A hallucinated id, or a real id belonging to another business.
    expect(resolveCampaign([LAVENDER, ROSE], { campaignId: "someone-elses" }).status).toBe("invalid_id");
  });

  it("says so when there are no campaigns at all", () => {
    expect(resolveCampaign([], { description: "lavender" }).status).toBe("none");
  });
});

describe("the two directions are gated differently, on purpose", () => {
  it("STARTING requires approval and is critical — it is the money step", () => {
    expect(getActionPolicy("activate_ad_campaign")?.requiresApproval).toBe(true);
    expect(ALWAYS_REQUIRES_APPROVAL).toContain("activate_ad_campaign");
    expect(ACTION_RISK.activate_ad_campaign).toBe("critical");
  });

  // RESTATED 4 NOVEMBER 2026, NOT LOOSENED (S6/P0). These three used to
  // slice ONE function and grep a branch out of it, because both
  // directions lived in `switchMetaCampaign` behind `if (kind ===
  // "pause")`. That shared body is why no call graph could tell the
  // money step from the free one — see pauseMetaCampaign's header — so
  // the function was split and these now slice the direction they are
  // about. Each assertion below is the same claim about a smaller piece
  // of code, which makes it stronger: a `createPublishAction` appearing
  // anywhere in the pause function now fails, where before only its
  // appearance inside one grepped-out branch did.
  function fnBody(name: string): string {
    const brain = committed("src/lib/agents/masterBrainV2.ts");
    const at = brain.indexOf(`async function ${name}(`);
    expect(at, `${name} is gone`).toBeGreaterThan(-1);
    const open = brain.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < brain.length; i += 1) {
      if (brain[i] === "{") depth += 1;
      else if (brain[i] === "}") {
        depth -= 1;
        if (depth === 0) return brain.slice(open, i + 1);
      }
    }
    throw new Error(`${name} has no closing brace`);
  }

  it("STOPPING does not go through the approval spine", () => {
    // Gating a pause would leave someone watching money burn while
    // waiting on a click. Same policy stance as auto_paused_campaign.
    expect(getActionPolicy("auto_paused_campaign")?.requiresApproval).toBe(false);
    const pause = fnBody("pauseMetaCampaign");
    expect(pause.length).toBeGreaterThan(200);
    expect(pause).not.toMatch(/createPublishAction/);
    expect(pause).toMatch(/status: "PAUSED"/);
  });

  it("the start path goes through createPublishAction with the activation key", () => {
    const activate = fnBody("activateMetaCampaign");
    expect(activate).toMatch(/actionKey: "activate_ad_campaign"/);
    expect(activate).not.toMatch(/matchCampaign/);
    // AND IT DOES NOT TOUCH META ITSELF. The approvals executor does
    // that, after the owner approves. This is what the reachability
    // test can now see, and could not while the two shared a body.
    expect(activate).not.toMatch(/setCampaignStatus|setStatus\(/);
  });

  it("AND THE TWO DIRECTIONS ARE SEPARATE FUNCTIONS, so a call graph can tell them apart", () => {
    // The property the split exists for. One function serving both
    // meant anything following activate_meta_campaign arrived at the
    // pause path's direct Meta call and read the money step as ungated
    // — and the only way to quieten that would have been to allowlist
    // the money step, which is the one entry such a list must never
    // carry.
    const brain = committed("src/lib/agents/masterBrainV2.ts");
    expect(brain).not.toMatch(/switchMetaCampaign/);
    expect(brain).toMatch(/case "activate_meta_campaign":\s*\n\s*return activateMetaCampaign\(/);
    expect(brain).toMatch(/case "pause_meta_campaign":\s*\n\s*return pauseMetaCampaign\(/);
  });

  it("does not filter candidates on the stale local status", () => {
    // Rows activated via the old ad-only path say ACTIVE locally while
    // Meta has them paused — filtering on the column would hide exactly
    // the campaigns that need fixing.
    expect(fnBody("resolveCampaignForSwitch")).not.toMatch(/\.eq\("meta_status"/);
  });
});

describe("the tools exist and do not claim a false limit", () => {
  const act = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "activate_meta_campaign");
  const pause = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "pause_meta_campaign");

  it("both are registered", () => {
    expect(act).toBeDefined();
    expect(pause).toBeDefined();
  });

  it("starting is chat-only; pausing also works on a call", () => {
    expect(act!.channels).toEqual(["chat"]);
    expect(pause!.channels).toContain("call");
  });

  it("the system prompt no longer allows the invented restriction", () => {
    const brain = committed("src/lib/agents/masterBrainV2.ts");
    const prompt = brain.slice(brain.indexOf("const systemPrompt = "));
    expect(prompt).toMatch(/activate_meta_campaign/);
    expect(prompt).toMatch(/pause_meta_campaign/);
    expect(prompt).toMatch(/NEVER say the go-live switch is only on Meta's platform/);
    // Chat once said "already live" while Ads Manager showed Off.
    expect(prompt).toMatch(/Whether a campaign is running is ONLY known from these tools/);
  });
});

describe("the Meta module runs activation for real", () => {
  const CONN = { fb_page_access_token: "TOKEN", fb_page_access_token_encrypted: null, fb_account_status: 1, fb_currency: "INR", fb_ad_account_id: "act_1", fb_page_id: "p1" };
  const AD = { id: "row-1", status: "launched", headline: LAVENDER.headline, daily_budget: 100, meta_status: "PAUSED", meta_campaign_id: "C", meta_adset_id: "S", meta_ad_id: "A", generated_image_url: "https://cdn/x.png" };
  const action = { id: "act-1", dealershipId: "d1", platform: "meta" as const, connectionRef: null, actionKey: "activate_ad_campaign" as const, targetRef: "row-1", targetLabel: "x", requestedChanges: { status: "ACTIVE" }, preview: null, previewedAt: null, status: "approved" as const, idempotencyKey: "k" };

  function db(updates: any[]) {
    return {
      from: (t: string) => {
        const api: any = {
          select: () => api,
          eq: () => api,
          update: (f: any) => { updates.push(f); return api; },
          maybeSingle: async () => ({ data: t === "dealerships" ? CONN : AD }),
          then: (r: any) => r({ data: null, error: null }),
        };
        return api;
      },
    };
  }

  function meta(effective: string) {
    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      if (init?.method === "POST") { posts.push(String(url).split("/").pop()!); return { ok: true, status: 200, json: async () => ({ success: true }) }; }
      // One answer for every read: the ad reads effective_status, the
      // ad set reads its budget (₹100/day, in paise, as Meta returns it).
      return { ok: true, status: 200, json: async () => ({ effective_status: effective, status: effective === "ACTIVE" ? "ACTIVE" : "PAUSED", campaign_id: "C", adset_id: "S", daily_budget: "10000" }) };
    }));
    return posts;
  }

  async function platform(updates: any[]) {
    const { createMetaPlatform } = await import("@/lib/publish/platforms/meta");
    return createMetaPlatform({ supabase: db(updates) as any });
  }

  it("supports activation", async () => {
    expect((await platform([])).supports).toContain("activate_ad_campaign");
  });

  it("flips all three levels and marks the row ACTIVE when Meta confirms", async () => {
    const posts = meta("ACTIVE");
    const updates: any[] = [];
    const r = await (await platform(updates)).execute(action);
    expect(r.ok).toBe(true);
    expect(posts).toEqual(["C", "S", "A"]);
    // meta_status only: production has no external_status column.
    expect(updates[0]).toEqual({ meta_status: "ACTIVE" });
  });

  it("FAILS, and leaves the row alone, when Meta still says CAMPAIGN_PAUSED", async () => {
    // The original bug, through the chat path: every flip accepted, the
    // ad still not delivering. Reported as failure, not success.
    meta("CAMPAIGN_PAUSED");
    const updates: any[] = [];
    const r = await (await platform(updates)).execute(action);
    expect(r.ok).toBe(false);
    expect(!r.ok && "reason" in r && r.reason).toMatch(/still isn't running/i);
    expect(updates).toEqual([]);
  });

  it("preview refuses a campaign Meta says is already running", async () => {
    meta("ACTIVE");
    const r = await (await platform([])).preview(action);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/already running/i);
  });

  it("preview warns plainly that approving starts spend", async () => {
    meta("CAMPAIGN_PAUSED");
    const r = await (await platform([])).preview(action);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/money starts moving/i);
  });
});

describe("the approve route does not run activation twice", () => {
  it("the legacy branch skips approvals backed by a publish action", () => {
    // Without this guard a chat activation would hit the legacy branch,
    // which looks up action_details.campaign_id — absent on these — and
    // fail the approval before the real executor ever ran.
    // H1 MOVED THE DECISION out of the route and into
    // lib/approvals/decide.ts, so the WhatsApp channel reaches the same
    // one instead of a second copy. These assertions are unchanged; only
    // the file they read moved. The route still holds the session half.
    const route = committed("src/lib/approvals/decide.ts");
    expect(route).toMatch(/action_type === "activate_ad_campaign" && !\(approval\.action_details as any\)\?\.publish_action_id/);
  });
});

describe("the cards", () => {
  it("the start card carries the approval and the creative, in the full layout", () => {
    const card = extractArtifact("activate_meta_campaign", {}, {
      success: true, activation: true, approval_id: "ap-1", action_id: "act-1",
      headline: LAVENDER.headline, summary: "Start it at ₹100.00/day.", daily_budget: "₹100.00/day",
      current_status: "CAMPAIGN_PAUSED", image_url: "https://cdn/x.png", warnings: [], note: "Ready for your approval below.",
    })!;
    expect(card.approval).toEqual({ id: "ap-1", publishActionId: "act-1" });
    expect(card.imageUrl).toBe("https://cdn/x.png");
    expect(isSimpleConfirmation(card as any)).toBe(false);
  });

  it("the pause card has no approval — it already happened", () => {
    const card = extractArtifact("pause_meta_campaign", {}, { success: true, paused: true, headline: "x", note: "Paused.", image_url: null })!;
    expect(card.approval).toBeUndefined();
    expect(card.fields!.find((f) => f.label === "Meta confirms")!.value).toMatch(/not spending/i);
  });

  it("the picker is numbered and speaks plainly about status", () => {
    const card = extractArtifact("activate_meta_campaign", {}, {
      needs_clarification: true, question: "Which campaign should I start?",
      candidates: [{ campaign_id: "row-1", headline: "A", daily_budget: 100, status: "PAUSED" }, { campaign_id: "row-2", headline: "B", daily_budget: 150, status: "ACTIVE" }],
    })!;
    const items = card.groups![0].items;
    expect(items[0].label).toMatch(/^1\. A/);
    expect(items[0].note).toMatch(/paused/);
    expect(items[1].note).toMatch(/running/);
    expect(items.map((i) => i.note).join(" ")).not.toMatch(/PAUSED|ACTIVE/);
  });
});
