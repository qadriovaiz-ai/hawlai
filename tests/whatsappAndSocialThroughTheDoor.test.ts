// PHASE 3.5, STEP 4: WhatsApp and the customer-facing social tasks.
//
// Both already had claims and provenance. Through the door they also
// get the customer-first structure, the anti-generic verdict, the
// invented-key strip and the comparative, performance and benefit
// rules.
//
// WHAT STAYS WITH EACH SURFACE:
//   WhatsApp           the opt-out line, added AFTER the claims check
//                      so it can never be stripped as a claim, and the
//                      Haiku routing (modelForTask) - hardcoding the
//                      standard model in the door would have quietly
//                      tripled the cost of every broadcast.
//   Social management  the owner-facing tasks do NOT go through the
//                      door. The reason is recorded above
//                      CUSTOMER_COPY_TASKS and predates this phase:
//                      running the copy guard over "post three times a
//                      week" would strip legitimate guidance. And
//                      viral_trends searches the web, which the door
//                      does not do.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

let prompts: string[];
let models: string[];
function anthropic(...outputs: any[]) {
  const replies = [...outputs];
  const last = outputs[outputs.length - 1];
  prompts = [];
  models = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    prompts.push(String(body.messages[0].content));
    models.push(String(body.model));
    const next = replies.length ? replies.shift() : last;
    const payload = { content: [{ type: "text", text: JSON.stringify(next) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { generateSocialTask } from "@/lib/agents/socialManagementAgent";

function facts(): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn", images: [] }],
    offers: [], pillars: [], site: null, home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    season: { today: "2026-10-11", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
  } as unknown as BusinessFacts;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("1. WhatsApp", () => {
  const ask = (over: any = {}, mode: "draft" | "publish" = "draft") =>
    generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", over.topic ?? "the lavender candle", null, undefined, undefined, facts(), mode);

  const GOOD = { message: "Evenings get loud. Lavender candle, soy wax, 40 hour burn. 550." };

  it("THE CUSTOMER-FIRST ORDER REACHES THE PROMPT", async () => {
    anthropic(GOOD);
    await ask();
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
  });

  it("AND WHATSAPP'S OWN RULES ARE STILL THERE", async () => {
    anthropic(GOOD);
    await ask();
    expect(prompts[0]).toMatch(/real person texting/i);
  });

  it("THE HAIKU ROUTING SURVIVES — the door does not force the standard model", async () => {
    // A broadcast is short copy and goes through the AI Task Router.
    // Hardcoding the standard model here would have tripled its cost.
    anthropic(GOOD);
    await ask();
    expect(models[0]).toMatch(/haiku/i);
  });

  it("A COMPARATIVE CLAIM IS STRIPPED, in a draft too", async () => {
    anthropic({ message: `${GOOD.message} Unlike the standard candles on the shelf, ours is steady.` });
    const r: any = await ask();
    // The MESSAGE, not the whole object: _claimsNote quotes the line it
    // removed, which is the point of the note. Asserting over the
    // stringified output tests the note, not the copy.
    expect(r.output.message).not.toMatch(/Unlike the standard candles/);
    expect(r.claimsRemoved.join(" ")).toMatch(/comparison/i);
  });

  it("A BENEFIT CLAIM IS KEPT IN THE DRAFT, with a note", async () => {
    anthropic({ message: `${GOOD.message} Light one before bed and sleep better.` });
    const r: any = await ask();
    expect(JSON.stringify(r.output)).toContain("sleep better");
    expect(r.substantiation.join(" ")).toMatch(/sleep better/);
  });

  it("AN INVENTED KEY NEVER REACHES THE MESSAGE", async () => {
    anthropic({ ...GOOD, Concrete_details_used: "40 hour burn" });
    const r: any = await ask();
    expect(JSON.stringify(r.output)).not.toMatch(/Concrete_details_used/);
  });

  it("THE OPT-OUT LINE IS STILL ADDED, and after the guard", async () => {
    // It goes on in code so it is never forgotten, and after the claims
    // check so it can never be stripped as a claim.
    anthropic(GOOD);
    const r: any = await ask();
    expect(JSON.stringify(r.output)).toMatch(/Reply STOP/i);
  });

  it("an honest broadcast comes back unchanged", async () => {
    anthropic(GOOD);
    const r: any = await ask();
    expect(r.output.message).toContain("Evenings get loud");
    expect(r.claimsRemoved).toEqual([]);
  });
});

describe("2. the customer-facing social tasks", () => {
  const GOOD = { replies: ["Thanks! The lavender one is soy wax, 40 hour burn, 550."] };

  it("REPLY SUGGESTIONS GO THROUGH THE DOOR", async () => {
    anthropic(GOOD);
    await generateSocialTask("reply_suggestions", "Candle by Qaaf", "Home fragrance", "is this soy wax?", null, undefined, null, undefined, facts());
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
  });

  it("AND AN INVENTED OFFER IN A SUGGESTED REPLY IS STRIPPED", async () => {
    anthropic({ replies: ["Thanks! Everything is 50% off this week."] });
    const r: any = await generateSocialTask("reply_suggestions", "Candle by Qaaf", "Home fragrance", "any discount?", null, undefined, null, undefined, facts());
    // The replies themselves. _claimsNote quotes what it took out.
    expect(JSON.stringify(r.output.replies)).not.toMatch(/50% off/);
    expect(r.claimsRemoved.length).toBeGreaterThan(0);
  });

  it("WHAT WAS POSTED RECENTLY IS PASSED AS recent, not pasted into the brief", async () => {
    anthropic(GOOD);
    await generateSocialTask("reply_suggestions", "Candle by Qaaf", "Home fragrance", "hi", null, undefined, "Slow evenings start with the lavender candle.", undefined, facts());
    expect(prompts[0]).toMatch(/do not repeat these openings, angles or phrasings/i);
    expect(prompts[0]).toContain("Slow evenings start with the lavender candle.");
  });

  it("AN OWNER-FACING TASK DOES NOT GO THROUGH THE DOOR — and that is deliberate", async () => {
    // "post three times a week" is guidance, not a claim about the
    // business, and the copy guard would strip it. The reason predates
    // this phase and is recorded above CUSTOMER_COPY_TASKS.
    anthropic({ tactics: [{ tactic: "Post three times a week", howTo: "Pick Mon, Wed, Fri" }] });
    const r: any = await generateSocialTask("growth_strategy", "Candle by Qaaf", "Home fragrance", "", null, undefined, null, undefined, facts());
    expect(prompts[0]).not.toMatch(/WHO THIS IS FOR: the reader, not the business/);
    expect(r.output.tactics).toHaveLength(1);
    expect(r.output.tactics[0].tactic).toBe("Post three times a week");
    expect(r.claimsRemoved).toBeUndefined();
  });

  it("and the owner-facing path keeps its own shape", async () => {
    anthropic({ tips: [{ tip: "Reply within an hour", why: "The feed rewards it" }] });
    const r: any = await generateSocialTask("engagement_analysis", "Candle by Qaaf", "Home fragrance", "", null, undefined, null, undefined, facts());
    expect(r.output.tips[0].tip).toBe("Reply within an hour");
  });
});

// ---------------------------------------------------------------------
// 3. THE FACEBOOK CAPTION — the surface both incidents happened on
// ---------------------------------------------------------------------
//
// generateSocialCaption had claims and provenance. Through the door it
// also gets the word cap (facebook_post, 150 words), the customer-first
// structure, the anti-generic verdict and the invented-key strip.

import { generateSocialCaption } from "@/lib/agents/socialMediaAgent";

describe("3. the Facebook caption", () => {
  it("THE CAP APPLIES, and an over-long caption is tightened not refused", async () => {
    const long = [
      "Evenings get loud in Shahjahanpur.",
      ...Array(24).fill("The Lavender candle is soy wax and it waits on the shelf for the evening."),
      "Lavender candle, 550. Order on the store page.",
    ].join(" ");
    anthropic({ caption: long });
    const r = await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, facts(), "publish");
    expect(r.caption.trim().split(/\s+/).length).toBeLessThanOrEqual(150);
    expect(r.caption).toContain("Evenings get loud");
    expect(r.caption).toContain("550");
  });

  it("THE CUSTOMER-FIRST ORDER IS IN THE PROMPT", async () => {
    anthropic({ caption: "Evenings get loud. Lavender candle, 550." });
    await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, facts(), "draft");
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
  });

  it("AN UNBACKED STORY STILL GOES — provenance by the longer route", async () => {
    anthropic({ caption: "We started in a borrowed saucepan on a kitchen floor. Lavender candle, 550." });
    const r = await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, facts(), "publish");
    expect(r.caption).not.toMatch(/borrowed saucepan/);
  });

  it("AND THE OWNER IS TOLD WHY THE LINE WENT", async () => {
    // A line removed by PROVENANCE reports on a different channel from
    // a claim, and this path returned claimsRemoved only - so the
    // sentence disappeared from the caption and the owner was told
    // nothing. Found by the assertion above failing for the right
    // reason: the story HAD gone, and claimsRemoved was empty.
    anthropic({ caption: "We started in a borrowed saucepan on a kitchen floor. Lavender candle, 550." });
    const r: any = await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, facts(), "publish");
    expect(String(r.note ?? "")).toMatch(/records/i);
  });

  it("THE UNATTENDED PATH IS STILL SINGLE-SHOT", async () => {
    // publish mode is the autopilot's, and the contract is one call.
    anthropic({ caption: "Looking for the perfect gift? We have amazing products." });
    await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, facts(), "publish");
    expect(prompts.length).toBe(1);
  });

  it("and it is told not to post when the caption reads like anyone's", async () => {
    anthropic({ caption: "Looking for the perfect gift? We have amazing products." });
    const r: any = await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, facts(), "publish");
    expect(r.publishable).toBe(false);
  });

  it("WITH NO RECORDS the caption is still checked and the state said", async () => {
    anthropic({ caption: "We are India's number 1 candle brand." });
    const r = await generateSocialCaption("the lavender candle", null, "Home fragrance", undefined, null, "publish");
    expect(r.caption).not.toMatch(/number 1/i);
    expect(r.unverified).toBeTruthy();
  });

  it("the owner's own words come back when the model fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}), headers: { get: () => null } })));
    const r = await generateSocialCaption("my own caption", null, "Home fragrance", undefined, facts(), "draft");
    expect(r.caption).toBe("my own caption");
  });
});
