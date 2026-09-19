// Advanced Strategy step 3: positioning against what competitors actually
// say in public (approved 2026-09-19).
//
// THE LIVE CHECK: the Research page's Ad Library search answered
// "Application does not have permission for this action" — Meta's Ad
// Library API returns only political/issue ads outside the EU. Competitor
// messaging now comes from their own public pages (web search, every claim
// a verbatim quoted snippet with its link) and ads the owner pastes in.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const credits: number[] = [];
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async (_d: string, inr: number) => { credits.push(inr); } }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    let sort: [string, boolean] | null = null;
    const rows = () => {
      const out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (!sort) return out;
      const [k, asc] = sort;
      return [...out].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * (asc ? 1 : -1));
    };
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...payload };
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
      select: () => api, order: (k: string, o?: { ascending?: boolean }) => ((sort = [k, o?.ascending !== false]), api), limit: () => api, in: () => api, gte: () => api, not: () => api, is: () => api, lt: () => api, or: () => api, neq: () => api,
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      eq: (k: string, v: any) => (filters.push((r) => !(k in r) || r[k] === v), api),
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

import { citationsOf, mentions, discoverCompetitors, collectClaims, mergeCompetitors, ownerAdClaim } from "@/lib/strategy/positioning/collect";
import { buildPositioning, classifyThemes, unallowedNumbers, verifyPositioning, allowedNumbers, ownFactsFrom, formatPositioningForPrompt } from "@/lib/strategy/positioning/analysis";
import { themesFor, THEMES } from "@/lib/strategy/positioning/themes";
import { startPositioning, advancePositioning, describeRun, newestRun, competitorContextFrom, latestPositioning, STALE_AFTER_MS, STOPPED_MESSAGE } from "@/lib/strategy/positioning/run";
import { resetOperatorAlerts, callClaude } from "@/lib/ai/claude";
import { planRun, estimateView, RUN_CEILING_INR, ALREADY_RAN_TODAY, TOO_MANY_TRIES_TODAY } from "@/lib/strategy/positioning/budget";
import { SEARCH_TIMEOUT_MS } from "@/lib/strategy/positioning/collect";
import { ANALYSIS_TIMEOUT_MS } from "@/lib/strategy/positioning/analysis";
import { DEFAULT_CLAUDE_RETRY_TIMING } from "@/lib/ai/claude";
import { CONTINUE_AFTER_MS, RUN_FOR_MS } from "@/lib/strategy/positioning/continue";
import { getModel } from "@/lib/models";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const OUTAGE = "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.";
const CREDITS = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };

/** A web-search reply: prose blocks carrying citations, then optional trailing text. */
function webReply(cited: { text: string; url: string; title: string; quote: string }[], tail = "") {
  return {
    status: 200,
    body: {
      content: [
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
        ...cited.map((c) => ({ type: "text", text: c.text, citations: [{ type: "web_search_result_location", url: c.url, title: c.title, encrypted_index: "x", cited_text: c.quote }] })),
        ...(tail ? [{ type: "text", text: tail }] : []),
      ],
      usage: { input_tokens: 1000, output_tokens: 200 },
    },
  };
}
const textReply = (text: string) => ({ status: 200, body: { content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } } });

