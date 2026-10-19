// TWO PATTERNS, AND EVERY PLACE THEY CAN HAPPEN.
//
// Founder, 18 October 2026: the three sentences the last run produced
// were symptoms. The patterns are what to fix, and the fault was not
// the pipeline's design — select / validate / write / verify is right —
// but that certain rules were applied in some places and not others.
//
//   P1  REASON-CONNECTING. The Write step joins two true facts into a
//       third claim nobody made: "A, so B". Both halves are on the
//       approved list, so a model joining them believes it is obeying,
//       which is why the no-judgement and no-strengthening rules do not
//       catch it.
//   P2  SCOPE-MIXING. A general business fact used for a claim about one
//       named product, or one product's figure used for another.
//
// The scope rule lived in three PROMPTS and nowhere in code, so it held
// wherever a model applied it and failed wherever one did not. It is now
// a module (src/lib/facts/scope.ts) that the validator and the verifier
// both read, and the rule is stated at every step rather than some.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { scopeOfKey, recordSupportsScope, resolveProduct, productSlug, describeScope, sameProductName } from "@/lib/facts/scope";
import { validateSelection } from "@/lib/facts/validateSelection";
import { verifyClaims } from "@/lib/facts/verifyClaims";
import { licensesFor, type FactRecord } from "@/lib/facts/factRecord";
import type { SelectedClaim } from "@/lib/facts/selectClaims";
import type { ExtractedClaim } from "@/lib/facts/extractClaims";

const TENANT = "biz_1";

function record(over: Partial<FactRecord> = {}): FactRecord {
  return {
    id: "f1", dealershipId: TENANT, key: "product.lavender_candle.price", value: 999, unit: "inr",
    source: "catalogue", sourceRef: "products:p1", confidence: "counted", licenses: licensesFor("catalogue"),
    recordedText: "Lavender candle — ₹999", observedAt: "2026-10-18T00:00:00.000Z", ...over,
  };
}

const RECORDS = [
  record({ id: "f_lav", key: "product.lavender_candle.price", value: 999 }),
  record({ id: "f_lav_name", key: "product.lavender_candle.name", value: "Lavender candle", unit: null }),
  record({ id: "f_rose", key: "product.rose_candle.price", value: 850 }),
  record({ id: "f_rose_name", key: "product.rose_candle.name", value: "Rose candle", unit: null }),
  record({ id: "f_ship", key: "shipping.mode", value: "free", unit: null, source: "shipping_config", licenses: licensesFor("shipping_config"), recordedText: "shipping is free" }),
  record({ id: "f_ammonia", key: "material.ammonia", value: false, unit: null, source: "owner_stated", licenses: licensesFor("owner_stated"), recordedText: "Ammonia wale products use nahi karte." }),
];

function claim(over: Partial<SelectedClaim> = {}): SelectedClaim {
  return { id: "c1", claimType: "price", factIds: ["f_lav"], intent: "the price", value: 999, unit: "inr", aboutProduct: null, ...over };
}

const validate = (claims: SelectedClaim[], records = RECORDS) => validateSelection({ claims }, records, TENANT);

