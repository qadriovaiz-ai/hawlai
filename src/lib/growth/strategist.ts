// THE STRATEGIST — S4/P3.
//
// P0 wrote the rules; this is the only place that reads and writes the
// table they apply to. The split is deliberate and is the same one that
// made autonomyLevels testable in S3: findings.ts has no I/O, so every
// rule in it is checked without a database, and everything here is
// about rows.
//
// WHAT IT DOES, in order:
//
//   1. records what the audit found, without duplicating a finding that
//      is already live
//   2. links each finding to a goal it serves, where one exists
//   3. picks at most three for today, highest score first, skipping
//      anything in its cooldown or depending on measurement that is
//      not verified
//   4. marks only the picked ones as surfaced
//
// IT WRITES NOTHING CUSTOMER-FACING. §2b: "manager never writes
// customer copy itself". The only table it WRITES is `opportunities`;
// it reads `goals` to find the goal a finding serves, and S4/P6 put the
// writing of draft goals in goalDrafts.ts rather than here.
//
// AND IT IS IDEMPOTENT FOR THE DAY. The cap counts rows already marked
// with today's date, so a second run of the daily job surfaces nothing
// new rather than another three. The dispatcher in dailyJobs.ts
// genuinely re-enters a run whose invocation ran out of time, so this
// is a real case and not a defensive one.

import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import type { AuditFinding } from "@/lib/growth/audit";
import { pickForToday, type Finding } from "@/lib/growth/findings";
import { findingTypesWithGoals, goalTitleForFindingType } from "@/lib/growth/strategy";
import { conversionClaimsAllowed, type TrackingState } from "@/lib/growth/tracking";

/**
 * Finding types whose suggestion would rest on conversion data.
 *
 * §2c: "no ROI claim, target or ad suggestion depends on conversions
 * until verified". None of S4's own audit findings do — they are about
 * the site, the catalogue and the copy, all of which are true whether
 * anything converts or not. The set exists because opportunityAgent's
 * own detectCandidates already produces ad-shaped findings, and the day
 * one of those is scored it must not reach the owner on unverified
 * measurement.
 *
 * LISTED RATHER THAN INFERRED, because guessing from a type name is how
 * a rule like this quietly stops applying.
 */
const NEEDS_VERIFIED_CONVERSIONS = new Set<string>([
  "ad_spend_no_return",
  "ad_budget_underused",
  "campaign_underperforming",
]);

export type StrategistRow = {
  id: string;
  type: string;
  reference_id: string;
  title: string;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  evidence: unknown;
  goal_id: string | null;
  rejected_at: string | null;
  last_surfaced_on: string | null;
  status: string;
};

export type StrategistResult = {
  /** What the owner is shown today, highest score first. */
  picked: StrategistRow[];
  /** Everything else, with the reason it is not being shown. */
  skipped: { row: StrategistRow; why: string }[];
  /** How many were already marked for today before this run. */
  alreadySurfaced: number;
  today: string;
};

/** A table row as findings.ts wants to see it. */
function asFinding(row: StrategistRow): Finding {
  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  return {
    score:
      row.impact === null || row.confidence === null || row.effort === null
        ? null
        : { impact: Number(row.impact), confidence: Number(row.confidence), effort: Number(row.effort) },
    evidence: evidence.map((e: any) => ({ kind: String(e?.kind ?? ""), id: String(e?.id ?? "") })),
    goalId: row.goal_id,
    rejectedAt: row.rejected_at,
  };
}

/**
 * Write what the audit found, without duplicating anything live.
 *
 * MATCHES THE LIVE UNIQUE INDEX FROM MIGRATION 210, which covers
 * status in ('open','rejected'). Inserting a candidate whose rejected
 * row still exists would now fail the index rather than escape the
 * cooldown — correct, but a failed insert is not the behaviour we want,
 * so the existing row is updated instead and its rejection left alone.
 */
