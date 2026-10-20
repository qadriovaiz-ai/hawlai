// C2 step 4b — deciding each claim the copy makes.
//
// Free: the judge is stubbed. What is pinned here is the split that
// matters — no figure ever reaches a model — and that silence from the
// judge is not a pass.

import { describe, it, expect, afterEach, vi } from "vitest";
import { verifyClaims, verifyNote, approvedForJudge, NUMERIC_TYPES } from "@/lib/facts/verifyClaims";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, placeholderFree, type ExtractedClaim, type ClaimType } from "@/lib/facts/extractClaims";
import type { SelectedClaim } from "@/lib/facts/selectClaims";
import type { FactRecord } from "@/lib/facts/factRecord";

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

describe("a figure stated without a unit", () => {
  // The third S2a WhatsApp run removed two true, recorded figures:
  //
  //   Removed "Shipping costs 50."  — it states 50 <UNKNOWN>, and the
  //     figures on record are 120 inr, 10 percent, 50 inr
  //
  // 50 inr was right there in the approved list. The only thing that
  // refused it was the unit: the extractor's schema REQUIRED a unit, so
  // for a sentence that states none the model produced "<UNKNOWN>", and
  // sameUnit read that as a unit contradicting "inr".
  //
  // A field that cannot say "there is none" makes the model invent one.
  // Exactly the shape of the boolean that had to be stringified to
  // "false" and was then read as marking its own claim untrue.

  it("THE UNIT FIELD IS OPTIONAL, so nothing has to be invented for it", async () => {
    const { code } = await import("./helpers/source");
    const src = code("src/lib/facts/extractClaims.ts");
    expect(src).toMatch(/required: \["number"\]/);
    expect(src).not.toMatch(/required: \["number", "unit"\]/);
    expect(src).toMatch(/OMIT this entirely when the text states no unit/);
  });

  it("EVERY WAY OF SAYING \"ABSENT\" ARRIVES AS ABSENT", () => {
    for (const u of ["<UNKNOWN>", "UNKNOWN", "unspecified", "none", "n/a", "-", "", "  ", "null"]) {
      expect(placeholderFree(u)).toBe("");
    }
  });

  it("but a real unit is untouched, including the ones that look odd", () => {
    expect(placeholderFree("₹")).toBe("₹");
    expect(placeholderFree(" inr ")).toBe("inr");
    expect(placeholderFree("percent")).toBe("percent");
    expect(placeholderFree("currency")).toBe("currency");
    expect(placeholderFree("minutes")).toBe("minutes");
  });

  it("THE SENTENCE THAT WAS REMOVED IS NOW ENTAILED", async () => {
    const r = await verifyClaims(
      [extracted({ claimType: "shipping", value: { number: 50, unit: "<UNKNOWN>" }, canonical: "shipping costs 50" })],
      [approvedClaim({ claimType: "shipping", value: 50, unit: "inr" })]
    );
    expect(r.verdicts[0].verdict).toBe("entailed");
    expect(r.verdicts[0].rule).toBe("figure_matches");
    expect(r.unsupportedSentences).toEqual([]);
  });

  it("AND A WRONG NUMBER WITHOUT A UNIT IS STILL REFUSED", async () => {
    // The direction that must not loosen. Dropping the unit buys no
    // leniency on the figure itself.
    const r = await verifyClaims(
      [extracted({ claimType: "shipping", value: { number: 90, unit: "<UNKNOWN>" }, canonical: "shipping costs 90" })],
      [approvedClaim({ claimType: "shipping", value: 50, unit: "inr" })]
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].rule).toBe("figure_not_approved");
  });

  it("and a stated unit that genuinely disagrees is still refused", async () => {
    const r = await verifyClaims(
      [extracted({ claimType: "shipping", value: { number: 50, unit: "percent" }, canonical: "shipping is 50 percent" })],
      [approvedClaim({ claimType: "shipping", value: 50, unit: "inr" })]
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
  });
});

