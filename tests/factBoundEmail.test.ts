// S1 — the fact-bound pipeline, wired into the door, email only.
//
// Four model calls per piece: select, write, extract, judge. Here they
// are all canned, so this file is free and tests the WIRING: that the
// flag does nothing when it is off, that each step's output reaches the
// next one, that a failure anywhere fails closed, and that the claim
// the founder called out by name cannot survive.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { generateCopy, factBoundEnabled, factBoundPrompt, type CopyRequest } from "@/lib/content/generateCopy";
import { copySentences, withoutSentences } from "@/lib/content/copySentences";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const ORIGINAL = globalThis.fetch;
const ORIGINAL_FLAG = process.env.FACT_BOUND_COPY;

afterEach(() => {
  globalThis.fetch = ORIGINAL;
  if (ORIGINAL_FLAG === undefined) delete process.env.FACT_BOUND_COPY;
  else process.env.FACT_BOUND_COPY = ORIGINAL_FLAG;
  vi.restoreAllMocks();
});

const FACTS = {
  businessName: "A Business",
  category: "Home fragrance",
  categoryKnown: true,
  businessModels: { models: ["products"], inferred: false },
  city: "Shahjahanpur",
  site: null,
  home: null,
  products: [
    { id: "p1", name: "Lavender candle", kind: "product", price: 999, description: "Soy wax", images: [], inventory: null, category: null, active: true, durationMinutes: null, bookingUrl: null },
  ],
  offers: [],
  shipping: { mode: "free", rate: null, freeThreshold: null },
  last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
  allTime: { paidOrders: 2, leads: 1 },
  ownerFacts: [{ category: "general", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." }],
  brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
  pillars: [],
  links: { store: "/site/a-business", products: [], booking: null },
  season: seasonFor([], "2026-09-18"),
  unreadable: [],
} as unknown as BusinessFacts;

function request(over: Partial<CopyRequest> = {}): CopyRequest {
  return {
    topic: "welcome email for the lavender candle",
    businessName: "A Business",
    businessCategory: "Home fragrance",
    facts: FACTS,
    mode: "draft",
    revise: false,
    operation: "email_generation",
    factBound: true,
    logContext: { supabase: {}, dealershipId: "biz_1" } as any,
    brief: { label: "welcome email", instructions: "Welcome a new subscriber." },
    ...over,
  };
}

/** The four calls, answered in order. Each entry is a canned body. */
function script(...bodies: unknown[]) {
  const sent: any[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return sent;
}

const tool = (name: string, input: unknown) => ({ content: [{ type: "tool_use", name, input }], usage: { input_tokens: 10, output_tokens: 5 } });
const prose = (text: string) => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } });

const SELECT_ONE = tool("select_claims", {
  claims: [{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "we never use cheap paraffin wax" }],
  conflicts: [],
  unknowns: [],
});

/** The real paraffin record id, which getContext mints from the owner row. */
async function paraffinId(): Promise<string> {
  const { contextFromFacts } = await import("@/lib/facts/getContext");
  const ctx = contextFromFacts("biz_1", FACTS, { kind: "email", topic: "welcome email for the lavender candle" });
  return ctx.records.find((r) => r.key === "material.paraffin")!.id;
}

async function selectPicking(claims: unknown[], over: Record<string, unknown> = {}) {
  const id = await paraffinId();
  const withIds = JSON.parse(JSON.stringify(claims).replace(/__PARAFFIN__/g, id));
  return tool("select_claims", { claims: withIds, conflicts: [], unknowns: [], ...over });
}

beforeEach(() => {
  process.env.FACT_BOUND_COPY = "1";
});

describe("1. the flag", () => {
  it("DOES NOTHING WHEN IT IS OFF — one call, the old prompt", async () => {
    delete process.env.FACT_BOUND_COPY;
    const sent = script(prose(JSON.stringify({ subject: "Hello", body: "The candle is ₹999." })));
    await generateCopy(request());
    expect(sent).toHaveLength(1);
    // The old prompt carries the records; the new one never does.
    expect(JSON.stringify(sent[0])).toMatch(/TRUTH RULES/);
  });

  it("does nothing when the surface has not opted in, even with the flag on", async () => {
    const sent = script(prose(JSON.stringify({ subject: "Hello", body: "Hi." })));
    await generateCopy(request({ factBound: false }));
    expect(sent).toHaveLength(1);
  });

  it("needs both conditions and real records", () => {
    expect(factBoundEnabled(request())).toBe(true);
    expect(factBoundEnabled(request({ factBound: false }))).toBe(false);
    expect(factBoundEnabled(request({ facts: null }))).toBe(false);
    delete process.env.FACT_BOUND_COPY;
    expect(factBoundEnabled(request())).toBe(false);
  });
});

