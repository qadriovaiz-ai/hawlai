// S5/P0 — DECISION AND OUTCOME RECORDS, and the one distinction the
// whole stage rests on.
//
// Every stage before this made statements about what IS, checkable by
// looking. This one makes statements about what HAPPENED, and the
// obvious next step is a claim about what WORKED — which is a claim
// about cause. src/lib/claims exists because claims nobody measured are
// how this product has hurt people before.
//
// So the load-bearing assertions here are:
//
//   1. "we could not tell" is a DIFFERENT outcome from "it had no
//      effect", and the one that could not tell has to say why
//   2. a verdict about a change requires the change
//   3. attribution is NOT part of the verdict: a change can be real and
//      unattributable, and the honest row says both
//   4. the code and migration 215 hold the same rules, so neither can
//      drift into being the only place one is enforced

import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION,
  CONFIDENCE,
  DECISION_KINDS,
  SHORT_CHECK_DAYS,
  STANDARD_CHECK_DAYS,
  VERDICT,
  checkDateFrom,
  isDue,
  verdictFor,
  whyOutcomeIsNotWritable,
  type OutcomeRow,
} from "@/lib/growth/outcomes";
import { code, sql } from "./helpers/source";

const migration = sql("supabase/migrations/215_decisions_outcomes.sql");

function row(over: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    verdict: "improved",
    confidence: "counted",
    attribution: "direct",
    measuredBefore: 10,
    measuredAfter: 14,
    whyNotMeasurable: null,
    ...over,
  };
}

describe("1. 'WE COULD NOT TELL' IS NOT 'IT HAD NO EFFECT'", () => {
  it("not_measurable IS A VERDICT, not an absent row", () => {
    expect(VERDICT).toContain("not_measurable");
    expect(VERDICT).toContain("unchanged");
    // Four distinct answers, and the two above are two of them.
    expect(new Set(VERDICT).size).toBe(4);
  });

  it("AND IT HAS TO SAY WHY", () => {
    // An unexplained "could not tell" is the silence this stage exists
    // to stop: three guards in the two days before this was written
    // failed by saying nothing.
    const why = whyOutcomeIsNotWritable(
      row({ verdict: "not_measurable", confidence: "inferred", measuredBefore: null, measuredAfter: null, whyNotMeasurable: null })
    );
    expect(why).toMatch(/has to say why/);
    expect(
      whyOutcomeIsNotWritable(
        row({ verdict: "not_measurable", confidence: "inferred", measuredBefore: null, measuredAfter: null, whyNotMeasurable: "page_events carries no attribution for this piece" })
      )
    ).toBeNull();
  });

  it("AND A BLANK REASON IS NOT A REASON", () => {
    for (const blank of ["", "   ", null]) {
      const why = whyOutcomeIsNotWritable(
        row({ verdict: "not_measurable", confidence: "inferred", measuredBefore: null, measuredAfter: null, whyNotMeasurable: blank as any })
      );
      expect(why, JSON.stringify(blank)).toMatch(/has to say why/);
    }
  });

  it("AND THE DATABASE REFUSES IT TOO", () => {
    const rule = migration.slice(migration.indexOf("add constraint outcomes_not_measurable_needs_reason"));
    expect(rule.slice(0, rule.indexOf(";"))).toMatch(
      /verdict <> 'not_measurable'\s*or \(why_not_measurable is not null and length\(btrim\(why_not_measurable\)\) > 0\)/
    );
  });
});

