// The daily job list: every automation for every business gets its turn.
//
// THE LIVE CASE (2026-09-15): candle_by_qaaf's welcome-email automation
// ran on 10 Sep and not once on 11–15 Sep. The heavy cron did everything
// for five businesses inside one 60-second invocation; it was killed before
// reaching candle_by_qaaf, and a killed invocation writes nothing.
//
// These run the real job list, worker, invocation and route against a fake
// database and fake automations with a fake clock.
//
// 2026-09-20: an invocation no longer calls this route itself to carry on
// — a chain of self-calls is what Vercel stops with 508 "Loop Detected".
// It works for BUDGET_MS of its 300s; the 2-minute dispatcher (called from
// outside by pg_cron) starts the next invocation when jobs are waiting and
// none is running.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let nextId = 1;

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: any = null;
    let opts: any = null;
    let returning = false;
    const filters: ((r: Row) => boolean)[] = [];
    let orderBy: string | null = null;
    let limit: number | null = null;
    const matching = () => {
      let m = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderBy) m = [...m].sort((a, b) => a[orderBy!] - b[orderBy!] || String(a[orderBy!]).localeCompare(String(b[orderBy!])));
      if (limit !== null) m = m.slice(0, limit);
      return m;
    };
    const finish = () => {
      if (op === "select") return { data: matching(), error: null };
      if (op === "update") {
        const hit = matching();
        for (const r of hit) Object.assign(r, values);
        return { data: returning ? hit.map((r) => ({ ...r })) : [], error: null };
      }
      if (op === "insert") {
        for (const v of [].concat(values)) (tables[table] ??= []).push({ id: `row-${nextId++}`, created_at: new Date().toISOString(), ...(v as Row) });
        return { data: [], error: null };
      }
      if (op === "upsert") {
        const keys = String(opts?.onConflict ?? "").split(",");
        for (const v of [].concat(values) as Row[]) {
          const existing = (tables[table] ??= []).find((r) => keys.every((k) => r[k] === v[k]));
          if (existing) {
            if (!opts?.ignoreDuplicates) Object.assign(existing, v);
          } else {
            tables[table].push({ id: `row-${nextId++}`, status: "pending", attempts: 0, ...v });
          }
        }
        return { data: [], error: null };
      }
      return { data: [], error: null };
    };
    const api: any = {
      select: () => ((returning = op !== "select"), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      lt: (k: string, v: any) => (filters.push((r) => r[k] != null && r[k] < v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), api),
      lte: (k: string, v: any) => (filters.push((r) => r[k] <= v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      order: (k: string) => ((orderBy = k), api),
      limit: (n: number) => ((limit = n), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      upsert: (v: Row[], o: any) => ((op = "upsert"), (values = v), (opts = o), api),
      maybeSingle: async () => ({ data: finish().data[0] ?? null, error: null }),
      single: async () => ({ data: finish().data[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(finish()).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) } };
}

import {
  planDailyJobs,
  claimNextJob,
  workDailyJobs,
  runDailyInvocation,
  buildDailyRunHealth,
  dailyRunStalled,
  requeueStuckJobs,
  BUDGET_MS,
  STUCK_MINUTES,
  MAX_ATTEMPTS,
} from "@/lib/automation/dailyJobs";
import { GROUPS, type SubsystemKey } from "@/lib/automation/cronGroups";

const TODAY = "2026-09-16";
/** The route and the dispatcher use India's real date. */
const TODAY_IN_INDIA = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const BUSINESSES = ["lala", "hind-realestate", "riverside-pottery", "bloom-and-wax", "candle_by_qaaf"];

/** Fake automations that take (fake) time: the AI ones are slow. */
const COST: Partial<Record<SubsystemKey, number>> = { daily_autopilot: 14_000, report_snapshots: 4_000, content_autopilot: 2_000, email_automation: 1_000, workflows: 500 };
function fakeRunners(clock: { now: number }, calls: string[]) {
  return Object.fromEntries(
    [...GROUPS.heavy, ...GROUPS.signals].map((s) => [
      s,
      async (_sb: any, id: string) => {
        clock.now += COST[s] ?? 1_000;
        calls.push(`${id}:${s}`);
        return { ok: true };
      },
    ])
  ) as any;
}

beforeEach(() => {
  tables = {
    dealerships: BUSINESSES.map((id, i) => ({ id, business_category: null, created_at: `2026-01-0${i + 1}` })),
    daily_jobs: [],
    automation_run_log: [],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** The cron's invocation, then the dispatcher's ticks: each tick starts an invocation only if the list needs one. */
async function runTheDay(group: "heavy" | "signals", runners: any, clock: { now: number }) {
  const invocations: string[] = [];
  const invoke = async (isContinuation: boolean) => {
    invocations.push(isContinuation ? "dispatcher" : "cron");
    await runDailyInvocation(db(), { groups: [group], isContinuation, runDate: TODAY, runners, clock: () => clock.now });
  };
  await invoke(false);
  for (let tick = 0; tick < 50 && (await dailyRunStalled(db(), group, TODAY)); tick++) await invoke(true);
  return invocations;
}

describe("the live case: five businesses", () => {
  it("every business's jobs all run — candle_by_qaaf's emails included — in the cron's one invocation", async () => {
    const clock = { now: 0 };
    const calls: string[] = [];
    const invocations = await runTheDay("heavy", fakeRunners(clock, calls), clock);
    const jobs = tables.daily_jobs;
    expect(jobs).toHaveLength(BUSINESSES.length * GROUPS.heavy.length);
    expect(jobs.every((j) => j.status === "done")).toBe(true);
    for (const b of BUSINESSES) for (const s of GROUPS.heavy) expect(calls).toContain(`${b}:${s}`);
    // ~2 minutes of work fits in one 300s invocation.
    expect(invocations).toEqual(["cron"]);
    // Emails for every business before any daily_autopilot.
    expect(Math.max(...BUSINESSES.map((b) => calls.indexOf(`${b}:email_automation`)))).toBeLessThan(calls.indexOf("lala:daily_autopilot"));
  });

  it("more than one invocation's work: the dispatcher carries it on — every job runs, with no invocation calling the route", async () => {
    tables.dealerships = Array.from({ length: 10 }, (_, i) => ({ id: `biz-${i}`, business_category: null, created_at: `2026-01-${String(i + 1).padStart(2, "0")}` }));
    const clock = { now: 0 };
    const calls: string[] = [];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const invocations = await runTheDay("heavy", fakeRunners(clock, calls), clock);
    expect(tables.daily_jobs.every((j) => j.status === "done")).toBe(true);
    expect(calls).toHaveLength(10 * GROUPS.heavy.length);
    expect(invocations[0]).toBe("cron");
    expect(invocations.length).toBeGreaterThan(1);
    expect(invocations.slice(1).every((i) => i === "dispatcher")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    // A whole day's list through a fake database: slower than vitest's 5s
    // default when the full suite is running in parallel.
  }, 30_000);

  it("no invocation starts a job after its time budget, and the budget leaves the last job room inside 300s", async () => {
    const clock = { now: 0 };
    const starts: number[] = [];
    tables.dealerships = Array.from({ length: 10 }, (_, i) => ({ id: `biz-${i}`, business_category: null, created_at: `2026-01-${String(i + 1).padStart(2, "0")}` }));
    const runners = fakeRunners(clock, []);
    const wrapped = Object.fromEntries(Object.entries(runners).map(([k, fn]: any) => [k, async (...a: any[]) => (starts.push(clock.now), fn(...a))])) as any;
    await planDailyJobs(db(), "heavy", TODAY);
    const invStart = clock.now;
    const r = await workDailyJobs(db(), { group: "heavy", runDate: TODAY, runners: wrapped, clock: () => clock.now });
    expect(r.outOfTime).toBe(true);
    expect(Math.max(...starts) - invStart).toBeLessThanOrEqual(BUDGET_MS);
    const { maxDuration } = await import("@/app/api/autopilot/daily-run/route");
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000 - BUDGET_MS).toBeGreaterThanOrEqual(120_000);
  }, 30_000);
});

describe("carrying on", () => {
  it("an invocation that runs out of time just stops — the rest waits for the dispatcher", async () => {
    const clock = { now: 0 };
    const runners = fakeRunners(clock, []);
    runners.email_automation = async () => void (clock.now += BUDGET_MS + 1);
    const summary: any = await runDailyInvocation(db(), { groups: ["heavy"], isContinuation: false, runDate: TODAY, runners, clock: () => clock.now });
    expect(summary.heavy).toEqual({ ran: 1, outOfTime: true });
    expect(tables.daily_jobs.filter((j) => j.status === "pending").length).toBeGreaterThan(0);
    expect(await dailyRunStalled(db(), "heavy", TODAY)).toBe(true);
  });

  it("a finished list needs nothing more", async () => {
    tables.dealerships = tables.dealerships.slice(0, 1);
    const runners = Object.fromEntries(GROUPS.signals.map((s) => [s, async () => ({})])) as any;
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: false, runDate: TODAY, runners, clock: () => 0 });
    expect(await dailyRunStalled(db(), "signals", TODAY)).toBe(false);
    const next = await runDailyInvocation(db(), { groups: ["signals"], isContinuation: true, runDate: TODAY, runners, clock: () => 0 });
    expect((next as any).signals).toEqual({ ran: 0, outOfTime: false });
  });
});

describe("a job whose invocation was killed", () => {
  it("is put back after the stuck window and run again", async () => {
    await planDailyJobs(db(), "heavy", TODAY);
    const killed = await claimNextJob(db(), "heavy", TODAY); // claimed, then the invocation dies
    expect(killed).toMatchObject({ subsystem: "email_automation", attempts: 1 });
    const job = tables.daily_jobs.find((j) => j.id === killed!.id)!;
    job.started_at = new Date(Date.now() - (STUCK_MINUTES + 1) * 60_000).toISOString();

    await requeueStuckJobs(db(), "heavy", TODAY);
    expect(job.status).toBe("pending");
    const again = await claimNextJob(db(), "heavy", TODAY);
    expect(again).toMatchObject({ id: killed!.id, attempts: 2 });
  });

  it("the next invocation's worker puts it back and runs it — nobody has to step in", async () => {
    tables.dealerships = tables.dealerships.slice(0, 1);
    await planDailyJobs(db(), "signals", TODAY);
    const killed = await claimNextJob(db(), "signals", TODAY);
    tables.daily_jobs.find((j) => j.id === killed!.id)!.started_at = new Date(Date.now() - (STUCK_MINUTES + 1) * 60_000).toISOString();
    const ran: string[] = [];
    const runners = Object.fromEntries(GROUPS.signals.map((s) => [s, async () => void ran.push(s)])) as any;
    await workDailyJobs(db(), { group: "signals", runDate: TODAY, runners, clock: () => Date.now() });
    expect(ran).toContain(killed!.subsystem);
    expect(tables.daily_jobs.find((j) => j.id === killed!.id)).toMatchObject({ status: "done", attempts: 2 });
  });

  it("a job still running within the window is left alone", async () => {
    await planDailyJobs(db(), "heavy", TODAY);
    const running = await claimNextJob(db(), "heavy", TODAY);
    await requeueStuckJobs(db(), "heavy", TODAY);
    expect(tables.daily_jobs.find((j) => j.id === running!.id)!.status).toBe("running");
  });

  it(`after ${MAX_ATTEMPTS} attempts it's failed with the reason`, async () => {
    await planDailyJobs(db(), "heavy", TODAY);
    const job = tables.daily_jobs[0];
    Object.assign(job, { status: "running", attempts: MAX_ATTEMPTS, started_at: new Date(Date.now() - (STUCK_MINUTES + 1) * 60_000).toISOString() });
    await requeueStuckJobs(db(), "heavy", TODAY);
    expect(job).toMatchObject({ status: "failed", error: `didn't finish in the time a run has (tried ${MAX_ATTEMPTS} times)` });
  });
});

describe("the list", () => {
  it("is written once per business per automation, in priority order, and not duplicated if planned again", async () => {
    await planDailyJobs(db(), "heavy", TODAY);
    await planDailyJobs(db(), "heavy", TODAY);
    expect(tables.daily_jobs).toHaveLength(BUSINESSES.length * GROUPS.heavy.length);
    const order = [...tables.daily_jobs].sort((a, b) => a.position - b.position).map((j) => `${j.subsystem}:${j.dealership_id}`);
    expect(order.slice(0, BUSINESSES.length)).toEqual(BUSINESSES.map((b) => `email_automation:${b}`));
    expect(order.at(-1)).toBe("daily_autopilot:candle_by_qaaf");
  });

  it("yesterday's unfinished jobs are closed with a reason when today's list is written", async () => {
    tables.daily_jobs.push({ id: "old", run_date: "2026-09-15", run_group: "heavy", dealership_id: "lala", subsystem: "daily_autopilot", position: 0, status: "pending", attempts: 0 });
    await planDailyJobs(db(), "heavy", TODAY);
    expect(tables.daily_jobs.find((j) => j.id === "old")).toMatchObject({ status: "failed", error: "not reached before the next day's run" });
  });

  it("a job can't be claimed twice: a claim only succeeds if it's still pending with the same attempt count", async () => {
    await planDailyJobs(db(), "signals", TODAY);
    const a = await claimNextJob(db(), "signals", TODAY);
    const b = await claimNextJob(db(), "signals", TODAY);
    expect(a!.id).not.toBe(b!.id);
    // Simulate a race: the job is taken between reading it and claiming it.
    const target = [...tables.daily_jobs].filter((j) => j.status === "pending").sort((x, y) => x.position - y.position)[0];
    const realFrom = db().from;
    let raced = false;
    const racing = {
      from: (t: string) => {
        const q = realFrom(t);
        const origUpdate = q.update;
        q.update = (v: Row) => {
          if (!raced && v.status === "running") {
            raced = true;
            target.status = "running"; // someone else got there first
          }
          return origUpdate(v);
        };
        return q;
      },
    };
    const c = await claimNextJob(racing, "signals", TODAY);
    expect(c!.id).not.toBe(target.id);
  });

  it("an automation that returns an error fails its job with the reason — and the rest still run", async () => {
    tables.dealerships = tables.dealerships.slice(0, 2);
    const runners = Object.fromEntries(GROUPS.signals.map((s) => [s, async () => ({})])) as any;
    runners.lead_export = async (_: any, id: string) => (id === "lala" ? { error: "Resend is down" } : {});
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: false, runDate: TODAY, runners, clock: () => 0 });
    expect(tables.daily_jobs.find((j) => j.dealership_id === "lala" && j.subsystem === "lead_export")).toMatchObject({ status: "failed", error: "Resend is down" });
    expect(tables.daily_jobs.filter((j) => j.status === "done")).toHaveLength(2 * GROUPS.signals.length - 1);
    expect(tables.automation_run_log.length).toBe(2 * GROUPS.signals.length);
  });
});

describe("the invocation", () => {
  it("the cron's first signals invocation runs the platform tasks, then plans; a continuation does neither", async () => {
    const order: string[] = [];
    const runners = Object.fromEntries(GROUPS.signals.map((s) => [s, async () => void order.push("job")])) as any;
    const platformTasks = async () => void order.push("platform");
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: false, runDate: TODAY, runners, platformTasks, clock: () => 0 });
    expect(order[0]).toBe("platform");
    tables.daily_jobs = [];
    order.length = 0;
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: true, runDate: TODAY, runners, platformTasks, clock: () => 0 });
    expect(order).toEqual([]);
    expect(tables.daily_jobs).toEqual([]);
  });
});

