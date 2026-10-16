// C2 step 4b — deciding each claim the copy makes.
//
// Free: the judge is stubbed. What is pinned here is the split that
// matters — no figure ever reaches a model — and that silence from the
// judge is not a pass.

import { describe, it, expect, afterEach, vi } from "vitest";
import { verifyClaims, verifyNote, approvedForJudge, NUMERIC_TYPES } from "@/lib/facts/verifyClaims";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, type ExtractedClaim, type ClaimType } from "@/lib/facts/extractClaims";
import type { SelectedClaim } from "@/lib/facts/selectClaims";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  vi.restoreAllMocks();
});

function extracted(over: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return { sentenceIndex: 0, canonical: "the candle is made of soy wax", claimType: "material", subject: "own_product", polarity: "assert", ...over };
}

function approvedClaim(over: Partial<SelectedClaim> = {}): SelectedClaim {
  return { id: "c1", claimType: "price", factIds: ["f1"], intent: "the candle costs ₹999", value: 999, unit: "inr", ...over };
}

/** The judge, answering whatever we tell it to. */
function judge(verdicts: { index: number; entailed: boolean; why: string }[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts } }], usage: { input_tokens: 10, output_tokens: 5 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function noJudge() {
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 })) as typeof fetch;
}

/** Fails the test if the model is called at all. */
function forbidCalls() {
  globalThis.fetch = (async () => {
    throw new Error("the model was called when it must not have been");
  }) as typeof fetch;
}

describe("1. no figure ever reaches a judge", () => {
  it("A FIGURE IS DECIDED BY ARITHMETIC, WITH NO MODEL CALL AT ALL", async () => {
    forbidCalls();
    const r = await verifyClaims([extracted({ claimType: "price", canonical: "the candle costs ₹999", value: { number: 999, unit: "inr" } })], [approvedClaim()]);
    expect(r.verdicts[0].verdict).toBe("entailed");
    expect(r.verdicts[0].rule).toBe("figure_matches");
    expect(r.costInr).toBe(0);
  });

  it("A FIGURE NO APPROVED CLAIM CARRIES IS REFUSED — candle-03 in another form", async () => {
    forbidCalls();
    // Rs 850 was a real price in the baseline, of the other product. A
    // judge asked "is Rs 850 right?" can be convinced; comparing two
    // numbers cannot.
    const r = await verifyClaims([extracted({ claimType: "price", canonical: "both candles start from ₹850", value: { number: 850, unit: "inr" } })], [approvedClaim()]);
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].rule).toBe("figure_not_approved");
    expect(r.verdicts[0].reason).toMatch(/it states 850/);
    expect(r.verdicts[0].reason).toMatch(/999/);
  });

  it("the same figure in another unit spelling is the same figure", async () => {
    forbidCalls();
    const approved = [approvedClaim({ claimType: "duration", intent: "40 hour burn time", value: 40, unit: "hours" })];
    for (const unit of ["hours", "hour", "ghante"]) {
      const r = await verifyClaims([extracted({ claimType: "duration", canonical: "it burns for 40 hours", value: { number: 40, unit } })], approved);
      expect(r.verdicts[0].verdict, unit).toBe("entailed");
    }
  });

  it("A DIFFERENT UNIT IS A DIFFERENT CLAIM — 40 minutes is not 40 hours", async () => {
    forbidCalls();
    const approved = [approvedClaim({ claimType: "duration", intent: "40 hour burn time", value: 40, unit: "hours" })];
    const r = await verifyClaims([extracted({ claimType: "duration", canonical: "it takes 40 minutes", value: { number: 40, unit: "minutes" } })], approved);
    expect(r.verdicts[0].verdict).toBe("unsupported");
  });

  it("every numeric type is decided by code, so none can drift to the judge", () => {
    expect([...NUMERIC_TYPES].sort()).toEqual(["count", "duration", "offer", "price", "shipping"]);
  });

  it("says so plainly when no figure was approved at all", async () => {
    forbidCalls();
    const r = await verifyClaims([extracted({ claimType: "price", value: { number: 999, unit: "inr" } })], [approvedClaim({ value: null, unit: null, intent: "soy wax" })]);
    expect(r.verdicts[0].reason).toMatch(/no figure was approved for this piece/);
  });
});

