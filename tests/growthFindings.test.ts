// S4/P0 — WHAT MAKES A FINDING WORTH SHOWING THE OWNER.
//
// The Strategist's four rules, pinned before the Strategist exists:
// score = impact x confidence / effort, 3 actions a day, a 30-day
// cooldown after a rejection, and — from the exit test itself —
//
//   > "each suggestion cites evidence and the goal it serves"
//
// so a finding with neither is not refused at render time, it is
// refused here. The exit test is about what the owner RECEIVES, and the
// only way to pass it reliably is to make the unfit thing unsendable.

import { describe, it, expect } from "vitest";
import {
  MAX_ACTIONS_PER_DAY,
  REJECTION_COOLDOWN_DAYS,
  inCooldown,
  pickForToday,
  scorable,
  scoreOf,
  surfaceable,
  type Finding,
} from "@/lib/growth/findings";
import { code } from "./helpers/source";

const NOW = new Date("2026-10-23T09:00:00.000Z");

function finding(over: Partial<Finding> = {}): Finding {
  return {
    score: { impact: 4, confidence: 4, effort: 2 },
    evidence: [{ kind: "page_event", id: "ev_1" }],
    goalId: "goal_1",
    rejectedAt: null,
    ...over,
  };
}

describe("1. the score is the founder's formula, and nothing else", () => {
  it("IS impact x confidence / effort", () => {
    expect(scoreOf({ impact: 4, confidence: 4, effort: 2 })).toBe(8);
    expect(scoreOf({ impact: 5, confidence: 1, effort: 5 })).toBe(1);
    expect(scoreOf({ impact: 1, confidence: 1, effort: 3 })).toBe(0.333);
  });

  it("REFUSES TO SCORE AN INCOMPLETE FINDING rather than guessing a default", () => {
    // A missing input scored as 1, or as 3, would rank a finding nobody
    // assessed against findings somebody did.
    expect(scorable(null)).toBe(false);
    expect(scorable({ impact: 4, confidence: 4 } as any)).toBe(false);
    expect(() => scoreOf({ impact: 4, confidence: 4 } as any)).toThrow(/incomplete/);
  });

  it("and takes only whole numbers in range", () => {
    expect(scorable({ impact: 0, confidence: 3, effort: 3 })).toBe(false);
    expect(scorable({ impact: 6, confidence: 3, effort: 3 })).toBe(false);
    expect(scorable({ impact: 2.5, confidence: 3, effort: 3 })).toBe(false);
    expect(scorable({ impact: 1, confidence: 1, effort: 1 })).toBe(true);
    expect(scorable({ impact: 5, confidence: 5, effort: 5 })).toBe(true);
  });

  it("CANNOT BE ASKED TO DIVIDE BY ZERO", () => {
    // Guaranteed twice: here, and by migration 210's CHECK that keeps
    // effort between 1 and 5.
    expect(scorable({ impact: 3, confidence: 3, effort: 0 })).toBe(false);
    expect(() => scoreOf({ impact: 3, confidence: 3, effort: 0 })).toThrow();
  });
});

