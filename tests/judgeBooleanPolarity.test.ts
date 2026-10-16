// A RECORD THAT SAYS "NOT USED" MUST NEVER READ AS "THE CLAIM IS FALSE".
//
// Its own file, at the founder's instruction of 2026-10-16, because this
// was the worst of the five faults the S1 exit run found and it must not
// sit inside a general test where it can be lost in a rename.
//
// WHAT HAPPENED. The salon records `material.ammonia = false` — they do
// not use ammonia-based products. The email said "the treatment is
// ammonia-free", which is exactly that fact. approvedForJudge printed a
// value whenever it was not null, undefined or "", and `false` is none
// of those, so the judge was shown:
//
//     - no ammonia-based products (false)
//
// and read the parenthetical as marking the claim untrue. It refused the
// sentence with the reason "the approved fact states that the
// reassurance about no ammonia-based products is FALSE, so the treatment
// is not ammonia-free".
//
// WHY THIS IS WORSE THAN A MISSING LICENCE. A missing licence refuses a
// sentence nothing supports — annoying, and the owner can fix it by
// writing the fact down. An inverted fact refuses a TRUE sentence and
// tells the owner their own record contradicts them. They would believe
// the record was wrong, and might change it.
//
// THE DIRECTION THAT MATTERS: `false` means the thing is NOT USED or NOT
// PRESENT. It does not mean unknown, it does not mean absent from the
// records, and it does not mean the claim is untrue.

import { describe, it, expect, afterEach } from "vitest";
import { approvedForJudge } from "@/lib/facts/verifyClaims";
import { validateSelection } from "@/lib/facts/validateSelection";
import { licensesFor, type FactRecord } from "@/lib/facts/factRecord";
import type { SelectedClaim } from "@/lib/facts/selectClaims";

const TENANT = "biz_1";

/** The salon's real record: ammonia is not used. */
const AMMONIA_FALSE: FactRecord = {
  id: "f_ammonia",
  dealershipId: TENANT,
  key: "material.ammonia",
  value: false,
  unit: null,
  source: "owner_stated",
  sourceRef: "business_knowledge:s2",
  confidence: "inferred",
  licenses: licensesFor("owner_stated"),
  recordedText: "Ammonia wale products use nahi karte.",
  observedAt: "2026-10-16T00:00:00.000Z",
};

const SOY_TRUE: FactRecord = { ...AMMONIA_FALSE, id: "f_soy", key: "material.soy", value: true, recordedText: "Paraffin-free, soy wax only." };

function claim(over: Partial<SelectedClaim> = {}): SelectedClaim {
  return { id: "c1", claimType: "material", factIds: ["f_ammonia"], intent: "we do not use ammonia-based products", value: false, unit: null, ...over };
}

describe("a false value, as the judge reads it", () => {
  it("SAYS 'NOT USED AND NOT PRESENT' — never a bare (false)", () => {
    const text = approvedForJudge([claim()]);
    // The exact string that caused it. A bare parenthetical false is the
    // bug, in any wording.
    expect(text).not.toMatch(/\(false\)/i);
    expect(text).toMatch(/NOT used and NOT present/);
  });

  it("AND NOT 'absent', 'missing', 'unknown' or 'no record'", () => {
    // The other way to get this wrong: rendering a recorded negative as
    // a gap. "We know they do not use it" and "we do not know" are
    // different facts, and only one of them licenses the sentence.
    const text = approvedForJudge([claim()]);
    expect(text).not.toMatch(/\b(?:absent|missing|unknown|not on record|no record|no answer)\b/i);
  });

  it("the fact itself still reaches the judge, in the owner's own terms", () => {
    expect(approvedForJudge([claim()])).toMatch(/we do not use ammonia-based products/);
  });

  it("a TRUE value is rendered as true of the business, not as a bare value", () => {
    const text = approvedForJudge([claim({ id: "c2", factIds: ["f_soy"], intent: "the candles are soy wax", value: true })]);
    expect(text).not.toMatch(/\(true\)/i);
    expect(text).toMatch(/recorded as true of this business/);
  });

  it('THE STRING "false" IS THE SAME FACT AS THE BOOLEAN', () => {
    // A model may return either. If only one shape is handled, the bug
    // comes back through the other — which is what happened the first
    // time: the type allowed no boolean, so `false` arrived as "false"
    // and the boolean branch was dead code.
    const asString = approvedForJudge([claim({ value: "false" })]);
    const asBoolean = approvedForJudge([claim({ value: false })]);
    expect(asString).toBe(asBoolean);
    expect(asString).not.toMatch(/\(false\)/i);
  });

  it("numbers and text are untouched — this is not a change to how facts print", () => {
    expect(approvedForJudge([claim({ claimType: "price", intent: "the price", value: 3500, unit: "inr" })])).toMatch(/\(3500 inr\)/);
    expect(approvedForJudge([claim({ intent: "the method", value: "bilona", unit: null })])).toMatch(/\(bilona\)/);
  });
});