describe("2. A VERDICT ABOUT A CHANGE REQUIRES THE CHANGE", () => {
  it("SO 'IMPROVED' CAN NEVER MEAN 'FELT BETTER'", () => {
    // CONFIDENCE "observed", NOT THE FIXTURE'S "counted". With counted,
    // the counted rule fires on the same missing numbers and satisfies
    // the same wording — so a mutation that deleted the VERDICT rule
    // survived this test. It was passing by the wrong rule.
    for (const verdict of ["improved", "unchanged", "worsened"] as const) {
      const why = whyOutcomeIsNotWritable(
        row({ verdict, confidence: "observed", measuredBefore: null, measuredAfter: null })
      );
      expect(why, verdict).toBe(`a verdict of "${verdict}" needs both a before and an after`);
    }
  });

  it("AND HALF A MEASUREMENT IS NOT A MEASUREMENT", () => {
    expect(whyOutcomeIsNotWritable(row({ measuredAfter: null }))).toMatch(/before and an after/);
    expect(whyOutcomeIsNotWritable(row({ measuredBefore: null }))).toMatch(/before and an after/);
  });

  it("AND 'COUNTED' MUST MEAN COUNTED", () => {
    // The weaker two words exist for the cases this one does not cover.
    const why = whyOutcomeIsNotWritable(
      row({ verdict: "not_measurable", confidence: "counted", measuredBefore: null, measuredAfter: null, whyNotMeasurable: "no attribution" })
    );
    expect(why).toMatch(/"counted" confidence needs both/);
  });

  it("AND THE DATABASE REFUSES BOTH", () => {
    // THE BODY, NOT THE NAME. Asserting the constraint name only meant
    // a mutation could replace its condition with `true` and leave the
    // name sitting there — which is exactly what survived the first
    // run. A constraint named after a rule it no longer holds is worse
    // than no constraint.
    const verdictRule = migration.slice(migration.indexOf("add constraint outcomes_verdict_needs_numbers"));
    expect(verdictRule.slice(0, verdictRule.indexOf(";"))).toMatch(
      /verdict = 'not_measurable'\s*or \(measured_before is not null and measured_after is not null\)/
    );
    const countedRule = migration.slice(migration.indexOf("add constraint outcomes_counted_needs_numbers"));
    expect(countedRule.slice(0, countedRule.indexOf(";"))).toMatch(
      /confidence <> 'counted'\s*or \(measured_before is not null and measured_after is not null\)/
    );
  });

  it("delta is computed by Postgres, never written", () => {
    // Migration 210 made the same choice for `score`: a stored number
    // and its inputs are two descriptions of one thing, and this
    // project has paid five times for a second description that
    // drifted.
    expect(migration).toMatch(/delta numeric generated always as \(measured_after - measured_before\) stored/);
    expect(code("src/lib/growth/outcomes.ts")).not.toMatch(/delta/);
  });
});

describe("3. ATTRIBUTION IS NOT PART OF THE VERDICT", () => {
  it("THE VERDICT IS COMPUTED FROM THE NUMBERS ALONE", () => {
    // Folding attribution in would turn "it went up, and nothing ties
    // that to this" into either a false claim or a thrown-away
    // measurement. A change can be real AND unattributable.
    expect(verdictFor(10, 14, "up")).toBe("improved");
    expect(verdictFor(14, 10, "up")).toBe("worsened");
    expect(verdictFor(10, 10, "up")).toBe("unchanged");
    expect(verdictFor(0, 0, "down")).toBe("unchanged");
    // NO ATTRIBUTION PARAMETER. The first version of this asserted the
    // arity instead, which was a proxy that broke the moment `direction`
    // was added for a real reason — and arity says nothing about WHICH
    // arguments. The source says it outright.
    const src = code("src/lib/growth/outcomes.ts");
    const fn = src.slice(src.indexOf("export function verdictFor"));
    expect(fn.slice(0, fn.indexOf(")"))).not.toMatch(/attribution/i);
  });

  it("AND AN IMPROVEMENT NOBODY CAN ATTRIBUTE IS STILL WRITABLE", () => {
    // The honest row: it improved, and nothing connects that to this.
    expect(whyOutcomeIsNotWritable(row({ attribution: "none" }))).toBeNull();
    expect(ATTRIBUTION).toContain("none");
  });

  it("AND WHICH WAY IS BETTER IS PART OF THE QUESTION", () => {
    // THE TRAP THIS CLOSES. "open findings" is a measure where FEWER is
    // better. Comparing the numbers alone would have recorded a goal
    // that closed five findings down to two — the thing working exactly
    // as intended — as "worsened", and every month's review would have
    // read as failure.
    expect(verdictFor(5, 2, "down")).toBe("improved");
    expect(verdictFor(2, 5, "down")).toBe("worsened");
    expect(verdictFor(5, 2, "up")).toBe("worsened");
    expect(verdictFor(2, 5, "up")).toBe("improved");
  });

  it("and an unreadable number is not a verdict", () => {
    expect(verdictFor(NaN, 10, "up")).toBe("not_measurable");
    expect(verdictFor(10, Infinity, "down")).toBe("not_measurable");
  });
});