describe("2. the write prompt", () => {
  it("CARRIES THE APPROVED CLAIMS AND NOT THE RECORDS", async () => {
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "we never use cheap paraffin wax" }]),
      prose(JSON.stringify({ subject: "Hello", body: "We never use cheap paraffin wax." })),
      tool("report_claims", { claims: [] }),
    );
    await generateCopy(request());
    const writePrompt = JSON.stringify(sent[1]);
    expect(writePrompt).toMatch(/THE ONLY FACTS YOU MAY STATE/);
    expect(writePrompt).toMatch(/we never use cheap paraffin wax/);
    // The whole point: the writer is not choosing any more.
    expect(writePrompt).not.toMatch(/may support:/);
    expect(writePrompt).not.toMatch(/TRUTH RULES/);
  });

  it("A PIECE WITH NOTHING APPROVED IS A SHORT PIECE, NOT AN INVENTED ONE", () => {
    const prompt = factBoundPrompt(request(), [], ["how long the fragrance lasts"]);
    expect(prompt).toMatch(/NO FACT WAS APPROVED FOR THIS PIECE/);
    expect(prompt).toMatch(/Do not fill the gap/);
    // And the unknown is named, so the model cannot reach for it.
    expect(prompt).toMatch(/must not appear in any form: how long the fragrance lasts/);
  });

  it("tells the writer to leave the reader's own order alone", () => {
    expect(factBoundPrompt(request(), [], [])).toMatch(/Say nothing about the reader's own order/);
  });

  it("states a figure exactly, and does not let it be spelled out", () => {
    const prompt = factBoundPrompt(request(), [{ id: "c1", claimType: "price", factIds: ["f1"], intent: "the price", value: 999, unit: "inr" }], []);
    expect(prompt).toMatch(/state the figure exactly as: 999/);
    expect(prompt).toMatch(/Do not convert them, round them or spell them out/);
  });
});

describe("3. the claim the founder named — customer_state", () => {
  it("A SELECTED customer_state CLAIM NEVER REACHES THE WRITER", async () => {
    // Step 2 refuses it in code, whatever it cites. If this ever
    // regresses, an email saying "your order is on its way" goes to
    // someone who never ordered.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "customer_state", factIds: ["__PARAFFIN__"], intent: "your candle is on its way" }]),
      prose(JSON.stringify({ subject: "Hello", body: "Good to see you." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    const writePrompt = JSON.stringify(sent[1]);
    expect(writePrompt).not.toMatch(/on its way/);
    expect(writePrompt).toMatch(/NO FACT WAS APPROVED FOR THIS PIECE/);
    // And the owner is told why.
    expect(r.output._factsNote).toMatch(/nothing here knows who is reading it/);
  });

  it("AND IF ONE IS WRITTEN ANYWAY, THE VERIFIER TAKES THE SENTENCE OUT", async () => {
    // The other end of the pipeline. A writer that invents the claim
    // despite the prompt must still not get it past the verifier.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "we never use cheap paraffin wax" }]),
      prose(JSON.stringify({ subject: "Your candle is on its way", body: "We never use cheap paraffin wax." })),
      tool("report_claims", {
        claims: [
          { sentenceIndex: 0, canonical: "the reader's candle is on its way", claimType: "customer_state", subject: "customer", polarity: "assert" },
          { sentenceIndex: 1, canonical: "the business never uses cheap paraffin wax", claimType: "material", subject: "own_product", polarity: "deny" },
        ],
      }),
      tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the approved fact says so" }] }),
    );
    const r = await generateCopy(request());
    expect(sent).toHaveLength(4);
    expect(r.output.subject ?? "").not.toMatch(/on its way/);
    // The honest claim beside it survives.
    expect(r.output.body).toMatch(/paraffin/);
    expect(r.output._factsNote).toMatch(/Removed "the reader's candle is on its way"/);
  });
});

describe("3b. the judge is shown the records, not a paraphrase", () => {
  it("THE RECORD'S OWN SENTENCE REACHES THE JUDGE'S PROMPT", () => {
    // A mutation found this gap: the door could stop passing the
    // records to verifyClaims and nothing failed. The S1 exit run
    // removed a true "hand-churned" sentence exactly because the judge
    // saw the Select model's paraphrase instead of the owner's row.
    return (async () => {
      const sent = script(
        await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "soy wax only" }]),
        prose(JSON.stringify({ subject: "Hi", body: "The candles are soy wax." })),
        tool("report_claims", {
          claims: [{ sentenceIndex: 1, canonical: "the candles are made of soy wax", claimType: "material", subject: "own_product", polarity: "assert" }],
        }),
        tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the record says so" }] }),
      );
      await generateCopy(request());
      expect(sent).toHaveLength(4);
      const judgePrompt = JSON.stringify(sent[3]);
      // The owner's own words, in their own language.
      expect(judgePrompt).toMatch(/Kabhi sasta paraffin wax mix nahi karti/);
      expect(judgePrompt).toMatch(/recorded as:/);
    })();
  });
});

