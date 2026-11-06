// WHAT IS RUNNING ON ITS OWN, AND WHAT IT HAS DONE — S7/P6.
//
// A permission the owner cannot see is a permission he cannot withdraw,
// and "I told you in a notification three weeks ago" is not visibility.
// So this is the one read behind the card on /dashboard/autopilot: for
// each action that may ever run unattended — what level it is at, why
// it is not higher if it is not, how many times it has acted alone
// today against the cap, and what the second judge said about what it
// published.
//
// EVERY NUMBER IS A COUNT OF A ROW. Nothing here is estimated,
// averaged or forecast; the screen is a window on `action_levels`,
// `publish_actions` and `claim_checks`. A figure this product cannot
// trace is a figure it does not show — the rule the daily email has
// followed since S4.
//
// AND IT SAYS "NOT CHECKED YET" RATHER THAN "CLEAN". The monitor runs
// the morning after something is published, so today's rows have no
// verdict. Reading that as nothing-wrong would be the one confusion
// S7/P2 exists to prevent, on the screen instead of in the database.

import { L2_ALLOWLIST, L2_DAILY_CAP } from "@/lib/autonomy/policy";
import { canHoldL2, type AutonomyLevel } from "@/lib/autonomyLevels";
import { undoExistsFor } from "@/lib/autonomy/promotion";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

export type AutonomyRow = {
  actionKey: string;
  /** What the owner calls it. */
  label: string;
  level: AutonomyLevel;
  /** Why it is not running on its own, or null when it is. */
  why: string | null;
  /** Is there a question about this waiting on his Tasks page? */
  asked: boolean;
  /** Times it has acted with nobody watching today. */
  actedToday: number;
  /** And the most it may. */
  capPerDay: number;
  /** What it published while running alone, and what was said about it. */
  published: { checked: number; notCheckedYet: number; failed: number };
};

const LABELS: Record<string, string> = {
  update_page_meta: "Change a page's search title and description",
};

/** Midnight IST today, as an instant a Postgres timestamp compares to. */
export function startOfTodayIst(today = indiaToday()): string {
  return new Date(`${String(today).slice(0, 10)}T00:00:00+05:30`).toISOString();
}

/**
 * Count the unattended runs of one action today.
 *
 * AN ACTION WITH NO APPROVAL ROW IS ONE NOBODY WAS ASKED ABOUT.
 * `publish/create.ts` writes `status: 'approved'` with no
 * `approval_id` exactly when the level let it skip the question, so
 * that absence is the record of acting alone — there is no column
 * saying "this one was unattended", and inventing one would mean a
 * migration for a number this query already has.
 *
 * COUNTED FOR THE ACTION, not for the business. The cap is per business
 * per day, and with one allowlisted action those are the same number
 * today; when a second is allowlisted this needs the sum, which is why
 * `capRemaining` below takes the total rather than one row's count.
 */
export async function actedAloneToday(
  supabase: any,
  dealershipId: string,
  actionKey: string,
  today = indiaToday()
): Promise<number | null> {
  const { data, error } = await supabase
    .from("publish_actions")
    .select("id")
    .eq("dealership_id", dealershipId)
    .eq("action_key", actionKey)
    .is("approval_id", null)
    .gte("created_at", startOfTodayIst(today));
  if (error || !Array.isArray(data)) {
    // NULL, NOT ZERO. Zero reads as "there is room left today", which
    // is the direction that lets something run when nobody could check.
    console.error(`[autonomy] could not count today's unattended ${actionKey} for ${dealershipId}: ${error?.message ?? "no rows"}`);
    return null;
  }
  return data.length;
}

/**
 * How many unattended actions this business has left today.
 *
 * NULL MEANS NONE LEFT, because it means the count could not be read.
 * The founder's cap is a safety limit, and a limit that opens when the
 * database hiccups is not one.
 */
export async function capRemaining(
  supabase: any,
  dealershipId: string,
  today = indiaToday()
): Promise<number> {
  let used = 0;
  for (const key of L2_ALLOWLIST) {
    const n = await actedAloneToday(supabase, dealershipId, key, today);
    if (n === null) return 0;
    used += n;
  }
  return Math.max(0, L2_DAILY_CAP - used);
}

/** Everything the owner's card shows. One read per table. */
export async function autonomyOverview(
  supabase: any,
  dealershipId: string,
  today = indiaToday()
): Promise<{ rows: AutonomyRow[]; capPerDay: number; remainingToday: number }> {
  const { readStoredLevel } = await import("@/lib/autonomyLevelsStore");

  const { data: askedRows } = await supabase
    .from("pending_approvals")
    .select("action_details")
    .eq("dealership_id", dealershipId)
    .eq("action_type", "grant_autonomy")
    .eq("status", "pending");
  const askedKeys = new Set(
    (Array.isArray(askedRows) ? askedRows : []).map((r: any) => String(r?.action_details?.action_key ?? ""))
  );

  const rows: AutonomyRow[] = [];
  for (const actionKey of L2_ALLOWLIST) {
    const stored = (await readStoredLevel(supabase, dealershipId, actionKey)) ?? "L0";
    const eligible = canHoldL2(actionKey, { hasUndo: await undoExistsFor(supabase, actionKey) });
    const actedToday = await actedAloneToday(supabase, dealershipId, actionKey, today);

    // WHAT THE SECOND JUDGE SAID. Only rows that actually went out, and
    // only for the surfaces this action writes to — a verdict about
    // somebody's email is not news about a page's search listing.
    const { surfaceFor } = await import("@/lib/claims/claimChecks");
    const surface = surfaceFor(actionKey);
    const { data: checks } = surface
      ? await supabase
          .from("claim_checks")
          .select("monitor_verdict")
          .eq("dealership_id", dealershipId)
          .eq("surface", surface)
          .eq("published", true)
      : { data: [] as any[] };
    const verdicts = (Array.isArray(checks) ? checks : []).map((c: any) => String(c?.monitor_verdict ?? ""));

    rows.push({
      actionKey,
      label: LABELS[actionKey] ?? actionKey.replace(/_/g, " "),
      level: stored,
      // AT L2 THERE IS NOTHING TO EXPLAIN. Below it, the reason is the
      // one the rule gives — never a letter, and never "see settings".
      why: stored === "L2" ? null : eligible.ok ? "I am still asking you each time, because you have not said I can do this on my own yet." : eligible.why,
      asked: askedKeys.has(actionKey),
      actedToday: actedToday ?? 0,
      capPerDay: L2_DAILY_CAP,
      published: {
        checked: verdicts.filter((v) => v === "clean").length,
        // NOT "CLEAN". The monitor runs the morning after, so today's
        // rows have no verdict — and reading that as nothing-wrong is
        // the confusion S7/P2 exists to prevent.
        notCheckedYet: verdicts.filter((v) => v === "" || v === "could_not_check").length,
        failed: verdicts.filter((v) => v === "unsupported").length,
      },
    });
  }

  return { rows, capPerDay: L2_DAILY_CAP, remainingToday: await capRemaining(supabase, dealershipId, today) };
}
