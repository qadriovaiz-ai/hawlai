// Carrying a positioning run on from one invocation to the next — the same
// hand-over the daily automation run uses (api/autopilot/daily-run): call
// the worker route with the server's own CRON_SECRET and move on.

import { advancePositioning, STOPPED_MESSAGE, STALE_AFTER_MS } from "./run";

export const WORK_PATH = "/api/strategy/positioning/work";

// A RUN THAT STOPS MOVING IS PICKED UP AGAIN (2026-09-20). A run stalled at
// "Reading … (1 of 5)" in production: the hand-over was accepted, then
// the invocation carrying the run ended without finishing — a model call
// with no time limit outlived its 60-second invocation. Calls are now
// time-boxed and invocations get 300s, but a lost invocation must never
// again mean a lost run: the page asks for progress every few seconds,
// and when the run hasn't moved it is carried on from its step.
//   - hand-over lost: no step claimed and nothing for 30s (a hand-over
//     starts its step within seconds);
//   - step died: claimed and nothing for STALE_AFTER_MS (every step's
//     calls are limited to well under that).
// At most MAX_RESUMES times a run, so a step that keeps dying can't keep
// spending; after that it stops, as before.
export const HANDOVER_LOST_AFTER_MS = 30_000;
export const MAX_RESUMES = 2;

/** Whether a running run has stopped moving. */
export function stalled(row: any, now: number = Date.now()): boolean {
  if (row?.status !== "running" || !row.updated_at) return false;
  const idle = now - Date.parse(row.updated_at);
  return row.step_running ? idle > STALE_AFTER_MS : idle > HANDOVER_LOST_AFTER_MS;
}

/**
 * Picks a stalled run up again: "resumed" (the caller carries it on with
 * driveRun), "stopped" (resumed too often — recorded as stopped), or null
 * (not stalled, or someone else just picked it up).
 */
export async function resumeStalled(service: any, row: any, now: number = Date.now()): Promise<"resumed" | "stopped" | null> {
  if (!stalled(row, now)) return null;
  const analysis = row.analysis ?? {};
  const resumes = Number(analysis.resumes ?? 0);
  if (resumes >= MAX_RESUMES) {
    await service
      .from("competitor_positioning")
      .update({ status: "failed", error: STOPPED_MESSAGE, step_running: false, updated_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .eq("dealership_id", row.dealership_id)
      .eq("status", "running");
    return "stopped";
  }
  // Only the look that sees this exact state picks it up — two open tabs
  // don't start two copies of the step.
  const { data } = await service
    .from("competitor_positioning")
    .update({ step_running: false, updated_at: new Date(now).toISOString(), analysis: { ...analysis, resumes: resumes + 1 } })
    .eq("id", row.id)
    .eq("dealership_id", row.dealership_id)
    .eq("status", "running")
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (!data) return null;
  console.warn(`[positioning] run ${row.id} stalled at step ${row.step} (${row.step_running ? "step died" : "hand-over lost"}) — picking it up again (${resumes + 1} of ${MAX_RESUMES})`);
  return "resumed";
}

/** Asks a fresh invocation to take the run's next step. Throws when it doesn't accept. */
export async function handOver(origin: string, id: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const res = await fetch(new URL(WORK_PATH, origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 202) throw new Error(`the next step answered ${res.status}`);
}

/** One step here, then the rest elsewhere. A failed hand-over stops the run visibly. */
export async function driveRun(service: any, origin: string, id: string): Promise<void> {
  const started = Date.now();
  const { more } = await advancePositioning(service, id);
  // In Vercel's logs: how long each step really takes, against the invocation's limit.
  console.log(`[positioning] run ${id}: step took ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!more) return;
  try {
    await handOver(origin, id);
  } catch (err: any) {
    console.error(`[positioning] hand-over for run ${id} failed:`, err?.message);
    await service
      .from("competitor_positioning")
      .update({ status: "failed", error: STOPPED_MESSAGE, step_running: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "running");
  }
}

/** The worker route's check: only the server itself (or Vercel Cron's secret) may carry a run on. */
export function workerAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[positioning] CRON_SECRET is not set — the run worker is unprotected.");
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
