// S4/P1 — M9: WHAT THE LIVE PAGES ALREADY CLAIM.
//
// Read only, and in two layers because this is the only part of P1 that
// costs money. The free layer is safe on the daily clock; the paid one
// is off unless asked for, and capped when it is.
//
// R3 governs what it may do with what it finds — report once, offer,
// change nothing unasked — so these tests assert the SHAPE of the
// report as much as the finding: counts and pointers, not the owner's
// own sentences quoted back at him in a daily email.

import { describe, it, expect, afterEach } from "vitest";
import { auditLiveCopy, PAID_LINE_CAP, type CopyLine } from "@/lib/growth/copyAudit";
import { scorable } from "@/lib/growth/findings";
import { CANDLE } from "../scripts/eval/fixtures";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
});

const FACTS = CANDLE.facts as unknown as BusinessFacts;

function line(text: string, over: Partial<CopyLine> = {}): CopyLine {
  return { pageId: "p1", pageSlug: "home", blockId: "b1", prop: "html", text, ...over };
}

/**
 * Counts model calls instead of throwing on them.
 *
 * THROWING WAS NOT ENOUGH, and the mutation check proved it: with the
 * paid layer forced on, the throw was swallowed by extractClaims'
 * own error handling, came back as `unverified`, and the result still
 * had costInr 0 and freeLayerOnly true — so the test passed while a
 * model was being called on every audit. The property is "no call was
 * ATTEMPTED", so the attempt is what gets counted.
 */
const calls: string[] = [];
function forbidModelCalls() {
  calls.length = 0;
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    throw new Error("the free layer must not call a model");
  }) as typeof fetch;
}

