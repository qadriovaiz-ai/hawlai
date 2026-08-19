// Wraps one daily-cron subsystem call with timing + a uniform
// automation_run_log write — the one generic per-run observability
// layer for all 13 daily cron subsystems (migration 126, P0 12c).
// Doesn't replace the 3 subsystems that already have their own finer-
// grained per-item logs (content_autopilot_log, auto_reply_log,
// email_automation_log) — this is a coarser per-run summary layered
// alongside them, not instead of them.
//
// Returns { error } on failure rather than re-throwing, matching the
// exact shape the daily-cron route's per-subsystem try/catch blocks
// already returned — this is a drop-in replacement for that pattern,
// not a behavior change to the route's response shape.

export async function runAndLog<T>(
  supabase: any,
  dealershipId: string,
  subsystem: string,
  fn: () => Promise<T>
): Promise<T | { error: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    await logRun(supabase, dealershipId, subsystem, true, JSON.stringify(result ?? null).slice(0, 500), Date.now() - start);
    return result;
  } catch (err: any) {
    await logRun(supabase, dealershipId, subsystem, false, err.message, Date.now() - start);
    return { error: err.message };
  }
}

async function logRun(supabase: any, dealershipId: string, subsystem: string, success: boolean, detail: string, durationMs: number) {
  try {
    await supabase.from("automation_run_log").insert({ dealership_id: dealershipId, subsystem, success, detail, duration_ms: durationMs });
  } catch {
    // Best-effort, same principle as emitNotification elsewhere in
    // this codebase — a logging failure must never mask the actual
    // subsystem's real success/failure, already captured above.
  }
}
