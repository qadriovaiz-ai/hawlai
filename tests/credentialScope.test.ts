// A LICENCE IS THE BUSINESS'S, AND THE PRODUCT IS SOLD UNDER IT.
//
// THE FOUNDER'S FINDING OF 2026-10-22, from the Option A confirmation
// run. dairy-03 lost this sentence:
//
//   "This ghee carries FSSAI licence 11223344556677."
//
// and the owner was told "No fact on record states any FSSAI licence
// number" — while `the owner wrote: "FSSAI licence 11223344556677."` is
// on dairy-03's record, and dairy-09 PUBLISHED the same licence from the
// same record in the same run, because that sentence named no product.
//
// The cause is the scope rule of 20 October doing its job and reaching
// one class too far. A business-level record cannot carry a claim about
// one named item — "we hand-churn" says nothing about whether THIS
// paneer was churned, which is the incident the rule was built for. But
// a credential is held by the business and everything it sells is sold
// under it. Refusing it per product protects nobody: it deletes a true
// sentence and denies the owner their own record.
//
// SO THE EXCEPTION IS KEYED ON THE CLAIM TYPE AND NOTHING ELSE, and it
// contains exactly one type. These tests exist to keep it that size:
// widening the set is how the paneer bug comes back.

import { describe, it, expect, afterEach } from "vitest";
import { recordSupportsScope, inheritsFromBusiness } from "@/lib/facts/scope";
import { verifyClaims } from "@/lib/facts/verifyClaims";
import type { ExtractedClaim } from "@/lib/facts/extractClaims";
import type { SelectedClaim } from "@/lib/facts/selectClaims";
import type { FactRecord } from "@/lib/facts/factRecord";
import { code } from "./helpers/source";
import { validateSelection as validateSelectionFn } from "@/lib/facts/validateSelection";
import { contextFromFacts } from "@/lib/facts/getContext";
import { scopeOfKey, resolveProduct } from "@/lib/facts/scope";
import { DAIRY } from "../scripts/eval/fixtures";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
});

function extracted(over: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return { sentenceIndex: 0, canonical: "the candle is made of soy wax", claimType: "material", subject: "own_product", polarity: "assert", ...over };
}
function approvedClaim(over: Partial<SelectedClaim> = {}): SelectedClaim {
  return { id: "c1", claimType: "price", factIds: ["f1"], intent: "the ghee costs ₹850", value: 850, unit: "inr", ...over };
}
function record(over: Partial<FactRecord> = {}): FactRecord {
  return {
    id: "f_fssai",
    dealershipId: "biz_1",
    key: "statement.p3",
    value: "FSSAI licence 11223344556677.",
    unit: null,
    source: "owner_stated",
    sourceRef: "business_knowledge:d1",
    confidence: "inferred",
    licenses: ["existence", "policy", "process"],
    recordedText: "FSSAI licence 11223344556677.",
    observedAt: "2026-10-22T00:00:00.000Z",
    ...over,
  };
}

describe("1. the exception, and its exact size", () => {
  it("A CREDENTIAL CLAIM ABOUT ONE PRODUCT MAY CITE A BUSINESS-LEVEL RECORD", () => {
    expect(recordSupportsScope("statement.p3", "desi_ghee_500ml", "credential")).toBe(true);
  });

  it("AND THE PANEER BUG STAYS FIXED — process is not inherited", () => {
    // The 20 October incident, asserted in the one form that matters.
    expect(recordSupportsScope("process.hand_churned", "paneer_250g", "process")).toBe(false);
    expect(recordSupportsScope("process.hand_churned", "desi_ghee_500ml", "process")).toBe(false);
    expect(recordSupportsScope("material.ammonia", "keratin_treatment", "material")).toBe(false);
  });

  it("NOTHING ELSE INHERITS, and this is the list", () => {
    expect(inheritsFromBusiness("credential")).toBe(true);
    for (const t of ["process", "material", "duration", "count", "price", "benefit", "safety", "capability", "comparison", "availability", "shipping", "offer", ""]) {
      expect(inheritsFromBusiness(t)).toBe(false);
    }
  });

  it("a caller that passes no claim type gets the old answer", () => {
    // Every existing call site that has not been threaded keeps the
    // strict rule, so the exception can never arrive by accident.
    expect(recordSupportsScope("statement.p3", "desi_ghee_500ml")).toBe(false);
    expect(recordSupportsScope("process.hand_churned", "paneer_250g")).toBe(false);
  });

  it("and the rest of the rule is untouched", () => {
    expect(recordSupportsScope("shipping.mode", "lavender_candle", "shipping")).toBe(true);
    expect(recordSupportsScope("product.rose_candle.price", "lavender_candle", "price")).toBe(false);
    expect(recordSupportsScope("product.lavender_candle.price", "lavender_candle", "price")).toBe(true);
    // A claim about the range was always fine and still is.
    expect(recordSupportsScope("process.hand_churned", null, "process")).toBe(true);
  });
});

