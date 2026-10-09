// THE LAST UNATTENDED CUSTOMER SURFACE.
//
// generateAutoReply answers every inbound Instagram/Facebook DM and
// every public comment, with nobody reading it first. Its own code
// comment says so. The audit (F-U1, then G-5) found it had none of the
// layer every other surface has:
//
//   - no BusinessFacts, only a hand-rolled catalogue string, which is
//     how it could quote a real price and invent a discount beside it
//   - no COPY_TRUTH_RULES
//   - no claims guard: `return parsed.reply ?? null` went straight to
//     sendDmReply / sendCommentReply
//   - no splitStories, so a customer's private hospital story could be
//     repeated to a stranger asking about delivery
//
// The same hole was closed on the website widget in c433380. This file
// closes it here, and EXECUTES the function to prove it — the previous
// two tests that touch generateAutoReply assert only that it returns
// null on failure and passes a good reply through.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------
// candle_by_qaaf as its records actually stand: ₹550 candle, ₹60 flat
// shipping, no offers, no orders — so a discount is unsupported and a
// customer count is unsupported, by the records, not by a word list.
// ---------------------------------------------------------------------

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api, insert: () => api, update: () => api,
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));

import { generateAutoReply } from "@/lib/agents/socialManagementAgent";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/** The model answers with exactly this reply. */
function modelSays(reply: string) {
  vi.stubGlobal("fetch", vi.fn(async () => {
    const content = [{ type: "text", text: JSON.stringify({ reply }) }];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ content }),
      json: async () => ({ content }),
      headers: { get: () => null },
    };
  }));
}

/** The prompts the model was actually sent. */
function capturePrompts(reply: string): string[] {
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: any) => {
    sent.push(JSON.parse(init.body).messages[0].content);
    const content = [{ type: "text", text: JSON.stringify({ reply }) }];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ content }),
      json: async () => ({ content }),
      headers: { get: () => null },
    };
  }));
  return sent;
}

function modelDown() {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status: 529,
    text: async () => JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }),
    json: async () => ({ error: { type: "overloaded_error", message: "overloaded" } }),
    headers: { get: () => null },
  })));
}