describe("a figure written into a record's words, not its value", () => {
  // The fourth S2a WhatsApp run removed two more true figures:
  //
  //   Removed "The paneer is 250g." — it states 250 g, and the figures
  //     on record are Made fresh every morning, 120 inr, 10 percent,
  //     50 inr, 11223344556677
  //   Removed "The candles burn for 40 hours." — it states 40 hours for
  //     hand-poured soy wax candles, and that figure belongs to
  //     something else
  //
  // 250 is in the product's own NAME, "Paneer 250g". 40 is in a
  // business-level record, product.burn_hours = 40 hours, which is true
  // of the whole range — the approved claim had been attached to one
  // candle and the writer widened it correctly.
  //
  // Step 2 has always checked a figure against the record's own WORDS
  // as well as its value. Step 4 checked only the approved values. The
  // founder's rule is "only what is in the record may be written", not
  // "only what Select happened to pick".

  const rec = (over: Partial<FactRecord>): FactRecord => ({
    id: "f_x",
    dealershipId: "biz_1",
    key: "product.paneer_250g.name",
    value: "Paneer 250g",
    unit: null,
    source: "catalogue",
    sourceRef: "products:p1",
    confidence: "observed",
    licenses: ["value", "existence"],
    recordedText: "Paneer 250g",
    observedAt: "2026-10-19T00:00:00.000Z",
    ...over,
  });

  it("A FIGURE IN THE PRODUCT'S OWN NAME IS IN THE RECORDS", async () => {
    const r = await verifyClaims(
      [extracted({ claimType: "count", canonical: "the paneer is 250g", value: { number: 250, unit: "g" }, aboutProduct: "paneer" })],
      [approvedClaim({ claimType: "price", value: 120, unit: "inr", aboutProduct: "Paneer 250g" })],
      { records: [rec({}), rec({ id: "f_p", key: "product.paneer_250g.price", value: 120, unit: "inr", recordedText: "Paneer 250g — ₹120" })] }
    );
    expect(r.verdicts[0].verdict).toBe("entailed");
    expect(r.verdicts[0].reason).toContain("Paneer 250g");
    expect(r.unsupportedSentences).toEqual([]);
  });

  it("A BUSINESS-LEVEL RECORD COVERS A CLAIM ABOUT THE RANGE", async () => {
    // product.burn_hours has only two segments, so scopeOfKey reads it
    // as business-level — the owner's statement about her candles, not
    // about one of them.
    const r = await verifyClaims(
      [extracted({ claimType: "duration", canonical: "the candles burn for 40 hours", value: { number: 40, unit: "hours" }, aboutProduct: "hand-poured soy wax candles" })],
      [approvedClaim({ claimType: "duration", value: 40, unit: "hour", aboutProduct: "Lavender candle" })],
      { records: [rec({ id: "f_burn", key: "product.burn_hours", value: 40, unit: "hours", recordedText: "candles burn for 40 hours" })] }
    );
    expect(r.verdicts[0].verdict).toBe("entailed");
  });

  it("BUT A PRODUCT RECORD STILL COVERS ONLY ITS OWN PRODUCT", async () => {
    // The 18 October hole stays shut. The 999 is the Lavender's.
    const r = await verifyClaims(
      [extracted({ claimType: "price", canonical: "the rose candle costs ₹999", value: { number: 999, unit: "inr" }, aboutProduct: "Rose candle" })],
      [approvedClaim({ value: 999, unit: "inr", aboutProduct: "Lavender candle" })],
      { records: [rec({ id: "f_lav", key: "product.lavender_candle.price", value: 999, unit: "inr", recordedText: "Lavender candle — ₹999" })] }
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].rule).toBe("figure_not_approved");
  });

  it("AND A FIGURE IN NO RECORD AT ALL IS STILL REFUSED", async () => {
    const r = await verifyClaims(
      [extracted({ claimType: "price", canonical: "it costs ₹1499", value: { number: 1499, unit: "inr" } })],
      [approvedClaim({ value: 999, unit: "inr" })],
      { records: [rec({ id: "f_lav", key: "product.lavender_candle.price", value: 999, unit: "inr", recordedText: "Lavender candle — ₹999" })] }
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
  });

  it("and with no records passed it behaves exactly as before", async () => {
    const r = await verifyClaims(
      [extracted({ claimType: "price", canonical: "it costs ₹1499", value: { number: 1499, unit: "inr" } })],
      [approvedClaim({ value: 999, unit: "inr" })]
    );
    expect(r.verdicts[0].verdict).toBe("unsupported");
  });
});

