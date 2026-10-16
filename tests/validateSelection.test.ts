// C2 step 2 — the selection, checked in code.
//
// This is where the allowlist becomes an allowlist: a claim survives
// only if a real record of this tenant's, carrying the right licence,
// supports it, and a figure survives only if it equals the figure in
// that record.
//
// THE FOUNDER'S INSTRUCTION OF 2026-10-16 is pinned first, because it
// is the one with a live false-negative risk: customer_state is NOT on
// the unlicensable list, so nothing stops it being approved except the
// recipient-record rule. Until a send carries the reader's own order
// row, every "aapka order aa raha hai" must be refused by default — not
// approved, not warned about.

import { describe, it, expect } from "vitest";
import { validateSelection, validationNote, LICENCE_FOR_CLAIM, typeFromKey } from "@/lib/facts/validateSelection";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, CLAIM_TYPES, type ClaimType } from "@/lib/facts/extractClaims";
import { licensesFor, type FactRecord } from "@/lib/facts/factRecord";
import type { SelectedClaim } from "@/lib/facts/selectClaims";

const TENANT = "biz_1";

function record(over: Partial<FactRecord> = {}): FactRecord {
  return {
    id: "f_price",
    dealershipId: TENANT,
    key: "product.lavender_candle.price",
    value: 999,
    unit: "inr",
    source: "catalogue",
    sourceRef: "products:p1",
    confidence: "counted",
    licenses: licensesFor("catalogue"),
    recordedText: "Lavender candle — ₹999",
    observedAt: "2026-10-16T00:00:00.000Z",
    ...over,
  };
}

function claim(over: Partial<SelectedClaim> = {}): SelectedClaim {
  return { id: "c1", claimType: "price", factIds: ["f_price"], intent: "state the price", value: 999, unit: "inr", ...over };
}

const RECORDS = [
  record(),
  record({ id: "f_measured", key: "business.paid_orders", value: 2, unit: null, source: "measured", licenses: licensesFor("measured"), recordedText: "2 paid order(s) on record" }),
  record({ id: "f_owner", key: "material.paraffin", value: false, unit: null, source: "owner_stated", licenses: licensesFor("owner_stated"), recordedText: "Kabhi sasta paraffin wax mix nahi karti." }),
  record({ id: "f_ship", key: "shipping.mode", value: "free", unit: null, source: "shipping_config", licenses: licensesFor("shipping_config"), recordedText: "shipping is free" }),
];

const validate = (claims: SelectedClaim[], records = RECORDS, tenant = TENANT) => validateSelection({ claims }, records, tenant);

