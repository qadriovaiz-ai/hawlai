// A customer's unanswered question becomes the owner's question — V4c-ii.
//
// Tier 3 asked the owner about gaps the PRODUCT found: a generator
// reached for a price, the guard cut it, twice is a pattern. V4c
// records gaps a real CUSTOMER found. This is where the second kind
// reaches the same one-question-at-a-time machinery.
//
// THE TESTS THAT MATTER are the ones about keeping the two kinds of
// evidence apart. They are counted separately, they are never added
// into one printed number, and the sentence only claims what actually
// happened.

import { describe, it, expect } from "vitest";
import {
  gapsFrom,
  nextGapToAsk,
  gapAskLine,
  worthAsking,
  findMissingFact,
  ASK_AFTER,
  ASK_AFTER_CUSTOMER,
} from "@/lib/onboarding/factGaps";
import { code } from "./helpers/source";

/** A claim_checks row: the generator reached for something and it was cut. */
const cut = (...kinds: string[]) => ({ removed_kinds: kinds, claims_removed: kinds.length });
/** An answer_gaps row: a real customer asked and got nothing. */
const asked = (key: string) => ({ question_key: key });

describe("1. THE TWO KINDS OF EVIDENCE ARE COUNTED SEPARATELY", () => {
  it("A CUSTOMER'S QUESTION IS NOT A CUT LINE", () => {
    // THE LOAD-BEARING ONE. Adding them would make "I had to cut a line
    // 4 times" true of a week in which two lines were cut and two
    // people asked — a number that reads as one thing and means
    // another.
    const gaps = gapsFrom([cut("price")], [asked("price_range"), asked("price_range")]);
    expect(gaps).toEqual([{ key: "price_range", times: 1, fromCustomers: 2 }]);
  });

  it("generator-only gaps are unchanged", () => {
    expect(gapsFrom([cut("price"), cut("price")])).toEqual([
      { key: "price_range", times: 2, fromCustomers: 0 },
    ]);
  });

  it("customer-only gaps carry no cut lines", () => {
    expect(gapsFrom([], [asked("opening_hours")])).toEqual([
      { key: "opening_hours", times: 0, fromCustomers: 1 },
    ]);
  });

  it("A KEY THE INTERVIEW CANNOT ASK ABOUT IS DROPPED, not counted", () => {
    // "other" is what the chat agent stores when it could not place the
    // question. A gap that cannot be turned into a question is a gap
    // nobody can be asked about, and counting it would let it win the
    // one slot and then produce no sentence.
    expect(gapsFrom([], [asked("other")])).toEqual([]);
    expect(gapsFrom([], [asked("retired_question_key")])).toEqual([]);
    expect(gapsFrom([], [asked("")])).toEqual([]);
    expect(gapsFrom([], [{} as any])).toEqual([]);
  });

  it("ordering weighs all the evidence, and a customer breaks the tie", () => {
    const gaps = gapsFrom([cut("price")], [asked("opening_hours")]);
    // One each — the customer-backed one goes first.
    expect(gaps[0].key).toBe("opening_hours");
    expect(gaps.map((g) => g.key)).toContain("price_range");
  });

  it("no evidence at all is an empty list", () => {
    expect(gapsFrom(null, null)).toEqual([]);
    expect(gapsFrom([], [])).toEqual([]);
    expect(gapsFrom(undefined)).toEqual([]);
  });
});

describe("2. ONE CUSTOMER IS ENOUGH; ONE CUT LINE IS NOT", () => {
  it("THE THRESHOLDS DIFFER, AND THE REASON DOES NOT TRANSFER", () => {
    // ASK_AFTER is 2 because a single removal can be a generator
    // reaching for something the business genuinely does not do. A real
    // customer asking is relevant by definition — nobody types a
    // question about a business they are not interested in.
    expect(ASK_AFTER).toBe(2);
    expect(ASK_AFTER_CUSTOMER).toBe(1);
    expect(worthAsking({ key: "price_range", times: 0, fromCustomers: 1 })).toBe(true);
    expect(worthAsking({ key: "price_range", times: 1, fromCustomers: 0 })).toBe(false);
    expect(worthAsking({ key: "price_range", times: 2, fromCustomers: 0 })).toBe(true);
  });

  it("ONE CUSTOMER GETS THE QUESTION ASKED", () => {
    expect(nextGapToAsk([], [], [asked("opening_hours")])).toEqual({
      key: "opening_hours",
      times: 0,
      fromCustomers: 1,
    });
  });

  it("AND IT IS STILL ONE QUESTION, AND STILL ONLY ONCE", () => {
    // The thresholds changing must not turn this into a backlog. Two
    // customer-backed gaps still yield exactly one, and anything
    // already answered, skipped or asked is still left alone.
    const both = [asked("opening_hours"), asked("price_range")];
    const one = nextGapToAsk([], [], both);
    expect(one).not.toBeNull();

    const dealtWith = [
      { question_key: "opening_hours", status: "asked" },
      { question_key: "price_range", status: "answered" },
    ];
    expect(nextGapToAsk([], dealtWith as any, both)).toBeNull();
  });

  it("a gap with neither kind of evidence is never asked", () => {
    expect(nextGapToAsk([], [], [])).toBeNull();
    expect(nextGapToAsk([cut("price")], [])).toBeNull();
  });
});

