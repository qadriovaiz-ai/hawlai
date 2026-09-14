// Health for automations that SEND something — judged by what was sent
// and what happened to it, never by whether the daily job ran.
//
// THE LIVE CASE (2026-09-15): "Welcome & Follow-up Emails · 100% success
// (7d)". Every one of those runs had returned { skipped: "automation off" }
// and not one email had ever been sent — automation_run_log records a run
// as a success whenever it doesn't crash. Social auto-posting had shown the
// same hollow 100% (fixed earlier, settings route); Custom Workflows had it
// too.
//
// Here: the rate is sends that went out and weren't bounced, flagged as
// spam, failed or suppressed, over sends attempted — null when nothing
// was attempted, because "nothing happened" is not a success rate. A run
// that skipped says why, and "off" is not shown as healthy.

export type SendAttempt = { success: boolean; error: string | null; at: string; messageId?: string | null };
export type RunRow = { created_at: string; success: boolean; detail: string | null } | null;
export type HealthState = "ok" | "failing" | "paused" | "off" | "idle";

export type SendHealth = {
  subsystem: string;
  kind: "sends";
  unit: "emails" | "steps";
  state: HealthState;
  /** What the owner should know or do, when it isn't simply working. */
  note: string | null;
  attempted: number;
  succeeded: number;
  delivered: number;
  problems: number;
  successRatePct: number | null;
  lastRunAt: string | null;
  lastSuccess: boolean | null;
  lastError: string | null;
  lastCronRunAt: string | null;
};

const PROBLEM_STATUSES = new Set(["bounced", "complained", "failed", "suppressed"]);

const SKIPS: Record<string, { state: HealthState; note: string }> = {
  "automation off": { state: "off", note: "Off — welcome and follow-up emails aren't switched on" },
  "no enabled workflows": { state: "off", note: "Off — no workflow is switched on" },
  "business address missing": { state: "paused", note: "Paused — add your business address in Settings → Brand Voice" },
  "business facts unreadable": { state: "paused", note: "Paused — your store details couldn't be read on the last run" },
  "gmail not connected": { state: "paused", note: "Paused — workflow emails need Gmail connected in Settings" },
};

/** The reason a run skipped, from its logged result summary. */
export function skipReason(detail: string | null | undefined): string | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail);
    return typeof parsed?.skipped === "string" ? parsed.skipped : typeof parsed?.waiting === "string" ? parsed.waiting : null;
  } catch {
    // detail is truncated at 500 characters; a cut-off summary still names its skip reason near the start.
    const m = /"(?:skipped|waiting)":"([^"]+)"/.exec(detail);
    return m ? m[1] : null;
  }
}

export function buildSendHealth(opts: {
  subsystem: string;
  unit: "emails" | "steps";
  /** Newest first. */
  attempts: SendAttempt[];
  /** Resend delivery status per message id (email_sends.delivery_status). */
  deliveryStatus: Record<string, string | null | undefined>;
  /** The subsystem's most recent daily run. */
  lastRun: RunRow;
}): SendHealth {
  const { attempts, deliveryStatus, lastRun } = opts;
  const attempted = attempts.length;
  const succeeded = attempts.filter((a) => a.success).length;
  const statusOf = (a: SendAttempt) => (a.messageId ? deliveryStatus[a.messageId] ?? null : null);
  const delivered = attempts.filter((a) => a.success && statusOf(a) === "delivered").length;
  const problemAttempts = attempts.filter((a) => a.success && PROBLEM_STATUSES.has(String(statusOf(a))));
  const problems = problemAttempts.length;
  const latest = attempts[0] ?? null;
  const latestFailed = latest ? !latest.success || PROBLEM_STATUSES.has(String(statusOf(latest))) : false;
  const lastFailure = attempts.find((a) => !a.success || PROBLEM_STATUSES.has(String(statusOf(a))));
  const lastError = lastFailure ? lastFailure.error ?? `email ${statusOf(lastFailure)}` : null;

  let state: HealthState;
  let note: string | null = null;
  const skip = skipReason(lastRun?.detail);
  if (lastRun && !lastRun.success) {
    state = "failing";
    note = `The last run failed${lastRun.detail ? `: ${lastRun.detail.slice(0, 160)}` : ""}`;
  } else if (skip && SKIPS[skip]) {
    ({ state, note } = SKIPS[skip]);
  } else if (attempted === 0) {
    state = "idle";
    note = `Nothing sent in the last 7 days`;
  } else {
    state = latestFailed ? "failing" : "ok";
  }

  return {
    subsystem: opts.subsystem,
    kind: "sends",
    unit: opts.unit,
    state,
    note,
    attempted,
    succeeded,
    delivered,
    problems,
    successRatePct: attempted ? Math.round(((succeeded - problems) / attempted) * 100) : null,
    lastRunAt: latest?.at ?? lastRun?.created_at ?? null,
    lastSuccess: state === "ok" ? true : state === "failing" ? false : null,
    lastError,
    lastCronRunAt: lastRun?.created_at ?? null,
  };
}