describe("the health row", () => {
  const job = (over: Row) => ({ subsystem: "email_automation", status: "done", error: null, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), ...over });

  it("nothing planned yet: idle", () => {
    expect(buildDailyRunHealth([])).toMatchObject({ state: "idle", total: 0 });
  });

  it("all done: ok", () => {
    expect(buildDailyRunHealth([job({}), job({ subsystem: "workflows" })])).toMatchObject({ state: "ok", total: 2, done: 2, failed: [], lastSuccess: true });
  });

  it("some still waiting: running", () => {
    expect(buildDailyRunHealth([job({}), job({ status: "pending", started_at: null, finished_at: null })])).toMatchObject({ state: "running", done: 1 });
  });

  it("a failure, or a job left running long past its start (killed), is failing with the reason", () => {
    const h = buildDailyRunHealth([
      job({ subsystem: "content_autopilot", status: "failed", error: "Facebook token expired" }),
      job({ subsystem: "daily_autopilot", status: "running", finished_at: null, started_at: new Date(Date.now() - (STUCK_MINUTES + 5) * 60_000).toISOString() }),
    ]);
    expect(h).toMatchObject({
      state: "failing",
      failed: [
        { subsystem: "content_autopilot", error: "Facebook token expired" },
        { subsystem: "daily_autopilot", error: "didn't finish in the time a run has" },
      ],
      lastSuccess: false,
    });
  });
});