describe("4. THE CODE AND THE MIGRATION HOLD THE SAME VOCABULARIES", () => {
  // A rule in only one of the two places is a rule that will drift.
  // autonomyLevels.ts has the same arrangement with migration 209, and
  // its header gives the reason: the database refuses a bad row at the
  // worst possible moment, and a test refuses it now.

  it("CONFIDENCE IS business_signals' OWN THREE WORDS", () => {
    expect([...CONFIDENCE]).toEqual(["counted", "observed", "inferred"]);
    expect(migration).toMatch(/confidence in \('counted', 'observed', 'inferred'\)/);
    // And it says where they came from, so nobody invents a fourth.
    expect(sql("supabase/migrations/215_decisions_outcomes.sql")).toMatch(/business_signals/);
  });

  it("AND EVERY VERDICT AND ATTRIBUTION VALUE IS IN THE CHECK", () => {
    for (const v of VERDICT) expect(migration, v).toContain(`'${v}'`);
    for (const a of ATTRIBUTION) expect(migration, a).toContain(`'${a}'`);
  });

  it("AND EVERY DECISION KIND IS IN THE CHECK", () => {
    for (const k of DECISION_KINDS) expect(migration, k).toContain(`'${k}'`);
    expect(migration).toMatch(/kind text not null check \(kind in \(/);
  });

  it("THE KIND IS A CLOSED SET, unlike action_levels.action_key", () => {
    // 209 left its key unconstrained because the policy table is code
    // and moves faster than migrations. Here the results job must know
    // HOW to measure each kind, so an unknown kind is a decision nobody
    // can ever score.
    const levels = sql("supabase/migrations/209_action_levels.sql");
    expect(levels).not.toMatch(/check \(action_key in/);
    expect(migration).toMatch(/check \(kind in \(/);
  });
});

describe("5. the decision's own shape", () => {
  it("expected_effect IS NULLABLE, BY DECISION", () => {
    // The founder's call, 3 November 2026: "I am doing this because it
    // is obviously right" is an honest decision, and forcing a forecast
    // would make this product invent numbers. The cost — such a
    // decision can never be scored against an expectation — is
    // accepted knowingly, and written down rather than discovered.
    expect(migration).toMatch(/expected_effect jsonb,/);
    expect(migration).not.toMatch(/expected_effect jsonb not null/);
    expect(migration).toMatch(/NULLABLE BY DECISION/);
  });

  it("AND HALF AN EXPECTED EFFECT IS REFUSED", () => {
    expect(migration).toMatch(/decisions_expected_effect_shape/);
    expect(migration).toMatch(/expected_effect \? 'metric' and expected_effect \? 'direction'/);
  });

  it("A CHECK DATE BEFORE THE DECISION IS REFUSED", () => {
    // It would come due the moment it was written, and be measured
    // before the action could have had any effect — a number with no
    // measurement behind it.
    expect(migration).toMatch(/decisions_check_date_not_before/);
    expect(migration).toMatch(/check_date >= \(created_at\)::date/);
  });

  it("why IS POINTERS, NOT PROSE, in opportunities' own shape", () => {
    expect(migration).toMatch(/why jsonb not null default '\[\]'::jsonb/);
    expect(migration).toMatch(/decisions_why_is_array/);
  });

  it("ONE OUTCOME PER DECISION", () => {
    // A second row would make "which one is right" a question nobody
    // should have to answer, and the results job genuinely re-enters a
    // run whose invocation ran out of time.
    expect(migration).toMatch(/decision_id uuid references decisions\(id\) on delete cascade not null unique/);
  });

  it("AND BOTH TABLES ARE OWNER-ONLY", () => {
    expect(migration).toMatch(/alter table decisions enable row level security/);
    expect(migration).toMatch(/alter table outcomes enable row level security/);
    expect(migration).toMatch(/decisions_dealership_all/);
    expect(migration).toMatch(/outcomes_dealership_all/);
    // outcomes has no dealership_id of its own, so its policy has to
    // reach through the decision.
    expect(migration).toMatch(/join dealerships ds on ds\.id = d\.dealership_id/);
  });
});

describe("6. the check date, and the 28 days that cannot be shortened", () => {
  it("THE DAY ITSELF COUNTS AS DUE", () => {
    expect(isDue("2026-11-06", "2026-11-06")).toBe(true);
    expect(isDue("2026-11-05", "2026-11-06")).toBe(true);
    expect(isDue("2026-11-07", "2026-11-06")).toBe(false);
  });

  it("AND AN UNREADABLE DATE IS NOT DUE", () => {
    // Being wrong the other way would measure a decision whose date
    // nobody can read, and write a number against it.
    expect(isDue("", "2026-11-06")).toBe(false);
    expect(isDue("soon", "2026-11-06")).toBe(false);
    expect(isDue("2026-11-06", "")).toBe(false);
    expect(isDue("2026-13-45", "2026-11-06")).toBe(false);
  });

  it("THE SHORT CHECK IS THREE DAYS AND THE STANDARD ONE IS STILL 28", () => {
    // The founder's P6 call: three days on ONE business, so the loop
    // can be watched closing this week. It does not shorten the exit
    // test, which is 28 days and stays unverified until it elapses.
    expect(SHORT_CHECK_DAYS).toBe(3);
    expect(STANDARD_CHECK_DAYS).toBe(28);
    expect(SHORT_CHECK_DAYS).toBeLessThan(STANDARD_CHECK_DAYS);
  });

  it("and a check date is counted in whole days from the day given", () => {
    expect(checkDateFrom("2026-11-03", 3)).toBe("2026-11-06");
    expect(checkDateFrom("2026-11-03", 28)).toBe("2026-12-01");
    expect(checkDateFrom("2026-11-03", 0)).toBe("2026-11-03");
    // Never backwards: that would be a check date before the decision,
    // which the database refuses.
    expect(checkDateFrom("2026-11-03", -5)).toBe("2026-11-03");
  });
});