describe("Select is curation, not gatekeeping", () => {
  // THE FOUNDER'S DECISION OF 2026-10-20. Run 12's dairy-10 copy said
  // "The paneer is fresh." and the judge removed it — "No approved fact
  // states anything about the paneer's freshness." It IS recorded;
  // Select had simply picked other facts for a message about delivery.
  //
  // His rule has always been that what is in the record may be written.
  // The pipeline was enforcing something narrower: that only what
  // Select CHOSE may be written. A true, recorded, product-scoped
  // sentence was deleted because of which facts a model found most
  // useful ten seconds earlier.

  const rec = (over: Partial<FactRecord>): FactRecord => ({
    id: "f_x",
    dealershipId: "biz_1",
    key: "product.paneer_250g.description",
    value: "Made fresh every morning",
    unit: null,
    source: "catalogue",
    sourceRef: "products:p1",
    confidence: "observed",
    licenses: ["existence", "policy", "process"],
    recordedText: "Paneer 250g: Made fresh every morning",
    observedAt: "2026-10-20T00:00:00.000Z",
    ...over,
  });

  const chosen = approvedClaim({ claimType: "shipping", value: 50, unit: "inr", intent: "delivery costs ₹50" });
  const shipRecord = rec({ id: "f1", key: "shipping.rate", value: 50, unit: "inr", recordedText: "shipping is flat ₹50", source: "shipping_config", licenses: ["policy", "value", "existence"] });
  const freshRecord = rec({
    id: "f_fresh",
    key: "product.paneer_250g.description",
    value: "Made fresh every morning",
    unit: null,
    recordedText: "Paneer 250g: Made fresh every morning",
  });

  it("THE UNCHOSEN RECORDS REACH THE JUDGE, MARKED AS SUCH", async () => {
    const sent: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [{ index: 0, entailed: true, why: "it is on record" }] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const r = await verifyClaims(
      [extracted({ claimType: "material", canonical: "the paneer is fresh", aboutProduct: "paneer" })],
      [chosen],
      { records: [shipRecord, freshRecord] }
    );
    const prompt = JSON.stringify(sent[0]);
    expect(prompt).toMatch(/Facts chosen for this piece/);
    expect(prompt).toMatch(/Also on record for this business, but NOT chosen for this piece/);
    expect(prompt).toMatch(/Made fresh every morning/);
    expect(r.verdicts[0].verdict).toBe("entailed");
  });

  it("alsoOnRecord LEAVES OUT WHAT WAS ALREADY CHOSEN", async () => {
    const { alsoOnRecord } = await import("@/lib/facts/verifyClaims");
    const text = alsoOnRecord([chosen], [shipRecord, freshRecord]);
    // chosen cites f1, so the shipping row must not appear twice.
    expect(text).toMatch(/Made fresh every morning/);
    expect(text).not.toMatch(/shipping is flat/);
  });

  it("AND LEAVES OUT A RECORD WITH NO VALUE — citing an absence is not evidence", async () => {
    const { alsoOnRecord } = await import("@/lib/facts/verifyClaims");
    const nothing = rec({ id: "f_null", key: "shipping.mode", value: null, unit: null, recordedText: "nothing is shipped" });
    expect(alsoOnRecord([], [nothing])).toBe("");
  });

  it("each unchosen fact carries what it covers, so scope still decides", async () => {
    const { alsoOnRecord } = await import("@/lib/facts/verifyClaims");
    expect(alsoOnRecord([], [freshRecord])).toMatch(/\[.+\]/);
  });

  it("THE RUBRIC SAYS BOTH LISTS ARE EVIDENCE AND THE STANDARD IS UNCHANGED", async () => {
    const { code } = await import("./helpers/source");
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/YOU MAY BE SHOWN TWO LISTS, AND BOTH ARE EVIDENCE/);
    expect(src).toMatch(/NEVER answer "not entailed" on the ground that a fact was not chosen for this piece/);
    // The half that stops this becoming a licence to be lenient.
    expect(src).toMatch(/A second list is more evidence to read, not a lower standard to meet/);
    expect(src).toMatch(/If neither list states the claim, it is not entailed/);
  });

  it("NOTHING CHOSEN IS NOT NOTHING ON RECORD", async () => {
    // Run 13, salon-04. Select approved nothing for a message whose
    // owner had asked for free shipping on treatments, and the verifier
    // then refused every sentence WITHOUT A JUDGE CALL - including "The
    // business is located in Indore", which is business.city and is on
    // record.
    //
    // The short-circuit said "no approved facts, so nothing can be
    // entailed", which was true until the records became evidence one
    // commit earlier. A model choosing no facts for one message must
    // not make the business's records disappear.
    const sent: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [{ index: 0, entailed: true, why: "business.city says Indore" }] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const city = rec({ id: "f_city", key: "business.city", value: "Indore", unit: null, recordedText: "the business is in Indore" });
    const r = await verifyClaims(
      [extracted({ claimType: "availability", canonical: "the business is located in Indore" })],
      // NOTHING approved.
      [],
      { records: [city] }
    );
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).toMatch(/the business is in Indore/);
    expect(r.verdicts[0].verdict).toBe("entailed");
  });

  it("BUT NOTHING ON RECORD AT ALL STILL NEEDS NO JUDGE", async () => {
    // The short-circuit must still fire when it is genuinely true,
    // because a call that can only be answered one way is a wasted one.
    globalThis.fetch = (async () => {
      throw new Error("the judge was called with nothing to show it");
    }) as typeof fetch;
    const r = await verifyClaims([extracted({ claimType: "availability", canonical: "the business is open" })], [], { records: [] });
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].reason).toMatch(/nothing to support it/);
  });

  it("and with no records passed the judge sees one list, exactly as before", async () => {
    const sent: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [{ index: 0, entailed: false, why: "nothing states it" }] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    await verifyClaims([extracted({ claimType: "material", canonical: "the paneer is fresh" })], [chosen]);
    expect(JSON.stringify(sent[0])).not.toMatch(/Also on record/);
  });
});

