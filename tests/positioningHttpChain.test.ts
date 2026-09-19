// The positioning hand-over over REAL HTTP (2026-09-20).
//
// Two production stalls were in the hand-over chain: first every
// hand-over was redirected to /auth/login (the middleware), then a run
// stopped at step 1 after its hand-over was accepted. Tests that call the
// worker route as a function can't see either. Here the server really
// calls itself: a local HTTP server stands in for the deployment — the
// middleware's own public-path decision, then the real worker route — and
// each hand-over is a real fetch over TCP carrying the real secret header.
// Only Anthropic and the database are fakes.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, created_at: new Date().toISOString(), ...payload };
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const touched = rows();
        for (const r of touched) Object.assign(r, payload);
        return { data: single ? touched[0] ?? null : touched, error: null };
      }
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, in: () => api, gte: () => api, not: () => api, is: () => api, lt: () => api, or: () => api, neq: () => api,
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      eq: (k: string, v: any) => (filters.push((r) => !(k in r) || r[k] === v), api),
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

// after(): the work runs once the answer is sent, as on Vercel.
const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => void pending.push(new Promise((r) => setImmediate(r)).then(fn)),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));
vi.mock("@/lib/featureGate", () => ({ requireFeature: async () => ({ allowed: true }) }));
vi.mock("@/lib/usage/usageGuard", () => ({ checkUsage: async () => ({ allowed: true }) }));

import { POST as startPost } from "@/app/api/strategy/positioning/route";
import { POST as workPost } from "@/app/api/strategy/positioning/work/route";
import { isPublicPath } from "@/lib/supabase/middleware";
import { WORK_PATH } from "@/lib/strategy/positioning/continue";
import { STOPPED_MESSAGE } from "@/lib/strategy/positioning/run";

const SECRET = "http-chain-secret";
const realFetch = globalThis.fetch;
let server: http.Server;
let origin: string;
/** What reached the server over the wire. */
let received: { path: string; auth: string | undefined; status: number }[];
/** Set to make the "deployment" redirect everything, as the middleware once did. */
let redirectEverything = false;

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString();
    let status: number;
    let text: string;
    let location: string | undefined;
    // The middleware's decision for a request with no session cookie.
    if (redirectEverything || !isPublicPath(url.pathname)) {
      if (url.pathname === "/auth/login") [status, text] = [200, "<html>login</html>"];
      else [status, text, location] = [307, "", "/auth/login"];
    } else if (url.pathname === WORK_PATH && req.method === "POST") {
      const r = await workPost(new Request(`${origin}${url.pathname}`, { method: "POST", headers: req.headers as any, body }));
      [status, text] = [r.status, await r.text()];
    } else {
      [status, text] = [404, ""];
    }
    received.push({ path: url.pathname, auth: req.headers.authorization, status });
    res.writeHead(status, location ? { location } : { "content-type": "application/json" });
    res.end(text);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const reply = (content: any[]) => new Response(JSON.stringify({ content, usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  received = [];
  redirectEverything = false;
  pending.length = 0;
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur" }],
    competitor_watches: [{ dealership_id: "d1", competitor_name: "Wick & Co" }],
    competitor_dismissed: [],
    competitor_owner_ads: [],
    business_knowledge: [{ dealership_id: "d1", is_active: true, category: "business_story", title: "Materials", content: "Soy wax." }],
    competitor_positioning: [],
  };
  // Anthropic is faked; everything else — the hand-overs — is real HTTP.
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    const href = String(url);
    if (!href.startsWith("https://api.anthropic.com")) return realFetch(url, init);
    const prompt = String(JSON.parse(init.body).messages?.[0]?.content ?? "");
    if (prompt.startsWith("Find up to")) return reply([{ type: "text", text: '{"competitors":[]}' }]);
    if (prompt.includes('"Wick & Co"')) return reply([{ type: "text", text: "x", citations: [{ type: "web_search_result_location", url: "https://wickandco.in", title: "Wick & Co", cited_text: "Candles from ₹249" }] }]);
    if (prompt.startsWith("Sort each item")) return reply([{ type: "text", text: '{"claims":{"0":["price"]},"facts":{"0":["materials"]}}' }]);
    return reply([{ type: "text", text: '{"statement":"","angles":[]}' }]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
});

/** Waits for all the deferred work, including work that more hand-overs start. */
async function settle(limit = 50) {
  for (let i = 0; i < limit; i++) {
    if (!pending.length) return;
    await pending.shift();
  }
  throw new Error("the chain never settled");
}

describe("the hand-over, over real HTTP", () => {
  it("a whole comparison: every step after the first reaches the worker over the wire, with the secret, and is accepted", async () => {
    const res = await startPost(new Request(`${origin}/api/strategy/positioning`, { method: "POST", body: JSON.stringify({ confirm: true }) }));
    expect(res.status).toBe(202);
    await settle();
    const run = tables.competitor_positioning[0];
    expect(run).toMatchObject({ status: "analysed", step_running: false });
    // find → Wick & Co → sort → write: three hand-overs, each over HTTP.
    expect(received).toEqual([
      { path: WORK_PATH, auth: `Bearer ${SECRET}`, status: 202 },
      { path: WORK_PATH, auth: `Bearer ${SECRET}`, status: 202 },
      { path: WORK_PATH, auth: `Bearer ${SECRET}`, status: 202 },
    ]);
  });

  it("a deployment that redirects the worker to login stops the run at once and visibly — never a silent stall", async () => {
    redirectEverything = true;
    await startPost(new Request(`${origin}/api/strategy/positioning`, { method: "POST", body: JSON.stringify({ confirm: true }) }));
    await settle();
    expect(received.map((r) => `${r.path}:${r.status}`)).toEqual([`${WORK_PATH}:307`, "/auth/login:200"]);
    expect(tables.competitor_positioning[0]).toMatchObject({ status: "failed", error: STOPPED_MESSAGE, step: 1 });
  });
});
