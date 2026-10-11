// PHASE 3.5, STEP 1: email is the first surface through generateCopy.
//
// WHAT EMAIL GAINS. It already had claims and provenance. Going through
// the door adds everything that existed on exactly one path before:
//
//   the customer-first structure in the prompt
//   the word-cap line (email has no cap, so this one is a no-op here)
//   the anti-generic verdict, and its retry when revise
//   the invented-key strip (contentKeys)
//   the comparative, performance and benefit rules, via the guard
//
// WHAT STAYS EMAIL'S OWN. The subject-line fix and the visual email.
// Both are about email specifically, and the door does not know what a
// subject line is for.
//
// These are EXECUTION tests: the real agent, the real door, a stubbed
// model. A source grep would pass on an import that nothing calls.

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

import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    // `images` is required, not optional: heroProduct reads
    // p.images.length and the visual email is built from it. A real
    // CatalogProduct always has the array, so a fixture without one
    // throws inside composeMarketingEmail and the agent returns its
    // fallback - which looks exactly like the migration having broken.
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn", images: [] }],
    offers: [], pillars: [], site: null, home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [
      { category: "business_story", title: "The mistake I learnt from", content: "Ek baar jaldi mein poora batch kharab kiya tha. Woh batch ghar se bahar nahi gaya." },
    ] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    season: { today: "2026-10-11", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as unknown as BusinessFacts;
}

const GOOD = {
  subject: "Your evenings, a little quieter",
  previewText: "Soy wax, 40 hour burn",
  body: "Evenings get loud in Shahjahanpur. The lavender candle is soy wax with a 40 hour burn. 550, and we ship for 60. Order on the store page.",
};

const ask = (over: any = {}, mode: "draft" | "publish" = "draft", f = facts()) =>
  generateEmailContent("welcome_email", "Candle by Qaaf", "Home fragrance", over.topic ?? "the lavender candle", null, undefined, undefined, f, mode);

describe("1. the prompt the door assembles", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("CARRIES THE CUSTOMER-FIRST ORDER", async () => {
    anthropic(GOOD);
    await ask();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
    expect(prompts[0]).toMatch(/customer's situation/i);
  });

  it("AND SAYS THE OWNER'S STORY IS NOT THE SUBJECT", async () => {
    // The sentence that produced a 224-word founder post said the
    // opposite: "that detail is the whole point of the piece".
    anthropic(GOOD);
    await ask();
    expect(prompts[0]).toMatch(/information, not the subject/);
    expect(prompts[0]).toMatch(/AT MOST ONE short sentence/);
    expect(prompts[0]).not.toMatch(/whole point of the piece/i);
  });

  it("STILL CARRIES EMAIL'S OWN RULES AND THE TRUTH RULES", async () => {
    // The door must not have swallowed the surface's brief.
    anthropic(GOOD);
    await ask();
    expect(prompts[0]).toMatch(/email marketer/i);
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toContain("Lavender candle");
  });

  it("asks for the story when the owner asked for the story", async () => {
    anthropic(GOOD);
    await generateEmailContent("newsletter", "Candle by Qaaf", "Home fragrance", "write our story for the newsletter", null, undefined, undefined, facts(), "draft");
    expect(prompts[0]).toMatch(/the story IS the subject/);
    expect(prompts[0]).not.toMatch(/information, not the subject/);
  });
});

describe("2. what the door now strips from an email", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("A KEY THE MODEL INVENTED NEVER REACHES THE OWNER", async () => {
    anthropic({ ...GOOD, Concrete_details_used: "40 hour burn, 550 rupees" });
    const r: any = await ask();
    expect(r.output.body).toContain("Evenings get loud");
    expect(JSON.stringify(r.output)).not.toMatch(/Concrete_details_used/);
  });

  it("A COMPARATIVE CLAIM GOES, IN A DRAFT TOO", async () => {
    // Email is reviewed before it is sent, so it runs in draft mode -
    // and a comparison is strict in both modes.
    anthropic({ ...GOOD, body: `${GOOD.body} Unlike the standard candles on the shelf, ours is steady.` });
    const r: any = await ask();
    expect(r.output.body).not.toMatch(/Unlike the standard candles/);
    expect(r.claimsRemoved.join(" ")).toMatch(/comparison/i);
  });

  it("A BENEFIT CLAIM IS KEPT IN THE DRAFT WITH A NOTE", async () => {
    anthropic({ ...GOOD, body: `${GOOD.body} Light it an hour before bed and sleep better.` });
    const r: any = await ask();
    expect(r.output.body).toContain("sleep better");
    expect(r.substantiation.join(" ")).toMatch(/sleep better/);
    expect(r.substantiation.join(" ")).toMatch(/Business Knowledge/);
  });

  it("AND STRIPPED WHEN THE EMAIL IS NOT BEING REVIEWED", async () => {
    anthropic({ ...GOOD, body: `${GOOD.body} Light it an hour before bed and sleep better.` });
    const r: any = await ask({}, "publish");
    expect(r.output.body).not.toMatch(/sleep better/);
  });

  it("A SAFETY CLAIM GOES IN BOTH MODES", async () => {
    for (const mode of ["draft", "publish"] as const) {
      anthropic({ ...GOOD, body: `${GOOD.body} Non-toxic and safe for babies.` });
      const r: any = await ask({}, mode);
      expect(r.output.body, mode).not.toMatch(/safe for babies/);
    }
  });

  it("an honest email is returned word for word", async () => {
    anthropic(GOOD);
    const r: any = await ask();
    expect(r.output.subject).toBe(GOOD.subject);
    expect(r.output.body).toBe(GOOD.body);
    expect(r.claimsRemoved).toEqual([]);
  });
});

