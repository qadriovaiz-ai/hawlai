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
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
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
  return { from, rpc: async () => ({ data: null, error: null }) };
}

import { citationsOf, mentions, discoverCompetitors, collectClaims, mergeCompetitors, ownerAdClaim } from "@/lib/strategy/positioning/collect";
import { buildPositioning, classifyThemes, unallowedNumbers, verifyPositioning, allowedNumbers, ownFactsFrom, formatPositioningForPrompt } from "@/lib/strategy/positioning/analysis";
import { themesFor, THEMES } from "@/lib/strategy/positioning/themes";
import { startPositioning, advancePositioning, describeRun, newestRun, competitorContextFrom, latestPositioning, STALE_AFTER_MS, STOPPED_MESSAGE } from "@/lib/strategy/positioning/run";
import { resetOperatorAlerts } from "@/lib/ai/claude";
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
    expect(r).toEqual({ ok: true, claimThemes: [["price"], ["price"]], factThemes: [["materials", "handmade"]] });
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
    const started = await startPositioning(db(), "d1");
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
    const started = await startPositioning(db(), "d1");
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
    const first = await startPositioning(db(), "d1", now);
    const again = await startPositioning(db(), "d1", now + 5_000);
    expect(again).toEqual({ ok: true, id: (first as any).id, reused: true });
    const later = await startPositioning(db(), "d1", now + STALE_AFTER_MS + 1_000);
    expect(later).toMatchObject({ ok: true, reused: false });
    expect(tables.competitor_positioning).toHaveLength(2);
  });

  it("credits out while finding competitors: the run fails with the approved reason and goes no further", async () => {
    const prompts = anthropic(() => CREDITS);
    const started = await startPositioning(db(), "d1");
    if (!started.ok) throw new Error(started.error);
    expect(await advancePositioning(db(), started.id)).toEqual({ more: false });
    expect(tables.competitor_positioning[0]).toMatchObject({ status: "failed", error: OUTAGE, step_running: false });
    expect(describeRun(tables.competitor_positioning[0])).toMatchObject({ state: "failed", error: OUTAGE });
    expect(prompts).toHaveLength(1);
  });

  it("one competitor too busy to read: noted, and the run carries on without it", async () => {
    anthropic((prompt) => (prompt.startsWith('Search for how "Aroma Hut"') ? { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "busy" } } } : sortAndWrite(prompt)));
    const started = await startPositioning(db(), "d1");
    if (!started.ok) throw new Error(started.error);
    await runToEnd(started.id);
    const done = tables.competitor_positioning[0];
    expect(done.status).toBe("analysed");
    expect(done.analysis.notes.couldntCheck).toEqual(["Aroma Hut"]);
  });

  it("the counted table is kept even if writing the advice fails", async () => {
    anthropic((prompt) => (prompt.startsWith("You are positioning") ? CREDITS : sortAndWrite(prompt)));
    const started = await startPositioning(db(), "d1");
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
