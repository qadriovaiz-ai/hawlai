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
// customer copy itself". The only table it touches is `opportunities`.
//
// AND IT IS IDEMPOTENT FOR THE DAY. The cap counts rows already marked
// with today's date, so a second run of the daily job surfaces nothing
// new rather than another three. The dispatcher in dailyJobs.ts
// genuinely re-enters a run whose invocation ran out of time, so this
// is a real case and not a defensive one.

import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import type { AuditFinding } from "@/lib/growth/audit";
import { pickForToday, type Finding } from "@/lib/growth/findings";
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
 * Link findings to the goals they serve, by the goal's own title.
 *
 * BY TITLE, AND THAT IS A STATED WEAKNESS rather than a hidden one.
 * `goals` (migration 131) has no stable key, and `setupGoalsFrom`
 * produces a title per finding type, so an exact title match is what
 * the schema allows today. A renamed goal silently unlinks its
 * findings, which shows up as the finding no longer being surfaced —
 * visible, and safe in the direction that matters.
 *
 * Nothing is invented: a finding whose goal does not exist keeps
 * goal_id null and is simply not surfaced, which is what `surfaceable`
 * already decides.
 */
export async function linkFindingsToGoals(
  supabase: any,
  dealershipId: string,
  titleByFindingType: Map<string, string>
): Promise<{ linked: number }> {
  if (!titleByFindingType.size) return { linked: 0 };

  const { data: goals, error } = await supabase
    .from("goals")
    .select("id, title, status")
    .eq("dealership_id", dealershipId)
    .eq("status", "active");
  if (error || !Array.isArray(goals) || !goals.length) return { linked: 0 };

  const idByTitle = new Map(goals.map((g: any) => [String(g.title).trim(), String(g.id)]));
  let linked = 0;

  for (const [type, title] of titleByFindingType.entries()) {
    const goalId = idByTitle.get(String(title).trim());
    if (!goalId) continue;
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

  const pickedRows = picked.map((p: any) => p.row as StrategistRow);
  if (pickedRows.length) {
    const { error: markError } = await supabase
      .from("opportunities")
      .update({ last_surfaced_on: today })
      .in("id", pickedRows.map((r) => r.id));
    // A FAILED MARK WOULD MEAN SHOWING THEM AGAIN TOMORROW ON TOP OF
    // TOMORROW'S THREE. Reported rather than swallowed; the report
    // still goes, because the suggestions themselves are sound.
    if (markError) console.error(`[strategist] could not mark surfaced for ${dealershipId}: ${markError.message}`);
  }

  return {
    picked: pickedRows,
    skipped: [...blocked, ...skipped.map((s: any) => ({ row: s.finding.row as StrategistRow, why: s.why }))],
    alreadySurfaced,
    today,
  };
}
