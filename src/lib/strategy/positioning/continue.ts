// Carrying a positioning run on from one invocation to the next — the same
// hand-over the daily automation run uses (api/autopilot/daily-run): call
// the worker route with the server's own CRON_SECRET and move on.

import { advancePositioning, STOPPED_MESSAGE } from "./run";

export const WORK_PATH = "/api/strategy/positioning/work";

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
  const { more } = await advancePositioning(service, id);
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