/** Answers the extractor, the net and the judge by tool name. */
function answer(by: Record<string, unknown>, opts: { failJudge?: boolean } = {}) {
  globalThis.fetch = (async (_u: any, init: any) => {
    const body = JSON.parse(init.body);
    const wanted = String(body?.tool_choice?.name ?? body?.tools?.[0]?.name ?? "");
    if (opts.failJudge && wanted === "report_verdicts") {
      return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "busy" } }), { status: 529 });
    }
    return new Response(
      JSON.stringify({ content: [{ type: "tool_use", name: wanted, input: by[wanted] ?? { claims: [] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
}

describe("1. the free layer costs nothing and still finds things", () => {
  it("DOES NOT CALL A MODEL BY DEFAULT", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Hand-poured in small batches.")], FACTS, { dealershipId: "d1" });
    expect(calls).toEqual([]);
    expect(r.costInr).toBe(0);
    expect(r.freeLayerOnly).toBe(true);
  });

  it("FINDS A PLACEHOLDER BEING SERVED TO VISITORS", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Call us on [PHONE NUMBER] today.")], FACTS, { dealershipId: "d1" });
    const f = r.findings.find((x) => x.type === "live_copy_placeholder");
    expect(f).toBeTruthy();
    expect(f!.title).toMatch(/1 line/);
    expect(f!.evidence[0].id).toBe("home:b1:html");
  });

  it("FINDS WORDING THE RECORDS DO NOT SUPPORT, and counts LINES not words", async () => {
    // An owner wants to know how many lines need attention, not how
    // many adjectives were counted.
    forbidModelCalls();
    const r = await auditLiveCopy(
      [line("The best and finest candles in the whole market."), line("Hand-poured in small batches.")],
      FACTS,
      { dealershipId: "d1" }
    );
    const f = r.findings.find((x) => x.type === "live_copy_unsupported_wording");
    expect(f).toBeTruthy();
    expect(f!.title).toMatch(/^1 line/);
  });

  it("and says nothing about copy the records do account for", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Hand-poured in small batches.")], FACTS, { dealershipId: "d1" });
    expect(r.findings).toEqual([]);
  });

  it("EVERY COUNTED NUMBER NAMES ITS SOURCE", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Hand-poured.")], FACTS, { dealershipId: "d1" });
    expect(r.counted.length).toBeGreaterThan(2);
    for (const c of r.counted) expect(String(c.source).trim()).not.toBe("");
  });
});

describe("2. the paid layer is capped, and says what it did not look at", () => {
  it("ONLY LOOKS AT PAID_LINE_CAP LINES, and reports the remainder", async () => {
    // This runs unattended. A business with eighty pages must not
    // quietly become an expensive one, and a partial audit must never
    // read as a complete one.
    answer({ report_claims: { claims: [] }, report_unlicensable: { claims: [] } });
    const many = Array.from({ length: PAID_LINE_CAP + 7 }, (_, i) => line(`Line number ${i}.`, { blockId: `b${i}` }));
    const r = await auditLiveCopy(many, FACTS, { dealershipId: "d1", allowModel: true });
    expect(r.counted.find((c) => c.label === "lines checked against your records")!.value).toBe(PAID_LINE_CAP);
    expect(r.counted.find((c) => c.label === "lines not checked this run")!.value).toBe(7);
    expect(r.freeLayerOnly).toBe(false);
  });

  it("REPORTS A CLAIM THE RECORDS CANNOT BACK, as a count with a pointer", async () => {
    answer({
      report_claims: {
        claims: [{ sentenceIndex: 0, canonical: "the candle makes the home calmer", claimType: "benefit", subject: "customer", polarity: "assert" }],
      },
      report_unlicensable: { claims: [] },
    });
    const r = await auditLiveCopy([line("Your home will feel calmer.")], FACTS, { dealershipId: "d1", allowModel: true });
    const f = r.findings.find((x) => x.type === "live_copy_unsupported_claim");
    expect(f).toBeTruthy();
    expect(f!.title).toMatch(/1 line/);
    expect(f!.evidence[0].id).toBe("home:b1:html");
  });

  it("AND OFFERS RATHER THAN CHANGING ANYTHING — R3", async () => {
    answer({
      report_claims: {
        claims: [{ sentenceIndex: 0, canonical: "the candle makes the home calmer", claimType: "benefit", subject: "customer", polarity: "assert" }],
      },
      report_unlicensable: { claims: [] },
    });
    const r = await auditLiveCopy([line("Your home will feel calmer.")], FACTS, { dealershipId: "d1", allowModel: true });
    const f = r.findings.find((x) => x.type === "live_copy_unsupported_claim")!;
    expect(f.detail).toMatch(/Nothing has been changed/);
    expect(f.detail).toMatch(/say the word/i);
    // Measured against the business's own records, not anyone's rules.
    expect(f.detail).toMatch(/your own records/);
  });

  it("A JUDGE IT COULD NOT REACH IS NOT A CLEAN RESULT", async () => {
    // The door's rule, applied here: silence read as approval is how an
    // unchecked claim survives. The free findings stand and the result
    // still says the deep check did not run.
    answer(
      {
        report_claims: {
          claims: [{ sentenceIndex: 0, canonical: "the candles are hand-poured", claimType: "process", subject: "own_product", polarity: "assert" }],
        },
        report_unlicensable: { claims: [] },
      },
      { failJudge: true }
    );
    const r = await auditLiveCopy([line("Each one is poured by hand.")], FACTS, { dealershipId: "d1", allowModel: true });
    expect(r.freeLayerOnly).toBe(true);
    expect(r.findings.find((x) => x.type === "live_copy_unsupported_claim")).toBeUndefined();
  });

  it("and the paid layer never runs without facts to check against", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Anything.")], null, { dealershipId: "d1", allowModel: true });
    expect(calls).toEqual([]);
    expect(r.freeLayerOnly).toBe(true);
    expect(r.costInr).toBe(0);
  });
});

describe("3. the report carries counts, not the owner's sentences", () => {
  it("NO FINDING QUOTES THE LINE IT FOUND", async () => {
    // A daily email that quotes a business owner's own website back at
    // him as a list of falsehoods is a different product from the one
    // being built. The pointer resolves; the prose counts.
    answer({
      report_claims: {
        claims: [{ sentenceIndex: 0, canonical: "the candle makes the home calmer", claimType: "benefit", subject: "customer", polarity: "assert" }],
      },
      report_unlicensable: { claims: [] },
    });
    const sentence = "Your home will feel calmer and your evenings softer.";
    const r = await auditLiveCopy([line(sentence)], FACTS, { dealershipId: "d1", allowModel: true });
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(f.title).not.toContain(sentence);
      expect(f.detail).not.toContain(sentence);
    }
  });

  it("AND EVERY FINDING IS USABLE BY THE STRATEGIST", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Call us on [PHONE] — the best in the market!")], FACTS, { dealershipId: "d1" });
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(scorable(f.score), f.type).toBe(true);
      expect(f.evidence.length, f.type).toBeGreaterThan(0);
      for (const e of f.evidence) expect(String(e.id).trim()).not.toBe("");
    }
  });

  it("and names no trade", async () => {
    forbidModelCalls();
    const r = await auditLiveCopy([line("Call us on [PHONE] — the best in the market!")], FACTS, { dealershipId: "d1" });
    for (const f of r.findings) {
      expect(`${f.title} ${f.detail}`).not.toMatch(/candle|ghee|salon|dairy|paneer/i);
    }
  });
});