describe("2. the exit test's own requirements are enforced here", () => {
  it("A SUGGESTION WITH NO EVIDENCE IS NOT A SUGGESTION", () => {
    const r = surfaceable(finding({ evidence: [] }), { now: NOW, surfacedToday: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/cites no evidence/);
  });

  it("AND NEITHER IS ONE WHOSE EVIDENCE POINTS AT NOTHING", () => {
    // An entry with an empty id passes a length check and fails the
    // owner, who clicks it and arrives nowhere.
    for (const bad of [{ kind: "", id: "ev_1" }, { kind: "page_event", id: "" }, { kind: "page_event", id: "   " }]) {
      const r = surfaceable(finding({ evidence: [bad] }), { now: NOW, surfacedToday: 0 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.why).toMatch(/points at nothing/);
    }
  });

  it("A SUGGESTION MUST NAME THE GOAL IT SERVES", () => {
    const r = surfaceable(finding({ goalId: null }), { now: NOW, surfacedToday: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/serves no goal/);
  });

  it("and a complete one goes through", () => {
    expect(surfaceable(finding(), { now: NOW, surfacedToday: 0 })).toEqual({ ok: true });
  });
});

describe("3. the cooldown", () => {
  it("HOLDS FOR 30 DAYS AFTER A REJECTION", () => {
    expect(REJECTION_COOLDOWN_DAYS).toBe(30);
    const yesterday = new Date(NOW.getTime() - 1 * 86_400_000).toISOString();
    const twentyNine = new Date(NOW.getTime() - 29 * 86_400_000).toISOString();
    const thirtyOne = new Date(NOW.getTime() - 31 * 86_400_000).toISOString();
    expect(inCooldown(yesterday, NOW)).toBe(true);
    expect(inCooldown(twentyNine, NOW)).toBe(true);
    expect(inCooldown(thirtyOne, NOW)).toBe(false);
    expect(inCooldown(null, NOW)).toBe(false);
  });

  it("AND AN UNREADABLE DATE COUNTS AS INSIDE IT", () => {
    // The owner said no once. A timestamp this code cannot parse is not
    // permission to ask again.
    expect(inCooldown("not a date", NOW)).toBe(true);
    expect(inCooldown("", NOW)).toBe(false); // no rejection at all
  });

  it("stops a rejected finding being surfaced", () => {
    const r = surfaceable(finding({ rejectedAt: new Date(NOW.getTime() - 86_400_000).toISOString() }), {
      now: NOW,
      surfacedToday: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/rejected it less than 30 days ago/);
  });
});

describe("4. the cap", () => {
  it("IS THREE A DAY", () => {
    expect(MAX_ACTIONS_PER_DAY).toBe(3);
    expect(surfaceable(finding(), { now: NOW, surfacedToday: 2 }).ok).toBe(true);
    const full = surfaceable(finding(), { now: NOW, surfacedToday: 3 });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.why).toMatch(/which is the cap/);
  });

  it("AND A FULL DAY STILL REPORTS WHY A FINDING WAS UNFIT", () => {
    // The ordering inside surfaceable is load-bearing: fitness first,
    // the cap last. Otherwise a day whose cap is full reports every
    // finding as "no room" and the real reasons are never logged.
    //
    // MY FIRST VERSION OF THIS TEST PASSED surfacedToday: 0, so the cap
    // could not have fired whatever the order was — it asserted nothing
    // and the mutation that reversed the order survived it. The cap has
    // to be FULL for the ordering to be observable.
    const r = surfaceable(finding({ evidence: [] }), { now: NOW, surfacedToday: MAX_ACTIONS_PER_DAY });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/cites no evidence/);
    expect(r.why).not.toMatch(/cap/);
  });

  it("PICKS THE HIGHEST SCORES, and drops the rest to the skipped list with reasons", () => {
    const best = finding({ score: { impact: 5, confidence: 5, effort: 1 } });   // 25
    const mid = finding({ score: { impact: 4, confidence: 2, effort: 2 } });    // 4
    const low = finding({ score: { impact: 1, confidence: 1, effort: 5 } });    // 0.2
    const worst = finding({ score: { impact: 1, confidence: 1, effort: 4 } });  // 0.25
    const { picked, skipped } = pickForToday([low, worst, mid, best], { now: NOW });
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe(best);
    expect(picked[1]).toBe(mid);
    // The lowest-scoring fit finding is the one the cap drops, not
    // whichever happened to be passed first.
    expect(skipped).toHaveLength(1);
    expect(skipped[0].finding).toBe(low);
    expect(skipped[0].why).toMatch(/cap/);
  });

  it("counts what the day has already used", () => {
    const { picked } = pickForToday([finding(), finding(), finding()], { now: NOW, surfacedToday: 2 });
    expect(picked).toHaveLength(1);
  });

  it("and every skipped finding carries a reason", () => {
    const { picked, skipped } = pickForToday(
      [finding({ evidence: [] }), finding({ goalId: null }), finding({ score: null })],
      { now: NOW }
    );
    expect(picked).toEqual([]);
    expect(skipped).toHaveLength(3);
    for (const s of skipped) expect(s.why.length).toBeGreaterThan(10);
  });
});

describe("5. the migration says what this file says", () => {
  const sql = code("supabase/migrations/210_opportunity_scoring.sql");

  it("THE SCORE IS GENERATED, NOT WRITTEN", () => {
    // Two descriptions of one number is the fault this project has paid
    // for four times. Postgres computes it or there is no score.
    expect(sql).toMatch(/generated always as \(/);
    expect(sql).toMatch(/round\(\(impact::numeric \* confidence::numeric\) \/ effort::numeric, 3\)/);
    expect(sql).toMatch(/\) stored/);
  });

  it("THE INPUTS ARE ALL-OR-NOTHING, AND NEVER ZERO", () => {
    expect(sql).toMatch(/impact between 1 and 5/);
    expect(sql).toMatch(/effort between 1 and 5/);
    expect(sql).toMatch(/impact is null and confidence is null and effort is null/);
  });

  it("A REJECTION CANNOT EXIST WITHOUT ITS DATE", () => {
    expect(sql).toMatch(/check \(status <> 'rejected' or rejected_at is not null\)/);
  });

  it("AND THE UNIQUE INDEX COVERS A REJECTION, so the cooldown cannot be escaped", () => {
    // Without this a rejected finding is simply re-detected and
    // inserted fresh tomorrow.
    expect(sql).toMatch(/where status in \('open', 'rejected'\)/);
    expect(sql).toMatch(/drop index if exists idx_opportunities_open_unique/);
  });

  it("evidence is an array the renderer can count", () => {
    expect(sql).toMatch(/jsonb_typeof\(evidence\) = 'array'/);
  });
});

describe("6. Perceive respects a rejection", () => {
  const src = code("src/lib/agents/opportunityAgent.ts");

  it("READS OPEN AND REJECTED, not open alone", () => {
    expect(src).toMatch(/\.in\("status", \["open", "rejected"\]\)/);
    expect(src).toMatch(/!liveKeys\.has\(/);
  });

  it("BUT ONLY RESOLVES THE OPEN ONES", () => {
    // Completing a rejected finding would clear its cooldown, which is
    // the opposite of what the owner asked for by rejecting it.
    expect(src).toMatch(/live\.filter\(\(o: any\) => o\.status === "open"\)/);
  });

  it("AND NO LONGER DISCARDS THE INSERT'S ERROR", () => {
    // Perceive failing quietly reads as "nothing is wrong with this
    // business", which is the most expensive silence in the loop.
    expect(src).toMatch(/const \{ error: insertError \} = await supabase\.from\("opportunities"\)\.insert\(/);
    expect(src).toMatch(/if \(insertError\)/);
  });
});