describe("two true records side by side are not a third fact", () => {
  // The founder's blind grading of run 14 found one F in 26 sentences:
  //
  //   "We deliver to your door in Indore for just ₹50 — flat rate,
  //    same for everyone."
  //
  // The RATE is on record. The AREA is not, anywhere. The judge put
  // business.city next to shipping.rate and read a delivery area out of
  // the pair — and the second list, added the same day, is what made
  // two unrelated records easy to find together.
  //
  // This is the causal rule of 18 October in the one place the change
  // made it easy to break: two true facts do not make the link between
  // them true.

  it("THE RUBRIC NAMES THE TRAP AND THE SENTENCE THAT SPRANG IT", async () => {
    const { code } = await import("./helpers/source");
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/WHERE A BUSINESS IS, AND WHAT IT CHARGES TO DELIVER, DO NOT ADD UP TO WHERE IT DELIVERS/);
    expect(src).toMatch(/that needs a record of the coverage itself, naming the area, the pin codes or the radius/);
    expect(src).toMatch(/is NOT ENTAILED by "the business is in Indore" plus "delivery costs Rs 50"/);
  });

  it("AND IT NAMES THE SAME TRAP IN OTHER CLOTHES, so the fix is not one sentence", async () => {
    // B10's lesson: a rule written as one example is defeated by the
    // next example. Opening hours plus a phone number, a price plus a
    // product, a process plus a material.
    const { code } = await import("./helpers/source");
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/THE SAME TRAP IN ITS OTHER FORMS/);
    expect(src).toMatch(/a price plus a product do not establish that it is in stock/);
    expect(src).toMatch(/is there ONE record that states this, or am I adding two together/);
  });

  it("it sits with the second-list rule, because that is what it guards", async () => {
    const { code } = await import("./helpers/source");
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src.indexOf("WHERE A BUSINESS IS")).toBeGreaterThan(src.indexOf("YOU MAY BE SHOWN TWO LISTS"));
  });
});