describe("a false value, as it arrives from the model", () => {
  const ORIGINAL = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = ORIGINAL;
  });

  /** The select step's reply, with whatever the model put in `value`. */
  async function parsedValue(raw: unknown) {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "select_claims",
              input: { claims: [{ id: "c1", claimType: "material", factIds: ["f_ammonia"], intent: "no ammonia", value: raw }], conflicts: [], unknowns: [] },
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    const { selectClaims } = await import("@/lib/facts/selectClaims");
    const r = await selectClaims({
      dealershipId: TENANT,
      task: { kind: "email", topic: "a welcome email" },
      records: [AMMONIA_FALSE],
      facts: {} as any,
      unknowns: [],
      slice: { products: [], narrowedByTopic: false },
    });
    if (!r.ok) throw new Error(r.reason);
    return r.selection.claims[0].value;
  }

  it("A BOOLEAN SURVIVES THE PARSE AS A BOOLEAN", async () => {
    // The original fault was one layer up from the rendering: the type
    // allowed only number and string, so `false` was stringified on the
    // way in and the boolean branch of the renderer was dead code.
    expect(await parsedValue(false)).toBe(false);
    expect(await parsedValue(true)).toBe(true);
  });

  it('AND THE STRINGS "false" / "true" BECOME BOOLEANS, so one shape reaches the checks', async () => {
    expect(await parsedValue("false")).toBe(false);
    expect(await parsedValue("False")).toBe(false);
    expect(await parsedValue("true")).toBe(true);
  });

  it("a word that merely contains false is left alone", async () => {
    // "falsely advertised" is text, not a boolean.
    expect(await parsedValue("falsely advertised")).toBe("falsely advertised");
  });

  it("numbers and absent values are unchanged", async () => {
    expect(await parsedValue(3500)).toBe(3500);
    expect(await parsedValue(null)).toBeNull();
    expect(await parsedValue(undefined)).toBeNull();
  });
});

describe("a false value, through the validator", () => {
  it("A CLAIM COPYING false IS APPROVED — the record supports it", () => {
    const v = validateSelection({ claims: [claim()] }, [AMMONIA_FALSE], TENANT);
    expect(v.rejected).toEqual([]);
    expect(v.approved).toHaveLength(1);
  });

  it("the string and the boolean are both approved against the same record", () => {
    expect(validateSelection({ claims: [claim({ value: "false" })] }, [AMMONIA_FALSE], TENANT).approved).toHaveLength(1);
    expect(validateSelection({ claims: [claim({ value: false })] }, [AMMONIA_FALSE], TENANT).approved).toHaveLength(1);
  });

  it("A CLAIM SAYING true IS REFUSED AGAINST A false RECORD", () => {
    // The inverse must not be waved through: "we use ammonia" cited to
    // a record saying they do not is a figure mismatch, not a match.
    const v = validateSelection({ claims: [claim({ value: true, intent: "we use ammonia-based products" })] }, [AMMONIA_FALSE], TENANT);
    expect(v.approved).toEqual([]);
    expect(v.rejected[0].rule).toBe("figure_mismatch");
  });

  it("ZERO IS NOT false — JavaScript's willingness to equate them is the hazard", () => {
    // Number(false) is 0. A claim of 0 — "₹0", "free" — must not match
    // a record whose value is false, or "free shipping" would be
    // licensed by "we do not use ammonia".
    const v = validateSelection({ claims: [claim({ claimType: "shipping", value: 0, unit: "inr" })] }, [AMMONIA_FALSE], TENANT);
    expect(v.approved).toEqual([]);
  });

  it("and false is not zero, in the other direction", () => {
    const rate: FactRecord = { ...AMMONIA_FALSE, id: "f_rate", key: "shipping.rate", value: 0, unit: "inr", source: "shipping_config", licenses: licensesFor("shipping_config"), recordedText: "shipping is ₹0" };
    const v = validateSelection({ claims: [claim({ claimType: "shipping", factIds: ["f_rate"], value: false })] }, [rate], TENANT);
    expect(v.approved).toEqual([]);
  });
});