describe("P2 — scope, decided in one place", () => {
  it("A KEY SAYS WHAT IT IS ABOUT", () => {
    expect(scopeOfKey("product.lavender_candle.price")).toEqual({ kind: "product", product: "lavender_candle" });
    expect(scopeOfKey("shipping.mode")).toEqual({ kind: "policy" });
    expect(scopeOfKey("offer.first10.percent")).toEqual({ kind: "policy" });
    expect(scopeOfKey("material.ammonia")).toEqual({ kind: "business" });
    expect(scopeOfKey("process.hand_churned")).toEqual({ kind: "business" });
    expect(scopeOfKey("statement.anything")).toEqual({ kind: "business" });
  });

  it("`product.burn_hours` IS BUSINESS-LEVEL, and the two-part key is the whole distinction", () => {
    // It comes from an owner's row, not from a catalogue column, so it
    // says nothing about WHICH candle. A three-part key names a product;
    // a two-part one does not, however much it looks like it.
    expect(scopeOfKey("product.burn_hours")).toEqual({ kind: "business" });
    expect(recordSupportsScope("product.burn_hours", "lavender_candle")).toBe(false);
  });

  it("A BUSINESS FACT DOES NOT SUPPORT A CLAIM ABOUT ONE PRODUCT — the founder's rule", () => {
    expect(recordSupportsScope("material.ammonia", "keratin_treatment")).toBe(false);
    expect(recordSupportsScope("process.hand_churned", "desi_ghee_500ml")).toBe(false);
  });

  it("A STORE-WIDE POLICY DOES, because the policy IS about every product", () => {
    // "Shipping for the Lavender Candle is free" was refused in the run
    // of 18 October, though shipping is free on everything. Without this
    // carve-out that true sentence could never be written.
    expect(recordSupportsScope("shipping.mode", "lavender_candle")).toBe(true);
    expect(recordSupportsScope("offer.first10.percent", "desi_ghee_500ml")).toBe(true);
  });

  it("one product's record does not support a claim about another", () => {
    expect(recordSupportsScope("product.rose_candle.price", "lavender_candle")).toBe(false);
    expect(recordSupportsScope("product.lavender_candle.price", "lavender_candle")).toBe(true);
  });

  it("a claim about the business is supported by a business fact", () => {
    // The asymmetry is deliberate: a business-level claim wants
    // business-level evidence.
    expect(recordSupportsScope("material.ammonia", null)).toBe(true);
    expect(recordSupportsScope("material.ammonia", "")).toBe(true);
  });

  it("A NAME THE CATALOGUE DOES NOT SELL IS `unknown`, NOT `none`", () => {
    // Resolving it to null would quietly turn a claim about a
    // non-existent product into a business-level claim that any record
    // could support.
    const catalogue = [{ name: "Lavender candle" }, { name: "Rose candle" }];
    expect(resolveProduct("Lavender candle", catalogue)).toEqual({ kind: "known", slug: "lavender_candle" });
    expect(resolveProduct("Jasmine candle", catalogue)).toEqual({ kind: "unknown", named: "Jasmine candle" });
    expect(resolveProduct(null, catalogue)).toEqual({ kind: "none" });
  });

  it("slugs match the ones getContext mints", () => {
    expect(productSlug("Lavender candle")).toBe("lavender_candle");
    expect(productSlug("Desi ghee 500ml")).toBe("desi_ghee_500ml");
  });
});

describe("P2 — the validator enforces it in code, not in prose", () => {
  it("A PRODUCT CLAIM CITING A BUSINESS FACT IS REFUSED", () => {
    const v = validate([claim({ claimType: "material", factIds: ["f_ammonia"], aboutProduct: "Lavender candle", value: false, unit: null })]);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("wrong_scope");
    expect(v.rejected[0].reason).toMatch(/about the business generally/);
  });

  it("AND THE OWNER IS TOLD WHAT WOULD FIX IT", () => {
    const v = validate([claim({ claimType: "material", factIds: ["f_ammonia"], aboutProduct: "Lavender candle", value: false, unit: null })]);
    expect(v.questions[0].text).toMatch(/record it against that product/);
  });

  it("A PRODUCT CLAIM CITING A STORE POLICY IS APPROVED", () => {
    const v = validate([claim({ claimType: "shipping", factIds: ["f_ship"], aboutProduct: "Lavender candle", value: "free", unit: null })]);
    expect(v.rejected).toEqual([]);
    expect(v.approved).toHaveLength(1);
  });

  it("A CLAIM ABOUT A PRODUCT THE BUSINESS DOES NOT SELL IS REFUSED", () => {
    const v = validate([claim({ aboutProduct: "Jasmine candle" })]);
    expect(v.rejected[0].rule).toBe("wrong_scope");
    expect(v.rejected[0].reason).toMatch(/not a product or service on record/);
  });

  it("one product's figure cited for another is refused", () => {
    const v = validate([claim({ factIds: ["f_rose"], aboutProduct: "Lavender candle", value: 850 })]);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("wrong_scope");
  });

  it("and the good case still passes", () => {
    const v = validate([claim({ factIds: ["f_lav"], aboutProduct: "Lavender candle", value: 999 })]);
    expect(v.rejected).toEqual([]);
  });
});

