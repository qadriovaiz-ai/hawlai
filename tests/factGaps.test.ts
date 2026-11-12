// The question the product asks because it needed the answer (I6 of
// docs/PLAN-AUTO-INTERVIEW.md — Tier 3).
//
// WHAT THIS TIER IS FOR, in the founder's own words: "jab real business
// sign up kare, kisi insaan ko beech mein manually interview lene ki
// zaroorat na pade." Tiers 1 and 2 ask at a moment the product chose.
// This tier asks at the moment the answer was MISSED — when a generator
// reached for a fact the business has never recorded and the guard
// deleted the sentence instead.
//
// WHAT WAS ALREADY THERE AND WHERE IT STOPPED. `claim_checks` has
// recorded `claims_removed` since migration 217 — an INTEGER. So the
// product has always known it wanted to say something it could not
// support, and never WHAT. And the answer existed one function earlier:
// claimCheck.ts's `Problem` type carries
// kind: "price" | "claim" | "substantiation" on every removal, and
// stripUnsupported flattened it away before any caller saw it.
//
// THE DECISION THESE TESTS PIN: the mapping from a removal to a question
// is REFUSED wherever it cannot be read off the guard's own
// classification. A mapper that guessed would ask the owner about a
// "material" because a sentence happened to mention one — the
// invented-keyword mistake the Growth Loop audit found three times in
// this product, arriving in the interview.

import { describe, it, expect, vi, afterEach } from "vitest";
import { code, sourceWithComments, sql } from "./helpers/source";

import {
  ASK_AFTER,
  askForMissingFact,
  gapAskLine,
  gapsFrom,
  nextGapToAsk,
  questionForKind,
} from "@/lib/onboarding/factGaps";
import { questionByKey } from "@/lib/onboarding/interview";
import { claimCheckField } from "@/lib/claims/claimChecks";
import { buildDailyReport, everyNumberIsCounted } from "@/lib/growth/report";
import { maturityOf } from "@/lib/growth/strategy";

afterEach(() => vi.restoreAllMocks());

const row = (...kinds: string[]) => ({ removed_kinds: kinds, claims_removed: kinds.length });

