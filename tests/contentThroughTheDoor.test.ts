// PHASE 3.5, STEP 3: the content path goes through the door.
//
// contentMarketingAgent is the agent that HAD every measure - the
// customer-first check, the word cap, the anti-generic verdict, the
// specificity editor - and had them as its own copy, which is exactly
// why no other surface had any of them. Its pipeline now lives in
// generateCopy; what stays is the link rule, the bio rule and the
// content-type table.
//
// WHAT THIS FILE IS FOR. The 17 existing files that drive
// generateContent are the real safety net for this migration, and three
// of them caught me dropping a tuned prompt on the way through:
//
//   "did NOT ask for their story"           customerFirstPost
//   "Content type: Instagram Post" ordering preferredLanguage
//   retryBrief, "the same length", and the
//   personal-history line in the retry      shortStaysSpecific
//
// Each was fixed by carrying the original wording into the door, not by
// touching the test.
//
// What is tested HERE is the one thing none of them covered: a mutation
// that stopped passing `recent` left the whole suite green, so the
// repetition guard was never pinned at all.

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

import { generateContent } from "@/lib/agents/contentMarketingAgent";

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

const GOOD = { text: "Evenings get loud. The lavender candle is soy wax, 40 hour burn. 550." };

const ask = (opts: any = {}) =>
  generateContent("facebook_post", "Candle by Qaaf", "Home fragrance", "the lavender candle", { tone_of_voice: "warm", preferred_language: null }, undefined, undefined, facts(), "draft", opts);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("what has gone out lately reaches the prompt", () => {
  it("THE RECENT PIECES ARE NAMED, so this one does not repeat them", async () => {
    // A mutation that passed `recent: undefined` left all 3836 tests
    // green. The repetition guard existed and nothing held it in place.
    anthropic(GOOD);
    await ask({ recent: ["Slow evenings start with the lavender candle.", "Diwali gifting, sorted."] });
    expect(prompts[0]).toContain("Slow evenings start with the lavender candle.");
    expect(prompts[0]).toContain("Diwali gifting, sorted.");
  });

  it("AND THE INSTRUCTION NOT TO REPEAT THEM", async () => {
    // Naming them without saying why would read as material to reuse.
    anthropic(GOOD);
    await ask({ recent: ["Slow evenings start with the lavender candle."] });
    expect(prompts[0]).toMatch(/do not repeat these openings, angles or phrasings/i);
  });

  it("nothing recent, nothing said about it", async () => {
    anthropic(GOOD);
    await ask({});
    expect(prompts[0]).not.toMatch(/ALREADY PUBLISHED RECENTLY/);
  });

  it("empty strings are not listed as a recent piece", async () => {
    anthropic(GOOD);
    await ask({ recent: ["", "   "] });
    expect(prompts[0]).not.toMatch(/ALREADY PUBLISHED RECENTLY/);
  });

  it("a long recent piece is clipped, not pasted whole", async () => {
    // The prompt is paid for by the token.
    anthropic(GOOD);
    const huge = "x".repeat(900);
    await ask({ recent: [huge] });
    expect(prompts[0]).not.toContain(huge);
    expect(prompts[0]).toContain("x".repeat(100));
  });

  it("FIVE AT MOST, however many are handed over", async () => {
    anthropic(GOOD);
    await ask({ recent: ["one", "two", "three", "four", "five", "six-should-not-appear"] });
    expect(prompts[0]).toContain("- one");
    expect(prompts[0]).toContain("- five");
    expect(prompts[0]).not.toContain("six-should-not-appear");
  });
});

describe("the ruthless copy-edit still runs on this path", () => {
  it("IT IS ASKED FOR, and it is the content path that pays for it", async () => {
    anthropic(GOOD, GOOD, GOOD);
    await ask({ revise: true });
    expect(prompts.some((p) => /ruthless copy editor/i.test(p))).toBe(true);
  });

  it("AND NOT ON THE UNATTENDED PATH", async () => {
    // revise: false is the auto-publish contract. One call, no edits.
    anthropic(GOOD);
    await ask({});
    expect(prompts).toHaveLength(1);
  });

  it("its prompt carries the records and the truth rules", async () => {
    anthropic(GOOD, GOOD, GOOD);
    await ask({ revise: true });
    const edit = prompts.find((p) => /ruthless copy editor/i.test(p))!;
    expect(edit).toContain("Lavender candle");
    expect(edit).toMatch(/NEVER invent numbers/);
  });
});
