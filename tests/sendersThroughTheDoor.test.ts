// PHASE 3.5, STEP 2: the messages that reach a person.
//
// Three paths, and until today each one gathered the business's facts,
// put them in the prompt, and then NOTHING LOOKED AT WHAT CAME BACK:
//
//   contentAgent      a follow-up sent to a named lead
//   retentionAgent    a message sent to an existing customer
//   influencerAgent   a DM and an email sent to an influencer
//
// They were moved up the queue from last to second for that reason.
//
// WHY THEY HAD NO GUARD, and it is worth stating because the shape
// repeats: each took its facts as a PRE-BUILT PROMPT STRING
// (`grounding`, from factsPrompt). A string can be put in a prompt but
// it cannot be checked against. The signature was the bug.
//
// AND ONE WORSE CASE. autopilotAgent drafts these follow-ups for every
// due lead in a loop, and passed `undefined` where the manual route
// passed the facts - so the unattended path wrote from nothing
// checkable AND had nothing check it. It now gathers the records once
// and runs single-shot.

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

import { generateFollowUpMessage } from "@/lib/agents/contentAgent";
import { generateRetentionMessage } from "@/lib/agents/retentionAgent";
import { generateInfluencerPlan } from "@/lib/agents/influencerAgent";

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

const LEAD: any = { id: "l1", name: "Ravi", lead_temperature: "warm", status: "new", details: null, budget: null };
const CUSTOMER: any = { id: "c1", name: "Meena", details: null };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("1. the lead follow-up", () => {
  it("THE TRUTH RULES AND THE RECORDS REACH THE PROMPT", async () => {
    anthropic({ message: "Hi Ravi, the lavender candle is soy wax with a 40 hour burn. 550. Shall I hold one?" });
    await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toContain("Lavender candle");
    expect(prompts[0]).toContain("Ravi");
  });

  it("AN INVENTED OFFER IS NOW TAKEN OUT — nothing checked this before", async () => {
    anthropic({ message: "Hi Ravi, we are giving 50% off everything this week. Shall I hold one?" });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts());
    expect(r.message).not.toMatch(/50% off/);
    expect(r.claimsRemoved?.length ?? 0).toBeGreaterThan(0);
  });

  it("A COMPARISON WITH OTHER SELLERS GOES TOO", async () => {
    anthropic({ message: "Hi Ravi. Unlike the standard candles on the shelf, ours is steady. 550." });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts());
    expect(r.message).not.toMatch(/Unlike the standard candles/);
  });

  it("AN INVENTED KEY NEVER REACHES THE MESSAGE", async () => {
    anthropic({ message: "Hi Ravi, soy wax, 40 hour burn, 550.", Concrete_details_used: "40 hour burn" });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts());
    expect(JSON.stringify(r)).not.toMatch(/Concrete_details_used/);
    expect(r.message).toContain("Hi Ravi");
  });

  it("an honest follow-up goes through word for word", async () => {
    const honest = "Hi Ravi, the lavender candle is soy wax with a 40 hour burn. 550. Shall I hold one?";
    anthropic({ message: honest });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts());
    expect(r.message).toBe(honest);
    expect(r.publishable).toBe(true);
  });

  it("THE EMAIL CHANNEL KEEPS ITS SUBJECT", async () => {
    anthropic({ subject: "About the lavender candle", message: "Hi Ravi,\n\nSoy wax, 40 hour burn. 550." });
    const r: any = await generateFollowUpMessage(LEAD, null, "email", "Home fragrance", undefined, undefined, facts());
    expect(r.subject).toBe("About the lavender candle");
    expect(prompts[0]).toMatch(/email subject line/);
  });

  it("THE UNATTENDED DRAFTING LOOP STAYS SINGLE-SHOT", async () => {
    // revise: false, which is what autopilotAgent passes.
    anthropic({ message: "Looking for the perfect gift? We have amazing products for everyone." });
    await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts(), false);
    expect(prompts.length).toBe(1);
  });

  it("but it is still told when the draft reads like a template", async () => {
    anthropic({ message: "Looking for the perfect gift? We have amazing products for everyone." });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, facts(), false);
    expect(r.publishable).toBe(false);
  });

  it("WITH NO RECORDS AT ALL, the rules still reach the prompt", async () => {
    // F-01: a failed records read must not be a way through.
    anthropic({ message: "Hi Ravi, shall I hold one?" });
    await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, null);
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toMatch(/could not be read/i);
  });

  it("and an unverifiable claim is still caught with no records", async () => {
    anthropic({ message: "Hi Ravi, we are India's number 1 candle brand." });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, null);
    expect(r.message).not.toMatch(/number 1/i);
  });
});

