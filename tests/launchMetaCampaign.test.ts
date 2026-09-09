// Launching a Meta campaign from Master Chat.
//
// THE GAP THIS CLOSES: asking Master Chat for an ad campaign produced
// a text plan and "go to the Ads Manager page". Not a wording bug —
// there was no launch tool in the registry at all, and TWO inputs
// explicitly instructed the referral (the generate_ad_plan description
// and a system-prompt line saying "You CANNOT launch real ads").
// Every backend layer built for this — PAUSED-on-create, the budget
// clamp, the account gate, [meta] logging — was reachable only from a
// page.
//
// So the tests here are in two halves: the tool exists and behaves,
// and the instructions that used to send people away no longer do.

import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "child_process";
import { BUSINESS_BRAIN_TOOLS } from "@/lib/businessBrain/toolRegistry";
import { getActionPolicy } from "@/lib/executionPolicy";
import { ALWAYS_REQUIRES_APPROVAL, ACTION_RISK } from "@/lib/publish/types";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "d".repeat(64);

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

describe("the tool is registered and honest about what it does", () => {
  const tool = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "launch_meta_campaign");

  it("exists in the catalog", () => {
    expect(tool).toBeDefined();
  });

  it("is CHAT ONLY", () => {
    // The decision rests on seeing the creative. Read aloud on a call,
    // "approve this ad?" asks about something the person cannot see.
    expect(tool!.channels).toEqual(["chat"]);
  });

  it("says it never launches directly and never sends them to a page", () => {
    const d = tool!.description.toLowerCase();
    expect(d).toContain("never launches it directly");
    expect(d).toMatch(/inline in the chat/);
    expect(d).not.toMatch(/ads manager|paid ads page/);
  });
});

describe("the policy treats it as a real action", () => {
  it("requires approval", () => {
    expect(getActionPolicy("launch_ad_campaign")?.requiresApproval).toBe(true);
  });

  it("is in the always-approve list, so no amount can exempt it", () => {
    expect(ALWAYS_REQUIRES_APPROVAL).toContain("launch_ad_campaign");
  });

  it("is classified high risk — real public objects in the merchant's account", () => {
    expect(ACTION_RISK.launch_ad_campaign).toBe("high");
  });
});

describe("the handler's safety rules, read from the committed source", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("the slice is not empty, so these assertions are not vacuous", () => {
    expect(handler.length).toBeGreaterThan(500);
  });

  it("NEVER calls Meta itself — writes go through the platform module", () => {
    // The same rule publishContract.test.ts enforces for Shopify. A
    // shortcut here would bypass the approval entirely.
    expect(handler).not.toMatch(/metaPost|launchPausedCampaign/);
    expect(handler).toMatch(/createPublishAction/);
  });

  it("checks the connection and the account BEFORE generating anything", () => {
    // A plan and an image are two model calls. Spending them on an
    // account that cannot run ads wastes them and delays the real
    // answer.
    const connIdx = handler.indexOf("isn't connected yet");
    const acctIdx = handler.indexOf("acct.usable");
    const planIdx = handler.indexOf("await makePlan(");
    expect(connIdx).toBeGreaterThan(-1);
    expect(acctIdx).toBeGreaterThan(-1);
    expect(connIdx).toBeLessThan(planIdx);
    expect(acctIdx).toBeLessThan(planIdx);
  });

  it("prefers a budget the person actually stated over the model's guess", () => {
    expect(handler).toMatch(/plan\.daily_budget = statedBudget/);
  });

  it("tells them when the request was already waiting, WITHOUT sending them away", () => {
    expect(handler).toMatch(/already asked for this/i);
    expect(handler).not.toMatch(/ads manager|approvals page|go to \/dashboard/i);
  });
});

describe("the card carries the decision inline", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const card = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {', brain.indexOf("function extractArtifact")),
    brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("function extractArtifact"))
  );

  it("passes the approval id so Approve/Reject render on the card", () => {
    expect(card).toMatch(/approval: result\.approval_id/);
  });

  it("shows the creative — the picture is most of what is being approved", () => {
    expect(card).toMatch(/url: result\.image_url/);
  });

  it("states that nothing runs until activated", () => {
    expect(card).toMatch(/Paused until you activate/i);
  });
});

// ---------------------------------------------------------------
// The two instruction sources that produced the regression.
// ---------------------------------------------------------------
describe("nothing tells the model to send someone to a page for a Meta launch", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");

  it("the generate_ad_plan description points at the tool, not a page", () => {
    const start = brain.indexOf('name: "generate_ad_plan"');
    const desc = brain.slice(start, brain.indexOf("input_schema", start));
    expect(desc).toContain("launch_meta_campaign");
    // It may still NAME Ads Manager in order to forbid it; what it must
    // not do is instruct the referral.
    expect(desc).not.toMatch(/tell the person to use the Ads Manager/i);
  });

  it("the system prompt no longer claims ads cannot be launched", () => {
    const prompt = brain.slice(brain.indexOf("const systemPrompt = "));
    expect(prompt).not.toMatch(/You CANNOT launch real ads/);
    expect(prompt).toMatch(/You CAN launch Meta/);
    expect(prompt).toMatch(/launch_meta_campaign/);
  });

  it("the system prompt is still honest about the platforms that CANNOT launch", () => {
    // Google, LinkedIn, Pinterest and Snapchat genuinely have only
    // planning tools. Fixing the Meta claim must not overcorrect into
    // implying every platform can launch — that would produce the
    // opposite failure, promising something no tool can do.
    const prompt = brain.slice(brain.indexOf("const systemPrompt = "));
    expect(prompt).toMatch(/Google, LinkedIn, Pinterest,? (and )?Snapchat/);
    expect(prompt).toMatch(/cannot launch it yet/i);
  });
});