describe("P2 — the verifier's arithmetic knows which product a figure belongs to", () => {
  const forbidCalls = () => {
    globalThis.fetch = (async () => {
      throw new Error("the model was called when it must not have been");
    }) as typeof fetch;
  };
  const approved: SelectedClaim[] = [
    { id: "c1", claimType: "price", factIds: ["f_lav"], intent: "the lavender candle costs ₹999", value: 999, unit: "inr", aboutProduct: "Lavender candle" },
  ];
  const extracted = (over: Partial<ExtractedClaim> = {}): ExtractedClaim => ({
    sentenceIndex: 0, canonical: "the candle costs ₹999", claimType: "price", subject: "own_product",
    polarity: "assert", value: { number: 999, unit: "inr" }, ...over,
  });

  it("THE ROSE CANDLE CANNOT BE GIVEN THE LAVENDER'S PRICE", async () => {
    // The hole this closes. The match ignored which product a figure
    // belonged to, so this passed every check — a wrong price on the
    // wrong product, which is candle-03's failure in another form.
    forbidCalls();
    const r = await verifyClaims([extracted({ canonical: "the rose candle costs ₹999", aboutProduct: "Rose candle" })], approved);
    expect(r.verdicts[0].verdict).toBe("unsupported");
    expect(r.verdicts[0].reason).toMatch(/belongs to something else/);
  });

  it("the right product keeps its own price", async () => {
    forbidCalls();
    const r = await verifyClaims([extracted({ aboutProduct: "Lavender candle" })], approved);
    expect(r.verdicts[0].verdict).toBe("entailed");
  });

  it("a claim naming no product still matches a store-level figure", async () => {
    // "Shipping is ₹50" is about the store, not an item.
    forbidCalls();
    const r = await verifyClaims([extracted({ aboutProduct: null })], approved);
    expect(r.verdicts[0].verdict).toBe("entailed");
  });

  it("THE JUDGE IS TOLD WHAT EACH FACT COVERS — not what it excludes", async () => {
    let body: any = null;
    globalThis.fetch = (async (_u: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "report_verdicts", input: { verdicts: [{ index: 0, entailed: false, why: "no" }] } }], usage: {} }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    await verifyClaims([extracted({ claimType: "material", value: null, canonical: "it is pure" })], approved, { records: RECORDS });
    // CHANGED 19 October, on the founder's instruction (C). The judge
    // used to be shown "about the business generally, NOT about any one
    // product" — wording that told it to refuse, and it did: "the
    // candles do not contain paraffin" was removed three runs running.
    // Scope is settled in code before the judge sees the claim, so what
    // it needs is COVERAGE.
    expect(JSON.stringify(body)).toMatch(/this fact covers:/);
    expect(JSON.stringify(body)).toMatch(/recorded against/);
    expect(JSON.stringify(body)).not.toMatch(/NOT about any one product/);
  });

  it("describeScope says it in words a person can read", () => {
    expect(describeScope("shipping.mode")).toMatch(/store-wide policy/);
    expect(describeScope("material.ammonia")).toMatch(/NOT about any one product/);
    expect(describeScope("product.lavender_candle.price")).toMatch(/one product only: lavender candle/);
  });
});

