// The daily job list — every automation for every business gets its turn,
// however many businesses there are.
//
// THE LIVE CASE (2026-09-15): the heavy cron invocation (60 seconds on
// Vercel Hobby) ran everything for every business in one go. candle_by_qaaf
// had one welcome-email run on record in six days: the invocation was
// killed before reaching it, and a killed invocation writes nothing.
//
// How it works now:
//  1. The cron invocation writes today's list: one job per business per
//     automation, in the group's priority order (sends first).
//  2. It takes jobs ONE AT A TIME with a conditional claim (pending →
//     running only if still pending with the same attempt count), so two
//     invocations can never run the same job.
//  3. It stops taking new jobs after BUDGET_MS of its 300 seconds, so the
//     job under way still finishes.
//  4. What's left is carried on by the 2-minute event dispatcher (pg_cron →
//     /api/events/dispatch → this route, dailyRunStalled): as soon as jobs
//     are waiting and none is running, it starts an invocation.
//  5. A job left "running" by a killed invocation is put back after
//     STUCK_MINUTES; after MAX_ATTEMPTS it's failed with the reason.
//  6. Yesterday's unfinished jobs are marked failed when today's list is
//     written, instead of lingering.
//
// NO INVOCATION CALLS THIS ROUTE ITSELF (2026-09-20). It used to hand over
// to a fresh invocation of itself before its second job, so a day's run
// was a chain of self-calls — and Vercel cuts a deployment calling itself
// off with 508 "Loop Detected" after a few hops (it stopped competitor
// positioning in production the same way). The dispatcher is called from
// outside by pg_cron, so its one call here is never part of a chain.
//
// Limit, stated plainly: a single automation that needs more than about
// two minutes for one business can't finish here either — it fails on its
// own, visibly, instead of silently taking every later business with it.

import { runAndLog } from "@/lib/automation/runAndLog";
import { GROUPS, type SubsystemKey } from "@/lib/automation/cronGroups";

/** Stop taking new jobs after this long — the job under way then has the rest of the invocation's 300s. */
export const BUDGET_MS = 180_000;
export const STUCK_MINUTES = 10;
export const MAX_ATTEMPTS = 3;

export type DailyGroup = "signals" | "heavy";
export type DailyJob = { id: string; dealership_id: string; subsystem: SubsystemKey; attempts: number; status: string };

type Runner = (supabase: any, dealershipId: string, category: string) => Promise<unknown>;

/** Writes today's list for a group (idempotent), and closes yesterday's unfinished jobs. */
export async function planDailyJobs(service: any, group: DailyGroup, runDate: string): Promise<{ planned: number } | { error: string }> {
  const { error: closeError } = await service
    .from("daily_jobs")
    .update({ status: "failed", error: "not reached before the next day's run", finished_at: new Date().toISOString() })
    .eq("run_group", group)
    .lt("run_date", runDate)
    .in("status", ["pending", "running"]);
  if (closeError) return { error: `couldn't close earlier runs: ${closeError.message}` };

  const { data: dealerships, error } = await service.from("dealerships").select("id").order("created_at", { ascending: true });
  if (error) return { error: `couldn't list businesses: ${error.message}` };

  const rows = GROUPS[group].flatMap((subsystem, s) =>
    (dealerships ?? []).map((d: any, i: number) => ({ run_date: runDate, run_group: group, dealership_id: d.id, subsystem, position: s * 100_000 + i }))
  );
  if (rows.length === 0) return { planned: 0 };
  const { error: insertError } = await service.from("daily_jobs").upsert(rows, { onConflict: "run_date,dealership_id,subsystem", ignoreDuplicates: true });
  if (insertError) return { error: `couldn't write today's jobs: ${insertError.message}` };
  return { planned: rows.length };
}

/** Puts back jobs whose invocation was killed; fails them after MAX_ATTEMPTS. */
export async function requeueStuckJobs(service: any, group: DailyGroup, runDate: string, now = Date.now()): Promise<void> {
  const cutoff = new Date(now - STUCK_MINUTES * 60_000).toISOString();
  const { data: stuck } = await service
    .from("daily_jobs")
    .select("id, attempts")
    .eq("run_date", runDate)
    .eq("run_group", group)
    .eq("status", "running")
    .lt("started_at", cutoff);
  for (const job of stuck ?? []) {
    const giveUp = job.attempts >= MAX_ATTEMPTS;
    await service
      .from("daily_jobs")
      .update(
        giveUp
          ? { status: "failed", error: `didn't finish in the time a run has (tried ${job.attempts} times)`, finished_at: new Date(now).toISOString() }
          : { status: "pending" }
      )
      .eq("id", job.id)
      .eq("status", "running");
  }
}

/** The next pending job, claimed so no other invocation runs it. Null when there's none left. */
export async function claimNextJob(service: any, group: DailyGroup, runDate: string): Promise<DailyJob | null> {
  for (let tries = 0; tries < 5; tries++) {
    const { data: next, error } = await service
      .from("daily_jobs")
      .select("id, dealership_id, subsystem, attempts, status")
      .eq("run_date", runDate)
      .eq("run_group", group)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`couldn't read the job list: ${error.message}`);
    if (!next) return null;
    const { data: claimed, error: claimError } = await service
      .from("daily_jobs")
      .update({ status: "running", attempts: next.attempts + 1, started_at: new Date().toISOString() })
      .eq("id", next.id)
      .eq("status", "pending")
      .eq("attempts", next.attempts)
      .select("id, dealership_id, subsystem, attempts, status")
      .maybeSingle();
    if (claimError) throw new Error(`couldn't claim a job: ${claimError.message}`);
    if (claimed) return claimed as DailyJob;
    // another invocation took it first — look again
  }
  return null;
}

