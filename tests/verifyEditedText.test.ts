// S3/P4 — WORDING THE MODEL WROTE FOR A PAGE GETS CHECKED.
//
// The founder's rule of 22 October 2026: his own exact words go on the
// page untouched, anything the model wrote or reworded goes through the
// fact check. The provenance half already existed and was right —
// `writtenByOwner` on edit_page_text, whose own description carries the
// subtle part: "approving a draft is approving its publication, not
// vouching for it."
//
// What was missing is that model-written edit text went through the
// OLDER claims layer and not the fact-bound verifier. The live site
// shows what that costs: "burns cleaner, slower, and safer than
// mass-market paraffin" and "Better for your home, better for the air
// you breathe" are a comparison claim and a benefit claim, and nothing
// in the licence table can ever support either.

import { describe, it, expect, afterEach } from "vitest";
import { verifyEditedText, editRefusalNote } from "@/lib/content/verifyEditedText";
import { code } from "./helpers/source";
import { CANDLE } from "../scripts/eval/fixtures";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
});

const FACTS = CANDLE.facts as unknown as BusinessFacts;

const tool = (name: string, input: unknown) => ({
  content: [{ type: "tool_use", name, input }],
  usage: { input_tokens: 10, output_tokens: 5 },
});

/** Answers by tool name, so call ORDER is never what a test depends on. */
function answer(by: Record<string, unknown>, opts: { failExtract?: boolean; failJudge?: boolean } = {}) {
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const wanted = String(body?.tool_choice?.name ?? body?.tools?.[0]?.name ?? "");
    if (opts.failExtract && wanted === "report_claims") {
      return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "busy" } }), { status: 529 });
    }
    if (opts.failJudge && wanted === "report_verdicts") {
      return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "busy" } }), { status: 529 });
    }
    const payload = by[wanted] ?? { claims: [] };
    return new Response(JSON.stringify(tool(wanted, payload)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("1. a claim nothing can license is refused", () => {
  it("A BENEFIT CLAIM NEVER REACHES THE PAGE", async () => {
    // Refused in code before any judge call: nothing in the licence
    // table grants `benefit`.
    answer({
      report_claims: {
        claims: [
          {
            sentenceIndex: 0,
            canonical: "the candle makes the reader's home calmer",
            claimType: "benefit",
            subject: "customer",
            polarity: "assert",
          },
        ],
      },
      report_unlicensable: { claims: [] },
    });
    const r = await verifyEditedText({
      texts: ["Your home will feel calmer."],
      facts: FACTS,
      dealershipId: "d1",
      topic: "home",
    });
    expect(r.ok).toBe(false);
    expect(r.unverified).toBe(false);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].text).toBe("Your home will feel calmer.");
  });

  it("AND THE OWNER IS TOLD WHICH LINE AND WHY", () => {
    const note = editRefusalNote({
      ok: false,
      unverified: false,
      costInr: 0,
      refused: [{ text: "Your home will feel calmer.", why: "nothing on record can support a benefit claim" }],
    });
    expect(note).toMatch(/didn't put that on the page/);
    expect(note).toMatch(/Your home will feel calmer/);
    expect(note).toMatch(/benefit claim/);
  });
});

describe("2. a recorded fact still goes through — the half I expected to break", () => {
  it("A TRUE FIGURE PASSES WITH NO SELECT STEP AT ALL", async () => {
    // I told the founder a naive reuse would refuse everything, because
    // an edit has no Select step and `approved` is empty. It does not,
    // and the reason is written into the verifier: the records fallback,
    // whose comment states "ONLY WHAT IS IN THE RECORD MAY BE WRITTEN,
    // not only what Select happened to pick".
    const price = (FACTS as any).products?.[0]?.price;
    expect(typeof price).toBe("number");
    answer({
      report_claims: {
        claims: [
          {
            sentenceIndex: 0,
            canonical: "the candle costs that much",
            claimType: "price",
            subject: "own_product",
            polarity: "assert",
            value: { number: price, unit: "inr" },
          },
        ],
      },
      report_unlicensable: { claims: [] },
    });
    const r = await verifyEditedText({
      texts: [`It is ₹${price}.`],
      facts: FACTS,
      dealershipId: "d1",
      topic: "home",
    });
    expect(r.refused).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("and wording that states nothing is left alone without a judge call", async () => {
    answer({ report_claims: { claims: [] }, report_unlicensable: { claims: [] } });
    const r = await verifyEditedText({
      texts: ["Open Mon–Sat."],
      facts: FACTS,
      dealershipId: "d1",
      topic: "home",
    });
    expect(r.ok).toBe(true);
    expect(r.refused).toEqual([]);
  });
});

describe("3. it fails closed", () => {
  it("AN UNREACHABLE EXTRACTOR IS NOT A CLEAN RESULT", async () => {
    // F-01. Silence read as approval is how an unchecked claim reaches
    // a customer, and this one would reach a LIVE PAGE.
    answer({ report_unlicensable: { claims: [] } }, { failExtract: true });
    const r = await verifyEditedText({
      texts: ["Anything at all."],
      facts: FACTS,
      dealershipId: "d1",
      topic: "home",
    });
    expect(r.ok).toBe(false);
    expect(r.unverified).toBe(true);
  });

  it("AND NEITHER IS AN UNREACHABLE JUDGE", async () => {
    answer(
      {
        report_claims: {
          claims: [{ sentenceIndex: 0, canonical: "the candles are hand-poured", claimType: "process", subject: "own_product", polarity: "assert" }],
        },
        report_unlicensable: { claims: [] },
      },
      { failJudge: true }
    );
    const r = await verifyEditedText({
      texts: ["Each one is poured by hand."],
      facts: FACTS,
      dealershipId: "d1",
      topic: "home",
    });
    expect(r.ok).toBe(false);
    expect(r.unverified).toBe(true);
  });

  it("and says so plainly rather than blaming the wording", () => {
    const note = editRefusalNote({ ok: false, unverified: true, costInr: 0, refused: [] });
    expect(note).toMatch(/couldn't check that wording/);
    expect(note).not.toMatch(/don't back it up/);
  });
});

describe("4. one enumeration, and one flag", () => {
  const src = code("src/lib/content/verifyEditedText.ts");
  const brain = code("src/lib/agents/masterBrainV2.ts");

  it("SPLITS SENTENCES WITH THE DOOR'S OWN FUNCTION", () => {
    // Re-deriving this is the B18 fault this codebase has paid for four
    // times over: the grading sheet, the output gate, the records box
    // and the cost estimator.
    expect(src).toMatch(/copySentences\(\{ text: texts \}/);
  });

  it("PASSES NO APPROVED CLAIMS, AND ALL THE RECORDS", () => {
    expect(src).toMatch(/verifyClaims\(claims, \[\], \{ logContext: log, records: ctx\.records \}\)/);
  });

  it("ONLY MODEL-WRITTEN LINES ARE CHECKED", () => {
    // The owner's own words are his. This is the line that keeps them
    // out of the check entirely.
    expect(brain).toMatch(/wanted\.filter\(\(e: any\) => !e\.writtenByOwner\)/);
  });

  it("AND THE WHOLE THING SITS BEHIND FACT_BOUND_COPY", () => {
    // Switching it on for page edits alone would mean one surface
    // running a pipeline the other four are not.
    const gate = brain.slice(brain.indexOf("const modelWritten ="), brain.indexOf("const result = applyEdits"));
    expect(gate).toMatch(/process\.env\.FACT_BOUND_COPY === "1"/);
  });

  it("and the older claims layer is still there underneath", () => {
    // Nothing was removed. With the flag off this path behaves exactly
    // as it did.
    expect(brain).toMatch(/applyEdits\(liveSections, wanted, editFacts\)/);
  });

  it("tells the model what to do instead, including the owner's-words case", () => {
    const gate = brain.slice(brain.indexOf("const modelWritten ="), brain.indexOf("const result = applyEdits"));
    expect(gate).toMatch(/Do not simply resend the same wording/);
    expect(gate).toMatch(/writtenByOwner/);
  });
});
