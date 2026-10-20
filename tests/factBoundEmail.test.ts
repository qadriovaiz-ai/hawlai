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
    const request = JSON.parse(init.body);
    sent.push(request);
    // THE SECOND NET ANSWERS ITSELF UNLESS A TEST SAYS OTHERWISE.
    //
    // extractUnlicensable (2026-10-20) added a call to every piece, and
    // scripting it in forty existing tests would have meant renumbering
    // every one of them — turning a change in the pipeline into a
    // change in forty unrelated assertions, where a slip is invisible.
    //
    // So a request for that tool gets an empty, well-formed answer
    // here: the net reports nothing, the piece is unaffected, and the
    // tests that do care about it script it explicitly and are matched
    // first by the loop below.
    const wants = request?.tool_choice?.name;
    const scripted = bodies.find(
      (b: any) => wants && b && Array.isArray((b as any).content) && (b as any).content.some((c: any) => c?.name === wants)
    );
    if (wants === "report_unlicensable" && !scripted) {
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_unlicensable", input: { claims: [] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return sent;
}

/**
 * The calls that asked for one tool, in order.
 *
 * BY NAME, NOT BY INDEX. The second net runs beside the main
 * extraction in a Promise.all, so a position in `sent` is no longer a
 * stable way to name a step — and it never should have been, since how
 * many calls the pipeline makes is a thing it is allowed to change.
 */
const asking = (sent: any[], name: string) => sent.filter((c) => c?.tool_choice?.name === name);

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

  it("needs both conditions — AND RUNS WITH NO RECORDS AT ALL", () => {
    // CORRECTED 2026-10-16. This test used to assert
    //
    //     expect(factBoundEnabled(request({ facts: null }))).toBe(false)
    //
    // which encoded the defect the reviewer then found: the
    // records-unreadable case went down the OLD path, so candle-08 — the
    // eval case built to catch invented specifics — never entered the
    // pipeline and produced six of the thirteen unsupported claims.
    //
    // Changed on the founder's instruction, and recorded rather than
    // quietly flipped: this is not a test weakened to let a change
    // through, it is a test that asserted a bug. A business whose
    // records cannot be read is when the pipeline matters most.
    expect(factBoundEnabled(request())).toBe(true);
    expect(factBoundEnabled(request({ facts: null }))).toBe(true);
    expect(factBoundEnabled(request({ factBound: false }))).toBe(false);
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
    // select, write, extract (+ the second net beside it), judge.
    expect(asking(sent, "report_claims")).toHaveLength(1);
    expect(asking(sent, "report_verdicts")).toHaveLength(1);
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
      // select, write, extract (+ the second net beside it), judge.
      expect(asking(sent, "report_claims")).toHaveLength(1);
      expect(asking(sent, "report_verdicts")).toHaveLength(1);
      // BY NAME, because the second net now runs beside the main
      // extraction and index 3 is no longer the judge.
      const judgePrompt = JSON.stringify(asking(sent, "report_verdicts")[0]);
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
    //
    // ITS FIXTURE CHANGED ON 2026-10-20, AND THE ASSERTION DID NOT.
    //
    // I wrote this test with the extractor answering `claims: []` —
    // using "the extractor found nothing" as a stand-in for "nothing
    // was wrong". The eighth S2a WhatsApp run showed those are not the
    // same thing: salon-04's benefit claim survived because the
    // extractor came back empty, so no verdict was reached, so nothing
    // was removed and no note was written. The run read as clean. An
    // empty extraction now marks the piece unverified.
    //
    // So this fixture was encoding the very assumption the fix removes.
    // A clean piece is one whose claims were EXAMINED and entailed, and
    // that is what it now scripts — the assertion is untouched.
    script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "we never use cheap paraffin wax" }]),
      prose(JSON.stringify({ subject: "Hi", body: "We never use cheap paraffin wax." })),
      tool("report_claims", {
        claims: [{ sentenceIndex: 0, canonical: "the business does not use cheap paraffin wax", claimType: "material", subject: "own_business", polarity: "deny" }],
      }),
      tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the record says exactly this" }] }),
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
    // AN EMPTIED ARRAY ELEMENT IS DROPPED, NOT KEPT AS "", and this
    // assertion said the opposite until 2026-10-20. Changed on the
    // founder's instruction about hashtags, not to make a change of
    // mine fit — CLAUDE.md rule 7 cares about which of those it is.
    //
    // His point: a hashtag whose every word was refused was publishing
    // as an EMPTY hashtag beside the real ones. The "empty, not
    // missing" rule was written for a subject line, where the caller
    // has to see that it lost its text; a list ITEM carries no such
    // meaning by being present and blank.
    //
    // The test below still pins "empty, not missing" for a string
    // field, so both halves are covered.
    expect(result.bullets).toEqual(["Six."]);
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

describe("7. a failure keeps its real name", () => {
  // THE API CREDIT BALANCE RAN OUT MID-RUN, 20 October 2026, and that
  // is how this was found. claude.ts classified it correctly as
  // `credits` and has the right words for it — "AI features are
  // temporarily unavailable on our side, the Hawlai team has been
  // alerted" — and this door threw the kind away and substituted
  // "overloaded", so the owner was told "The AI service is busy, try
  // again in a minute".
  //
  // An owner told to try again in a minute tries again in a minute,
  // and keeps trying, and it never works. classifyClaudeError's own
  // header says the reason was discarded 48 times before it existed.
  // This was the 49th place.

  it("A CREDITS FAILURE IS NOT REPORTED AS BUSYNESS", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }),
        { status: 400, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    const r = await generateCopy(request());
    const said = JSON.stringify(r);
    expect(said).toMatch(/temporarily unavailable on our side/);
    expect(said).not.toMatch(/busy — try again in a minute/);
    expect(r._aiFailure?.kind).toBe("credits");
  });

  it("AND AN OVERLOAD STILL IS, because that one IS worth retrying", async () => {
    // The direction that must not change. A 529 really is busyness and
    // "try again in a minute" is the right thing to say about it.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 })) as typeof fetch;
    const r = await generateCopy(request());
    expect(JSON.stringify(r)).toMatch(/busy — try again in a minute/);
  });

  it("the kind travels out of Select rather than being guessed at the door", async () => {
    const { code } = await import("./helpers/source");
    expect(code("src/lib/facts/selectClaims.ts")).toMatch(/kind: result\.failure\.kind/);
    expect(code("src/lib/content/generateCopy.ts")).toMatch(/aiFailureMessage\(selected\.kind \?\? "overloaded"\)/);
  });
});