export async function recordFindings(
  supabase: any,
  dealershipId: string,
  findings: AuditFinding[]
): Promise<{ inserted: number; updated: number; failed: number }> {
  if (!findings.length) return { inserted: 0, updated: 0, failed: 0 };

  const { data: liveRows, error: readError } = await supabase
    .from("opportunities")
    .select("id, type, reference_id, status")
    .eq("dealership_id", dealershipId)
    .in("status", ["open", "rejected"]);
  // A FAILED READ IS NOT AN EMPTY TABLE. Treating it as one would
  // insert duplicates of everything already live.
  if (readError) return { inserted: 0, updated: 0, failed: findings.length };

  const live = new Map((liveRows ?? []).map((r: any) => [`${r.type}:${r.reference_id}`, r]));
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const finding of findings) {
    const key = `${finding.type}:${finding.reference}`;
    const existing = live.get(key) as any;
    const payload = {
      title: finding.title,
      description: finding.detail,
      impact: finding.score.impact,
      confidence: finding.score.confidence,
      effort: finding.score.effort,
      evidence: finding.evidence,
    };

    if (existing) {
      // The wording and the count may have changed since yesterday; the
      // rejection and its date must not be touched.
      const { error } = await supabase.from("opportunities").update(payload).eq("id", existing.id);
      if (error) failed += 1;
      else updated += 1;
      continue;
    }

    const { error } = await supabase.from("opportunities").insert({
      dealership_id: dealershipId,
      type: finding.type,
      reference_id: finding.reference,
      status: "open",
      ...payload,
    });
    if (error) failed += 1;
    else inserted += 1;
  }

  return { inserted, updated, failed };
}

/**
 * Link findings to the goals they serve.
 *
 * DRIVEN BY THE GOALS ON RECORD, NOT BY TODAY'S FINDINGS — 3 November
 * 2026. This used to take a type-to-title map built from the findings
 * of the run it was in, so a finding type not re-detected today could
 * never be linked, however long its row had been sitting there with a
 * matching active goal. M9's copy findings are exactly that case: the
 * paid pass runs on one named day, so the founder confirmed a goal for
 * "wording your records do not support" and it would have stayed
 * unlinked until the next paid run — which costs money.
 *
 * The audit's own findings hid the problem, because they are
 * re-detected every morning and so re-linked every morning.
 *
 * BY source_key FIRST, TITLE SECOND — S4/P6, migration 211. A renamed
 * goal would otherwise silently unlink its findings, and renaming your
 * own goal is a normal thing to do. The title fallback is not dead
 * code: every goal written before 211, and every goal the owner writes
 * through set_goal, has source_key null, and its title is the only
 * thing that can place it. Those titles come from GOAL_FOR, which is
 * where they came from before.
 *
 * Nothing is invented: a finding whose goal does not exist keeps
 * goal_id null and is simply not surfaced, which is what `surfaceable`
 * already decides.
 */
export async function linkFindingsToGoals(
  supabase: any,
  dealershipId: string
): Promise<{ linked: number }> {
  const { data: goals, error } = await supabase
    .from("goals")
    .select("id, title, source_key, status")
    .eq("dealership_id", dealershipId)
    .eq("status", "active");
  // A MISSING COLUMN READS EXACTLY LIKE AN EMPTY TABLE HERE, and the
  // consequence — no finding has a goal, so the report surfaces
  // nothing — is silent. Repo migrations drift from production, so it
  // is said out loud.
  if (error) {
    console.error(
      `[strategist] could not read goals for ${dealershipId}, so nothing was linked: ${error.message}. If migration 211 has not been run, goals.source_key does not exist yet.`
    );
    return { linked: 0 };
  }
  if (!Array.isArray(goals) || !goals.length) return { linked: 0 };

  // WHICH FINDING TYPE EACH ACTIVE GOAL SERVES. source_key says it
  // outright; a goal without one is placed by its title, against the
  // titles this product gives goals (GOAL_FOR).
  const typeByTitle = new Map<string, string>();
  for (const type of findingTypesWithGoals()) {
    const title = goalTitleForFindingType(type);
    if (title) typeByTitle.set(title.trim(), type);
  }

  // TWO PASSES, AND source_key GOES FIRST. One pass in row order let a
  // goal matched only by TITLE claim a type before the goal that names
  // that type outright — which is the whole point of migration 211
  // undone. Caught by the test that was written for it.
  //
  // Within a pass the first one wins, so two goals claiming one finding
  // type cannot make "which goal does this serve" a question nobody can
  // answer. 211's unique index stops that for drafted goals; a
  // hand-written goal could still collide.
  const goalIdByType = new Map<string, string>();
  for (const g of goals as any[]) {
    const type = g.source_key ? String(g.source_key) : null;
    if (type && !goalIdByType.has(type)) goalIdByType.set(type, String(g.id));
  }
  for (const g of goals as any[]) {
    if (g.source_key) continue;
    const type = typeByTitle.get(String(g.title).trim());
    if (type && !goalIdByType.has(type)) goalIdByType.set(type, String(g.id));
  }
  if (!goalIdByType.size) return { linked: 0 };

  let linked = 0;
  for (const [type, goalId] of goalIdByType.entries()) {
    const { error: updateError } = await supabase
      .from("opportunities")
      .update({ goal_id: goalId })
      .eq("dealership_id", dealershipId)
      .eq("type", type)
      .eq("status", "open")
      .is("goal_id", null);
    if (!updateError) linked += 1;
  }
  return { linked };
}

