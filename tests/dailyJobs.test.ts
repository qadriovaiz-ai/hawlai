// The daily job list: every automation for every business gets its turn.
//
// THE LIVE CASE (2026-09-15): candle_by_qaaf's welcome-email automation
// ran on 10 Sep and not once on 11–15 Sep. The heavy cron did everything
// for five businesses inside one 60-second invocation; it was killed before
// reaching candle_by_qaaf, and a killed invocation writes nothing.
//
// These run the real job list, worker, invocation and route against a fake
// database and fake automations with a fake clock.

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

describe("the live case: five businesses, 60-second invocations", () => {
  it("every business's jobs all run, across hand-overs — candle_by_qaaf's emails included", async () => {
    const clock = { now: 0 };
    const calls: string[] = [];
    const runners = fakeRunners(clock, calls);
    const invocations: number[] = [];
    let pendingHandOvers = 0;

    // The cron's invocation, then every hand-over it and its successors ask for.
    const invoke = async (isContinuation: boolean) => {
      invocations.push(clock.now);
      await runDailyInvocation(db(), { groups: ["heavy"], isContinuation, runDate: TODAY, runners, handOver: async () => void pendingHandOvers++, clock: () => clock.now });
    };
    await invoke(false);
    while (pendingHandOvers > 0) {
      pendingHandOvers--;
      await invoke(true);
    }

    const jobs = tables.daily_jobs;
    expect(jobs).toHaveLength(BUSINESSES.length * GROUPS.heavy.length);
    expect(jobs.every((j) => j.status === "done")).toBe(true);
    for (const b of BUSINESSES) for (const s of GROUPS.heavy) expect(calls).toContain(`${b}:${s}`);
    expect(invocations.length).toBeGreaterThan(1);
    // Emails for every business before any daily_autopilot.
    expect(Math.max(...BUSINESSES.map((b) => calls.indexOf(`${b}:email_automation`)))).toBeLessThan(calls.indexOf("lala:daily_autopilot"));
  });

  it("no invocation starts a job after its time budget", async () => {
    const clock = { now: 0 };
    const starts: number[] = [];
    const runners = fakeRunners(clock, []);
    const wrapped = Object.fromEntries(Object.entries(runners).map(([k, fn]: any) => [k, async (...a: any[]) => (starts.push(clock.now), fn(...a))])) as any;
    await planDailyJobs(db(), "heavy", TODAY);
    const invStart = clock.now;
    const r = await workDailyJobs(db(), { group: "heavy", runDate: TODAY, runners: wrapped, handOver: async () => {}, clock: () => clock.now });
    expect(r.outOfTime).toBe(true);
    expect(Math.max(...starts) - invStart).toBeLessThanOrEqual(BUDGET_MS);
  });
});