// ---------------------------------------------------------------------
describe("1. THE KIND SURVIVES THE BOUNDARY IT USED TO DIE AT", () => {
  it("stripUnsupported HANDS BACK THE KINDS, not only the sentences", () => {
    const src = code("src/lib/claims/claimCheck.ts");
    expect(src).toMatch(/removedKinds: \("price" \| "claim" \| "substantiation"\)\[\];/);
    expect(src).toMatch(/removedKinds\.push\(\.\.\.problems\.map\(\(p\) => p\.kind\)\)/);
  });

  it("AND THEY ARE NOT DE-DUPLICATED, because Tier 3 counts", () => {
    // Two prices the guard could not support is twice the evidence that
    // no price is on record. `removed` is de-duplicated for the owner's
    // reading; this is not.
    // code() STRIPS COMMENTS, so the reason sitting between these two
    // lines in the source is not in what this reads — they are adjacent
    // here. The first version of this assertion tried to match across
    // that comment and could never have passed.
    const src = code("src/lib/claims/claimCheck.ts");
    expect(src).toMatch(/removed: Array\.from\(new Set\(removed\)\),\s*\n\s*removedKinds,/);
    // And the reason IS in the source, where the next reader will be.
    expect(sourceWithComments("src/lib/claims/claimCheck.ts")).toMatch(/NOT DE-DUPLICATED, unlike `removed`/);
  });

  it("THE CLEAN PATH RETURNS AN EMPTY LIST, not undefined", () => {
    const src = code("src/lib/claims/claimCheck.ts");
    expect(src).toMatch(/return \{ text, removed: \[\], removedKinds: \[\],/);
  });

  it("AND THE ROW CARRIES THEM", () => {
    const src = code("src/lib/claims/claimChecks.ts");
    expect(src).toMatch(/removed_kinds: input\.field\.removedKinds,/);
  });

  it("an absent list is recorded as empty, which means NOT RECORDED", () => {
    // Every row written before migration 224 has an empty array, and
    // none of them means a clean output — `removed` is where the count
    // is stated.
    expect(claimCheckField({ text: "x", removed: ["a"] }).removedKinds).toEqual([]);
    expect(claimCheckField({ text: "x", removed: ["a"], removedKinds: ["price"] }).removedKinds).toEqual(["price"]);
    expect(claimCheckField({ text: "x", removed: ["a"], removedKinds: "price" as any }).removedKinds).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("2. A GAP IS ONLY NAMED WHERE THE GUARD ALREADY CLASSIFIED IT", () => {
  it("A PRICE REMOVAL ASKS FOR THE PRICE RANGE", () => {
    expect(questionForKind("price")).toBe("price_range");
  });

  it("A SUBSTANTIATION REMOVAL ASKS WHY THEM AND NOT SOMEONE CHEAPER", () => {
    // The guard's own category for a claim only the owner can stand
    // behind.
    expect(questionForKind("substantiation")).toBe("why_not_cheaper");
  });

  it("A CLAIM ABOUT A SPAN OF TIME ASKS ABOUT TIMING", () => {
    expect(questionForKind("claim", '"ships in 2 days" — nothing on record says so')).toBe("delivery_time");
    expect(questionForKind("claim", "same-day dispatch")).toBe("delivery_time");
  });

  it("AND EVERYTHING ELSE ASKS NOTHING AT ALL", () => {
    // THE DECISION. A mapper that guessed would ask the owner for the
    // wrong thing, and a question about something he was never asked
    // about reads as the product not knowing its own business.
    expect(questionForKind("claim", "some other unsupported sentence")).toBeNull();
    expect(questionForKind("claim")).toBeNull();
    expect(questionForKind("something_new")).toBeNull();
    expect(questionForKind(null)).toBeNull();
    expect(questionForKind(undefined)).toBeNull();
  });

  it("every key it can name is a real interview question", () => {
    for (const kind of [
      ["price", ""],
      ["substantiation", ""],
      ["claim", "2 days"],
    ] as [string, string][]) {
      const key = questionForKind(kind[0], kind[1])!;
      expect(questionByKey(key), `${key} is not a registered question`).not.toBeNull();
    }
  });

  it("and the time words are filler-free in any trade — rule 3", () => {
    const src = code("src/lib/onboarding/factGaps.ts").toLowerCase();
    for (const word of ["candle", "saree", "mithai", "tuition", "showroom", "jar"]) {
      expect(src).not.toContain(word);
    }
  });
});

// ---------------------------------------------------------------------
describe("3. GAPS ARE COUNTED, AND AN EMPTY LIST IS NOT A CLEAN OUTPUT", () => {
  it("THE SAME GAP TWICE IS COUNTED TWICE", () => {
    expect(gapsFrom([row("price"), row("price")])).toEqual([{ key: "price_range", times: 2 }]);
    expect(gapsFrom([row("price", "price")])).toEqual([{ key: "price_range", times: 2 }]);
  });

  it("THE MOST MISSED IS FIRST", () => {
    const gaps = gapsFrom([row("price"), row("substantiation"), row("substantiation"), row("substantiation")]);
    expect(gaps[0]).toEqual({ key: "why_not_cheaper", times: 3 });
    expect(gaps[1]).toEqual({ key: "price_range", times: 1 });
  });

  it("A TIE IS BROKEN BY KEY, so two runs cannot disagree", () => {
    // SUBSTANTIATION IS FED FIRST ON PURPOSE. The counts are collected in
    // a Map, so without the key tie-break the answer is whichever kind
    // happened to appear first in the rows — and the first version of this
    // test fed price first, where insertion order and alphabetical order
    // agree, so it passed with the tie-break deleted. Found by mutation
    // M14 on 2026-11-07.
    const gaps = gapsFrom([row("substantiation"), row("price")]);
    expect(gaps.map((g) => g.key)).toEqual(["price_range", "why_not_cheaper"]);
  });

  it("AND EVERY KEY IT CAN RETURN IS A REGISTERED QUESTION", () => {
    // What the guard removed from nextGapToAsk was standing in for, and
    // the thing that would genuinely break: questionForKind returns three
    // literal keys, and if the registry is renamed under it this tier goes
    // quiet instead of erroring. Mutation M22 showed the guard itself
    // could not be reached from any input, so the invariant is pinned
    // here instead of defended there.
    for (const key of ["price_range", "why_not_cheaper", "delivery_time"]) {
      expect(questionByKey(key), `${key} is not in the registry`).toBeTruthy();
    }
  });

  it("AN EMPTY removed_kinds CONTRIBUTES NOTHING", () => {
    // Every row written before migration 224 has one, and reading it as
    // "nothing was removed" would make the product confident about a
    // history it cannot see.
    expect(gapsFrom([{ removed_kinds: [], claims_removed: 3 }])).toEqual([]);
    expect(gapsFrom([{ claims_removed: 3 }])).toEqual([]);
    expect(gapsFrom([{ removed_kinds: "price" as any }])).toEqual([]);
  });

  it("and no rows is no gaps, not an error", () => {
    expect(gapsFrom([])).toEqual([]);
    expect(gapsFrom(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("4. ONE QUESTION, ABOVE A THRESHOLD, AND ONCE EVER", () => {
  it("ONE REMOVAL IS NOT ENOUGH", () => {
    // A single removal can be a generator reaching for something the
    // business genuinely does not do. Twice is a pattern.
    expect(ASK_AFTER).toBe(2);
    expect(nextGapToAsk([row("price")], [])).toBeNull();
    expect(nextGapToAsk([row("price"), row("price")], [])).toEqual({ key: "price_range", times: 2 });
  });

  it("AN ANSWERED QUESTION IS LEFT ALONE", () => {
    const progress = [{ question_key: "price_range", status: "answered" }];
    expect(nextGapToAsk([row("price"), row("price")], progress)).toBeNull();
  });

  it("AND SO IS A SKIPPED ONE", () => {
    // The owner declining is him having dealt with it.
    const progress = [{ question_key: "price_range", status: "skipped" }];
    expect(nextGapToAsk([row("price"), row("price")], progress)).toBeNull();
  });

  it("AND SO IS ONE ALREADY ASKED — once, ever", () => {
    // The founder's decision of 7 November. A product that asks the same
    // thing every week is a product the owner stops reading.
    const progress = [{ question_key: "price_range", status: "asked" }];
    expect(nextGapToAsk([row("price"), row("price")], progress)).toBeNull();
  });

  it("THE NEXT GAP DOWN IS ASKED INSTEAD, not nothing", () => {
    const rows = [row("price"), row("price"), row("substantiation"), row("substantiation")];
    const progress = [{ question_key: "price_range", status: "asked" }];
    expect(nextGapToAsk(rows, progress)).toEqual({ key: "why_not_cheaper", times: 2 });
  });

  it("and a gap with no registered question is skipped over", () => {
    expect(nextGapToAsk([{ removed_kinds: ["not_a_kind", "not_a_kind"] }], [])).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("5. THE LINE SAYS WHY IT IS ASKING, AND DECLARES ITS FIGURE", () => {
  it("IT GIVES THE REASON BEFORE THE QUESTION", () => {
    // "What is your price range?" out of nowhere is a form. "I had to
    // delete a line twice because I don't know your prices" is a reason,
    // and it is true.
    const line = gapAskLine({ key: "price_range", times: 3 })!;
    expect(line.text).toMatch(/^I had to cut a line 3 times recently because I don't have your Price range\./);
  });

  it("AND THE QUESTION ITSELF COMES FROM THE REGISTRY", () => {
    // So the rule-3 test that holds the interview's prompts
    // category-neutral holds this line too.
    const line = gapAskLine({ key: "price_range", times: 2 })!;
    expect(line.text).toContain(questionByKey("price_range")!.prompt);
    expect(code("src/lib/onboarding/factGaps.ts")).toMatch(/\$\{question\.prompt\}/);
  });

  it("THE DIGIT IS DECLARED, or the report would drop the whole block", () => {
    // growth/audit.ts records the fault: the digit walk refuses a number
    // it cannot trace, and it dropped an entire email over the "5" in
    // "5 pages have no search title".
    const line = gapAskLine({ key: "price_range", times: 4 })!;
    expect(line.counted).toEqual([
      { label: "lines cut for a missing Price range", value: 4, source: "claim_checks" },
    ]);
  });

  it("AND THE REPORT KEEPS THE BLOCK, digit walk and all", () => {
    const line = gapAskLine({ key: "delivery_time", times: 2 })!;
    // The same shape tests/growthReport.test.ts builds, because the
    // builder reads tracking and maturity and a partial object throws
    // before it reaches the block being tested.
    const report = buildDailyReport({
      dealershipId: "d1",
      day: "2026-11-08",
      businessName: "A Business",
      tracking: {
        siteEvents: { firing: true, lastAt: "2026-10-22T10:00:00Z", visitorEvents30d: 41, firstAt: "2026-08-01T10:00:00Z" },
        searchConsole: { connected: true, siteUrl: "https://example.test" },
        site: { published: true, why: "your site is published" },
        adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded" },
        health: "ok",
      },
      maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, new Date("2026-11-08T06:00:00Z")),
      counted: [],
      declared: line.counted,
      suggestions: [],
      setupGoals: [],
      activeGoals: 1,
      findingCount: 0,
      askForFact: line,
    } as any);
    const printed = JSON.stringify(report);
    expect(printed).toContain("I had to cut a line 2 times recently");
    expect(everyNumberIsCounted(report).ok).toBe(true);
  });

  it("a gap with no registered question produces no line", () => {
    expect(gapAskLine({ key: "not_a_question", times: 5 })).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("6. THE ASK IS RECORDED BEFORE IT IS SENT", () => {
  function db(opts: { checks?: any[]; progress?: any[]; failCheck?: boolean; failWrite?: boolean } = {}) {
    const written: any[] = [];
    const client = {
      from(table: string) {
        if (table === "claim_checks") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            gte: async () => ({ data: opts.checks ?? [], error: opts.failCheck ? { message: "boom" } : null }),
          };
          return chain;
        }
        return {
          select: () => ({ eq: async () => ({ data: opts.progress ?? [], error: null }) }),
          upsert: async (payload: any) => {
            written.push(payload);
            return { error: opts.failWrite ? { message: "write failed" } : null };
          },
        };
      },
    };
    return { client, written };
  }

  it("A GAP WORTH ASKING ABOUT IS MARKED asked, WITH A TIMESTAMP", () => {
    const { client, written } = db({ checks: [row("price"), row("price")] });
    return askForMissingFact(client as any, "d1").then((r) => {
      expect(r.asked).toEqual({ key: "price_range", times: 2 });
      expect(r.line!.text).toContain("Price range");
      expect(written[0]).toMatchObject({ dealership_id: "d1", question_key: "price_range", status: "asked" });
      expect(typeof written[0].asked_at).toBe("string");
    });
  });

  it("AND IF THE RECORD CANNOT BE WRITTEN, NOTHING IS ASKED", () => {
    // The whole promise of this tier is one question per fact, ever. An
    // ask that could not be recorded would be asked again tomorrow.
    const { client } = db({ checks: [row("price"), row("price")], failWrite: true });
    return askForMissingFact(client as any, "d1").then((r) => {
      expect(r.asked).toBeNull();
      expect(r.line).toBeNull();
      expect(r.why).toMatch(/could not record the ask/);
    });
  });

  it("A FAILED READ ASKS NOTHING", () => {
    // Asking without being able to check what has already been asked is
    // how "once, ever" becomes "every morning".
    const { client, written } = db({ failCheck: true });
    return askForMissingFact(client as any, "d1").then((r) => {
      expect(r.asked).toBeNull();
      expect(r.why).toMatch(/could not read the history/);
      expect(written).toEqual([]);
    });
  });

  it("AND NOTHING MISSED OFTEN ENOUGH ASKS NOTHING, quietly", () => {
    const { client, written } = db({ checks: [row("price")] });
    return askForMissingFact(client as any, "d1").then((r) => {
      expect(r.asked).toBeNull();
      expect(r.why).toMatch(/nothing has been missed often enough/);
      expect(written).toEqual([]);
    });
  });

  it("the order is recorded-then-returned, and the file says why", () => {
    const src = sourceWithComments("src/lib/onboarding/factGaps.ts");
    expect(src).toMatch(/THE RECORD IS WRITTEN BEFORE THE EMAIL IS BUILT/);
    // SLICED TO askForMissingFact FIRST. R2c added findMissingFact,
    // which READS ONLY and returns the same shape earlier in the file —
    // so indexOf found its return and inverted this check. The
    // satisfied-by-any-occurrence fault, again: when the thing occurs
    // more than once, slice.
    const whole = code("src/lib/onboarding/factGaps.ts");
    const body = whole.slice(whole.indexOf("export async function askForMissingFact"));
    expect(body.length).toBeGreaterThan(400);
    const upsertAt = body.indexOf('from("interview_answers").upsert');
    const returnAt = body.indexOf("return { asked: gap, line");
    expect(upsertAt).toBeGreaterThan(-1);
    expect(returnAt).toBeGreaterThan(upsertAt);
  });
});

// ---------------------------------------------------------------------
describe("7. THE DAILY RUN ASKS, AND A FAILURE NEVER BREAKS THE EMAIL", () => {
  const run = code("src/lib/growth/dailyGrowth.ts");

  it("THE RUN CALLS IT AND PASSES THE LINE TO THE REPORT", () => {
    expect(run).toMatch(/const ask = await askForMissingFact\(supabase, dealershipId\)/);
    expect(run).toMatch(/askForFact = ask\.line;/);
    expect(run).toMatch(/^\s*askForFact,$/m);
  });

  it("AND IT CANNOT THROW INTO THE RUN", () => {
    // Every other optional block here has the same shape: a failure is
    // logged and the email still goes.
    expect(run).toMatch(/try \{\s*\n\s*const ask = await askForMissingFact/);
    expect(run).toMatch(/could not look for a missing fact to ask about/);
  });

  it("THE QUESTION SITS ABOVE THE NUMBERS, below the plan", () => {
    // It is a request, not a result, so it does not belong among the
    // stats — and an owner who reads only the top still sees it.
    const report = code("src/lib/growth/report.ts");
    const askAt = report.indexOf("const ask = input.askForFact;");
    const statsAt = report.indexOf('for (const c of input.counted) blocks.push({ kind: "stat"');
    expect(askAt).toBeGreaterThan(-1);
    expect(statsAt).toBeGreaterThan(askAt);
  });

  it("and an empty question adds no block", () => {
    const report = code("src/lib/growth/report.ts");
    expect(report).toMatch(/if \(ask && String\(ask\.text \?\? ""\)\.trim\(\)\) \{/);
  });
});

// ---------------------------------------------------------------------
describe("8. THE MIGRATION KEEPS THE KIND AND NOT THE WORDS", () => {
  const m = sql("supabase/migrations/224_claim_check_gaps.sql");

  it("THE COLUMN IS A jsonb ARRAY DEFAULTING TO EMPTY", () => {
    expect(m).toMatch(/add column if not exists removed_kinds jsonb not null default '\[\]'::jsonb/);
  });

  it("AND THE REMOVED SENTENCES ARE DELIBERATELY NOT STORED", () => {
    // claim_checks.text already raised a retention question that
    // migration 217 flagged and nobody has answered. Tier 3 needs the
    // kind, and the question put to the owner is written from the
    // registry rather than from the model's wording.
    expect(m).not.toMatch(/removed_text|removed_phrases|removed_sentences/);
    const raw = sourceWithComments("supabase/migrations/224_claim_check_gaps.sql");
    expect(raw).toMatch(/the removed SENTENCES/);
  });

  it("THE COLUMN SAYS WHAT AN EMPTY ARRAY MEANS", () => {
    expect(m).toMatch(/comment on column claim_checks\.removed_kinds is/);
    expect(m).toMatch(/claims_removed stays the count/);
  });

  it("and it ships the query that proves nothing was changed", () => {
    const raw = sourceWithComments("supabase/migrations/224_claim_check_gaps.sql");
    expect(raw).toMatch(/count\(\*\) filter \(where removed_kinds = '\[\]'::jsonb\) as empty/);
    expect(raw).toMatch(/the two numbers are EQUAL/);
  });
});