describe("3. THE SENTENCE ONLY CLAIMS WHAT HAPPENED", () => {
  it("A CUSTOMER-ONLY GAP NEVER MENTIONS CUTTING A LINE", () => {
    // THE LOAD-BEARING ONE. Nothing was cut. "I had to cut a line 0
    // times" is false, and "1 time" borrowed from the customer count is
    // worse.
    const line = gapAskLine({ key: "opening_hours", times: 0, fromCustomers: 1 })!;
    expect(line.text).toMatch(/A customer asked about your/);
    expect(line.text).not.toMatch(/cut a line/);
    expect(line.counted).toHaveLength(1);
    expect(line.counted[0]).toMatchObject({ value: 1, source: "answer_gaps" });
  });

  it("AND A GENERATOR-ONLY GAP IS WORD FOR WORD WHAT IT WAS", () => {
    // An existing sentence the owner has already read. Changing it
    // would be a change nobody asked for.
    const line = gapAskLine({ key: "price_range", times: 3, fromCustomers: 0 })!;
    expect(line.text).toMatch(/^I had to cut a line 3 times recently because I don't have your /);
    expect(line.text).not.toMatch(/A customer asked/);
    expect(line.counted).toHaveLength(1);
    expect(line.counted[0]).toMatchObject({ value: 3, source: "claim_checks" });
  });

  it("BOTH KINDS SAY BOTH, EACH WITH ITS OWN SOURCE", () => {
    const line = gapAskLine({ key: "price_range", times: 2, fromCustomers: 3 })!;
    expect(line.text).toMatch(/3 customers asked about your/);
    expect(line.text).toMatch(/cut a line 2 times/);
    expect(line.counted.map((c) => c.source).sort()).toEqual(["answer_gaps", "claim_checks"]);
    expect(line.counted.find((c) => c.source === "answer_gaps")!.value).toBe(3);
    expect(line.counted.find((c) => c.source === "claim_checks")!.value).toBe(2);
  });

  it("THE CUSTOMER COMES FIRST when there is one", () => {
    const line = gapAskLine({ key: "price_range", times: 2, fromCustomers: 1 })!;
    expect(line.text.indexOf("A customer asked")).toBeLessThan(line.text.indexOf("cut a line"));
  });

  it("one customer reads as one, not as '1 customers'", () => {
    expect(gapAskLine({ key: "opening_hours", times: 0, fromCustomers: 1 })!.text).toMatch(/A customer asked/);
    expect(gapAskLine({ key: "opening_hours", times: 0, fromCustomers: 2 })!.text).toMatch(/2 customers asked/);
  });

  it("EVERY DIGIT IN THE SENTENCE IS DECLARED", () => {
    // The report's digit walk drops the whole block over an undeclared
    // figure, and this sentence now carries two.
    for (const gap of [
      { key: "price_range", times: 2, fromCustomers: 3 },
      { key: "opening_hours", times: 0, fromCustomers: 1 },
      { key: "price_range", times: 4, fromCustomers: 0 },
    ]) {
      const line = gapAskLine(gap)!;
      const declared = new Set(line.counted.map((c) => String(c.value)));
      const sentence = line.text.slice(0, line.text.indexOf("?") + 1);
      for (const digit of sentence.match(/\d+/g) ?? []) {
        expect(declared.has(digit), `${digit} in "${sentence}"`).toBe(true);
      }
    }
  });

  it("a gap with no evidence at all produces no sentence", () => {
    expect(gapAskLine({ key: "price_range", times: 0, fromCustomers: 0 })).toBeNull();
  });

  it("an unregistered key still produces no sentence", () => {
    expect(gapAskLine({ key: "nope", times: 0, fromCustomers: 9 })).toBeNull();
  });
});

describe("4. THE READ, AND WHAT A FAILURE MEANS", () => {
  function db(opts: { checks?: any[]; customer?: any[]; failCustomer?: boolean } = {}) {
    return {
      from(table: string) {
        if (table === "interview_answers") {
          return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        }
        const data = table === "answer_gaps" ? opts.customer ?? [] : opts.checks ?? [];
        const error = table === "answer_gaps" && opts.failCustomer ? { message: "boom" } : null;
        const chain: any = { select: () => chain, eq: () => chain, gte: async () => ({ data, error }) };
        return chain;
      },
    } as any;
  }

  it("A CUSTOMER GAP REACHES THE OWNER'S QUESTION", async () => {
    const r = await findMissingFact(db({ customer: [asked("opening_hours")] }), "d1");
    expect(r.asked?.key).toBe("opening_hours");
    expect(r.line!.text).toMatch(/A customer asked about your/);
  });

  it("A FAILED GAPS READ ASKS NOTHING — it is not 'no customer asked'", async () => {
    // The same rule the visits reader follows: reporting silence we did
    // not measure is worse than saying nothing.
    const r = await findMissingFact(db({ checks: [cut("price"), cut("price")], failCustomer: true }), "d1");
    expect(r.asked).toBeNull();
    expect(r.why).toMatch(/could not read the history/);
  });

  it("THE READ IS SHARED BY BOTH ASKERS, not written twice", () => {
    // Two copies of a read is how one of them quietly stops asking for
    // a column — which happened to business_knowledge on 13 November.
    const src = code("src/lib/onboarding/factGaps.ts");
    expect(src.split('from("answer_gaps")')).toHaveLength(2);
    expect(src.split('from("claim_checks")')).toHaveLength(2);
    expect(src.split("readGapEvidence(")).toHaveLength(4); // definition + two callers
  });

  it("AND BOTH ASKERS PASS THE CUSTOMER ROWS ON", () => {
    const src = code("src/lib/onboarding/factGaps.ts");
    expect(src.split("nextGapToAsk(checks, progress, customer)")).toHaveLength(3);
  });
});