// ---------------------------------------------------------------
// The platform module.
// ---------------------------------------------------------------
describe("the Meta platform module", () => {
  const DRAFT = {
    id: "draft-1",
    dealership_id: "d1",
    status: "draft",
    plan_json: { headline: "Diwali Sale", body: "Limited time", daily_budget: 500, targeting_city: "Lucknow" },
    generated_image_url: "https://cdn/ad.png",
  };
  const CONN = {
    business_category: "candles",
    fb_page_id: "page_1",
    fb_lead_form_id: "form_1",
    fb_ad_account_id: "act_999",
    fb_page_access_token: "TOKEN",
    fb_page_access_token_encrypted: null,
    fb_min_daily_budget: 9491,
    fb_currency: "INR",
    fb_account_status: 1,
    fb_limits_checked_at: new Date().toISOString(),
  };

  function db(conn: any = CONN, draft: any = DRAFT) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: table === "ad_creatives" ? draft : conn }) }),
            maybeSingle: async () => ({ data: table === "ad_creatives" ? draft : conn }),
          }),
        }),
        update: () => ({ eq: async () => ({ data: null }) }),
      }),
    };
  }

  async function platform(conn?: any, draft?: any) {
    const { createMetaPlatform } = await import("@/lib/publish/platforms/meta");
    return createMetaPlatform({ supabase: db(conn, draft) as any });
  }

  const action = {
    id: "act-1", dealershipId: "d1", platform: "meta" as const, connectionRef: null,
    actionKey: "launch_ad_campaign" as const, targetRef: "draft-1", targetLabel: "Diwali Sale",
    requestedChanges: {}, preview: null, previewedAt: null, status: "draft" as const, idempotencyKey: "k",
  };

  it("supports exactly one action", async () => {
    expect((await platform()).supports).toEqual(["launch_ad_campaign"]);
  });

  it("preview describes the campaign and NEVER calls Meta to create anything", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    const r = await (await platform()).preview(action);
    expect(r.ok).toBe(true);
    // The limits are cached and fresh, so nothing should go out.
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("preview says plainly that nothing spends yet", async () => {
    const r = await (await platform()).preview(action);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/Nothing spends yet/i);
  });

  it("preview warns when the budget was raised to the account minimum", async () => {
    const cheap = { ...DRAFT, plan_json: { ...DRAFT.plan_json, daily_budget: 50 } };
    const r = await (await platform(CONN, cheap)).preview(action);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/minimum.*raised/i);
  });

  it("preview refuses a disabled ad account", async () => {
    const r = await (await platform({ ...CONN, fb_account_status: 2 })).preview(action);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/disabled/i);
  });

  it("preview refuses when Facebook is not connected", async () => {
    const r = await (await platform({ ...CONN, fb_page_access_token: null, fb_page_access_token_encrypted: null })).preview(action);
    expect(r.ok).toBe(false);
  });

  it("preview refuses an incomplete draft rather than previewing a blank ad", async () => {
    const r = await (await platform(CONN, { ...DRAFT, generated_image_url: null })).preview(action);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/incomplete/i);
  });

  it("every change has a null before-value, because this creates", async () => {
    const r = await (await platform()).preview(action);
    expect(r.ok && r.preview.changes.every((c) => c.before === null)).toBe(true);
  });

  it("execute does NOT relaunch a draft that already went live", async () => {
    // The idempotency hazard for a create: not a stale before-value,
    // but the same approved draft being launched twice.
    const launched = { ...DRAFT, status: "launched", meta_ad_id: "ad_1", meta_campaign_id: "camp_1" };
    const r = await (await platform(CONN, launched)).execute(action);
    expect(r.ok).toBe(true);
    expect(r.ok && (r.platformResponse as any).already).toBe(true);
  });

  it("execute re-checks the account status at execution time", async () => {
    // An account can be disabled between approval and execution.
    const r = await (await platform({ ...CONN, fb_account_status: 2 })).execute(action);
    expect(r.ok).toBe(false);
  });
});

describe("execute uses the approved creative, never a fresh one", () => {
  it("the module never regenerates the plan or the image", async () => {
    // THE LOAD-BEARING PROPERTY. A regenerated creative means the ad
    // that runs is not the ad that was approved — the same class of
    // failure the price path's before-value re-verification prevents.
    const source = committed("src/lib/publish/platforms/meta.ts");
    const execute = source.slice(source.indexOf("async execute("));
    expect(execute).not.toMatch(/generateAdPlan|buildCreativeWithoutPhoto|generateAdImageFromDescription/);
    expect(execute).toMatch(/draft\.generated_image_url/);
    expect(execute).toMatch(/plan: draft\.plan_json/);
  });
});