describe("P1 — reason-connecting, stated at every step that can stop it", () => {
  it("THE WRITE STEP IS TOLD NOT TO JOIN TWO FACTS", () => {
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/DO NOT JOIN TWO FACTS INTO A THIRD/);
    // The joins, in both languages.
    expect(src).toMatch(/which is why/);
    expect(src).toMatch(/isliye/);
    // And the sentence that explains why the other rules miss it.
    expect(src).toMatch(/Two true facts side by side do not make the link between them true/);
  });

  it("THE EXTRACTOR REPORTS THE LINK AS ITS OWN CLAIM", () => {
    const src = code("src/lib/facts/extractClaims.ts");
    expect(src).toMatch(/A LINK BETWEEN TWO FACTS IS A THIRD CLAIM/);
    expect(src).toMatch(/is three claims/);
  });

  it("THE JUDGE IS TOLD TWO FACTS DO NOT ENTAIL A LINK", () => {
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/TWO FACTS DO NOT ENTAIL A LINK BETWEEN THEM/);
    expect(src).toMatch(/however plausible the mechanism sounds/);
  });

  it("the write step also carries the scope rule, which it did not before", () => {
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/A FACT ABOUT ONE NAMED PRODUCT STAYS WITH THAT PRODUCT/);
    expect(src).toMatch(/Shipping and discount codes are store-wide/);
  });

  it("ALL FOUR STEPS NOW CARRY BOTH RULES — the pattern, not the three sentences", () => {
    // The founder's point: the fault was a rule applied in some places
    // and not others. This asserts the coverage rather than any one
    // sentence being fixed.
    const files = {
      select: code("src/lib/facts/selectClaims.ts"),
      validate: code("src/lib/facts/validateSelection.ts"),
      write: code("src/lib/content/generateCopy.ts"),
      verify: code("src/lib/facts/verifyClaims.ts"),
    };
    // Scope: named in select and write, enforced in code in validate and
    // verify.
    expect(files.select).toMatch(/SCOPE/);
    expect(files.write).toMatch(/ONE NAMED PRODUCT STAYS WITH THAT PRODUCT/);
    expect(files.validate).toMatch(/recordSupportsScope/);
    // sameProductName since 19 October: the exact-slug compare it
    // replaced refused a true price ("ghee" vs "Desi ghee 500ml").
    expect(files.verify).toMatch(/sameProductName/);
    // Causal: named wherever a model acts.
    expect(files.write).toMatch(/DO NOT JOIN TWO FACTS/);
    expect(files.verify).toMatch(/DO NOT ENTAIL A LINK/);
  });
});