describe("1. a claim about the reader's own order — the founder's rule", () => {
  it("A CUSTOMER_STATE CLAIM IS REFUSED EVEN WITH A PERFECTLY REAL CITATION", () => {
    // The false negative this test exists to prevent. The claim cites a
    // genuine, counted, in-tenant record that grants `value`, so every
    // other rule in this file would pass it.
    const v = validate([claim({ claimType: "customer_state", factIds: ["f_measured"], value: 2, unit: null, intent: "your order is on its way" })]);
    expect(v.approved).toEqual([]);
    expect(v.rejected).toHaveLength(1);
    expect(v.rejected[0].rule).toBe("needs_recipient_record");
  });

  it("and the reason says WHY, in words the owner can act on", () => {
    const v = validate([claim({ claimType: "customer_state", factIds: ["f_measured"] })]);
    expect(v.rejected[0].reason).toMatch(/nothing here knows who is reading it/);
    // The specific confusion that makes this dangerous.
    expect(v.rejected[0].reason).toMatch(/count of the business's orders is not a record of theirs/);
  });

  it("IT IS REFUSED BEFORE ANY CITATION IS LOOKED UP, so a good citation buys nothing", () => {
    // Citing a non-existent record would normally be rejected as
    // unknown_fact. The recipient rule must fire first, or the ORDER of
    // the rules would be doing the work by accident.
    const v = validate([claim({ claimType: "customer_state", factIds: ["does_not_exist"] })]);
    expect(v.rejected[0].rule).toBe("needs_recipient_record");
  });

  it("IT IS REFUSED WITH NO CITATION AT ALL — not handed to the no-citation rule", () => {
    // The mutation this kills: gating the recipient guard on
    // `factIds.length` leaves it looking correct, because a claim that
    // cites a fake record still gets refused. A claim citing NOTHING
    // would then fall through to no_citation, and the day a recipient
    // record exists the guard would be in the wrong place.
    const v = validate([claim({ claimType: "customer_state", factIds: [], value: null })]);
    expect(v.rejected[0].rule).toBe("needs_recipient_record");
  });

  it("the rule is not satisfied by the licence table, which would be the quiet way to lose it", () => {
    // LICENCE_FOR_CLAIM has an entry for customer_state, so if the
    // recipient guard were ever deleted the claim would sail through on
    // a `measured` record. This asserts the guard, not the table.
    expect(LICENCE_FOR_CLAIM.customer_state).toBe("value");
    expect(NEEDS_RECIPIENT_RECORD).toContain("customer_state");
    expect(UNLICENSABLE_TYPES).not.toContain("customer_state");
  });
});

describe("2. claims no record can ever license", () => {
  it("BENEFIT, SAFETY, CAPABILITY AND COMPARISON ARE REFUSED WHATEVER THEY CITE", () => {
    const claims = UNLICENSABLE_TYPES.map((t, i) => claim({ id: `c${i}`, claimType: t, factIds: ["f_price", "f_owner"], value: null }));
    const v = validate(claims);
    expect(v.approved).toEqual([]);
    expect(v.rejected.map((r) => r.rule)).toEqual(UNLICENSABLE_TYPES.map(() => "no_licence_exists"));
  });

  it("a comparison is refused for the right reason, which is not 'no record'", () => {
    const v = validate([claim({ claimType: "comparison", factIds: ["f_owner"], value: null })]);
    expect(v.rejected[0].reason).toMatch(/nothing a business records about itself can establish a claim about someone else's product/);
  });

  it("and these are refused BEFORE citations are checked", () => {
    const v = validate([claim({ claimType: "benefit", factIds: ["nope"], value: null })]);
    expect(v.rejected[0].rule).toBe("no_licence_exists");
  });
});

describe("3. citations", () => {
  it("a claim citing nothing is refused", () => {
    const v = validate([claim({ factIds: [] })]);
    expect(v.rejected[0].rule).toBe("no_citation");
  });

  it("a claim citing a record that does not exist is refused", () => {
    const v = validate([claim({ factIds: ["f_ghost"] })]);
    expect(v.rejected[0].rule).toBe("unknown_fact");
  });

  it("A CITATION IS ONLY EVIDENCE INSIDE ITS OWN BUSINESS", () => {
    const v = validate([claim()], RECORDS, "another_business");
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("wrong_tenant");
  });
});

describe("4. the licence the record carries", () => {
  it("A PRICE MUST COME FROM SOMEWHERE THAT GRANTS `value` — not from the owner's prose", () => {
    // owner_stated grants existence, policy and process, never value. A
    // number the owner typed in a sentence is not the row checkout
    // reads.
    const v = validate([claim({ claimType: "price", factIds: ["f_owner"], value: 999 })]);
    expect(v.rejected[0].rule).toBe("no_licence_on_record");
    expect(v.rejected[0].reason).toMatch(/needs a record that can establish "value"/);
  });

  it("and the owner is told what to do about it", () => {
    const v = validate([claim({ claimType: "price", factIds: ["f_owner"], intent: "say the candle is ₹999" })]);
    expect(v.questions).toHaveLength(1);
    expect(v.questions[0].wouldLicense).toBe("price");
  });

  it("a material claim DOES come from the owner's own words", () => {
    // The owner may say what their product is made of. That is the
    // whole point of owner_stated granting `existence`.
    const v = validate([claim({ claimType: "material", factIds: ["f_owner"], value: null })]);
    expect(v.approved).toHaveLength(1);
  });

  it("a shipping claim comes from the shipping config", () => {
    const v = validate([claim({ claimType: "shipping", factIds: ["f_ship"], value: "free", unit: null })]);
    expect(v.approved).toHaveLength(1);
  });

  it("every licensable claim type has a licence, so none passes unchecked", () => {
    for (const t of CLAIM_TYPES) {
      const unlicensable = UNLICENSABLE_TYPES.includes(t);
      expect(Boolean(LICENCE_FOR_CLAIM[t as ClaimType]), t).toBe(!unlicensable);
    }
  });
});

describe("5. the figure comes from the record", () => {
  it("A FIGURE NO CITED RECORD CARRIES IS REFUSED — candle-03 in another form", () => {
    // ₹850 was a real price in the baseline, of the OTHER product. A
    // price can be real and still be the wrong price.
    const v = validate([claim({ value: 850 })]);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
    expect(v.rejected[0].reason).toMatch(/it states 850/);
    expect(v.rejected[0].reason).toMatch(/999/);
  });

  it("the same figure written differently is the same figure", () => {
    expect(validate([claim({ value: 999.0 })]).approved).toHaveLength(1);
    expect(validate([claim({ value: "999" })]).approved).toHaveLength(1);
  });

  it("CITING A KNOWN-UNKNOWN FOR A FIGURE IS CITING AN ABSENCE", () => {
    // A record whose value is null means we looked and there is no
    // answer — the salon that ships nothing. It is not permission to
    // state a number.
    const records = [record({ id: "f_null", key: "shipping.rate", value: null, source: "shipping_config", licenses: licensesFor("shipping_config") })];
    const v = validate([claim({ claimType: "shipping", factIds: ["f_null"], value: 50 })], records);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
  });

  it("AND ZERO IS THE DANGEROUS CASE: ₹0 must not match a record that has no answer", () => {
    // Found by a surviving mutation. Number(null) is 0, so a claim
    // stating 0 MATCHES a null-valued record on the figure comparison
    // and reaches the branch that exists for exactly this. ₹0 is a
    // "free" claim — "shipping is free", cited to a record that says we
    // do not know what shipping costs.
    const records = [record({ id: "f_null", key: "shipping.rate", value: null, source: "shipping_config", licenses: licensesFor("shipping_config") })];
    const v = validate([claim({ claimType: "shipping", factIds: ["f_null"], value: 0 })], records);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
    expect(v.rejected[0].reason).toMatch(/no value — we looked and there is no answer/);
  });

  it("a claim with no figure is not asked for one", () => {
    const v = validate([claim({ claimType: "material", factIds: ["f_owner"], value: null, unit: null })]);
    expect(v.approved).toHaveLength(1);
  });

  it("an empty-string figure is treated as no figure, not as a mismatch", () => {
    const v = validate([claim({ claimType: "material", factIds: ["f_owner"], value: "" as any })]);
    expect(v.approved).toHaveLength(1);
  });
});

describe("6. what the owner reads", () => {
  it("a conflict names both sides and leaves the decision with the owner", () => {
    const note = validationNote(
      { approved: [], rejected: [], questions: [] },
      [{ askedFor: "a 20% discount", recordSays: "FIRST10 gives 10% off" }],
      []
    );
    expect(note).toMatch(/You asked for a 20% discount/);
    expect(note).toMatch(/FIRST10 gives 10% off/);
    expect(note).toMatch(/change the record, or I write it without that/);
  });

  it("a refusal says what was left out and why", () => {
    const v = validate([claim({ claimType: "benefit", intent: "say it helps you sleep", value: null })]);
    const note = validationNote(v, [], []);
    expect(note).toMatch(/Left out: say it helps you sleep/);
  });

  it("an unknown is phrased as something to record", () => {
    const note = validationNote({ approved: [], rejected: [], questions: [] }, [], ["how long the result lasts"]);
    expect(note).toMatch(/Not on record: how long the result lasts/);
  });

  it("nothing to say produces no note at all", () => {
    expect(validationNote({ approved: [], rejected: [], questions: [] }, [], [])).toBeNull();
  });
});

describe("7. the good case still passes", () => {
  it("a well-cited, correctly-figured, in-tenant claim is approved", () => {
    const v = validate([claim(), claim({ id: "c2", claimType: "material", factIds: ["f_owner"], value: null })]);
    expect(v.approved.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(v.rejected).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 8. THE FOUR FALSE REFUSALS THE S1 EXIT RUN OF 2026-10-16 PRODUCED.
//
// Every one of these is a claim that is TRUE, RECORDED and CITED
// CORRECTLY, and the validator refused it. They are the third metric —
// true claims wrongly removed — which the founder set at 0 precisely
// because this is the expensive error.
// ---------------------------------------------------------------------
describe("8. true claims that were being refused", () => {
  const ownerDuration = record({
    id: "f_burn",
    key: "product.burn_hours",
    value: 40,
    unit: "hours",
    source: "owner_stated",
    licenses: licensesFor("owner_stated"),
    recordedText: "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai.",
  });

  it("A DURATION THE OWNER RECORDED CAN BE STATED — there is no checkout column for it", () => {
    // Graded true four times in the baseline, and refused by the exit
    // run because `duration` demanded a `value` licence that only the
    // catalogue, offers, shipping and measured rows grant. The owner is
    // the only possible source for how long a candle burns.
    const v = validate([claim({ claimType: "duration", factIds: ["f_burn"], value: 40, unit: "hours" })], [ownerDuration]);
    expect(v.rejected).toEqual([]);
    expect(v.approved).toHaveLength(1);
  });

  it("AND THE FIGURE IS STILL CHECKED — loosening the licence did not loosen the number", () => {
    const v = validate([claim({ claimType: "duration", factIds: ["f_burn"], value: 60, unit: "hours" })], [ownerDuration]);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
  });

  it("a PRICE still needs the row checkout reads", () => {
    // The rule that stays. owner_stated grants no `value`, so a price
    // typed in prose is still refused — that distinction is the reason
    // the licence table exists.
    const v = validate([claim({ claimType: "price", factIds: ["f_owner"], value: 999 })]);
    expect(v.rejected[0].rule).toBe("no_licence_on_record");
  });

  const statement = record({
    id: "f_fssai",
    key: "statement.fssai_licence",
    value: "FSSAI licence 11223344556677.",
    unit: null,
    source: "owner_stated",
    licenses: licensesFor("owner_stated"),
    recordedText: "FSSAI licence 11223344556677.",
  });

  it("A FIGURE INSIDE A PROSE RECORD IS FOUND — the FSSAI licence number", () => {
    // The record's VALUE is the sentence, so a number beside it could
    // never match. Refused twice in the exit run.
    const v = validate([claim({ claimType: "credential", factIds: ["f_fssai"], value: 11223344556677, unit: null })], [statement]);
    expect(v.rejected).toEqual([]);
  });

  it("the grouping commas a model adds do not change the number", () => {
    const grouped = record({ ...statement, id: "f_g", value: "FSSAI licence 11,22,33,44,55,66,77." });
    const v = validate([claim({ claimType: "credential", factIds: ["f_g"], value: 11223344556677, unit: null })], [grouped]);
    expect(v.rejected).toEqual([]);
  });

  it("A DIFFERENT NUMBER IN THE SAME SENTENCE IS NOT A MATCH", () => {
    // Still arithmetic, not a search for digits: the licence number is
    // not 1122, and a sentence containing a number does not license
    // every number.
    const v = validate([claim({ claimType: "credential", factIds: ["f_fssai"], value: 1122, unit: null })], [statement]);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
  });

  const named = record({
    id: "f_name",
    key: "product.desi_ghee_500ml.name",
    value: "Desi ghee 500ml",
    unit: null,
    recordedText: "Desi ghee 500ml",
  });

  it("A SIZE THAT EXISTS ONLY IN THE PRODUCT NAME IS A FACT", () => {
    // "A 500 ml jar" was checked against the price figures, because
    // 500ml lives nowhere else.
    const v = validate([claim({ claimType: "count", factIds: ["f_name"], value: 500, unit: "ml" })], [named]);
    expect(v.rejected).toEqual([]);
  });

  it("and a number that is part of a longer one is not a match", () => {
    // 50 must not match "500ml", which is why the boundaries are digit
    // boundaries and not word boundaries.
    const v = validate([claim({ claimType: "count", factIds: ["f_name"], value: 50, unit: "ml" })], [named]);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
  });
});

// ---------------------------------------------------------------------
// 9. A MISLABELLED FIGURE, RE-TYPED FROM THE RECORD IT CITES.
//
// The second clean-run fault of 2026-10-16. The candle's 40-hour burn
// time was selected as claimType "benefit" — intent "the candle burns
// for 40 hours, which is the central claim" — and refused, because
// benefit is unlicensable. Fixing `duration` in the licence table did
// nothing for a claim the model did not call a duration.
//
// The licence table is only ever as strong as the type the model picks,
// so the record's KEY is consulted. That is a fact about the record,
// not a judgement, which is why code may use it.
// ---------------------------------------------------------------------
describe("9. a figure mislabelled by the model", () => {
  const burn = record({
    id: "f_burn",
    key: "product.burn_hours",
    value: 40,
    unit: "hours",
    source: "owner_stated",
    licenses: licensesFor("owner_stated"),
    recordedText: "40 hours burn hota hai.",
  });

  it("A DURATION CALLED A BENEFIT IS STILL A DURATION, when it carries the record's figure", () => {
    const v = validate([claim({ claimType: "benefit", factIds: ["f_burn"], value: 40, unit: "hours", intent: "the candle burns for 40 hours" })], [burn]);
    expect(v.rejected).toEqual([]);
    expect(v.approved[0].claimType).toBe("duration");
  });

  it("A BENEFIT CLAIM WITH NO FIGURE IS NOT RESCUED — the hole this must not open", () => {
    // "It helps you sleep", citing a real record, labelled benefit. If
    // re-typing did not require a matching figure, any benefit claim
    // could cite any record and be re-typed into something licensable.
    const v = validate([claim({ claimType: "benefit", factIds: ["f_owner"], value: null, unit: null, intent: "it helps you sleep" })]);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("no_licence_exists");
  });

  it("AND A FIGURE THAT DOES NOT MATCH THE RECORD IS NOT RESCUED EITHER", () => {
    const v = validate([claim({ claimType: "benefit", factIds: ["f_burn"], value: 60, unit: "hours", intent: "it burns for 60 hours" })], [burn]);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("no_licence_exists");
  });

  it("a comparison is never rescued, whatever it cites", () => {
    // Nothing a business records about itself can establish a claim
    // about someone else's product, so no key could make it licensable.
    const v = validate([claim({ claimType: "comparison", factIds: ["f_burn"], value: 40, unit: "hours", intent: "it burns longer than other candles" })], [burn]);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("no_licence_exists");
  });

  it("IT NEVER GOES THE OTHER WAY — a licensable label is left alone", () => {
    // A model that under-claims is not the failure being fixed, and
    // re-typing downwards would mean code deciding a claim is a benefit
    // when the model said it was a price.
    const v = validate([claim({ claimType: "price", factIds: ["f_price"], value: 999 })]);
    expect(v.approved[0].claimType).toBe("price");
  });

  it("the key tells the type for every record kind getContext mints", () => {
    expect(typeFromKey("product.lavender_candle.price")).toBe("price");
    expect(typeFromKey("product.keratin_treatment.duration_minutes")).toBe("duration");
    expect(typeFromKey("product.burn_hours")).toBe("duration");
    expect(typeFromKey("offer.first10.percent")).toBe("offer");
    expect(typeFromKey("shipping.mode")).toBe("shipping");
    expect(typeFromKey("business.paid_orders")).toBe("count");
    expect(typeFromKey("material.paraffin")).toBe("material");
    expect(typeFromKey("process.double_boiler")).toBe("process");
    // A prose statement has no type, so nothing is re-typed from it.
    expect(typeFromKey("statement.fssai_licence")).toBeNull();
    expect(typeFromKey("product.desi_ghee_500ml.name")).toBeNull();
  });
});

describe("9b. the null-figure hole the mutations found", () => {
  it("A BENEFIT CLAIM WITH NO FIGURE CANNOT BE RESCUED BY A null-VALUED RECORD", () => {
    // Found by a surviving mutation, and it is the nastiest shape here.
    // Dropping the "claim carries a figure" condition looked harmless
    // against a record holding a real value — sameFigure(false, null)
    // does not match — but a KNOWN-UNKNOWN record holds null, and
    // Number(null) is 0 on both sides, so sameFigure(null, null)
    // matches. A benefit claim citing "nothing is shipped" would then
    // be re-typed to `shipping` and approved, with no figure left for
    // the arithmetic to catch.
    const nothingShipped = record({
      id: "f_noship",
      key: "shipping.mode",
      value: null,
      unit: null,
      source: "shipping_config",
      licenses: licensesFor("shipping_config"),
      recordedText: "nothing is shipped",
    });
    const v = validate(
      [claim({ claimType: "benefit", factIds: ["f_noship"], value: null, unit: null, intent: "it helps you relax" })],
      [nothingShipped]
    );
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("no_licence_exists");
  });

  it("and a safety claim cannot either", () => {
    const nothingShipped = record({ id: "f_noship", key: "shipping.mode", value: null, unit: null, source: "shipping_config", licenses: licensesFor("shipping_config") });
    const v = validate([claim({ claimType: "safety", factIds: ["f_noship"], value: null, unit: null, intent: "safe for children" })], [nothingShipped]);
    expect(v.approved).toEqual([]);
  });
});
