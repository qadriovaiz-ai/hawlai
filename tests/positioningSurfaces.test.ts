// Where positioning shows up (Advanced Strategy step 3, 2026-09-19): the
// Strategy page's routes, pasted ads, removing a found competitor, the chat
// tool, and deep strategy — which used to search Meta's Ad Library API and
// so always wrote its competitor section with no data.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let deleted: { table: string; filters: string[] }[];
let gateAllowed = true;
let creditsLeft = true;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const described: string[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert" || op === "upsert") {
        const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, created_at: "2026-09-19T10:00:00Z", ...payload };
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const touched = rows();
        for (const r of touched) Object.assign(r, payload);
        return { data: single ? touched[0] ?? null : touched, error: null };
      }
      if (op === "delete") {
        deleted.push({ table, filters: described });
        tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
        return { data: null, error: null };
      }
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, in: () => api, gte: () => api, not: () => api, is: () => api, lt: () => api, or: () => api, neq: () => api,
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      upsert: (v: any) => ((op = "upsert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      delete: () => ((op = "delete"), api),
      eq: (k: string, v: any) => (filters.push((r) => !(k in r) || r[k] === v), described.push(`${k}=${v}`), api),
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

// after() only works inside a real request; here the work it defers is
// queued and run by drain(), the way Vercel runs it once the answer is sent.
const pending: (() => Promise<unknown> | unknown)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void pending.push(fn) }));
async function drain(limit = 30) {
  for (let i = 0; i < limit && pending.length; i++) await pending.shift()!();
  if (pending.length) throw new Error("the run never finished");
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));
vi.mock("@/lib/featureGate", () => ({
  requireFeature: async () => (gateAllowed ? { allowed: true } : { allowed: false, response: new Response(JSON.stringify({ error: "Competitor comparison is on the Pro plan." }), { status: 403 }) }),
}));
vi.mock("@/lib/usage/usageGuard", () => ({ checkUsage: async () => (creditsLeft ? { allowed: true } : { allowed: false, message: "You've used this month's research credits." }) }));