describe("2. claims nothing could support", () => {
  it("THE UNLICENSABLE TYPES ARE REFUSED WITH NO MODEL CALL", async () => {
    forbidCalls();
    const claims = UNLICENSABLE_TYPES.map((t, i) => extracted({ sentenceIndex: i, claimType: t, canonical: `a ${t} claim` }));
    const r = await verifyClaims(claims, [approvedClaim()]);
    expect(r.verdicts.map((v) => v.verdict)).toEqual(UNLICENSABLE_TYPES.map(() => "unsupported"));
    expect(r.costInr).toBe(0);
  });

  it("A COMPETITOR CLAIM IS REFUSED EVEN WHEN ITS TYPE IS AN ORDINARY ONE", async () => {
    forbidCalls();
    // dairy-07, reviewer-graded F twice: "churned by hand rather than
    // processing cream at scale — the way most supermarket ghee is
    // made". Typed `process`, which a record CAN license.
    const r = await verifyClaims(
      [extracted({ claimType: "process", subject: "competitor", canonical: "our ghee is made differently from most supermarket ghee", comparedWith: "supermarket ghee" })],
      [approvedClaim({ claimType: "process", intent: "made by the bilona method", value: null, unit: null })]
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].reason).toMatch(/compares with someone else's product/);
  });

  it("A CUSTOMER_STATE CLAIM IS REFUSED HERE TOO — both halves of the pipeline", async () => {
    forbidCalls();
    // Step 2 refuses it at selection. This is the other end: if one is
    // ever written anyway, the verifier must still catch it.
    const r = await verifyClaims([extracted({ claimType: "customer_state", subject: "customer", canonical: "the reader's candle is on its way" })], [approvedClaim()]);
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].rule).toBe("needs_recipient_record");
    expect(NEEDS_RECIPIENT_RECORD).toContain("customer_state" as ClaimType);
  });
});

describe("3. the judge, for questions of meaning", () => {
  it("an entailed qualitative claim passes", async () => {
    judge([{ index: 0, entailed: true, why: "the approved fact says soy wax" }]);
    const r = await verifyClaims([extracted()], [approvedClaim({ claimType: "material", intent: "made of soy wax", value: null, unit: null })]);
    expect(r.verdicts[0].verdict).toBe("entailed");
    expect(r.verdicts[0].rule).toBe("judged_entailed");
  });

  it("an unentailed one is refused, with the judge's reason carried through", async () => {
    judge([{ index: 0, entailed: false, why: "no approved fact mentions a smell" }]);
    const r = await verifyClaims([extracted({ canonical: "the candle has no harsh chemical smell" })], [approvedClaim()]);
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].reason).toBe("no approved fact mentions a smell");
  });

  it("A CLAIM THE JUDGE DID NOT ANSWER ABOUT IS UNSUPPORTED, NOT MISSING", async () => {
    // A verdict list that skips a claim must not read as approval of
    // it. This is the quietest way a verifier can fail.
    judge([{ index: 0, entailed: true, why: "fine" }]);
    const r = await verifyClaims([extracted({ sentenceIndex: 0 }), extracted({ sentenceIndex: 1, canonical: "a second claim" })], [approvedClaim()]);
    expect(r.verdicts[1].verdict).toBe("unsupported");
    expect(r.verdicts[1].reason).toMatch(/no answer/);
  });

  it("ONE CALL FOR THE WHOLE PIECE, not one per claim", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [0, 1, 2].map((index) => ({ index, entailed: true, why: "ok" })) } }], usage: {} }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    await verifyClaims([extracted({ sentenceIndex: 0 }), extracted({ sentenceIndex: 1 }), extracted({ sentenceIndex: 2 })], [approvedClaim()]);
    expect(calls).toBe(1);
  });

  it("SILENCE FROM THE JUDGE IS NOT A PASS", async () => {
    noJudge();
    const r = await verifyClaims([extracted()], [approvedClaim()]);
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].rule).toBe("judge_unavailable");
    // And the caller is told, so it can mark the draft rather than
    // treating silence as approval.
    expect(r.degraded).toBe(true);
  });

  it("no approved fact means no judge call — there is nothing to be entailed by", async () => {
    forbidCalls();
    const r = await verifyClaims([extracted()], []);
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.costInr).toBe(0);
  });

  it("the judge is told to refuse anything it is unsure about", async () => {
    judge([]);
    await verifyClaims([extracted()], [approvedClaim()]);
    // Pinned on the rubric itself: "probably true" is the failure mode
    // a lenient judge has.
    const { code } = await import("./helpers/source");
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/When you are unsure, the answer is not entailed/);
    expect(src).toMatch(/probably true/);
  });
});

