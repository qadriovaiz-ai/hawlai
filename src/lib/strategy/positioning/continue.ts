// Carrying a positioning run through its steps — with NO request from the
// server to itself.
//
// WHY (2026-09-20, third failure on this chain): each step used to hand
// over to the next by calling our own worker route. Vercel counts a
// deployment calling itself in a chain and cuts it off with 508 "Loop
// Detected" after a few hops (reported at about 4); a 5-competitor run is
// 7 steps, so every full run was bound to hit it. Production logged it:
// "step took 1.9s" then "the next step answered 508".
//
// NOW:
//   - one invocation (maxDuration 300) takes steps one after another until
//     the run is done or it has used RUN_FOR_MS — normally the whole run,
//     since every step's calls are time-boxed (collect.ts, analysis.ts);
//   - if it stops early, or the invocation dies, the page's own polling —
//     a fresh request from the browser each time, never a chain — carries
//     the run on from its step (pickUp, called by GET).
// Nothing here calls our own deployment, so there's nothing to loop.

import { advancePositioning, STOPPED_MESSAGE, STALE_AFTER_MS } from "./run";

/** Stop starting new steps after this long, so the step under way (≤ ~110s) ends inside the invocation's 300s. */
export const RUN_FOR_MS = 170_000;
/** Mutable for tests only. */
export const runTiming = { runForMs: RUN_FOR_MS };

/** A run nobody is stepping, idle this long, is carried on by the page's next look. */
export const CONTINUE_AFTER_MS = 5_000;
/** A step claimed but silent this long died with its invocation; it is run again at most this many times a run. */
export const MAX_RESUMES = 2;

/** Hard stop on steps per invocation — a run has at most 5 competitors + 3 steps. */
const MAX_STEPS_PER_INVOCATION = 12;

/** Steps the run, one after another, inside this invocation. */
export async function driveRun(service: any, id: string, clock: () => number = Date.now): Promise<void> {
  const started = clock();
  for (let i = 0; i < MAX_STEPS_PER_INVOCATION; i++) {
    const stepStarted = clock();
    const { more } = await advancePositioning(service, id);
    // In Vercel's logs: how long each step really takes.
    console.log(`[positioning] run ${id}: step took ${((clock() - stepStarted) / 1000).toFixed(1)}s`);
    if (!more) return;
    if (clock() - started >= runTiming.runForMs) {
      console.log(`[positioning] run ${id}: pausing after ${((clock() - started) / 1000).toFixed(0)}s — the page carries it on`);
      return;
    }
  }
}

/** What the page's look should do about a running run. */
export function needsPickUp(row: any, now: number = Date.now()): "continue" | "resume" | null {
  if (row?.status !== "running" || !row.updated_at) return null;
  const idle = now - Date.parse(row.updated_at);
  if (row.step_running) return idle > STALE_AFTER_MS ? "resume" : null;
  return idle > CONTINUE_AFTER_MS ? "continue" : null;
}

/**
 * The page's look at a running run: "picked" (the caller runs driveRun in
 * after()), "stopped" (a step died too often — recorded as stopped), or
 * null (it's moving, or another look just picked it up).
 *
 *   continue — no step claimed and nothing for 5s: an invocation stopped
 *              at its time budget, or never started. Normal; not counted.
 *   resume   — a step claimed and silent past STALE_AFTER_MS: its
 *              invocation died. Counted; after MAX_RESUMES it stops.
 */
export async function pickUp(service: any, row: any, now: number = Date.now()): Promise<"picked" | "stopped" | null> {
  const kind = needsPickUp(row, now);
  if (!kind) return null;
  const analysis = row.analysis ?? {};
  const resumes = Number(analysis.resumes ?? 0);
  if (kind === "resume" && resumes >= MAX_RESUMES) {
    await service
      .from("competitor_positioning")
      .update({ status: "failed", error: STOPPED_MESSAGE, step_running: false, updated_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .eq("dealership_id", row.dealership_id)
      .eq("status", "running");
    return "stopped";
  }
  // Only the look that sees this exact state picks it up — two open tabs
  // don't start two invocations.
  const { data } = await service
    .from("competitor_positioning")
    .update({
      step_running: false,
      updated_at: new Date(now).toISOString(),
      ...(kind === "resume" ? { analysis: { ...analysis, resumes: resumes + 1 } } : {}),
    })
    .eq("id", row.id)
    .eq("dealership_id", row.dealership_id)
    .eq("status", "running")
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (!data) return null;
  if (kind === "resume") console.warn(`[positioning] run ${row.id}: step ${row.step} died with its invocation — running it again (${resumes + 1} of ${MAX_RESUMES})`);
  return "picked";
}