export async function workDailyJobs(
  service: any,
  opts: {
    group: DailyGroup;
    runDate: string;
    runners: Record<SubsystemKey, Runner>;
    clock?: () => number;
  }
): Promise<{ ran: number; outOfTime: boolean }> {
  const clock = opts.clock ?? Date.now;
  const start = clock();
  let ran = 0;

  await requeueStuckJobs(service, opts.group, opts.runDate, clock());

  const categories = new Map<string, string>();
  while (true) {
    // Out of time: stop. The dispatcher carries on what's left (dailyRunStalled).
    if (clock() - start > BUDGET_MS) return { ran, outOfTime: true };
    const job = await claimNextJob(service, opts.group, opts.runDate);
    if (!job) return { ran, outOfTime: false };

    if (!categories.has(job.dealership_id)) {
      const { data } = await service.from("dealerships").select("business_category").eq("id", job.dealership_id).maybeSingle();
      categories.set(job.dealership_id, data?.business_category ?? "business");
    }
    const runner = opts.runners[job.subsystem];
    const result: any = runner
      ? await runAndLog(service, job.dealership_id, job.subsystem, () => runner(service, job.dealership_id, categories.get(job.dealership_id)!))
      : { error: `no runner for ${job.subsystem}` };
    const failed = result && typeof result === "object" && "error" in result && result.error;
    await service
      .from("daily_jobs")
      .update({ status: failed ? "failed" : "done", error: failed ? String(result.error).slice(0, 500) : null, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    ran++;
  }
}

export type DailyRunHealth = {
  subsystem: "daily_run";
  kind: "daily";
  state: "ok" | "running" | "failing" | "idle";
  total: number;
  done: number;
  failed: { subsystem: string; error: string | null }[];
  lastRunAt: string | null;
  lastSuccess: boolean | null;
};

/** One business's jobs for the day, for the health card. */
export function buildDailyRunHealth(jobs: { subsystem: string; status: string; error: string | null; started_at: string | null; finished_at: string | null }[], now = Date.now()): DailyRunHealth {
  const total = jobs.length;
  const done = jobs.filter((j) => j.status === "done").length;
  // A job still "running" long after it started was killed with its invocation.
  const killed = jobs.filter((j) => j.status === "running" && j.started_at && now - Date.parse(j.started_at) > STUCK_MINUTES * 60_000);
  const failed = [
    ...jobs.filter((j) => j.status === "failed").map((j) => ({ subsystem: j.subsystem, error: j.error })),
    ...killed.map((j) => ({ subsystem: j.subsystem, error: "didn't finish in the time a run has" })),
  ];
  const open = jobs.filter((j) => j.status === "pending" || (j.status === "running" && !killed.includes(j))).length;
  const times = jobs.map((j) => j.finished_at ?? j.started_at).filter(Boolean) as string[];
  const lastRunAt = times.sort().at(-1) ?? null;
  const state: DailyRunHealth["state"] = total === 0 ? "idle" : failed.length ? "failing" : open ? "running" : "ok";
  return { subsystem: "daily_run", kind: "daily", state, total, done, failed, lastRunAt, lastSuccess: state === "ok" ? true : state === "failing" ? false : null };
}

/**
 * One invocation of the daily run. The cron's first invocation (not a
 * continuation) runs the platform-wide tasks and writes today's list;
 * every invocation then works through the list until its time is up.
 */
export async function runDailyInvocation(
  service: any,
  opts: {
    groups: DailyGroup[];
    isContinuation: boolean;
    runDate: string;
    runners: Record<SubsystemKey, Runner>;
    /** Platform-wide work for the signals run (Resend webhook, platform spend). */
    platformTasks?: () => Promise<unknown>;
    clock?: () => number;
  }
) {
  const summary: Record<string, unknown> = { runDate: opts.runDate, continuation: opts.isContinuation };
  if (!opts.isContinuation && opts.platformTasks && opts.groups.includes("signals")) {
    summary.platform = await opts.platformTasks().catch((err: any) => ({ error: err?.message }));
  }
  for (const group of opts.groups) {
    if (!opts.isContinuation) summary[`${group}Plan`] = await planDailyJobs(service, group, opts.runDate);
    summary[group] = await workDailyJobs(service, { group, runDate: opts.runDate, runners: opts.runners, clock: opts.clock });
  }
  return summary;
}

/**
 * For the 2-minute event dispatcher: whether a group's list needs an
 * invocation — jobs waiting (or stuck) and none being worked on. This is
 * how a run continues once an invocation's time is up, so it doesn't wait
 * for minutes of silence first.
 */
export async function dailyRunStalled(service: any, group: DailyGroup, runDate: string, now = Date.now()): Promise<boolean> {
  const { data: jobs } = await service.from("daily_jobs").select("status, started_at, finished_at").eq("run_date", runDate).eq("run_group", group);
  const list = jobs ?? [];
  const stuckBefore = now - STUCK_MINUTES * 60_000;
  const stuck = (j: any) => j.status === "running" && j.started_at && Date.parse(j.started_at) < stuckBefore;
  const waiting = list.some((j: any) => j.status === "pending" || stuck(j));
  // An invocation is on it: a job running that isn't stuck.
  const active = list.some((j: any) => j.status === "running" && !stuck(j));
  return waiting && !active;
}
