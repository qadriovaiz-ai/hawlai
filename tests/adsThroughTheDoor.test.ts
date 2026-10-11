// PHASE 3.5, STEP 5: the ads.
//
//   paidAdsAgent      its customer-facing ad_copy task
//   retargetingAgent  the ad a customer sees after visiting the site
//   adEngine          the launcher's headline and body
//
// AND AN F-01 THAT WAS STILL LIVE IN adEngine, three days after the
// same shape was fixed everywhere else:
//
//     const plan = await draftAdPlan(...);
//     if (!facts) return plan;          // no check, no marker
//
// A failed records read returned an ad plan with nothing checked and
// nothing saying so, on a path that spends the owner's money.
//
// WHY adEngine USES guardCopyFields AND NOT THE WHOLE DOOR. Its one
// model call extracts headline, body, budget, city and an image scene
// together, with its own self-critique retry loop. The door cannot
// write that shape, but the ORDER OF THE CHECKS afterwards is the
// door's, and that is the part that kept drifting between surfaces.
// tests/oneDoorForCopy.test.ts counts the surfaces allowed to do this,
// so it cannot spread quietly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

let prompts: string[];
function anthropic(...outputs: any[]) {
  const replies = [...outputs];
  const last = outputs[outputs.length - 1];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = replies.length ? replies.shift() : last;
    const payload = { content: [{ type: "text", text: JSON.stringify(next) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

import { generateAdPlan as generateAdPlanTask } from "@/lib/agents/paidAdsAgent";
import { generateRetargetingCopy } from "@/lib/agents/retargetingAgent";
import { guardCopyFields } from "@/lib/content/generateCopy";

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

describe("1. paid ads: the copy task goes through the door, the planning tasks do not", () => {
  const AD = {
    headlines: ["Quieter evenings in Shahjahanpur"],
    primaryText: ["The Lavender candle is soy wax, 40 hour burn. 550."],
    descriptions: ["Ships across Shahjahanpur"],
  };

  it("AD COPY GETS THE CUSTOMER-FIRST ORDER", async () => {
    anthropic(AD);
    await generateAdPlanTask("google", "ad_copy", "Candle by Qaaf", "Home fragrance", null, undefined, null, undefined, facts());
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
  });

  it("AND KEEPS THE PLATFORM-ACCURACY RULE", async () => {
    // The surface's own brief must survive the move.
    anthropic(AD);
    await generateAdPlanTask("google", "ad_copy", "Candle by Qaaf", "Home fragrance", null, undefined, null, undefined, facts());
    expect(prompts[0]).toMatch(/never invent platform features that don't exist/i);
  });

  it("AN INVENTED DISCOUNT IN AD COPY IS STRIPPED", async () => {
    anthropic({ headlines: ["50% off everything"], primaryText: ["Lavender candle, soy wax, 40 hour burn. 550."], descriptions: ["Shahjahanpur"] });
    const r: any = await generateAdPlanTask("google", "ad_copy", "Candle by Qaaf", "Home fragrance", null, undefined, null, undefined, facts());
    expect(JSON.stringify(r.output.headlines)).not.toMatch(/50% off/);
    expect(r.claimsRemoved.length).toBeGreaterThan(0);
  });

  it("A PLANNING TASK IS LEFT ALONE — budget advice is not a claim about the business", async () => {
    // The reason predates this phase and is recorded at
    // CUSTOMER_COPY_TASKS: running the copy guard over "start at ₹300 a
    // day" would strip legitimate guidance.
    anthropic({ objective: "Leads", campaignStructure: "One campaign, two ad groups", targetingSummary: "Shahjahanpur, 25-45", suggestedFormats: ["Search", "Performance Max"] });
    const r: any = await generateAdPlanTask("google", "campaign_brief", "Candle by Qaaf", "Home fragrance", null, undefined, null, undefined, facts());
    expect(prompts[0]).not.toMatch(/WHO THIS IS FOR: the reader, not the business/);
    expect(r.output.suggestedFormats).toHaveLength(2);
    expect(r.claimsRemoved).toBeUndefined();
  });
});

describe("2. retargeting", () => {
  const COPY = {
    headline: "Still thinking it over?",
    primaryText: "The lavender candle is soy wax, 40 hour burn. 550.",
    cta: "Shop Now",
    variant2Headline: "Left something behind?",
    variant2PrimaryText: "It is still there when you are ready.",
  };

  it("THE CUSTOMER-FIRST ORDER AND THE TRUTH RULES REACH THE PROMPT", async () => {
    anthropic(COPY);
    await generateRetargetingCopy("abandoned_cart", "Candle by Qaaf", "Home fragrance", "1 cart", undefined, undefined, facts());
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
  });

  it("AN INVENTED OFFER IS STRIPPED AND THE OWNER IS TOLD", async () => {
    anthropic({ ...COPY, primaryText: "Come back for 20% off and free shipping." });
    const r: any = await generateRetargetingCopy("abandoned_cart", "Candle by Qaaf", "Home fragrance", "1 cart", undefined, undefined, facts());
    expect(r.primaryText).not.toMatch(/20% off|free shipping/i);
    // THE NOTE TRAVELS. Rebuilding the object field by field dropped
    // _claimsNote and two existing tests caught it: the owner would
    // have seen copy with a line quietly missing and no word on why.
    expect(String(r._claimsNote)).toMatch(/Hawlai removed/);
  });

  it("A FIELD THE GUARD EMPTIES FALLS BACK TO THE HONEST LINE, never blank", async () => {
    anthropic({ ...COPY, variant2PrimaryText: "We are India's number 1 candle brand." });
    const r: any = await generateRetargetingCopy("abandoned_cart", "Candle by Qaaf", "Home fragrance", "1 cart", undefined, undefined, facts());
    expect(r.variant2PrimaryText.trim()).not.toBe("");
    expect(r.variant2PrimaryText).not.toMatch(/number 1/i);
  });

  it("honest copy comes back as written", async () => {
    anthropic(COPY);
    const r: any = await generateRetargetingCopy("abandoned_cart", "Candle by Qaaf", "Home fragrance", "1 cart", undefined, undefined, facts());
    expect(r.headline).toBe(COPY.headline);
    expect(r.primaryText).toBe(COPY.primaryText);
  });
});

describe("3. adEngine: the checks without the generation", () => {
  const INVENTED_STORY = "We started in a borrowed saucepan on a kitchen floor.";

  it("THE CHECKS RUN IN THE SAME ORDER", async () => {
    const r = guardCopyFields({ headline: "Quieter evenings", body: "Unlike the standard candles on the shelf, ours is steady." }, { facts: facts(), mode: "draft" });
    expect(r.output.body).not.toMatch(/Unlike the standard candles/);
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("AN UNBACKED STORY GOES, so provenance reaches this path too", () => {
    const r = guardCopyFields({ headline: "Quieter evenings", body: INVENTED_STORY }, { facts: facts(), mode: "publish" });
    expect(r.narrative).toHaveLength(1);
    expect(r.output.body).not.toMatch(/borrowed saucepan/);
  });

  it("IT DOES NOT FAIL OPEN — the F-01 that was still live here", () => {
    // `if (!facts) return plan` returned an ad plan with no check and
    // no marker. The state is named now, either way.
    const r = guardCopyFields({ headline: "Quieter evenings", body: INVENTED_STORY }, { facts: null, mode: "publish" });
    expect(r.output.body).not.toMatch(/borrowed saucepan/);
    expect(r.output._factsState).toBe("FACTS_UNAVAILABLE");
  });

  it("AND IT MAKES NO MODEL CALL", async () => {
    // The whole point of this half: the caller already has its draft.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    guardCopyFields({ headline: "Quieter evenings", body: "Soy wax, 40 hour burn. 550." }, { facts: facts(), mode: "draft" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an invented key never survives it either", () => {
    const r = guardCopyFields({ headline: "Quieter evenings", body: "Soy wax, 550.", Concrete_details_used: "40 hour burn" } as any, { facts: facts(), mode: "draft" });
    expect(JSON.stringify(r.output)).not.toMatch(/Concrete_details_used/);
  });

  it("honest ad copy is untouched", () => {
    // The body names the product, which is what isGeneric looks for:
    // a piece carrying nothing only this business could say is generic
    // whether or not it makes a false claim.
    const honest = "The Lavender candle is soy wax, 40 hour burn. 550.";
    const r = guardCopyFields({ headline: "Quieter evenings", body: honest }, { facts: facts(), mode: "draft" });
    expect(r.output.body).toBe(honest);
    expect(r.removed).toEqual([]);
    expect(r.publishable).toBe(true);
  });
});
