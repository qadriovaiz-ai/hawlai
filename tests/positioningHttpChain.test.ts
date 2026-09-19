// A competitor comparison over REAL HTTP (2026-09-20).
//
// Three production failures were in how a run moved from step to step:
// hand-overs redirected to /auth/login; a step outliving its invocation;
// then Vercel's 508 "Loop Detected" — each step called our own worker
// route for the next, and Vercel cuts off a deployment that keeps calling
// itself. The server no longer calls itself at all. Here a local HTTP
// server stands in for the deployment (the middleware's session rule,
// then the real routes), the test plays the page over real TCP — press
// the button, then poll — and every request the server receives is
// checked to have come from the page. Only Anthropic and the database
// are fakes.

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

import { POST as startPost, GET as lookGet } from "@/app/api/strategy/positioning/route";
import { isPublicPath } from "@/lib/supabase/middleware";
import { runTiming, RUN_FOR_MS } from "@/lib/strategy/positioning/continue";

const PAGE = "the-page";
const realFetch = globalThis.fetch;
let server: http.Server;
let origin: string;
/** Every request that reached the server: who sent it, and what it got. */
let received: { from: string; method: string; path: string; status: number }[];

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString();
    let status: number;
    let text = "";
    let location: string | undefined;
    const hasSession = String(req.headers.cookie ?? "").includes("session=1");
    // The middleware: no session and not a public path → login.
    if (!hasSession && !isPublicPath(url.pathname)) {
      [status, location] = [307, "/auth/login"];
    } else if (url.pathname === "/api/strategy/positioning") {
      const request = new Request(`${origin}${url.pathname}`, { method: req.method, headers: req.headers as any, ...(req.method === "POST" ? { body } : {}) });
      const r = req.method === "POST" ? await startPost(request) : await lookGet(request);
      [status, text] = [r.status, await r.text()];
    } else {
      status = 404;
    }
    received.push({ from: String(req.headers["x-sent-by"] ?? "the server itself"), method: req.method ?? "", path: url.pathname, status });
    res.writeHead(status, location ? { location } : { "content-type": "application/json" });
    res.end(text);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const reply = (content: any[]) => new Response(JSON.stringify({ content, usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
beforeEach(() => {
  received = [];
  pending.length = 0;
  runTiming.runForMs = RUN_FOR_MS;
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur" }],
    competitor_watches: [{ dealership_id: "d1", competitor_name: "Wick & Co" }, { dealership_id: "d1", competitor_name: "Glow" }],
    competitor_dismissed: [],
    competitor_owner_ads: [],
    business_knowledge: [{ dealership_id: "d1", is_active: true, category: "business_story", title: "Materials", content: "Soy wax." }],
    competitor_positioning: [],
  };
  // Anthropic is faked; every other request is real HTTP.
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    const href = String(url);
    if (!href.startsWith("https://api.anthropic.com")) return realFetch(url, init);
    const prompt = String(JSON.parse(init.body).messages?.[0]?.content ?? "");
    if (prompt.startsWith("Find up to")) return reply([{ type: "text", text: '{"competitors":[]}' }]);
    if (prompt.includes('"Wick & Co"')) return reply([{ type: "text", text: "x", citations: [{ type: "web_search_result_location", url: "https://wickandco.in", title: "Wick & Co", cited_text: "Candles from ₹249" }] }]);
    if (prompt.includes('"Glow"')) return reply([{ type: "text", text: "x", citations: [{ type: "web_search_result_location", url: "https://glow.in", title: "Glow", cited_text: "Glow candles, handmade" }] }]);
    if (prompt.startsWith("Sort each item")) return reply([{ type: "text", text: '{"claims":{"0":["price"],"1":["handmade"]},"facts":{"0":["materials"]}}' }]);
    return reply([{ type: "text", text: '{"statement":"","angles":[]}' }]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  runTiming.runForMs = RUN_FOR_MS;
});

/** The page, over real HTTP, with the owner's session. */
function page(method: "GET" | "POST", body?: any) {
  return realFetch(`${origin}/api/strategy/positioning`, {
    method,
    headers: { cookie: "session=1", "x-sent-by": PAGE, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Waits for the deferred work the requests started. */
async function settle(limit = 50) {
  for (let i = 0; i < limit; i++) {
    if (!pending.length) return;
    await pending.shift();
  }
  throw new Error("the work never settled");
}

describe("a comparison over real HTTP", () => {
  it("press the button, and the whole run finishes — the server never sends a request to itself", async () => {
    const res = await page("POST", { confirm: true });
    expect(res.status).toBe(202);
    await settle();
    expect(tables.competitor_positioning[0]).toMatchObject({ status: "analysed", step_running: false });
    // One request reached the server, and the page sent it.
    expect(received).toEqual([{ from: PAGE, method: "POST", path: "/api/strategy/positioning", status: 202 }]);
    const look = await (await page("GET")).json();
    expect(look.run.competitors.map((c: any) => c.name)).toEqual(["Wick & Co", "Glow"]);
  });

  it("an invocation that pauses after every step: the page's polling carries the run to the end — still no request from the server to itself", async () => {
    runTiming.runForMs = 0;
    await page("POST", { confirm: true });
    await settle();
    const run = tables.competitor_positioning[0];
    let polls = 0;
    while (run.status === "running" && polls < 10) {
      run.updated_at = new Date(Date.now() - 6_000).toISOString(); // the page's next look, a few seconds on
      const look = await page("GET");
      expect(look.status).toBe(200);
      await settle();
      polls++;
    }
    // find, Wick & Co, Glow, sort, write: the button's invocation did one, four polls the rest.
    expect(polls).toBe(4);
    expect(run.status).toBe("analysed");
    expect(received.every((r) => r.from === PAGE)).toBe(true);
    expect(received.map((r) => `${r.method} ${r.status}`)).toEqual(["POST 202", "GET 200", "GET 200", "GET 200", "GET 200"]);
  });

  it("without a session the page's request is sent to login — the middleware still guards the routes", async () => {
    const res = await realFetch(`${origin}/api/strategy/positioning`, { method: "POST", redirect: "manual", body: "{}" });
    expect(res.status).toBe(307);
    expect(tables.competitor_positioning).toEqual([]);
  });
});