/**
 * Today's at most three, and the reason for every one left out.
 *
 * MARKS ONLY WHAT IT PICKED. A finding that was considered and skipped
 * keeps its previous `last_surfaced_on`, so tomorrow's cap is not spent
 * on yesterday's decisions.
 */
export async function pickToday(
  supabase: any,
  dealershipId: string,
  tracking: TrackingState,
  now: Date = new Date()
): Promise<StrategistResult> {
  const today = indiaToday(now);

  const { data: rows, error } = await supabase
    .from("opportunities")
    .select("id, type, reference_id, title, impact, confidence, effort, evidence, goal_id, rejected_at, last_surfaced_on, status")
    .eq("dealership_id", dealershipId)
    .eq("status", "open");
  if (error || !Array.isArray(rows)) return { picked: [], skipped: [], alreadySurfaced: 0, today };

  const all = rows as StrategistRow[];
  const alreadySurfaced = all.filter((r) => r.last_surfaced_on === today).length;

  // §2c, applied before anything is ranked: a suggestion resting on
  // conversion data cannot be made while the measurement behind it is
  // unverified.
  const conversionsOk = conversionClaimsAllowed(tracking);
  const blocked: { row: StrategistRow; why: string }[] = [];
  const eligible: StrategistRow[] = [];
  for (const row of all) {
    if (row.last_surfaced_on === today) continue; // already in today's report
    if (!conversionsOk && NEEDS_VERIFIED_CONVERSIONS.has(row.type)) {
      blocked.push({ row, why: `it depends on conversion data, and ${tracking.adsConversions.why}` });
      continue;
    }
    eligible.push(row);
  }

  const { picked, skipped } = pickForToday(
    eligible.map((row) => ({ ...asFinding(row), row })),
    { now, surfacedToday: alreadySurfaced }
  );

  // PICKING IS NOT SHOWING — R2a, 12 November 2026.
  //
  // This function used to WRITE last_surfaced_on for everything it
  // picked, and buildGrowthReport then un-marked whatever the digit
  // walk had dropped. That compensating pair worked only while a report
  // was built every single day. The founder's decision is that reports
  // are on-demand, so the daily work would have gone on marking
  // findings as surfaced on days nothing was surfaced — the record
  // saying the owner had seen what he never saw, which is exactly the
  // 3 November fault the un-marking was added to fix.
  //
  // So the one writer is now `markSurfaced`, called by the report with
  // what it actually printed. The un-marking is gone, because there is
  // nothing to undo.
  //
  // THE SKIP ABOVE STILL READS THE MARK, which is what keeps a second
  // report on the same day from repeating the first one.
  const pickedRows = picked.map((p: any) => p.row as StrategistRow);
  return {
    picked: pickedRows,
    skipped: [...blocked, ...skipped.map((s: any) => ({ row: s.finding.row as StrategistRow, why: s.why }))],
    alreadySurfaced,
    today,
  };
}


/**
 * Record that these findings were SHOWN to the owner.
 *
 * THE ONE WRITER of last_surfaced_on, and it is called by the report
 * rather than the picker (R2a). A finding is surfaced when it appears
 * in front of the owner, not when something considered putting it
 * there.
 *
 * A FAILED MARK MEANS SHOWING THEM AGAIN IN THE NEXT REPORT, on top of
 * that report's own three. Reported rather than swallowed — the same
 * reasoning the inline version carried.
 */
export async function markSurfaced(
  supabase: any,
  ids: string[],
  day: string
): Promise<{ marked: number; why: string | null }> {
  if (!ids.length) return { marked: 0, why: null };
  const { error } = await supabase
    .from("opportunities")
    .update({ last_surfaced_on: day })
    .in("id", ids);
  if (error) {
    console.error(`[strategist] could not mark ${ids.length} findings as surfaced: ${error.message}`);
    return { marked: 0, why: error.message };
  }
  return { marked: ids.length, why: null };
}