describe("the 2-minute dispatcher", () => {
  it("starts an invocation as soon as jobs are waiting and none is running — not after minutes of silence", async () => {
    const now = Date.now();
    await planDailyJobs(db(), "heavy", TODAY);
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(true);
    // One finished a minute ago, the rest waiting, nobody on them: carry on now.
    tables.daily_jobs[0].status = "done";
    tables.daily_jobs[0].finished_at = new Date(now - 60_000).toISOString();
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(true);
    // An invocation is on it: leave it be.
    Object.assign(tables.daily_jobs[1], { status: "running", started_at: new Date(now - 30_000).toISOString() });
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(false);
    // …unless that job is stuck (its invocation died): then it's waiting too.
    tables.daily_jobs[1].started_at = new Date(now - (STUCK_MINUTES + 1) * 60_000).toISOString();
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(true);
    // All done: nothing to start.
    for (const j of tables.daily_jobs) Object.assign(j, { status: "done", finished_at: new Date(now - 10 * 60_000).toISOString() });
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(false);
    // All done but one whose invocation died: that one alone still needs an invocation.
    Object.assign(tables.daily_jobs[3], { status: "running", finished_at: null, started_at: new Date(now - (STUCK_MINUTES + 1) * 60_000).toISOString() });
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(true);
  });

  it("the dispatcher's call to the daily run is one hop from outside, and the daily run makes no call of its own", async () => {
    vi.resetModules();
    const afterCallbacks: (() => Promise<void>)[] = [];
    vi.doMock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: any) => void afterCallbacks.push(fn) }));
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
    const quick = Object.fromEntries([...GROUPS.heavy, ...GROUPS.signals].map((s) => [s, async () => ({})]));
    vi.doMock("@/lib/automation/dailyRunners", () => ({ DAILY_RUNNERS: quick }));
    vi.doMock("@/lib/email/resendWebhook", () => ({ ensureResendWebhook: async () => ({ status: "ok", id: "wh" }) }));
    vi.doMock("@/lib/agents/platformSpendAlertAgent", () => ({ checkPlatformDailySpend: async () => ({}) }));
    process.env.CRON_SECRET = "cron-test-secret";
    const { GET: dailyRun } = await import("@/app/api/autopilot/daily-run/route");
    const { POST: dispatch } = await import("@/app/api/events/dispatch/route");

    await planDailyJobs(db(), "heavy", TODAY_IN_INDIA());
    // Every request anyone makes: the dispatcher's nudge goes to the real daily-run route.
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: any, init: any) => {
      requests.push(String(u));
      return dailyRun(new Request(String(u), { headers: init?.headers }));
    }));
    const res = await dispatch(new Request("https://hawlai.online/api/events/dispatch", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }));
    expect((await res.json()).dailyRunNudged).toEqual(["heavy"]);
    expect(requests).toEqual(["https://hawlai.online/api/autopilot/daily-run?group=heavy&continue=1"]);
    // The daily run's own work: all of it, and not one request.
    for (const cb of afterCallbacks.splice(0)) await cb();
    expect(requests).toHaveLength(1);
    expect(tables.daily_jobs.filter((j) => j.run_date === TODAY_IN_INDIA()).every((j) => j.status === "done")).toBe(true);
    vi.unstubAllGlobals();
    delete process.env.CRON_SECRET;
  });
});