describe("4. it fails closed", () => {
  it("A SELECT FAILURE DOES NOT FALL BACK TO THE OLD PROMPT", async () => {
    // A silent fallback would mean the flag was on, the pipeline was
    // off, and nothing said so.
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 })) as typeof fetch;
    const r = await generateCopy(request());
    expect(r.publishable).toBe(false);
    expect(r._fallback).toBe(true);
    expect(r.blockedReason).toMatch(/could not be checked just now/);
  });

  it("AN UNREACHABLE EXTRACTOR MARKS THE DRAFT UNVERIFIED AND UNPUBLISHABLE", async () => {
    let call = 0;
    const selected = await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin" }]);
    globalThis.fetch = (async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify(selected), { status: 200, headers: { "content-type": "application/json" } });
      // A body the SECOND NET keeps, deliberately. My first version used
      // "No cheap paraffin here.", which the old guard removes as a
      // claim about other products being cheap paraffin — correct
      // behaviour, and it made this test look like a fact-bound failure.
      if (call === 2) return new Response(JSON.stringify(prose(JSON.stringify({ subject: "Hi", body: "We never use cheap paraffin wax." }))), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 });
    }) as typeof fetch;
    const r = await generateCopy(request());
    // The words are kept — they may be perfectly fine — and marked.
    expect(r.output.body).toMatch(/paraffin/);
    expect(r.output._factsNote).toMatch(/could not be checked against your records just now/);
    // "Nobody checked" must never travel as "checked" — and asserted
    // on the REASON, not just on the boolean. A surviving mutation
    // showed why: `publishable` was already false here for an unrelated
    // shape reason, so the boolean alone passed with the degradation
    // branch deleted.
    expect(r.publishable).toBe(false);
    expect(r.blockedReason).toMatch(/could not be checked against your records just now/);
  });
});

describe("5. what the owner is told", () => {
  it("a conflict names both sides", async () => {
    script(
      await selectPicking([], { conflicts: [{ askedFor: "a 20% discount", recordSays: "the only code gives 10% off", factIds: [] }] }),
      prose(JSON.stringify({ subject: "Hi", body: "Good to see you." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request({ topic: "email about our 20% diwali discount" }));
    expect(r.output._factsNote).toMatch(/You asked for a 20% discount/);
    expect(r.output._factsNote).toMatch(/the only code gives 10% off/);
  });

  it("an unknown is reported as something to record", async () => {
    script(
      await selectPicking([], { unknowns: ["how long the fragrance lasts"] }),
      prose(JSON.stringify({ subject: "Hi", body: "Good to see you." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(r.output._factsNote).toMatch(/Not on record: how long the fragrance lasts/);
  });

  it("BOTH NOTES APPEAR TOGETHER — they answer different questions", async () => {
    // _factsNote: what was never selected, what conflicts, what the
    // verifier took back out.
    // _claimsNote: what the OLD guard removed, still running as the
    // second net by the founder's decision of 2026-10-11.
    //
    // The body here is one the second net strips — it reads "No cheap
    // paraffin" as a claim that other products are cheap paraffin — so
    // both layers have something to say about the same piece.
    script(
      await selectPicking([], { unknowns: ["how long the fragrance lasts"] }),
      prose(JSON.stringify({ subject: "Hi", body: "No cheap paraffin here." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(r.output._factsNote).toMatch(/Not on record: how long the fragrance lasts/);
    expect(r.removed.join(" ")).toMatch(/claim about them, not about yours/);
    expect(r.output._claimsNote).toBeTruthy();
  });

  it("a clean piece gets no facts note at all", async () => {
    // Nothing rejected, no conflict, no unknown, nothing removed by the
    // verifier — so there is nothing to tell the owner, and an empty
    // note would be noise on every email.
    script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "we never use cheap paraffin wax" }]),
      prose(JSON.stringify({ subject: "Hi", body: "We never use cheap paraffin wax." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(r.output._factsNote).toBeUndefined();
  });
});

describe("6. splitting and re-assembling a piece", () => {
  const output = { subject: "One. Two.", body: "Three. Four.", bullets: ["Five.", "Six."], _factsNote: "Seven." };

  it("every string is split, in a stable order, and notes are skipped", () => {
    expect(copySentences(output).map((s) => s.text)).toEqual(["One.", "Two.", "Three.", "Four.", "Five.", "Six."]);
  });

  it("A NOTE IS NEVER TREATED AS COPY", () => {
    // This codebase has twice asserted over a note that QUOTES the
    // thing it reports. Running the verifier over _factsNote would
    // check the guard's words instead of the model's.
    expect(copySentences(output).some((s) => s.text.includes("Seven"))).toBe(false);
  });

  it("the named sentences come out and the rest stay put", () => {
    const sentences = copySentences(output);
    const result = withoutSentences(output, sentences, [1, 4]);
    expect(result.subject).toBe("One.");
    expect(result.body).toBe("Three. Four.");
    expect(result.bullets).toEqual(["", "Six."]);
    expect(result._factsNote).toBe("Seven.");
  });

  it("A FIELD THAT LOSES EVERY SENTENCE IS EMPTY, NOT MISSING", () => {
    // A missing key reads downstream as "this surface has no subject".
    // An empty one is something the caller can see and refuse.
    const sentences = copySentences(output);
    const result = withoutSentences(output, sentences, [0, 1]);
    expect(result).toHaveProperty("subject");
    expect(result.subject).toBe("");
  });

  it("dropping nothing changes nothing", () => {
    expect(withoutSentences(output, copySentences(output), [])).toBe(output);
  });
});