import { POST as positioningPost, GET as positioningGet } from "@/app/api/strategy/positioning/route";
import { POST as workPost } from "@/app/api/strategy/positioning/work/route";
import { STALE_AFTER_MS, STOPPED_MESSAGE } from "@/lib/strategy/positioning/run";
import { POST as adPost, DELETE as adDelete } from "@/app/api/strategy/positioning/ads/route";
import { POST as dismissPost } from "@/app/api/strategy/positioning/dismiss/route";
import { GET as deepGet } from "@/app/api/strategy/deep/route";
import { executeTool, TOOLS } from "@/lib/agents/masterBrainV2";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const OUTAGE = "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.";
const CREDITS = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };
const req = (url: string, body?: any, method = body ? "POST" : "GET") => new Request(`https://hawlai.test${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

const ANALYSED = {
  id: "run-1",
  dealership_id: "d1",
  status: "analysed",
  created_at: "2026-09-19T10:00:00Z",
  competitors: [{ name: "Wick & Co", source: "watched", claimCount: 2 }, { name: "Moonlit Candles", source: "found", claimCount: 1 }],
  claims: [],
  analysis: {
    positioning: {
      competitorCount: 2,
      rows: [
        { key: "price", label: "Price and value", claimedBy: ["Wick & Co", "Moonlit Candles"], examples: [{ competitor: "Wick & Co", quote: "Candles from ₹249", url: "https://wickandco.in" }], yourFacts: [], standing: "crowded" },
        { key: "materials", label: "Materials and quality", claimedBy: [], examples: [], yourFacts: ["Materials and suppliers"], standing: "open" },
      ],
      whiteSpace: ["materials"],
      crowdedYouHave: [],
      openUnbacked: [],
    },
    advice: { statement: "Candles that say what they're made of.", angles: [{ theme: "materials", title: "Name your wax", why: "None of the 2 competitors mention materials." }], removed: [] },
    adviceError: null,
  },
};

function anthropic(route: (prompt: string) => { status: number; body: any }) {
  const urls: string[] = [];
  const prompts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    urls.push(String(url));
    const body = init?.body ? JSON.parse(init.body) : {};
    const prompt = String(body.messages?.[0]?.content ?? "");
    prompts.push(prompt);
    const r = route(prompt);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
  return { urls, prompts };
}

beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur", fb_page_access_token: "tok" }],
  };
  deleted = [];
  gateAllowed = true;
  creditsLeft = true;
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Strategy page's routes — a run in the background", () => {
  const SECRET = "test-cron-secret";
  let handOvers: { url: string; auth: string | null }[];

  /** Anthropic by prompt, plus the server calling its own worker route to carry a run on. */
  function serve(route: (prompt: string) => { status: number; body: any }, workerStatus?: number) {
    handOvers = [];
    vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
      const href = String(url);
      if (href.includes("/api/strategy/positioning/work")) {
        handOvers.push({ url: href, auth: init?.headers?.Authorization ?? null });
        if (workerStatus) return new Response("{}", { status: workerStatus });
        return workPost(new Request(href, init));
      }
      const body = init?.body ? JSON.parse(init.body) : {};
      const r = route(String(body.messages?.[0]?.content ?? ""));
      return new Response(JSON.stringify(r.body), { status: r.status });
    }));
  }

  const web = (quote: string, url: string, title: string) => ({ status: 200, body: { content: [{ type: "text", text: "x", citations: [{ type: "web_search_result_location", url, title, encrypted_index: "e", cited_text: quote }] }], usage: { input_tokens: 1, output_tokens: 1 } } });
  const text = (t: string) => ({ status: 200, body: { content: [{ type: "text", text: t }], usage: { input_tokens: 1, output_tokens: 1 } } });
  const route = (prompt: string) => {
    if (prompt.startsWith("Find up to")) return text('{"competitors":[]}');
    if (prompt.includes('"Wick & Co"')) return web("Candles from ₹249", "https://wickandco.in", "Wick & Co");
    if (prompt.startsWith("Sort each item")) return text('{"claims":{"0":["price"]},"facts":{}}');
    if (prompt.startsWith("You are positioning")) return text('{"statement":"","angles":[]}');
    return text("{}");
  };

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    pending.length = 0;
    tables.competitor_watches = [{ dealership_id: "d1", competitor_name: "Wick & Co" }];
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("the button answers at once (202) — the searches happen after, not inside the request", async () => {
    serve(route);
    const res = await positioningPost(req("/api/strategy/positioning", {}));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ state: "running" });
    expect(tables.competitor_positioning[0]).toMatchObject({ dealership_id: "d1", status: "running", step: 0 });
    // Nothing has searched yet: that's the deferred work.
    expect((globalThis.fetch as any).mock.calls).toHaveLength(0);
    expect(pending).toHaveLength(1);
  });

  it("a whole comparison, step by step through the worker route, each hand-over carrying the server's secret", async () => {
    serve(route);
    await positioningPost(req("/api/strategy/positioning", {}));
    await drain();
    const run = tables.competitor_positioning[0];
    expect(run.status).toBe("analysed");
    // find → Wick & Co → sort → write: four steps, three hand-overs.
    expect(handOvers).toHaveLength(3);
    expect(handOvers.every((h) => h.auth === `Bearer ${SECRET}`)).toBe(true);
    const body = await (await positioningGet()).json();
    expect(body.run.id).toBe(run.id);
    expect(body.current).toBeNull();
  });

  it("the worker only takes steps for the server itself", async () => {
    serve(route);
    const res = await workPost(new Request("https://hawlai.test/api/strategy/positioning/work", { method: "POST", body: JSON.stringify({ id: "x" }) }));
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });

  it("a hand-over that isn't accepted stops the run visibly — it never spins", async () => {
    serve(route, 500);
    await positioningPost(req("/api/strategy/positioning", {}));
    await drain();
    expect(tables.competitor_positioning[0]).toMatchObject({ status: "failed", error: STOPPED_MESSAGE });
  });

  it("while it runs, GET says what it's doing; a run that stopped moving is shown — and recorded — as stopped", async () => {
    const now = Date.now();
    tables.competitor_positioning = [{ id: "r1", dealership_id: "d1", status: "running", step: 1, step_running: false, competitors: [{ name: "Wick & Co", claimCount: 0 }], claims: [], analysis: {}, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }];
    let body = await (await positioningGet()).json();
    expect(body.current).toMatchObject({ id: "r1", state: "running", label: "Reading what Wick & Co says about itself (1 of 1)..." });

    tables.competitor_positioning[0].updated_at = new Date(now - STALE_AFTER_MS - 5_000).toISOString();
    body = await (await positioningGet()).json();
    expect(body.current).toMatchObject({ state: "failed", error: STOPPED_MESSAGE });
    expect(tables.competitor_positioning[0].status).toBe("failed");
  });

  it("pressing twice while it runs starts no second set of searches", async () => {
    serve(route);
    await positioningPost(req("/api/strategy/positioning", {}));
    const second = await positioningPost(req("/api/strategy/positioning", {}));
    expect(second.status).toBe(202);
    expect(tables.competitor_positioning).toHaveLength(1);
    expect(pending).toHaveLength(1);
  });

  it("credits out: the run fails with the approved reason, and the page is told on its next look", async () => {
    serve(() => CREDITS);
    await positioningPost(req("/api/strategy/positioning", {}));
    await drain();
    const body = await (await positioningGet()).json();
    expect(body.current).toMatchObject({ state: "failed", error: OUTAGE });
  });

  it("gated like Competitor Intelligence, and charged to Research Credits — before anything starts", async () => {
    gateAllowed = false;
    expect((await positioningPost(req("/api/strategy/positioning", {}))).status).toBe(403);
    gateAllowed = true;
    creditsLeft = false;
    const res = await positioningPost(req("/api/strategy/positioning", {}));
    expect(res.status).toBe(429);
    expect((await res.json()).limitReached).toBe(true);
    expect(tables.competitor_positioning ?? []).toEqual([]);
  });

  it("GET returns this business's latest finished run and pasted ads", async () => {
    tables.competitor_positioning = [ANALYSED, { ...ANALYSED, id: "run-other", dealership_id: "d2" }];
    tables.competitor_owner_ads = [{ id: "ad1", dealership_id: "d1", competitor_name: "Aroma Hut", ad_text: "Diwali sale — 40% off" }];
    const body = await (await positioningGet()).json();
    expect(body.run.id).toBe("run-1");
    expect(body.current).toBeNull();
    expect(body.ownerAds.map((a: any) => a.id)).toEqual(["ad1"]);
  });
});

describe("the page", () => {
  it("polls while a run is moving, and says it runs in the background", async () => {
    const { readFileSync } = await import("node:fs");
    const panel = readFileSync("src/components/strategy/PositioningPanel.tsx", "utf8");
    expect(panel).toContain("setTimeout(() => void load(), POLL_MS)");
    expect(panel).toContain("It runs in the background — you can leave this page and come back.");
    expect(panel).not.toMatch(/step: "collect"|step: "analyse"/);
  });
});

describe("ads the owner pasted in", () => {
  it("saved for this business, as written", async () => {
    const res = await adPost(req("/api/strategy/positioning/ads", { competitorName: "  Aroma   Hut ", adText: "Diwali sale —   40% off all candles" }));
    expect(res.status).toBe(200);
    expect(tables.competitor_owner_ads[0]).toMatchObject({ dealership_id: "d1", competitor_name: "Aroma Hut", ad_text: "Diwali sale — 40% off all candles" });
  });

  it("a name and at least a sentence are needed; not an essay", async () => {
    expect((await adPost(req("/api/strategy/positioning/ads", { competitorName: "", adText: "Diwali sale on now" }))).status).toBe(400);
    expect((await adPost(req("/api/strategy/positioning/ads", { competitorName: "Aroma Hut", adText: "sale" }))).status).toBe(400);
    expect((await adPost(req("/api/strategy/positioning/ads", { competitorName: "Aroma Hut", adText: "x".repeat(2001) }))).status).toBe(400);
  });

  it("removing one is scoped to this business", async () => {
    tables.competitor_owner_ads = [{ id: "ad1", dealership_id: "d1", competitor_name: "A", ad_text: "an ad" }];
    await adDelete(req("/api/strategy/positioning/ads?id=ad1", undefined, "DELETE"));
    expect(deleted[0].filters).toEqual(["id=ad1", "dealership_id=d1"]);
  });
});

describe("removing a competitor Hawlai found", () => {
  it("remembered for this business, so it's never used again", async () => {
    const res = await dismissPost(req("/api/strategy/positioning/dismiss", { competitorName: "Moonlit Candles" }));
    expect(await res.json()).toMatchObject({ dismissed: "Moonlit Candles" });
    expect(tables.competitor_dismissed[0]).toMatchObject({ dealership_id: "d1", competitor_name: "Moonlit Candles" });
  });
});

describe("the chat", () => {
  const ctx: any = { id: "d1", name: "Candle by Qaaf", category: "Home fragrance" };

  it("with no comparison yet, it sends them to run one — and never describes competitors itself", async () => {
    const r = await executeTool(db(), ctx, "competitor_positioning", {}, "");
    expect(r.none).toBe(true);
    expect(r.note).toMatch(/Strategy page .* "Compare with competitors"/);
    expect(r.note).toMatch(/Don't describe competitors from your own knowledge/);
  });

  it("with one, it quotes the counted table and the checked advice", async () => {
    tables.competitor_positioning = [ANALYSED];
    const r = await executeTool(db(), ctx, "competitor_positioning", {}, "");
    expect(r.themes[0]).toMatchObject({ theme: "Price and value", standing: "crowded", competitorsSayingIt: "2 of 2", who: ["Wick & Co", "Moonlit Candles"] });
    expect(r.angles).toEqual([{ theme: "materials", title: "Name your wax", why: "None of the 2 competitors mention materials." }]);
    expect((TOOLS as any[]).some((t) => t.name === "competitor_positioning")).toBe(true);
  });
});

describe("deep strategy", () => {
  const strategyJson = JSON.stringify({ businessAnalysis: "a", productAnalysis: "b", competitorAnalysis: "c", targetAudience: { ageRange: "25-45", income: "mid", description: "d" }, pricingStrategy: "e", positioningStatement: "f", usp: "g", swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, marketGaps: [], personas: [], quarterlyPlan: [], annualGrowthPlan: "h" });

  it("writes its competitor section from the latest comparison — and never calls the Ad Library API", async () => {
    tables.competitor_positioning = [ANALYSED];
    const { urls, prompts } = anthropic(() => ({ status: 200, body: { content: [{ type: "text", text: strategyJson }], usage: { input_tokens: 1, output_tokens: 1 } } }));
    const res = await deepGet(req("/api/strategy/deep?regenerate=true"));
    expect(res.status).toBe(200);
    expect(urls.some((u) => u.includes("graph.facebook.com"))).toBe(false);
    expect(prompts[0]).toContain("Known competitor activity: From competitors' own public pages, counted by Hawlai — Price and value: 2 of 2 (Wick & Co, Moonlit Candles)");
  });

  it("with no comparison, it says so and points to it — never invents competitors", async () => {
    const { prompts } = anthropic(() => ({ status: 200, body: { content: [{ type: "text", text: strategyJson }], usage: { input_tokens: 1, output_tokens: 1 } } }));
    await deepGet(req("/api/strategy/deep?regenerate=true"));
    expect(prompts[0]).toMatch(/No competitor data available — say so honestly, suggest running "Compare with competitors" on the Strategy page, and never invent competitors/);
  });
});