describe("the route", () => {
  it("answers 202 at once, works in after() — and never calls itself", async () => {
    vi.resetModules();
    const afterCallbacks: (() => Promise<void>)[] = [];
    vi.doMock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: any) => void afterCallbacks.push(fn) }));
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
    vi.doMock("@/lib/email/resendWebhook", () => ({ ensureResendWebhook: async () => ({ status: "ok", id: "wh" }) }));
    vi.doMock("@/lib/agents/platformSpendAlertAgent", () => ({ checkPlatformDailySpend: async () => ({}) }));
    // Each automation takes a minute of the clock: more than one invocation's budget.
    const slow = Object.fromEntries([...GROUPS.heavy, ...GROUPS.signals].map((s) => [s, async () => ({})]));
    vi.doMock("@/lib/automation/dailyRunners", () => ({ DAILY_RUNNERS: slow }));
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: any) => (fetched.push(String(u)), { status: 202 })));
    process.env.CRON_SECRET = "cron-test-secret";

    const { GET } = await import("@/app/api/autopilot/daily-run/route");
    const res = await GET(new Request("https://hawlai.online/api/autopilot/daily-run?group=heavy", { headers: { authorization: "Bearer cron-test-secret" } }));
    expect(res.status).toBe(202);
    expect(tables.daily_jobs).toEqual([]); // nothing done before answering

    await afterCallbacks[0]();
    expect(tables.daily_jobs.length).toBe(BUSINESSES.length * GROUPS.heavy.length);
    expect(fetched.filter((u) => u.includes("/api/autopilot/daily-run"))).toEqual([]);

    const denied = await GET(new Request("https://hawlai.online/api/autopilot/daily-run?group=heavy&continue=1"));
    expect(denied.status).toBe(401);
    vi.unstubAllGlobals();
    delete process.env.CRON_SECRET;
  });
});