/** Anthropic answering by what's asked: each request is matched to a reply. */
function anthropic(route: (prompt: string, body: any) => { status: number; body: any }) {
  const prompts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    const prompt = String(body.messages?.[0]?.content ?? "");
    prompts.push(prompt);
    const r = route(prompt, body);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
  return prompts;
}

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: [{ id: "p1", name: "Lavender candle", kind: "product", price: 550, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [{ category: "business_story", title: "Materials and suppliers", content: "Soy wax from a Kanpur supplier; I rejected paraffin. Each candle sets for 24 hours." }],
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null },
    season: { current: null, upcoming: [] } as any,
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

beforeEach(() => {
  credits.length = 0;
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a competitor claim is a verbatim quote from a page about that competitor", () => {
  it("reads every web-search citation once, and nothing else", () => {
    const reply = webReply([
      { text: "Wick & Co sells soy candles.", url: "https://wickandco.in", title: "Wick & Co", quote: "Handmade soy candles, free shipping above ₹999" },
      { text: "Again.", url: "https://wickandco.in", title: "Wick & Co", quote: "Handmade soy candles, free shipping above ₹999" },
    ]).body;
    reply.content.push({ type: "text", text: "uncited", citations: [{ type: "char_location", cited_text: "not web" }] } as any);
    expect(citationsOf(reply)).toEqual([{ url: "https://wickandco.in", title: "Wick & Co", quote: "Handmade soy candles, free shipping above ₹999" }]);
  });

  it("knows a page is about a business by its distinctive words, not its category", () => {
    const cat = ["home", "fragrance", "candle", "candles"];
    expect(mentions("Candle by Qaaf", "https://www.candlebyqaaf.com/shop", cat)).toBe(true);
    expect(mentions("Wick & Co", "Wick & Co — Instagram", cat)).toBe(true);
    // Sharing only the category word isn't the same business.
    expect(mentions("Candle by Qaaf", "Best candle brands in India 2026", cat)).toBe(false);
    expect(mentions("Moonlit Candles", "Moonlit Candles | Handmade in Pune", cat)).toBe(true);
    expect(mentions("Moonlit Candles", "Handmade candles in Pune", cat)).toBe(false);
    // The category word in a name isn't required to match: "Wick Candles" is Wick's page.
    expect(mentions("Wick Candles", "Wick — hand-poured soy wax", cat)).toBe(true);
  });

  it("discovery keeps only competitors a cited page names — never the business itself or one the owner removed", async () => {
    const prompts = anthropic(() =>
      webReply(
        [
          { text: "Moonlit Candles sells soy candles in Pune.", url: "https://moonlit.in", title: "Moonlit Candles", quote: "Moonlit Candles — small-batch soy candles" },
          { text: "Aroma Hut is a Lucknow store.", url: "https://aromahut.in", title: "Aroma Hut", quote: "Aroma Hut Lucknow" },
          // Pages naming the business itself and one the owner removed — both must still be left out.
          { text: "Candle by Qaaf sells candles.", url: "https://candlebyqaaf.com", title: "Candle by Qaaf", quote: "Candle by Qaaf soy candles" },
          { text: "Old Rival sells candles.", url: "https://oldrival.in", title: "Old Rival", quote: "Old Rival candles" },
        ],
        '{"competitors":[{"name":"Moonlit Candles","url":"https://moonlit.in"},{"name":"Invented Scents","url":"https://nowhere.in"},{"name":"Aroma Hut"},{"name":"Candle by Qaaf"},{"name":"Old Rival"}]}'
      )
    );
    const r = await discoverCompetitors({ businessName: "Candle by Qaaf", category: "Home fragrance", city: "Shahjahanpur", exclude: ["Old Rival"], want: 4 });
    expect(r.found).toEqual([
      { name: "Moonlit Candles", source: "found", url: "https://moonlit.in" },
      { name: "Aroma Hut", source: "found", url: null },
    ]);
    expect(prompts[0]).toMatch(/first write one sentence naming it, citing the page/);
  });

  it("claims: only quotes from pages about that competitor (or its own site) are kept", async () => {
    anthropic(() =>
      webReply([
        { text: "Their site says…", url: "https://moonlit.in/about", title: "About us", quote: "Every candle is poured in small batches of 12" },
        { text: "Instagram…", url: "https://instagram.com/moonlitcandles", title: "Moonlit Candles (@moonlitcandles)", quote: "Free delivery across India" },
        { text: "A listicle…", url: "https://blog.example/best-candles", title: "10 best candle brands", quote: "Scented candles make great gifts" },
      ])
    );
    const r = await collectClaims({ name: "Moonlit Candles", source: "found", url: "https://moonlit.in" }, { category: "Home fragrance", city: null }, { supabase: {}, dealershipId: "d1" });
    expect(r.claims.map((c) => c.quote)).toEqual(["Every candle is poured in small batches of 12", "Free delivery across India"]);
    expect(r.claims[0]).toMatchObject({ competitor: "Moonlit Candles", origin: "web", url: "https://moonlit.in/about" });
    expect(credits).toHaveLength(1);
  });

  it("an AI outage comes back as the failure, with no claims", async () => {
    anthropic(() => CREDITS);
    expect(await collectClaims({ name: "Moonlit Candles", source: "found" }, { category: "Home fragrance", city: null })).toMatchObject({ claims: [], failure: { kind: "credits" } });
  });

  it("an ad the owner pasted in is their own record, kept as written", () => {
    expect(ownerAdClaim({ competitor_name: "Aroma Hut", ad_text: "Diwali   sale — 40% off all  candles" })).toEqual({ competitor: "Aroma Hut", quote: "Diwali sale — 40% off all candles", url: null, title: "Ad you saw", origin: "owner" });
  });

  it("the list: watched first, then ones with a pasted ad, then found ones — five at most, each once", () => {
    const found = ["A1", "A2", "A3", "A4"].map((name) => ({ name, source: "found" as const }));
    expect(mergeCompetitors(["Wick & Co"], ["Aroma Hut", "wick & co"], found).map((c) => `${c.source}:${c.name}`)).toEqual(["watched:Wick & Co", "owner_ad:Aroma Hut", "found:A1", "found:A2", "found:A3"]);
  });
});

describe("themes depend on how the business makes money", () => {
  it("products and services compare on different ground; a mixed business gets both, once each", () => {
    expect(themesFor(["products"]).map((t) => t.key)).toContain("materials");
    expect(themesFor(["services"]).map((t) => t.key)).toContain("expertise");
    expect(themesFor(["services"]).map((t) => t.key)).not.toContain("materials");
    const both = themesFor(["products", "services"]).map((t) => t.key);
    expect(new Set(both).size).toBe(both.length);
    expect(both.length).toBe(THEMES.products.length + THEMES.services.length);
    expect(themesFor(null)).toEqual(THEMES.products);
  });
});

describe("code counts; the model only sorts", () => {
  const themes = themesFor(["products"]);
  const competitors = ["Moonlit Candles", "Aroma Hut", "Wick & Co", "Glow Co"];
  const claims = [
    { competitor: "Moonlit Candles", quote: "Candles from ₹299", url: "https://m", title: null, origin: "web" as const },
    { competitor: "Aroma Hut", quote: "Lowest prices in Lucknow", url: "https://a", title: null, origin: "web" as const },
    { competitor: "Wick & Co", quote: "Budget-friendly candles", url: "https://w", title: null, origin: "web" as const },
    { competitor: "Glow Co", quote: "Free shipping on all orders", url: "https://g", title: null, origin: "web" as const },
    { competitor: "Aroma Hut", quote: "Another price line", url: "https://a2", title: null, origin: "web" as const },
  ];
  const own = ownFactsFrom(facts());

  it("the business's own facts: story, catalogue with prices, shipping", () => {
    expect(own.map((f) => f.label)).toEqual(["Materials and suppliers", "Product: Lavender candle", "Shipping"]);
    expect(own[1].text).toBe("₹550 — Hand-poured soy wax");
    expect(own[2].text).toBe("₹60 shipping");
  });

  it("sorting: only real theme keys, only the items asked about, at most two each", async () => {
    anthropic(() => textReply('{"claims":{"0":["price","made_up"],"1":["price"],"9":["price"]},"facts":{"0":["materials","handmade","delivery"]}}'));
    const r = await classifyThemes(claims.slice(0, 2), own.slice(0, 1), themes);
    expect(r).toEqual({ ok: true, claimThemes: [["price"], ["price"]], factThemes: [["materials", "handmade"]], costInr: expect.any(Number) });
  });

  it("crowded, contested and open are counted per competitor — not per quote — and white space needs a fact of your own", () => {
    const claimThemes = [["price"], ["price"], ["price"], ["delivery"], ["price"]];
    const factThemes = [["materials", "handmade"], ["materials"], ["delivery"]];
    const p = buildPositioning(competitors, claims, claimThemes, own, factThemes, themes);
    const row = (k: string) => p.rows.find((r) => r.key === k)!;
    expect(row("price")).toMatchObject({ claimedBy: ["Moonlit Candles", "Aroma Hut", "Wick & Co"], standing: "crowded", yourFacts: [] });
    expect(row("price").examples).toHaveLength(2);
    expect(row("delivery")).toMatchObject({ claimedBy: ["Glow Co"], standing: "open", yourFacts: ["Shipping"] });
    expect(row("materials")).toMatchObject({ claimedBy: [], standing: "open", yourFacts: ["Materials and suppliers", "Product: Lavender candle"] });
    expect(p.whiteSpace).toEqual(["materials", "handmade", "delivery"]);
    expect(p.crowdedYouHave).toEqual([]);
    expect(p.openUnbacked).toEqual(["offers", "gifting", "range"]);
  });

  it("with only two competitors, one claiming a theme makes it contested, not open", () => {
    const p = buildPositioning(["A", "B"], [{ competitor: "A", quote: "q", url: null, title: null, origin: "web" }], [["price"]], [], [], themes);
    expect(p.rows.find((r) => r.key === "price")!.standing).toBe("contested");
  });

  it("the table the model writes from says the counts in plain words", () => {
    const p = buildPositioning(competitors, claims, [["price"], ["price"], ["price"], ["delivery"], []], own, [["materials"], [], []], themes);
    const text = formatPositioningForPrompt(p, own);
    expect(text).toContain('[price] Price and value — CROWDED: 3 of 4 competitors say this (e.g. Moonlit Candles: "Candles from ₹299")');
    expect(text).toContain("[materials] Materials and quality — OPEN: none of the 4 competitors say this; this business has: Materials and suppliers.");
  });
});

describe("the written advice keeps only what the table and the facts back up", () => {
  const themes = themesFor(["products"]);
  const own = ownFactsFrom(facts());
  const p = buildPositioning(["M", "A", "W", "G"], [
    { competitor: "M", quote: "from ₹299", url: null, title: null, origin: "web" },
    { competitor: "A", quote: "cheap", url: null, title: null, origin: "web" },
    { competitor: "W", quote: "budget", url: null, title: null, origin: "web" },
  ], [["price"], ["price"], ["price"]], own, [["materials"], ["materials"], []], themes);

  it("numbers: counts, real prices and the owner's own figures only", () => {
    const allowed = allowedNumbers(p, facts());
    expect(unallowedNumbers("3 of 4 competitors lead with price; yours is ₹550 and sets for 24 hours", allowed)).toEqual([]);
    expect(unallowedNumbers("Customers are 40% more likely to buy", allowed)).toEqual(["40%"]);
    expect(unallowedNumbers("rated by 500 happy customers", allowed)).toEqual(["500"]);
    expect(unallowedNumbers("since 2019", allowed)).toEqual([]);
  });

  it("an angle on ground the business has nothing for, an invented number, or an unverified claim is dropped — and the owner is told", () => {
    const advice = verifyPositioning({
      statement: "The only candles in Shahjahanpur that tell you where the wax comes from.",
      angles: [
        { theme: "materials", title: "Say where the wax comes from", why: "None of the 4 competitors mention materials; your soy wax comes from Kanpur." },
        { theme: "offers", title: "Run a Diwali sale", why: "Offer 20% off." },
        { theme: "materials", title: "Trusted by thousands", why: "Loved by 500 customers." },
        { theme: "materials", title: "Free shipping", why: "Tell them shipping is free on every order." },
      ],
    }, p, facts());
    expect(advice.statement).toBe("The only candles in Shahjahanpur that tell you where the wax comes from.");
    expect(advice.angles.map((a) => a.title)).toEqual(["Say where the wax comes from"]);
    expect(advice.removed).toHaveLength(3);
    expect(advice.removed.join(" | ")).toMatch(/"Run a Diwali sale" — it isn't backed by anything on record/);
    expect(advice.removed.join(" | ")).toMatch(/"Trusted by thousands" — 500 isn't a number Hawlai counted/);
    expect(advice.removed.join(" | ")).toMatch(/"Free shipping" — /);
  });

  it("a positioning line with an invented figure is removed, not shown", () => {
    const advice = verifyPositioning({ statement: "Rated 4.9 by our customers.", angles: [] }, p, facts());
    expect(advice.statement).toBeNull();
    expect(advice.removed[0]).toMatch(/positioning line — 4.9 isn't a number Hawlai counted/);
  });
});

describe("a run, end to end", () => {
  beforeEach(() => {
    tables = {
      dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur" }],
      competitor_watches: [{ dealership_id: "d1", competitor_name: "Wick & Co" }],
      competitor_dismissed: [{ dealership_id: "d1", competitor_name: "Old Rival" }],
      competitor_owner_ads: [{ dealership_id: "d1", competitor_name: "Aroma Hut", ad_text: "Diwali sale — 40% off all candles this week only" }],
      business_knowledge: [{ dealership_id: "d1", is_active: true, category: "business_story", title: "Materials and suppliers", content: "Soy wax from a Kanpur supplier; I rejected paraffin." }],
      profiles: [],
    };
  });

  const route = (prompt: string) => {
    if (prompt.startsWith("Find up to")) {
      return webReply([
        { text: "Moonlit Candles sells soy candles.", url: "https://moonlit.in", title: "Moonlit Candles", quote: "Moonlit Candles small-batch soy candles" },
        { text: "Old Rival sells candles.", url: "https://oldrival.in", title: "Old Rival", quote: "Old Rival candles" },
      ], '{"competitors":[{"name":"Moonlit Candles","url":"https://moonlit.in"},{"name":"Old Rival"}]}');
    }
    if (prompt.includes('"Wick & Co"')) return webReply([{ text: "x", url: "https://wickandco.in", title: "Wick & Co", quote: "Candles from ₹249, free shipping over ₹799" }]);
    if (prompt.includes('"Aroma Hut"')) return webReply([{ text: "x", url: "https://aromahut.in", title: "Aroma Hut Lucknow", quote: "Lucknow's most affordable candles" }]);
    if (prompt.includes('"Moonlit Candles"')) return webReply([{ text: "x", url: "https://moonlit.in/shop", title: "Moonlit Candles shop", quote: "Starting at ₹299" }]);
    return textReply("{}");
  };

  /** Runs every step, one "invocation" each, as the hand-overs would; returns how many ran. */
  async function runToEnd(id: string, limit = 20) {
    let steps = 0;
    for (; steps < limit; steps++) {
      const { more } = await advancePositioning(db(), id);
      if (!more) return steps + 1;
    }
    throw new Error("the run never finished");
  }

  const sortAndWrite = (prompt: string) => {
    if (prompt.startsWith("Sort each item")) return textReply('{"claims":{"0":["offers"],"1":["price","delivery"],"2":["price"],"3":["price"]},"facts":{"0":["materials","handmade"],"1":["materials"],"2":["delivery"]}}');
    if (prompt.startsWith("You are positioning")) return textReply('{"statement":"Candles that say exactly what they are made of.","angles":[{"theme":"materials","title":"Name your wax","why":"None of the 3 competitors talk about materials; you can name your Kanpur soy wax."}]}');
    return route(prompt);
  };

  it("one step per invocation: find, one competitor at a time, sort, write — each step at most one model call", async () => {
    const prompts = anthropic(sortAndWrite);
    const started = await startPositioning(db(), "d1", { confirm: true });
    if (!started.ok) throw new Error(started.error);
    expect(tables.competitor_positioning[0]).toMatchObject({ dealership_id: "d1", status: "running", step: 0 });

    // Step 0: who to compare with — one discovery search.
    expect(await advancePositioning(db(), started.id)).toEqual({ more: true });
    expect(prompts).toHaveLength(1);
    const afterFind = tables.competitor_positioning[0];
    expect(afterFind.competitors.map((c: any) => `${c.source}:${c.name}`)).toEqual(["watched:Wick & Co", "owner_ad:Aroma Hut", "found:Moonlit Candles"]);
    // A dismissed competitor is never searched for, and never comes back.
    expect(afterFind.competitors.map((c: any) => c.name)).not.toContain("Old Rival");
    // The pasted ad is in from the start.
    expect(afterFind.claims.map((c: any) => c.quote)).toEqual(["Diwali sale — 40% off all candles this week only"]);

    // Steps 1-3: one competitor each.
    for (const name of ["Wick & Co", "Aroma Hut", "Moonlit Candles"]) {
      const before = prompts.length;
      expect(describeRun(tables.competitor_positioning[0]).label).toMatch(new RegExp(`Reading what ${name.replace("&", "\\&")} says about itself`));
      await advancePositioning(db(), started.id);
      expect(prompts.length - before).toBe(1);
      expect(prompts.at(-1)).toContain(`"${name}"`);
    }

    // Sort, then write.
    expect(await runToEnd(started.id)).toBe(2);
    const done = tables.competitor_positioning[0];
    expect(done).toMatchObject({ status: "analysed", step_running: false, error: null });
    expect(done.competitors.map((c: any) => `${c.name}:${c.claimCount}`)).toEqual(["Wick & Co:1", "Aroma Hut:2", "Moonlit Candles:1"]);
    const p = done.analysis.positioning;
    expect(p.rows.find((x: any) => x.key === "price")).toMatchObject({ claimedBy: ["Wick & Co", "Aroma Hut", "Moonlit Candles"], standing: "crowded" });
    expect(p.whiteSpace).toContain("materials");
    expect(done.analysis.advice.angles.map((a: any) => a.title)).toEqual(["Name your wax"]);

    const latest = await latestPositioning(db(), "d1");
    expect(competitorContextFrom(latest)).toMatch(/^From competitors' own public pages, counted by Hawlai — Price and value: 3 of 3 \(Wick & Co, Aroma Hut, Moonlit Candles\)/);
  });

  it("a step already claimed isn't run again — a duplicate hand-over does nothing", async () => {
    const prompts = anthropic(sortAndWrite);
    const started = await startPositioning(db(), "d1", { confirm: true });
    if (!started.ok) throw new Error(started.error);
    tables.competitor_positioning[0].step_running = true;
    expect(await advancePositioning(db(), started.id)).toEqual({ more: false });
    expect(prompts).toHaveLength(0);
    // Nor is a finished or failed run.
    tables.competitor_positioning[0] = { ...tables.competitor_positioning[0], step_running: false, status: "analysed" };
    expect(await advancePositioning(db(), started.id)).toEqual({ more: false });
    expect(prompts).toHaveLength(0);
  });

  it("pressing again while a run is moving returns that run — no second set of searches; a stalled one is replaced", async () => {
    const now = Date.now();
    const first = await startPositioning(db(), "d1", { confirm: true, now: now });
    const again = await startPositioning(db(), "d1", { confirm: true, now: now + 5_000 });
    expect(again).toEqual({ ok: true, id: (first as any).id, reused: true });
    const later = await startPositioning(db(), "d1", { confirm: true, now: now + STALE_AFTER_MS + 1_000 });
    expect(later).toMatchObject({ ok: true, reused: false });
    expect(tables.competitor_positioning).toHaveLength(2);
  });

  it("credits out while finding competitors: the run fails with the approved reason and goes no further", async () => {
    const prompts = anthropic(() => CREDITS);
    const started = await startPositioning(db(), "d1", { confirm: true });
    if (!started.ok) throw new Error(started.error);
    expect(await advancePositioning(db(), started.id)).toEqual({ more: false });
    expect(tables.competitor_positioning[0]).toMatchObject({ status: "failed", error: OUTAGE, step_running: false });
    expect(describeRun(tables.competitor_positioning[0])).toMatchObject({ state: "failed", error: OUTAGE });
    expect(prompts).toHaveLength(1);
  });

  it("one competitor too busy to read: noted, and the run carries on without it", async () => {
    anthropic((prompt) => (prompt.startsWith('Search for how "Aroma Hut"') ? { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "busy" } } } : sortAndWrite(prompt)));
    const started = await startPositioning(db(), "d1", { confirm: true });
    if (!started.ok) throw new Error(started.error);
    await runToEnd(started.id);
    const done = tables.competitor_positioning[0];
    expect(done.status).toBe("analysed");
    expect(done.analysis.notes.couldntCheck).toEqual(["Aroma Hut"]);
  });

  it("the counted table is kept even if writing the advice fails", async () => {
    anthropic((prompt) => (prompt.startsWith("You are positioning") ? CREDITS : sortAndWrite(prompt)));
    const started = await startPositioning(db(), "d1", { confirm: true });
    if (!started.ok) throw new Error(started.error);
    await runToEnd(started.id);
    const done = tables.competitor_positioning[0];
    expect(done).toMatchObject({ status: "analysed" });
    expect(done.analysis.advice).toBeNull();
    expect(done.analysis.adviceError).toBe(OUTAGE);
    expect(done.analysis.positioning.rows.length).toBeGreaterThan(0);
  });

  it("where a run stands, in words — and a run that stopped moving is stopped, not spinning", () => {
    const base = { id: "r", created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z", status: "running", competitors: [{ name: "Wick & Co" }, { name: "Glow" }] };
    const at = Date.parse("2026-09-19T10:00:30Z");
    expect(describeRun({ ...base, step: 0 }, at).label).toBe("Finding your competitors...");
    expect(describeRun({ ...base, step: 2 }, at).label).toBe("Reading what Glow says about itself (2 of 2)...");
    expect(describeRun({ ...base, step: 3 }, at).label).toBe("Sorting what they say, theme by theme...");
    expect(describeRun({ ...base, step: 4 }, at).label).toBe("Writing your positioning...");
    expect(describeRun({ ...base, step: 1 }, Date.parse(base.updated_at) + STALE_AFTER_MS + 1)).toMatchObject({ state: "failed", error: STOPPED_MESSAGE });
    expect(describeRun({ ...base, status: "failed", error: OUTAGE })).toMatchObject({ state: "failed", error: OUTAGE });
  });

  it("the newest run is this business's own", async () => {
    tables.competitor_positioning = [{ id: "theirs", dealership_id: "d2", status: "running", created_at: "2026-09-19T11:00:00Z" }];
    expect(await newestRun(db(), "d1")).toBeNull();
  });
});

describe("what a comparison costs, and what stops it costing more", () => {
  const DAY = 24 * 60 * 60 * 1000;
  // 2026-09-19 12:00 IST.
  const NOW = Date.parse("2026-09-19T06:30:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();

  beforeEach(() => {
    tables = {
      dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur" }],
      competitor_watches: [{ dealership_id: "d1", competitor_name: "Wick & Co" }],
      competitor_dismissed: [],
      competitor_owner_ads: [{ dealership_id: "d1", competitor_name: "Aroma Hut", ad_text: "Diwali sale — 40% off all candles this week only" }],
      business_knowledge: [{ dealership_id: "d1", is_active: true, category: "business_story", title: "Materials and suppliers", content: "Soy wax from a Kanpur supplier; I rejected paraffin." }],
      profiles: [],
      api_usage_logs: [],
      competitor_positioning: [],
    };
  });

  const webClaim = (competitor: string, quote: string, url = "https://x.in") => ({ competitor, quote, url, title: competitor, origin: "web" });
  /** A finished run from `daysAgo`, with found competitors and web quotes. */
  function pastRun(daysAgo: number, over: Row = {}) {
    const at = iso(NOW - daysAgo * DAY);
    const row = {
      id: `past-${daysAgo}`,
      dealership_id: "d1",
      status: "analysed",
      step: 6,
      created_at: at,
      updated_at: at,
      competitors: [
        { name: "Wick & Co", source: "watched", claimCount: 1 },
        { name: "Aroma Hut", source: "owner_ad", claimCount: 2 },
        { name: "Moonlit Candles", source: "found", url: "https://moonlit.in", claimCount: 1 },
      ],
      claims: [webClaim("Wick & Co", "Candles from ₹249"), webClaim("Aroma Hut", "Lucknow's most affordable candles"), webClaim("Moonlit Candles", "Starting at ₹299")],
      analysis: { spentInr: 20 },
      ...over,
    };
    tables.competitor_positioning.push(row);
    return row;
  }

  const sortAndWrite = (prompt: string) => {
    if (prompt.startsWith("Sort each item")) return textReply('{"claims":{"0":["price"],"1":["price"]},"facts":{"0":["materials"]}}');
    if (prompt.startsWith("You are positioning")) return textReply('{"statement":"Candles that say what they are made of.","angles":[]}');
    if (prompt.startsWith("Find up to")) {
      return webReply([{ text: "Moonlit Candles sells soy candles.", url: "https://moonlit.in", title: "Moonlit Candles", quote: "Moonlit Candles small-batch soy candles" }], '{"competitors":[{"name":"Moonlit Candles","url":"https://moonlit.in"}]}');
    }
    if (prompt.includes('"Wick & Co"')) return webReply([{ text: "x", url: "https://wickandco.in", title: "Wick & Co", quote: "Candles from ₹249, free shipping over ₹799" }]);
    if (prompt.includes('"Moonlit Candles"')) return webReply([{ text: "x", url: "https://moonlit.in/shop", title: "Moonlit Candles shop", quote: "Starting at ₹299" }]);
    return webReply([]);
  };

  async function runToEnd(id: string) {
    for (let i = 0; i < 20; i++) if (!(await advancePositioning(db(), id)).more) return;
    throw new Error("the run never finished");
  }

  it("a first run: finds competitors, searches each one — about ₹27, so it asks first", async () => {
    const plan = await planRun(db(), "d1", NOW);
    // Two known + three free places → one discovery and five competitor searches.
    expect(plan).toMatchObject({ discover: true, searchCalls: 6, estimateInr: 27, needsConfirm: true, blocked: null });
    expect(estimateView(plan)).toEqual({ estimateInr: 27, needsConfirm: true, blocked: null, searchCalls: 6, reusing: { competitors: 0, withQuotes: 0 } });

    const unconfirmed = await startPositioning(db(), "d1", { now: NOW });
    expect(unconfirmed).toMatchObject({ ok: false, needsConfirm: true, error: "This comparison will cost about ₹27 of AI credits. Confirm to start it." });
    expect(tables.competitor_positioning).toHaveLength(0);

    const confirmed = await startPositioning(db(), "d1", { confirm: true, now: NOW });
    expect(confirmed).toMatchObject({ ok: true, reused: false });
    expect(tables.competitor_positioning[0].analysis).toMatchObject({ plan: { discover: true, searchCalls: 6, estimateInr: 27 }, spentInr: 0 });
  });

  it("a rerun within 14 days reuses the competitors and their quotes: no search at all, about ₹6, no confirm", async () => {
    pastRun(3);
    const plan = await planRun(db(), "d1", NOW);
    expect(plan).toMatchObject({ discover: false, searchCalls: 0, estimateInr: 6, needsConfirm: false, blocked: null });
    expect(plan.reusedFound).toEqual([{ name: "Moonlit Candles", source: "found", url: "https://moonlit.in" }]);
    expect(Object.keys(plan.cachedClaims).sort()).toEqual(["Aroma Hut", "Moonlit Candles", "Wick & Co"]);

    const prompts = anthropic(sortAndWrite);
    const started = await startPositioning(db(), "d1", { now: NOW });
    if (!started.ok) throw new Error(started.error);
    await runToEnd(started.id);
    // Only sorting and writing — not one search.
    expect(prompts.map((x) => x.slice(0, 12))).toEqual(["Sort each it", "You are posi"]);
    const done = tables.competitor_positioning.find((r) => r.id === started.id)!;
    expect(done.status).toBe("analysed");
    expect(done.competitors.map((c: any) => `${c.name}:${c.claimCount}`)).toEqual(["Wick & Co:1", "Aroma Hut:2", "Moonlit Candles:1"]);
    expect(done.claims.map((c: any) => c.quote)).toContain("Starting at ₹299");
  });

  it("quotes older than 14 days aren't reused, and a removed competitor isn't brought back", async () => {
    pastRun(15);
    expect(await planRun(db(), "d1", NOW)).toMatchObject({ discover: true, searchCalls: 6 });

    tables.competitor_positioning = [];
    pastRun(2);
    tables.competitor_dismissed = [{ dealership_id: "d1", competitor_name: "Moonlit Candles" }];
    const plan = await planRun(db(), "d1", NOW);
    expect(plan.reusedFound).toEqual([]);
    expect(Object.keys(plan.cachedClaims).sort()).toEqual(["Aroma Hut", "Wick & Co"]);
    expect(plan.searchCalls).toBe(0);
  });

  it("only the competitor without quotes is searched — newest quotes win", async () => {
    pastRun(5, { claims: [webClaim("Wick & Co", "old Wick quote")] });
    // A pasted ad in an old run isn't a web quote — the owner's ads are read fresh.
    pastRun(1, { id: "newer", claims: [webClaim("Wick & Co", "new Wick quote"), webClaim("Moonlit Candles", "Starting at ₹299"), { ...webClaim("Aroma Hut", "Diwali sale"), url: null, origin: "owner" }] });
    const plan = await planRun(db(), "d1", NOW - 0);
    expect(plan.cachedClaims["Wick & Co"].map((c) => c.quote)).toEqual(["new Wick quote"]);
    // Aroma Hut has only the owner's ad: one search, ₹3 + ₹6.
    expect(plan).toMatchObject({ searchCalls: 1, estimateInr: 9, needsConfirm: false });
  });

  it("one run that spends, per business per day (India time) — a run that spent nothing doesn't count", async () => {
    // Earlier today, IST, and it spent.
    pastRun(0.1, { claims: [], competitors: [], analysis: { spentInr: 8 } });
    const blocked = await planRun(db(), "d1", NOW);
    expect(blocked.blocked).toMatch(/^You've already run a full comparison today/);
    const r = await startPositioning(db(), "d1", { confirm: true, now: NOW });
    expect(r).toMatchObject({ ok: false, error: blocked.blocked });
    expect(tables.competitor_positioning).toHaveLength(1);

    // Another business's run doesn't block this one.
    tables.competitor_positioning[0].dealership_id = "d2";
    expect((await planRun(db(), "d1", NOW)).blocked).toBeNull();

    // A run today that failed before spending anything doesn't use up the day.
    tables.competitor_positioning[0] = { ...tables.competitor_positioning[0], dealership_id: "d1", status: "failed", analysis: { spentInr: 0 } };
    expect((await planRun(db(), "d1", NOW)).blocked).toBeNull();

    // Yesterday 23:00 IST is a different day.
    tables.competitor_positioning[0] = { ...tables.competitor_positioning[0], created_at: "2026-09-18T17:30:00Z", analysis: { spentInr: 8 } };
    expect((await planRun(db(), "d1", NOW)).blocked).toBeNull();
  });

  it("a run that failed doesn't use up the day — the retry reuses what it found; three failures that spent do", async () => {
    // Today's run found competitors, spent on discovery, then stalled.
    pastRun(0.1, { status: "failed", claims: [], analysis: { spentInr: 7 } });
    const retry = await planRun(db(), "d1", NOW);
    expect(retry.blocked).toBeNull();
    // Its competitors are reused: no discovery paid twice.
    expect(retry).toMatchObject({ discover: false, reusedFound: [{ name: "Moonlit Candles" }] });

    pastRun(0.05, { id: "second", status: "failed", claims: [], analysis: { spentInr: 3 } });
    expect((await planRun(db(), "d1", NOW)).blocked).toBeNull();
    pastRun(0.02, { id: "third", status: "failed", claims: [], analysis: { spentInr: 3 } });
    expect((await planRun(db(), "d1", NOW)).blocked).toBe(TOO_MANY_TRIES_TODAY);

    // One that finished today uses up the day, whatever else failed.
    tables.competitor_positioning = [];
    pastRun(0.1, { status: "failed", claims: [], analysis: { spentInr: 7 } });
    pastRun(0.05, { id: "done", claims: [], competitors: [], analysis: { spentInr: 20 } });
    expect((await planRun(db(), "d1", NOW)).blocked).toBe(ALREADY_RAN_TODAY);
  });

  it("every step's calls end well inside the step limit and the invocation", async () => {
    const { STALE_AFTER_MS } = await import("@/lib/strategy/positioning/run");
    const { maxDuration: workLimit } = await import("@/app/api/strategy/positioning/route");
    // A search: one attempt, plus the one standard-model fallback.
    expect(2 * SEARCH_TIMEOUT_MS).toBeLessThan(STALE_AFTER_MS);
    // Sorting or writing: two attempts and the longest wait between them.
    expect(2 * ANALYSIS_TIMEOUT_MS + DEFAULT_CLAUDE_RETRY_TIMING.maxMs).toBeLessThan(STALE_AFTER_MS);
    // The last step an invocation starts (at RUN_FOR_MS) still ends inside it.
    expect(RUN_FOR_MS + 2 * ANALYSIS_TIMEOUT_MS + DEFAULT_CLAUDE_RETRY_TIMING.maxMs).toBeLessThan(workLimit * 1000);
    expect(STALE_AFTER_MS).toBeLessThan(workLimit * 1000);
    expect(CONTINUE_AFTER_MS).toBeLessThan(STALE_AFTER_MS);
  });

  it("a search that never answers is given up after its limit — once, no retry, no fallback — and the step moves on", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let calls = 0;
      vi.stubGlobal("fetch", vi.fn((_u: string, init: any) => {
        calls++;
        return new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(init.signal.reason)));
      }));
      const pending = collectClaims({ name: "Wick & Co", source: "watched" }, { category: "Home fragrance", city: null });
      await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS - 1);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      const r = await pending;
      expect(r.failure).toMatchObject({ kind: "network", message: `no answer within ${SEARCH_TIMEOUT_MS}ms` });
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sorting that never answers is given up after its limit too", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      vi.stubGlobal("fetch", vi.fn((_u: string, init: any) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(init.signal.reason)))));
      const pending = classifyThemes([{ competitor: "A", quote: "x", url: null, title: null, origin: "owner" }], [], themesFor(["products"]));
      await vi.advanceTimersByTimeAsync(2 * ANALYSIS_TIMEOUT_MS + 5_000);
      expect(await pending).toMatchObject({ ok: false, failure: { kind: "network" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a rerun that needs no search is never blocked by the daily limit", async () => {
    pastRun(0.1);
    expect(await planRun(db(), "d1", NOW)).toMatchObject({ searchCalls: 0, blocked: null });
  });

  it("at the ₹40 ceiling no more competitors are searched; the run finishes with what it has and says who was skipped", async () => {
    const prompts = anthropic(sortAndWrite);
    const started = await startPositioning(db(), "d1", { confirm: true, now: NOW });
    if (!started.ok) throw new Error(started.error);
    await advancePositioning(db(), started.id); // step 0: discovery
    const row = tables.competitor_positioning[0];
    row.analysis = { ...row.analysis, spentInr: RUN_CEILING_INR };
    const before = prompts.length;
    await runToEnd(started.id);
    const searched = prompts.slice(before).filter((x) => x.startsWith("Search for how"));
    expect(searched).toEqual([]);
    expect(row.status).toBe("analysed");
    expect(row.analysis.notes.skippedAtCeiling).toEqual(["Wick & Co", "Aroma Hut", "Moonlit Candles"]);
    // The pasted ad was enough to compare with.
    expect(row.claims.map((c: any) => c.quote)).toEqual(["Diwali sale — 40% off all candles this week only"]);
  });

  it("at the ceiling with nothing to quote, the run fails with the reason — no sorting, no writing", async () => {
    tables.competitor_owner_ads = [];
    const prompts = anthropic(sortAndWrite);
    const started = await startPositioning(db(), "d1", { confirm: true, now: NOW });
    if (!started.ok) throw new Error(started.error);
    await advancePositioning(db(), started.id);
    const row = tables.competitor_positioning[0];
    row.analysis = { ...row.analysis, spentInr: 41 };
    const before = prompts.length;
    await runToEnd(started.id);
    expect(prompts.length).toBe(before);
    expect(row).toMatchObject({ status: "failed", error: "The comparison reached its ₹40 limit before finding anything it could quote. Paste an ad you've seen and run it again tomorrow." });
  });

  it("searches run on the fast model, one search per competitor, kept to its own site when known; discovery gets two", async () => {
    const bodies: any[] = [];
    anthropic((prompt, body) => (bodies.push(body), sortAndWrite(prompt)));
    const started = await startPositioning(db(), "d1", { confirm: true, now: NOW });
    if (!started.ok) throw new Error(started.error);
    await runToEnd(started.id);
    const search = (start: string) => bodies.find((b) => String(b.messages[0].content).startsWith(start))!;
    const discovery = search("Find up to");
    expect(discovery.model).toBe(getModel("fast"));
    expect(discovery.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 2 }]);
    expect(search('Search for how "Wick & Co"').tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
    expect(search('Search for how "Moonlit Candles"').tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 1, allowed_domains: ["moonlit.in"] }]);
    expect(search('Search for how "Moonlit Candles"').model).toBe(getModel("fast"));
    // Sorting and writing stay on the standard model.
    expect(search("Sort each item").model).toBe(getModel("standard"));
    expect(search("You are positioning").model).toBe(getModel("standard"));

    // What it really cost is recorded, and matches what was charged.
    const done = tables.competitor_positioning[0];
    expect(done.analysis.spentInr).toBeGreaterThan(0);
    // Every call's cost, discovery and each competitor included — the same as the usage log.
    const logged = tables.api_usage_logs.reduce((sum, x) => sum + Number(x.cost_inr), 0);
    expect(tables.api_usage_logs.filter((x) => x.operation === "positioning_claims")).toHaveLength(3);
    expect(done.analysis.spentInr).toBeCloseTo(logged, 2);
    expect(done.analysis.plan).toMatchObject({ estimateInr: 27 });
  });

  it("if the API refuses the fast model for search, the same search runs once on the standard model", async () => {
    const models: string[] = [];
    anthropic((prompt, body) => {
      models.push(body.model);
      if (body.model === getModel("fast")) return { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "web_search is not supported on this model" } } };
      return sortAndWrite(prompt);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await collectClaims({ name: "Wick & Co", source: "watched" }, { category: "Home fragrance", city: null });
    expect(models).toEqual([getModel("fast"), getModel("standard")]);
    expect(r.claims.map((c) => c.quote)).toEqual(["Candles from ₹249, free shipping over ₹799"]);
  });

  it("an outage isn't retried on the other model", async () => {
    const models: string[] = [];
    anthropic((_p, body) => (models.push(body.model), CREDITS));
    const r = await collectClaims({ name: "Wick & Co", source: "watched" }, { category: "Home fragrance", city: null });
    expect(models).toEqual([getModel("fast")]);
    expect(r).toMatchObject({ claims: [], costInr: 0 });
  });

  it("web-search fees are logged as their own usage row and counted in the call's cost", async () => {
    anthropic(() => ({ status: 200, body: { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } } } }));
    const r = await callClaude({ model: getModel("fast"), max_tokens: 10, messages: [{ role: "user", content: "hi" }] }, { operation: "positioning_claims", logContext: { supabase: db(), dealershipId: "d1" } });
    if (!r.ok) throw new Error("call failed");
    const rows = tables.api_usage_logs;
    const fee = rows.find((x) => x.operation === "positioning_claims:web_search");
    // $0.01 a search at ₹87.
    expect(fee).toMatchObject({ dealership_id: "d1", service: "anthropic", model: "web_search", input_tokens: 0, output_tokens: 0, cost_inr: 1.74 });
    const tokens = rows.find((x) => x.operation === "positioning_claims")!;
    expect(r.costInr).toBeCloseTo(Number(tokens.cost_inr) + 1.74, 3);
    // No searches, no fee row.
    tables.api_usage_logs = [];
    anthropic(() => textReply("ok"));
    await callClaude({ model: getModel("fast"), max_tokens: 10, messages: [{ role: "user", content: "hi" }] }, { operation: "x", logContext: { supabase: db(), dealershipId: "d1" } });
    expect(tables.api_usage_logs.map((x) => x.operation)).toEqual(["x"]);
  });
});