describe("3. the shape measures reach email", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  const STORY_EMAIL = {
    subject: "How we started",
    previewText: "A batch I ruined",
    body: [
      "I learned this the hard way.",
      "That batch never left the house.",
      "I will not rush the 24-hour setting time.",
      "I light one myself most nights.",
      "Lavender candle, 550.",
    ].join(" "),
  };

  it("A STORY-DOMINANT EMAIL IS RETRIED", async () => {
    anthropic(STORY_EMAIL, STORY_EMAIL, STORY_EMAIL);
    await ask();
    // The retry's own prompt, which only the door sends.
    expect(prompts.some((p) => /wrong shape for its reader/i.test(p))).toBe(true);
  });

  it("AND IF THE RETRY FAILS, THE OWNER IS TOLD — not left to notice", async () => {
    anthropic(STORY_EMAIL, STORY_EMAIL, STORY_EMAIL);
    const r: any = await ask();
    expect(String(r.output._storyNote ?? "")).toMatch(/your own story/i);
  });

  it("A REPAIRED EMAIL CARRIES NO NOTE", async () => {
    anthropic(STORY_EMAIL, GOOD);
    const r: any = await ask();
    expect(r.output.body).toContain("Evenings get loud");
    expect(r.output._storyNote ?? null).toBe(null);
  });

  const GENERIC_EMAIL = {
    subject: "Looking for the perfect gift?",
    previewText: "Shop now",
    body: "Looking for the perfect gift? We have amazing products for everyone. Shop now and treat yourself today.",
  };

  it("A GENERIC EMAIL IS CAUGHT — the measure email never had", async () => {
    // isGeneric existed since 2026-10-09 and reached exactly one path.
    // Email had no version of it at all.
    anthropic(GENERIC_EMAIL, GENERIC_EMAIL, GENERIC_EMAIL);
    const r: any = await ask();
    expect(String(r.output._storyNote ?? "")).toMatch(/every business uses|belongs to your business/i);
    expect(r.publishable).toBe(false);
  });

  it("AND RETRIED, with the recorded specific named in the retry", async () => {
    anthropic(GENERIC_EMAIL, GENERIC_EMAIL, GENERIC_EMAIL);
    await ask();
    const retry = prompts.find((p) => /could have been published by any business/i.test(p));
    expect(retry).toBeTruthy();
  });

  it("a repaired generic email carries no note and is publishable", async () => {
    anthropic(GENERIC_EMAIL, GOOD);
    const r: any = await ask();
    expect(r.output.body).toContain("40 hour burn");
    expect(r.output._storyNote ?? null).toBe(null);
    expect(r.publishable).toBe(true);
  });

  it("THE UNATTENDED PATH STAYS SINGLE-SHOT", async () => {
    // publish mode means nobody is reviewing, so no retries: the
    // written contract the autopilot path depends on.
    anthropic(STORY_EMAIL, GOOD);
    await ask({}, "publish");
    expect(prompts.length).toBe(1);
  });

  it("but it is still TOLD, so an unattended caller can refuse to send", async () => {
    anthropic(STORY_EMAIL);
    const r: any = await ask({}, "publish");
    expect(r.publishable).toBe(false);
  });

  it("an honest email is publishable", async () => {
    anthropic(GOOD);
    const r: any = await ask();
    expect(r.publishable).toBe(true);
  });
});

describe("4. what email keeps that the door does not own", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("THE SUBJECT-LINE FIX STILL RUNS, AFTER the door", async () => {
    // A subject promising a discount the business does not offer.
    anthropic({ ...GOOD, subject: "50% off everything inside" });
    const r: any = await ask();
    expect(r.output.subject).not.toMatch(/50% off/);
    expect(r.claimsRemoved.length).toBeGreaterThan(0);
  });

  it("THE VISUAL EMAIL IS STILL BUILT", async () => {
    anthropic(GOOD);
    const r: any = await ask();
    expect(r.email).toBeTruthy();
    expect(r.email.html ?? r.email.body ?? "").toBeTruthy();
  });

  it("a malformed reply still reports its own cause", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const payload = { content: [{ type: "text", text: "this is not json at all" }], usage: {} };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
    }));
    const r: any = await ask();
    expect(r._malformed).toBe(true);
    expect(r._cause).toBeTruthy();
  });
});