describe("2. the retention message", () => {
  it("THE RECORDS AND THE RULES REACH THE PROMPT", async () => {
    anthropic({ message: "Hi Meena, hope the lavender one is still going. 40 hour burn, so there may be some left." });
    await generateRetentionMessage(CUSTOMER, null, "service_reminder", "Home fragrance", undefined, undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toContain("Meena");
    expect(prompts[0]).toMatch(/EXISTING CUSTOMER/);
  });

  it("AN INVENTED REFERRAL BENEFIT IS TAKEN OUT", async () => {
    anthropic({ message: "Hi Meena, refer a friend and get 20% off your next order." });
    const message = await generateRetentionMessage(CUSTOMER, null, "referral", "Home fragrance", undefined, undefined, facts());
    expect(message).not.toMatch(/20% off/);
  });

  it("A HEALTH CLAIM IS TAKEN OUT OF A MESSAGE THAT IS ABOUT TO BE SENT", async () => {
    // Tier substantiation would KEEP this in a draft, and that is right
    // for a draft the owner edits. This is a message, so the safety
    // side matters: the vulnerable-group rule is strict in both modes.
    anthropic({ message: "Hi Meena, the new one is non-toxic and safe for babies." });
    const message = await generateRetentionMessage(CUSTOMER, null, "upsell", "Home fragrance", undefined, undefined, facts());
    expect(message).not.toMatch(/safe for babies/);
  });

  it("an honest reminder is unchanged", async () => {
    const honest = "Hi Meena, hope the lavender one is still going. Let me know if you want another.";
    anthropic({ message: honest });
    const message = await generateRetentionMessage(CUSTOMER, null, "service_reminder", "Home fragrance", undefined, undefined, facts());
    expect(message).toBe(honest);
  });

  it("the fallback still comes back when the model is unreadable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const payload = { content: [{ type: "text", text: "not json" }], usage: {} };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
    }));
    const message = await generateRetentionMessage(CUSTOMER, null, "referral", "Home fragrance", undefined, undefined, facts());
    expect(message).toMatch(/Hi Meena/);
  });
});

describe("3. the influencer outreach", () => {
  const PLAN = {
    searchTerms: ["candle makers shahjahanpur", "home fragrance india"],
    outreachMessage: "Hi [Name], we make soy wax candles in Shahjahanpur. 40 hour burn. Would you like one to try?",
    emailSubject: "A candle from Shahjahanpur",
    emailBody: "Hi [Name],\n\nWe make soy wax candles with a 40 hour burn. Would you like one to try?",
    collabIdeas: ["Gift one candle for an honest review", "Paid post"],
  };

  it("THE RULES AND THE RECORDS REACH THE PROMPT", async () => {
    anthropic(PLAN);
    await generateInfluencerPlan("lavender candle", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toContain("Lavender candle");
  });

  it("AN INVENTED CLAIM IN THE DM IS TAKEN OUT", async () => {
    anthropic({ ...PLAN, outreachMessage: "Hi [Name], we are the best candle brand in India. Want one?" });
    const r = await generateInfluencerPlan("lavender candle", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.outreachMessage).not.toMatch(/best candle brand/i);
  });

  it("AND IN THE EMAIL BODY", async () => {
    anthropic({ ...PLAN, emailBody: "Hi [Name],\n\nOver 500 happy customers already. Want one?" });
    const r = await generateInfluencerPlan("lavender candle", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.emailBody).not.toMatch(/500 happy customers/i);
  });

  it("THE OWNER-FACING PARTS OF THE SHAPE SURVIVE", async () => {
    // searchTerms and collabIdeas are for the owner to use, not words a
    // customer reads. The guard walks every string, so this checks the
    // walk does not eat them.
    anthropic(PLAN);
    const r = await generateInfluencerPlan("lavender candle", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.searchTerms).toEqual(PLAN.searchTerms);
    expect(r.collabIdeas).toEqual(PLAN.collabIdeas);
  });

  it("the [Name] placeholder is not mistaken for an invented detail", async () => {
    anthropic(PLAN);
    const r = await generateInfluencerPlan("lavender candle", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.outreachMessage).toContain("[Name]");
  });
});