describe("hand-over", () => {
  it("happens before the second job starts — so a kill during that job can't end the run — and only once per invocation", async () => {
    const clock = { now: 0 };
    const events: string[] = [];
    await planDailyJobs(db(), "signals", TODAY);
    const runners = Object.fromEntries(GROUPS.signals.map((s) => [s, async (_: any, id: string) => void events.push(`run ${id}:${s}`)])) as any;
    await workDailyJobs(db(), { group: "signals", runDate: TODAY, runners, handOver: async () => void events.push("hand-over"), clock: () => clock.now });
    expect(events.filter((e) => e === "hand-over")).toHaveLength(1);
    expect(events.indexOf("hand-over")).toBe(1);
  });

  it("an invocation that ran out of time without handing over (one long job) hands over before exiting", async () => {
    const clock = { now: 0 };
    let handOvers = 0;
    const runners = fakeRunners(clock, []);
    runners.email_automation = async () => void (clock.now += BUDGET_MS + 1);
    await runDailyInvocation(db(), { groups: ["heavy"], isContinuation: false, runDate: TODAY, runners, handOver: async () => void handOvers++, clock: () => clock.now });
    expect(handOvers).toBe(1);
  });

  it("a finished list doesn't hand over", async () => {
    tables.dealerships = tables.dealerships.slice(0, 1);
    let handOvers = 0;
    const runners = Object.fromEntries(GROUPS.signals.map((s) => [s, async () => ({})])) as any;
    await planDailyJobs(db(), "signals", TODAY);
    // one invocation does everything instantly — its single hand-over came before job 2
    await workDailyJobs(db(), { group: "signals", runDate: TODAY, runners, handOver: async () => void handOvers++, clock: () => 0 });
    const next = await runDailyInvocation(db(), { groups: ["signals"], isContinuation: true, runDate: TODAY, runners, handOver: async () => void handOvers++, clock: () => 0 });
    expect((next as any).signals).toEqual({ ran: 0, handedOver: false, outOfTime: false });
    expect(handOvers).toBe(1);
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
    await workDailyJobs(db(), { group: "signals", runDate: TODAY, runners, handOver: async () => {}, clock: () => Date.now() });
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
    expect(job).toMatchObject({ status: "failed", error: `didn't finish within 60 seconds (tried ${MAX_ATTEMPTS} times)` });
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
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: false, runDate: TODAY, runners, handOver: async () => {}, clock: () => 0 });
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
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: false, runDate: TODAY, runners, handOver: async () => {}, platformTasks, clock: () => 0 });
    expect(order[0]).toBe("platform");
    tables.daily_jobs = [];
    order.length = 0;
    await runDailyInvocation(db(), { groups: ["signals"], isContinuation: true, runDate: TODAY, runners, handOver: async () => {}, platformTasks, clock: () => 0 });
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
        { subsystem: "daily_autopilot", error: "didn't finish within 60 seconds" },
      ],
      lastSuccess: false,
    });
  });
});

describe("the 2-minute safety net", () => {
  it("nudges only a list that has waiting jobs and no recent movement", async () => {
    const now = Date.now();
    await planDailyJobs(db(), "heavy", TODAY);
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(true);
    tables.daily_jobs[0].status = "done";
    tables.daily_jobs[0].finished_at = new Date(now - 60_000).toISOString();
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(false);
    for (const j of tables.daily_jobs) Object.assign(j, { status: "done", finished_at: new Date(now - 10 * 60_000).toISOString() });
    expect(await dailyRunStalled(db(), "heavy", TODAY, now)).toBe(false);
  });
});

describe("the route", () => {
  it("answers 202 at once, works in after(), and hands over to itself with the server's own secret", async () => {
    vi.resetModules();
    const afterCallbacks: (() => Promise<void>)[] = [];
    vi.doMock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: any) => void afterCallbacks.push(fn) }));
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
    vi.doMock("@/lib/email/resendWebhook", () => ({ ensureResendWebhook: async () => ({ status: "ok", id: "wh" }) }));
    vi.doMock("@/lib/agents/platformSpendAlertAgent", () => ({ checkPlatformDailySpend: async () => ({}) }));
    const slow = Object.fromEntries([...GROUPS.heavy, ...GROUPS.signals].map((s) => [s, async () => ({})]));
    vi.doMock("@/lib/automation/dailyRunners", () => ({ DAILY_RUNNERS: slow }));
    const fetched: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: any, init: any) => (fetched.push({ url: String(u), auth: init?.headers?.Authorization ?? null }), { status: 202 })));
    process.env.CRON_SECRET = "cron-test-secret";

    const { GET } = await import("@/app/api/autopilot/daily-run/route");
    const res = await GET(new Request("https://hawlai.online/api/autopilot/daily-run?group=heavy", { headers: { authorization: "Bearer cron-test-secret" } }));
    expect(res.status).toBe(202);
    expect(tables.daily_jobs).toEqual([]); // nothing done before answering

    await afterCallbacks[0]();
    expect(tables.daily_jobs.length).toBe(BUSINESSES.length * GROUPS.heavy.length);
    expect(fetched[0]).toEqual({ url: "https://hawlai.online/api/autopilot/daily-run?group=heavy&continue=1", auth: "Bearer cron-test-secret" });

    const denied = await GET(new Request("https://hawlai.online/api/autopilot/daily-run?group=heavy&continue=1"));
    expect(denied.status).toBe(401);
    vi.unstubAllGlobals();
    delete process.env.CRON_SECRET;
  });
});
