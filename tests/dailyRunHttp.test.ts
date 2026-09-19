// The daily automation run over REAL HTTP (2026-09-20).
//
// It used to carry itself on by calling its own route — a chain of
// self-calls, which Vercel stops with 508 "Loop Detected" after a few hops
// (competitor positioning failed in production exactly that way). Now an
// invocation works until its budget and stops; the 2-minute dispatcher,
// called from outside by pg_cron, starts the next one.
//
// A local HTTP server runs the real daily-run and dispatcher routes. The
// test plays Vercel Cron and pg_cron. Every request the server receives is
// either theirs or a dispatcher nudge — one per group the dispatcher
// reports — and never the daily run calling itself.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

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
      if (op === "upsert") {
        const keys = String(opts?.onConflict ?? "").split(",");
        for (const v of [].concat(values) as Row[]) {
          const existing = (tables[table] ??= []).find((r) => keys.every((k) => r[k] === v[k]));
          if (!existing) tables[table].push({ id: `row-${nextId++}`, status: "pending", attempts: 0, ...v });
        }
        return { data: [], error: null };
      }
      if (op === "insert") {
        for (const v of [].concat(values)) (tables[table] ??= []).push({ id: `row-${nextId++}`, ...(v as Row) });
        return { data: [], error: null };
      }
      return { data: [], error: null };
    };
    const api: any = {
      select: () => ((returning = op !== "select"), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      lt: (k: string, v: any) => (filters.push((r) => r[k] != null && r[k] < v), api),
      lte: (k: string, v: any) => (filters.push((r) => r[k] != null && r[k] <= v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      or: () => api, not: () => api, is: () => api, neq: () => api,
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
  return { from, rpc: async () => ({ data: null, error: null }) };
}

// Fake time: each automation takes a minute, so a day of 20 businesses is
// far more than one invocation's budget.
let fakeNow = Date.now();
let jobCostMs = 60_000;
const pending: (() => Promise<unknown>)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<unknown>) => void pending.push(fn) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/email/resendWebhook", () => ({ ensureResendWebhook: async () => ({ status: "ok", id: "wh" }) }));
vi.mock("@/lib/agents/platformSpendAlertAgent", () => ({ checkPlatformDailySpend: async () => ({}) }));
vi.mock("@/lib/events/eventHandlers", () => ({ EVENT_HANDLERS: {} }));
vi.mock("@/lib/tasks/taskExecutors", () => ({ TASK_EXECUTORS: {} }));
vi.mock("@/lib/events/emitEvent", () => ({ emitEvent: async () => {} }));
vi.mock("@/lib/automation/runAndLog", () => ({ runAndLog: async (_s: any, _d: any, _k: any, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/automation/dailyRunners", async () => {
  const { GROUPS } = await import("@/lib/automation/cronGroups");
  return { DAILY_RUNNERS: Object.fromEntries([...GROUPS.heavy, ...GROUPS.signals].map((s) => [s, async () => void (fakeNow += jobCostMs)])) };
});

import { GET as dailyRun } from "@/app/api/autopilot/daily-run/route";
import { POST as dispatch } from "@/app/api/events/dispatch/route";
import { GROUPS } from "@/lib/automation/cronGroups";

const SECRET = "cron-http-secret";
const realFetch = globalThis.fetch;
let server: http.Server;
let origin: string;
let received: { from: string; path: string; status: number }[];

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const request = new Request(`${origin}${url.pathname}${url.search}`, { method: req.method, headers: req.headers as any });
    const r =
      url.pathname === "/api/autopilot/daily-run" ? await dailyRun(request)
      : url.pathname === "/api/events/dispatch" ? await dispatch(request)
      : new Response("", { status: 404 });
    const text = await r.text();
    received.push({ from: String(req.headers["x-sent-by"] ?? "the server itself"), path: url.pathname, status: r.status });
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(text);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  fakeNow = Date.now();
  jobCostMs = 60_000;
  vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
  vi.spyOn(console, "log").mockImplementation(() => {});
  received = [];
  pending.length = 0;
  tables = {
    dealerships: Array.from({ length: 20 }, (_, i) => ({ id: `biz-${i}`, business_category: null, created_at: `2026-01-${String(i + 1).padStart(2, "0")}` })),
    daily_jobs: [],
    event_queue: [],
    agent_tasks: [],
  };
  // Every request is real HTTP.
  vi.stubGlobal("fetch", (url: any, init: any) => realFetch(url, init));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
});

async function drain() {
  while (pending.length) await pending.shift()!();
}
const call = (path: string, who: string, method = "GET") =>
  realFetch(`${origin}${path}`, { method, headers: { authorization: `Bearer ${SECRET}`, "x-sent-by": who } });

describe("the daily run over real HTTP", () => {
  it("a day bigger than one invocation: the cron starts it, pg_cron's dispatcher carries it on, and the daily run never calls itself", async () => {
    expect((await call("/api/autopilot/daily-run?group=heavy", "vercel-cron")).status).toBe(202);
    await drain();
    const jobs = () => tables.daily_jobs.filter((j) => j.run_group === "heavy");
    expect(jobs()).toHaveLength(20 * GROUPS.heavy.length);
    // The cron's invocation stopped at its budget, with work left.
    expect(jobs().some((j) => j.status === "pending")).toBe(true);

    let nudges = 0;
    for (let tick = 0; tick < 100 && jobs().some((j) => j.status !== "done"); tick++) {
      fakeNow += 2 * 60_000; // pg_cron's next tick
      const body = await (await call("/api/events/dispatch", "pg_cron", "POST")).json();
      nudges += body.dailyRunNudged.length;
      await drain();
    }
    expect(jobs().every((j) => j.status === "done")).toBe(true);
    expect(nudges).toBeGreaterThan(1);

    // Everything the server received: the cron, pg_cron's ticks, and one
    // daily-run request per nudge — sent by the dispatcher. Nothing else.
    const fromServer = received.filter((r) => r.from === "the server itself");
    expect(fromServer).toHaveLength(nudges);
    expect(fromServer.every((r) => r.path === "/api/autopilot/daily-run" && r.status === 202)).toBe(true);
    expect(received.filter((r) => r.from === "vercel-cron")).toHaveLength(1);
  });

  it("a day that fits one invocation: no nudge, and no request from the server at all", async () => {
    tables.dealerships = tables.dealerships.slice(0, 2);
    jobCostMs = 5_000; // 16 jobs × 5s: well inside one invocation
    await call("/api/autopilot/daily-run?group=heavy", "vercel-cron");
    await drain();
    fakeNow += 2 * 60_000;
    const body = await (await call("/api/events/dispatch", "pg_cron", "POST")).json();
    expect(body.dailyRunNudged).toEqual([]);
    expect(tables.daily_jobs.every((j) => j.status === "done")).toBe(true);
    expect(received.every((r) => r.from !== "the server itself")).toBe(true);
  });
});