// ---------------------------------------------------------------------
// A COLLECTIVE REFERENCE IS THE RANGE (founder, 19 October 2026).
//
// My scope fix of 18 October refused EIGHT true, recorded claims as
// scope mismatches — "the candles do not contain paraffin", "the candle
// is hand-poured", "the candles contain only soy wax" — all exactly
// what material.paraffin and process.hand_poured record. The rule is
// about ONE SPECIFICALLY NAMED item, where a business sells several and
// the record cannot say which. "The candles" is the range.
//
// DERIVED FROM THE CATALOGUE, not from a list of collective nouns: such
// a list would be one trade's vocabulary shipped to every business,
// which is what multiTenantVocabulary exists to stop. A reference
// matching more than one product cannot be naming one of them.
// ---------------------------------------------------------------------
describe("a collective reference is the range, not an item", () => {
  const TWO = [{ name: "Lavender candle" }, { name: "Rose candle" }];
  const ONE = [{ name: "Lavender candle" }];
  const DAIRY = [{ name: "Desi ghee 500ml" }, { name: "Paneer 250g" }];

  it("A REFERENCE MATCHING MORE THAN ONE PRODUCT IS COLLECTIVE", () => {
    expect(resolveProduct("candle", TWO)).toEqual({ kind: "none" });
    expect(resolveProduct("candles", TWO)).toEqual({ kind: "none" });
    expect(resolveProduct("the candles", TWO)).toEqual({ kind: "none" });
  });

  it("A SPECIFICALLY NAMED PRODUCT STILL NEEDS ITS OWN EVIDENCE", () => {
    expect(resolveProduct("Lavender candle", TWO)).toEqual({ kind: "known", slug: "lavender_candle" });
    expect(resolveProduct("Rose candle", TWO)).toEqual({ kind: "known", slug: "rose_candle" });
  });

  it("WITH ONE PRODUCT, SCOPE NEVER BLOCKS — there is nothing to be ambiguous about", () => {
    // The rule exists because a business sells several things and a
    // business-level record cannot say which. A single-product
    // catalogue has no such gap.
    expect(resolveProduct("Lavender candle", ONE)).toEqual({ kind: "none" });
  });

  it("A NAME THAT IS ONLY DETERMINERS NAMES NOTHING — it is the range", () => {
    // Found by a surviving mutation. "the one", "ours": refusing these
    // as an unknown product would refuse the business's own general
    // claim, which is the opposite of what the rule is for.
    expect(resolveProduct("the one", TWO)).toEqual({ kind: "none" });
    expect(resolveProduct("ours", TWO)).toEqual({ kind: "none" });
    expect(resolveProduct("each of them", TWO)).toEqual({ kind: "none" });
  });

  it("a product the catalogue does not sell is still refused", () => {
    expect(resolveProduct("Jasmine candle", TWO)).toEqual({ kind: "unknown", named: "Jasmine candle" });
  });

  it("TOLERANT MATCHING: \"ghee\" IS \"Desi ghee 500ml\"", () => {
    // The clear bug: a true price was refused because the sentence said
    // "ghee" and the catalogue said "Desi ghee 500ml".
    expect(resolveProduct("ghee", DAIRY)).toEqual({ kind: "known", slug: "desi_ghee_500ml" });
    expect(sameProductName("ghee", "Desi ghee 500ml")).toBe(true);
    expect(sameProductName("500 ml jar of ghee", "Desi ghee 500ml")).toBe(true);
  });

  it("and it does not match two different things", () => {
    expect(sameProductName("paneer", "Desi ghee 500ml")).toBe(false);
    expect(sameProductName("Lavender candle", "Rose candle")).toBe(false);
  });

  it("a trailing s is dropped per word, and nothing else is stemmed", () => {
    expect(sameProductName("candles", "Lavender candle")).toBe(true);
    // No aggressive stemming: guessing at morphology across English and
    // romanised Hindi would match more than it should.
    expect(sameProductName("candy", "Lavender candle")).toBe(false);
  });

  it("THE VALIDATOR APPROVES A COLLECTIVE CLAIM ON A BUSINESS RECORD", () => {
    // The eight false refusals, in one assertion.
    const v = validateSelection(
      { claims: [claim({ claimType: "material", factIds: ["f_ammonia"], aboutProduct: "the candles", value: false, unit: null })] },
      RECORDS,
      TENANT,
      [{ name: "Lavender candle" }, { name: "Rose candle" }]
    );
    expect(v.rejected).toEqual([]);
    expect(v.approved).toHaveLength(1);
  });

  it("and still refuses a business record for a SPECIFICALLY named one", () => {
    const v = validateSelection(
      { claims: [claim({ claimType: "material", factIds: ["f_ammonia"], aboutProduct: "Lavender candle", value: false, unit: null })] },
      RECORDS,
      TENANT,
      [{ name: "Lavender candle" }, { name: "Rose candle" }]
    );
    expect(v.rejected[0].rule).toBe("wrong_scope");
  });

  it("every step states the distinction, not just the code", () => {
    expect(code("src/lib/facts/selectClaims.ts")).toMatch(/ONE SPECIFICALLY NAMED PRODUCT/);
    // The judge no longer carries the collective/specific distinction
    // at all, which is the point of C: it carries the instruction NOT
    // to decide scope. The distinction lives in code.
    expect(code("src/lib/facts/verifyClaims.ts")).toMatch(/SCOPE IS NOT YOURS TO DECIDE/);
    expect(code("src/lib/facts/extractClaims.ts")).toMatch(/A collective reference is the range, not an item/);
    expect(code("src/lib/content/generateCopy.ts")).toMatch(/A FACT ABOUT ONE NAMED PRODUCT STAYS WITH THAT PRODUCT/);
  });
});