describe("2. the judge actually sees it", () => {
  /** The CLAIMS section only — the system prompt uses these words itself. */
  const claimsBlock = (request: any): string => {
    const content = String(request?.messages?.[0]?.content ?? "");
    const at = content.indexOf("Claims to decide:");
    return at < 0 ? "" : content.slice(at);
  };

  function capture() {
    const sent: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [{ index: 0, entailed: true, why: "x" }] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    return sent;
  }

  it("DAIRY-03's LICENCE IS PUT IN FRONT OF THE JUDGE", async () => {
    const sent = capture();
    await verifyClaims(
      [extracted({ claimType: "credential", canonical: "the ghee carries FSSAI licence 11223344556677", aboutProduct: "Desi ghee 500ml" })],
      [approvedClaim({ aboutProduct: "Desi ghee 500ml" })],
      { records: [record({})] }
    );
    expect(sent).toHaveLength(1);
    expect(claimsBlock(sent[0])).toMatch(/ALSO ON RECORD[\s\S]*11223344556677/);
  });

  it("AND A PROCESS CLAIM ABOUT THE SAME PRODUCT STILL IS NOT", async () => {
    // Same record, same product, different claim type. The type is the
    // whole of the exception.
    const sent = capture();
    await verifyClaims(
      [extracted({ claimType: "process", canonical: "the paneer is hand-churned", aboutProduct: "Paneer 250g" })],
      [approvedClaim({ aboutProduct: "Paneer 250g" })],
      { records: [record({ id: "f_churn", key: "process.hand_churned", value: true, recordedText: "Haath se churn karte hain." })] }
    );
    expect(claimsBlock(sent[0])).not.toMatch(/ALSO ON RECORD/);
  });
});

describe("3. it is threaded at every gate, not just the last one", () => {
  it("SELECT'S OWN VALIDATION PASSES THE CLAIM TYPE", () => {
    // Without this, dairy-03's claim dies at step 2 and never reaches
    // the judge at all, so the fix above would change nothing.
    expect(code("src/lib/facts/validateSelection.ts")).toMatch(/recordSupportsScope\(r\.key, named\.slug, claim\.claimType\)/);
  });

  it("AND THE JUDGE'S TWO EVIDENCE LISTS BOTH GET IT", () => {
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/approvedForJudge\(approved, opts\.records \?\? \[\], c\.aboutProduct, c\.claimType\)/);
    expect(src).toMatch(/alsoOnRecord\(approved, opts\.records \?\? \[\], c\.aboutProduct, c\.claimType\)/);
  });
});

describe("4. dairy-03 itself, on its own real slice", () => {
  // THE CASE THAT FOUND THIS, replayed through the real records. Free:
  // nothing here calls a model except the stubbed judge.
  const ctx = contextFromFacts("biz_1", DAIRY.facts as any, {
    kind: "social_post",
    topic: "ghee is good for digestion, post likho",
  });
  const fssai = ctx.records.find((r) => String(r.recordedText ?? "").includes("FSSAI"))!;

  it("the licence really is in its slice, and really is business-level", () => {
    expect(fssai).toBeTruthy();
    expect(fssai.key).toBe("statement.fssai_licence_11223344556677");
    expect(scopeOfKey(fssai.key).kind).toBe("business");
  });

  it("SELECT NEVER REFUSED IT — I SAID IT DID, AND THAT WAS WRONG", () => {
    // Reported to the founder as "it dies at step 2". It does not.
    // dairy-03's slice withholds the paneer, so its catalogue has ONE
    // product, and resolveProduct deliberately returns "none" there:
    // "a single-product catalogue has no such gap, so scope never
    // blocks". Select approved this claim before the fix and after it.
    //
    // KEPT AS A TEST RATHER THAN DELETED, because the mutation check is
    // what exposed it: dropping claim.claimType from validateSelection
    // broke only the source-grep assertion and not the behavioural one,
    // which is exactly what a vacuous test looks like.
    expect(resolveProduct("Desi ghee 500ml", [{ name: "Desi ghee 500ml" }])).toEqual({ kind: "none" });
    const v = validateSelectionFn(
      { claims: [{ id: "c1", claimType: "credential", factIds: [fssai.id], intent: "the ghee carries FSSAI licence 11223344556677", aboutProduct: "Desi ghee 500ml" } as any] },
      ctx.records,
      "biz_1"
    );
    expect(v.approved).toHaveLength(1);
  });

  it("THE GATE THAT DELETED IT WAS THE JUDGE'S EVIDENCE FILTER, and this is the real fix", async () => {
    // alsoOnRecord asks recordSupportsScope with the RAW product name,
    // so it applies the strict rule even in a single-product slice
    // where Select has decided scope does not apply. That is why the
    // judge saw no evidence and refused a recorded licence.
    const sent: any[] = [];
    globalThis.fetch = (async (_u: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [{ index: 0, entailed: true, why: "x" }] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    // THE CANONICAL MUST NOT CARRY THE NUMBER, and that is not a
    // detail. My first version wrote "the ghee carries FSSAI licence
    // 11223344556677" as the claim and then searched the claims block
    // for the digits — which the claim header prints itself, so the
    // test passed with the evidence filter mutated out. The same
    // mistake the hand-churning test records making twice.
    await verifyClaims(
      [extracted({ claimType: "credential", canonical: "the ghee carries an FSSAI licence", aboutProduct: "Desi ghee 500ml" })],
      [approvedClaim({ factIds: ["f_other"], aboutProduct: "Desi ghee 500ml" })],
      { records: ctx.records }
    );
    const content = String(sent[0]?.messages?.[0]?.content ?? "");
    const claims = content.slice(content.indexOf("Claims to decide:"));
    // The property is that EVIDENCE was attached, so assert the header.
    expect(claims).toMatch(/ALSO ON RECORD[\s\S]*11223344556677/);
  });

  it("AND THE SAME RECORD IS STILL REFUSED FOR A PROCESS CLAIM ON ANOTHER PRODUCT", () => {
    // If this ever passes, the 20 October paneer crossover is back.
    const churn = ctx.records.find((r) => r.key === "process.hand_churned")!;
    expect(recordSupportsScope(churn.key, "paneer_250g", "process")).toBe(false);
    expect(recordSupportsScope(churn.key, "paneer_250g", "material")).toBe(false);
  });
});