const CATALOGUE = [{ name: "Lavender candle", price: 550, description: "Hand-poured soy wax", inventoryCount: 5 }];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
    websites: [{ id: "w1", dealership_id: "d1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    website_pages: [],
    products: [{ id: "p1", dealership_id: "d1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [], is_active: true, order_index: 0 }],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
    business_knowledge: [],
    brand_profiles: [{ dealership_id: "d1", tone_of_voice: "warm", messaging_pillars: [], preferred_language: "english" }],
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const facts = () => gatherBusinessFacts(db(), "d1");

// ---------------------------------------------------------------------
// 1. An invented discount must not reach the customer.
// ---------------------------------------------------------------------

describe("an invented offer never reaches the customer", () => {
  it("A TRUE PRICE AND AN INVENTED DISCOUNT IN ONE SENTENCE: THE WHOLE SENTENCE GOES", async () => {
    // Worth stating plainly, because it is a deliberate trade and not
    // what you might expect: the claims guard removes by SENTENCE. A
    // reply that mixes a real price with an invented offer loses both,
    // and with its only sentence gone nothing is sent at all.
    //
    // That is the right outcome HERE specifically. Everywhere else a
    // human sees the shortened draft and can repair it; here the next
    // reader is the customer. A half-sentence is worse than silence,
    // and silence now escalates.
    modelSays("It's ₹550, and we're running 20% off today!");
    const out = await generateAutoReply(
      "dm", "price kya hai?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toBeNull();
    expect(out.withheld?.join(" ")).toMatch(/20\s*%/);
    expect(out.escalate).toMatch(/Reply yourself/);
  });

  it("PUBLISH MODE, NOT DRAFT: an unverified price does not reach the customer", async () => {
    // The mode is load-bearing and nothing proved it. In "draft" a
    // sentence whose ONLY problem is a price is KEPT and flagged, for a
    // human to check. There is no human here, so this path uses
    // "publish" and the sentence goes.
    //
    // ₹799 is a price-only problem: the real catalogue says ₹550 and
    // there is no other claim in the sentence to remove it for.
    modelSays("It's ₹799 for the Lavender candle.");
    const out = await generateAutoReply(
      "dm", "price?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toBeNull();
    expect(out.escalate).toMatch(/Reply yourself/);
  });

  it("but a true price on its OWN sentence is sent", async () => {
    // The same fact, in a sentence of its own, reaches the customer —
    // so the rule above costs a mixed sentence, not the answer.
    modelSays("It's ₹550. Stock mein hai.");
    const out = await generateAutoReply(
      "dm", "price kya hai?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toContain("₹550");
  });

  it("a separate invented-offer sentence is withheld and the honest half survives", async () => {
    modelSays("Haan, Lavender candle available hai. Free shipping bhi hai!");
    const out = await generateAutoReply(
      "dm", "available hai?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    // Shipping is ₹60 flat on this store — the existing rule, not a new one.
    expect(out.reply ?? "").not.toMatch(/free shipping/i);
    expect(out.reply ?? "").toMatch(/available/i);
  });

  it("WHEN THE GUARD EMPTIES IT, NOTHING IS SENT AND THE OWNER IS TOLD", async () => {
    modelSays("We're rated 5 stars by 500+ happy customers!");
    const out = await generateAutoReply(
      "dm", "are you any good?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toBeNull();
    // Not "No reply generated" — the owner can act on this.
    expect(out.escalate).toMatch(/claimed something your records don't back/);
    expect(out.escalate).toMatch(/Reply yourself/);
    expect(out.withheld?.join(" ")).toMatch(/500\+/);
  });

  it("the truth rules and the real facts are in the prompt", async () => {
    const sent = capturePrompts("Sure.");
    await generateAutoReply(
      "dm", "price?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(sent[0]).toMatch(/NEVER invent numbers/);
    expect(sent[0]).toMatch(/NEVER write an offer, discount, sale price/);
    expect(sent[0]).toMatch(/Lavender candle/);
    expect(sent[0]).toMatch(/Shipping:/);
    // Customer audience: the business's own order and lead counts are
    // its internal position and must not be in a prompt that answers
    // strangers.
    expect(sent[0]).not.toMatch(/Track record/);
    expect(sent[0]).not.toMatch(/paid order\(s\)/);
  });
});

// ---------------------------------------------------------------------
// 2. A customer's private story must not be repeated.
// ---------------------------------------------------------------------

describe("a customer's private story is not repeated to a stranger", () => {
  const PRIVATE = {
    category: "business_story",
    title: "A customer wrote",
    content: "Her husband had been in an accident and she lit a candle through the waiting at the hospital.",
  };
  const OWN = {
    category: "business_story",
    title: "How it started",
    content: "I poured the first batch in my kitchen in 2023.",
  };

  it("THE PRIVATE STORY NEVER ENTERS THE PROMPT", async () => {
    const sent = capturePrompts("Thanks for asking!");
    await generateAutoReply(
      "dm", "tell me about you", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [PRIVATE, OWN] as any, [], null, undefined, await facts()
    );
    expect(sent[0]).not.toMatch(/hospital/i);
    expect(sent[0]).not.toMatch(/accident/i);
    expect(sent[0]).not.toMatch(/husband/i);
  });

  it("and the owner's own story still does", async () => {
    const sent = capturePrompts("Thanks for asking!");
    await generateAutoReply(
      "dm", "tell me about you", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [PRIVATE, OWN] as any, [], null, undefined, await facts()
    );
    expect(sent[0]).toMatch(/poured the first batch/);
  });

  it("A PUBLIC COMMENT IS THE WORST PLACE FOR IT, and it is gated there too", async () => {
    const sent = capturePrompts("Thanks!");
    await generateAutoReply(
      "comment", "love these!", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [PRIVATE] as any, null, null, undefined, await facts()
    );
    expect(sent[0]).not.toMatch(/hospital/i);
  });
});

// ---------------------------------------------------------------------
// 3. Facts unavailable: fail closed.
// ---------------------------------------------------------------------

describe("facts unavailable means no reply at all", () => {
  it("NO MODEL CALL, NO REPLY, AND THE OWNER IS ESCALATED TO", async () => {
    const calls = vi.fn();
    vi.stubGlobal("fetch", calls);
    const out = await generateAutoReply(
      "dm", "price kya hai?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, null
    );
    expect(out.reply).toBeNull();
    expect(out.escalate).toMatch(/records couldn't be read/);
    expect(out.escalate).toMatch(/Answer it yourself/);
    // Fails BEFORE spending a model call: there is nothing to check the
    // answer against, so there is no point producing one.
    expect(calls).not.toHaveBeenCalled();
  });

  it("undefined facts fail closed the same way", async () => {
    const out = await generateAutoReply(
      "dm", "price?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, undefined
    );
    expect(out.reply).toBeNull();
    expect(out.escalate).toBeTruthy();
  });

  it("every no-reply case gives the owner a DIFFERENT, actionable reason", async () => {
    // "No reply generated" was logged for all of them.
    const noFacts = await generateAutoReply("dm", "x", "b", "c", null, CATALOGUE, [], [], null, undefined, null);
    modelDown();
    const down = await generateAutoReply("dm", "x", "b", "c", null, CATALOGUE, [], [], null, undefined, await facts());
    modelSays("We're rated 5 stars by 500+ happy customers!");
    const guarded = await generateAutoReply("dm", "x", "b", "c", null, CATALOGUE, [], [], null, undefined, await facts());

    const reasons = [noFacts.escalate, down.escalate, guarded.escalate];
    expect(new Set(reasons).size).toBe(3);
    for (const r of reasons) expect(r).toMatch(/yourself/i);
    // Different is not enough — each one has to NAME its cause, or the
    // owner is back to guessing which of five things happened.
    expect(noFacts.escalate).toMatch(/records couldn't be read/);
    expect(down.escalate).toMatch(/couldn't reach the AI/);
    expect(guarded.escalate).toMatch(/claimed something your records don't back/);
  });
});

// ---------------------------------------------------------------------
// 4. A clean reply is sent, unchanged.
// ---------------------------------------------------------------------

describe("a clean reply goes out exactly as written", () => {
  it("THE GUARD IS NOT A FILTER ON NORMAL ANSWERS", async () => {
    const clean = "Haan! Lavender candle ₹550 ka hai, abhi stock mein hai.";
    modelSays(clean);
    const out = await generateAutoReply(
      "dm", "lavender candle kitne ka hai?", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toBe(clean);
    expect(out.escalate).toBeUndefined();
    expect(out.withheld).toBeUndefined();
  });

  it("a plain acknowledgement passes", async () => {
    modelSays("Thanks for reaching out — our team will get back to you shortly.");
    const out = await generateAutoReply(
      "dm", "I have a complaint", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toMatch(/get back to you/);
  });

  it("a public comment reply passes too", async () => {
    modelSays("Thank you! DM us and we'll help you pick one.");
    const out = await generateAutoReply(
      "comment", "so pretty!", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], null, null, undefined, await facts()
    );
    expect(out.reply).toMatch(/DM us/);
  });

  it("whitespace-only is not a reply", async () => {
    modelSays("   ");
    const out = await generateAutoReply(
      "dm", "hi", "candle_by_qaaf", "Home fragrance",
      { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts()
    );
    expect(out.reply).toBeNull();
    expect(out.escalate).toMatch(/returned nothing/);
  });
});

// ---------------------------------------------------------------------
// The wiring. A source assertion, deliberately, and labelled as one.
// ---------------------------------------------------------------------

describe("the handler actually passes the facts", () => {
  it("BOTH CALL SITES HAND OVER businessCtx.facts", async () => {
    // Why a source read and not an execution test: `facts` is the 11th
    // positional parameter and optional, so omitting it type-checks
    // cleanly and every assertion above still passes DASH the agent just
    // fails closed and the auto-reply silently never works again. A
    // mutation that dropped it from the handler was caught by nothing.
    //
    // An optional safety parameter cannot be enforced by the compiler.
    // Making it required would mean reordering a signature with four
    // optional parameters ahead of it; that is worth doing and is not
    // worth doing the night before a live test. This holds the line
    // until then. Same tool, same reasoning, as
    // tests/clientBundleBoundary.test.ts.
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/webhooks/autoReplyHandler.ts", "utf8");
    const calls = src.match(/generateAutoReply\([\s\S]*?\);/g) ?? [];
    expect(calls.length, "expected the DM and comment call sites").toBe(2);
    for (const call of calls) {
      expect(call, "a generateAutoReply call without the facts").toMatch(/businessCtx\.facts/);
    }
  });
});