describe("4. what comes out", () => {
  it("a sentence with an unsupported claim is listed for removal, once", async () => {
    forbidCalls();
    const r = await verifyClaims(
      [
        extracted({ sentenceIndex: 2, claimType: "benefit", canonical: "it helps you sleep" }),
        extracted({ sentenceIndex: 2, claimType: "safety", canonical: "it is safe for children" }),
        extracted({ sentenceIndex: 5, claimType: "price", value: { number: 999, unit: "inr" } }),
      ],
      [approvedClaim()]
    );
    expect(r.unsupportedSentences).toEqual([2]);
  });

  it("nothing unsupported means nothing to drop and nothing to say", async () => {
    forbidCalls();
    const r = await verifyClaims([extracted({ claimType: "price", value: { number: 999, unit: "inr" } })], [approvedClaim()]);
    expect(r.unsupportedSentences).toEqual([]);
    expect(verifyNote(r)).toBeNull();
  });

  it("the note quotes the claim and the reason, in the owner's words", async () => {
    forbidCalls();
    const r = await verifyClaims([extracted({ claimType: "benefit", canonical: "it helps you sleep better" })], [approvedClaim()]);
    const note = verifyNote(r)!;
    expect(note).toMatch(/Removed "it helps you sleep better"/);
    expect(note).toMatch(/nothing on record can support a benefit claim/);
  });

  it("a degraded run says so in the note", async () => {
    noJudge();
    const r = await verifyClaims([extracted()], [approvedClaim()]);
    expect(verifyNote(r)).toMatch(/could not be checked just now/);
  });

  it("the approved facts are shown to the judge without ids", () => {
    // Ids are an internal handle. A judge shown "f_3a9c" learns
    // nothing and may echo it into a reason the owner reads.
    const text = approvedForJudge([approvedClaim(), approvedClaim({ id: "c2", intent: "soy wax", value: null, unit: null })]);
    expect(text).toMatch(/the candle costs ₹999 \(999 inr\)/);
    expect(text).not.toMatch(/f1|c1|c2/);
  });
});

// ---------------------------------------------------------------------
// 5. "currency" IS A UNIT A MODEL ACTUALLY RETURNS.
//
// The S1 exit run refused a correct ₹3,500 twice: the extractor called
// the unit "currency", the record calls it "inr", and sameUnit treated
// them as different claims. Any name for money is money; a name for
// TIME is not.
// ---------------------------------------------------------------------
describe("5. the units a model actually sends", () => {
  const price = [approvedClaim({ claimType: "price", intent: "the treatment costs ₹3500", value: 3500, unit: "inr" })];

  it("EVERY NAME FOR MONEY IS MONEY", async () => {
    forbidCalls();
    for (const unit of ["inr", "INR", "rupees", "rupee", "rs", "₹", "currency", "money"]) {
      const r = await verifyClaims([extracted({ claimType: "price", canonical: "it costs 3500", value: { number: 3500, unit } })], price);
      expect(r.verdicts[0].verdict, unit).toBe("entailed");
    }
  });

  it("AND A UNIT OF TIME IS STILL NOT MONEY", async () => {
    forbidCalls();
    // The loosening must not go so far that 3500 minutes passes as
    // ₹3,500.
    const r = await verifyClaims([extracted({ claimType: "duration", canonical: "it takes 3500 minutes", value: { number: 3500, unit: "minutes" } })], price);
    expect(r.verdicts[0].verdict).toBe("unsupported");
  });

  it("A BOOLEAN RECORD CANNOT BACK A FIGURE OF ZERO", async () => {
    forbidCalls();
    // Number(false) is 0. Without the guard, "shipping is ₹0" would be
    // entailed by "we do not use ammonia".
    const r = await verifyClaims(
      [extracted({ claimType: "shipping", canonical: "shipping is free", value: { number: 0, unit: "inr" } })],
      [approvedClaim({ claimType: "material", intent: "no ammonia is used", value: false, unit: null })]
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
  });
});
