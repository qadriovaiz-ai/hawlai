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
        for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
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

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));
vi.mock("@/lib/featureGate", () => ({
  requireFeature: async () => (gateAllowed ? { allowed: true } : { allowed: false, response: new Response(JSON.stringify({ error: "Competitor comparison is on the Pro plan." }), { status: 403 }) }),
}));
vi.mock("@/lib/usage/usageGuard", () => ({ checkUsage: async () => (creditsLeft ? { allowed: true } : { allowed: false, message: "You've used this month's research credits." }) }));

import { POST as positioningPost, GET as positioningGet } from "@/app/api/strategy/positioning/route";
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

describe("the Strategy page's routes", () => {
  it("credits out while collecting: 503 with the approved words, nothing saved", async () => {
    anthropic(() => CREDITS);
    const res = await positioningPost(req("/api/strategy/positioning", { step: "collect" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: OUTAGE, aiFailure: "credits" });
    expect(tables.competitor_positioning ?? []).toEqual([]);
  });

  it("gated like Competitor Intelligence, and charged to Research Credits", async () => {
    gateAllowed = false;
    expect((await positioningPost(req("/api/strategy/positioning", { step: "collect" }))).status).toBe(403);
    gateAllowed = true;
    creditsLeft = false;
    const res = await positioningPost(req("/api/strategy/positioning", { step: "collect" }));
    expect(res.status).toBe(429);
    expect((await res.json()).limitReached).toBe(true);
  });

  it("analysing someone else's run — or no run — is refused", async () => {
    tables.competitor_positioning = [{ id: "theirs", dealership_id: "d2", competitors: [], claims: [] }];
    expect((await positioningPost(req("/api/strategy/positioning", { step: "analyse", id: "theirs" }))).status).toBe(404);
    expect((await positioningPost(req("/api/strategy/positioning", { step: "analyse" }))).status).toBe(400);
  });

  it("GET returns this business's latest finished run and pasted ads", async () => {
    tables.competitor_positioning = [ANALYSED, { ...ANALYSED, id: "run-other", dealership_id: "d2" }];
    tables.competitor_owner_ads = [{ id: "ad1", dealership_id: "d1", competitor_name: "Aroma Hut", ad_text: "Diwali sale — 40% off" }];
    const body = await (await positioningGet()).json();
    expect(body.run.id).toBe("run-1");
    expect(body.ownerAds.map((a: any) => a.id)).toEqual(["ad1"]);
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
