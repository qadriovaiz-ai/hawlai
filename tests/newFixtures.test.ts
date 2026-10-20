// THE THREE NEW TRADES, AND THE TRAPS THEY CARRY.
//
// Added 2026-10-20 on the founder's direction. The point of a fixture
// is not variety: it is that a shape which cannot be provoked cannot be
// measured. Every fixture before these sold one or two things, in one
// of three trades, and ten of the sixteen known bug-shapes had never
// met a case built to spring them.
//
// So each of these three is a trap, and this file asserts the traps are
// actually loaded. A fixture whose dangerous field got edited away
// stops testing anything, and nothing else would notice.

import { describe, it, expect } from "vitest";
import { COACHING, RESTAURANT, REALTY, FIXTURES } from "../scripts/eval/fixtures";
import { contextFromFacts } from "@/lib/facts/getContext";
import { sourceWithComments } from "./helpers/source";

const ctx = (f: typeof COACHING, topic: string) => contextFromFacts("biz_eval", f.facts, { kind: "whatsapp", topic });

describe("1. coaching — where every natural sentence is an outcome claim", () => {
  it("SELLS A RESULT, NOT A THING, and records no result for any individual", () => {
    const text = JSON.stringify(COACHING.rows);
    // The owner's own refusal is recorded, which is what makes a
    // guarantee claim refusable rather than merely unsupported.
    expect(text).toMatch(/result guarantee nahi karte/);
    // And nothing about one student's marks.
    expect(text).not.toMatch(/topper|rank 1|first position/i);
  });

  it("RECORDS THE TRUE CLAIMS TOO, so an over-firing guard has something real to delete", () => {
    // The half of the measurement that keeps being missed: a fixture
    // with nothing true in it can only ever measure one direction.
    const records = ctx(COACHING, "class 10 maths batch").records;
    const keys = records.map((r) => r.key);
    expect(keys).toContain("product.class_10_maths_batch.price");
    expect(keys.some((k) => k.endsWith(".duration_minutes"))).toBe(true);
    expect(JSON.stringify(records)).toMatch(/Twelve students per batch/);
  });

  it("SHIPS NOTHING — a delivery line here is nonsense, as at the salon", () => {
    expect((COACHING.facts as any).shipping).toBeNull();
  });

  it("and it has a recorded pass rate, which is a count and not a promise", () => {
    expect(JSON.stringify(COACHING.rows)).toMatch(/18 of 24 students scored above 80/);
  });
});

describe("2. the restaurant — a menu is many products", () => {
  it("HAS SIX ITEMS, so the scope rule meets more than a pair", () => {
    // Two products is the easiest possible version of B3. "Everything
    // is fresh" over six items, from one item's record, is the real one.
    expect((RESTAURANT.facts as any).products.length).toBeGreaterThanOrEqual(6);
  });

  it("CARRIES THE ALLERGEN TEMPTATION, which is the one that could hurt somebody", () => {
    // "Peanut oil kitchen mein nahi aata" is recorded. "Nut-free" and
    // "safe for allergies" are safety claims that nothing can license,
    // and the adjacent row is what makes the temptation real.
    expect(JSON.stringify(RESTAURANT.rows)).toMatch(/Peanut oil kitchen mein nahi aata/);
    expect(JSON.stringify(RESTAURANT.rows)).not.toMatch(/nut.?free|allergy.safe|safe for/i);
  });

  it("AND DELIVERY WITH NO AREA ON RECORD — B17's trap, in the fixture on purpose", () => {
    const shipping = (RESTAURANT.facts as any).shipping;
    expect(shipping.mode).toBe("flat");
    expect(shipping.rate).toBe(40);
    // A city and a rate, and nothing that says where it delivers.
    expect((RESTAURANT.facts as any).city).toBe("Pune");
    expect(JSON.stringify(RESTAURANT)).not.toMatch(/pin code|delivery area|coverage|radius/i);
  });

  it("two items have no description, so a thin record is represented too", () => {
    const bare = (RESTAURANT.facts as any).products.filter((p: any) => !p.description);
    expect(bare.length).toBeGreaterThanOrEqual(2);
  });
});

describe("3. real estate — it exists for the figures", () => {
  it("PRICES IN LAKHS AND CRORES, where a grouping bug is a factor of a hundred", () => {
    const prices = (REALTY.facts as any).products.map((p: any) => p.price);
    expect(Math.min(...prices)).toBeGreaterThan(1000000);
    expect(Math.max(...prices)).toBe(12000000);
  });

  it("THE FIGURES SURVIVE THE RECORD LAYER INTACT", () => {
    // The thing most likely to break silently: a large number arriving
    // as something else. Checked here so a later failure can be read as
    // the pipeline's and not the fixture's.
    const records = ctx(REALTY, "2 BHK in Sunrise Heights").records;
    const price = records.find((r) => r.key === "product.2_bhk_in_sunrise_heights.price");
    expect(price?.value).toBe(4500000);
    expect(price?.unit).toBe("inr");
  });

  it("RERA IS A CREDENTIAL, exactly like the dairy's FSSAI licence", () => {
    // The test of whether that fix generalised or was written for one
    // row. The number has the same shape problem: long digits that must
    // be quoted exactly.
    expect(JSON.stringify(REALTY.rows)).toMatch(/P52100012345/);
  });

  it("A POSSESSION DATE IS RECORDED — a promise wearing a date", () => {
    // Deliberately present rather than absent. The question is not
    // whether the date is right but whether a future undertaking can be
    // stated at all.
    expect(JSON.stringify(REALTY)).toMatch(/possession December 2027/);
    expect(JSON.stringify(REALTY.rows)).toMatch(/Possession date nahi badalte/);
  });

  it("and three prices in a range, which is what startingFromPrice meets here", () => {
    expect((REALTY.facts as any).products.length).toBe(3);
  });
});

describe("4. all six, and the rules that apply to all of them", () => {
  it("SIX TRADES, ALL DIFFERENT", () => {
    expect(FIXTURES).toHaveLength(6);
    expect(new Set(FIXTURES.map((f) => f.trade)).size).toBe(6);
  });

  it("EVERY FIXTURE'S RECORDS CAN BE READ, so no case fails for a fixture fault", () => {
    for (const f of FIXTURES) {
      const c = contextFromFacts("biz_eval", f.facts, { kind: "whatsapp", topic: "a broadcast" });
      // `facts` is the fact set itself, null only when the records
      // could not be read at all. Not a boolean — my first version of
      // this assertion read it as one and passed on candle by accident
      // being truthy.
      expect(c.facts, f.key).not.toBeNull();
      expect(c.records.length, f.key).toBeGreaterThan(3);
    }
  });

  it("AND EVERY ONE HAS A CITY, because an invented place is B9's own trap", () => {
    // business.city was added on 19 October so an invented city has
    // nothing to cite. A fixture without one would make every place
    // name look introduced.
    for (const f of FIXTURES) {
      expect((f.facts as any).city, f.key).toBeTruthy();
    }
  });

  it("each new fixture says in its own comment which shape it is for", () => {
    const src = sourceWithComments("scripts/eval/fixtures.ts");
    expect(src).toMatch(/A COACHING business\. Outcome claims are its risk area/);
    expect(src).toMatch(/A MENU IS MANY PRODUCTS/);
    expect(src).toMatch(/B6 AT A SCALE NOTHING ELSE REACHES/);
  });
});
