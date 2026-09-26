// The real searches, stored and read (Brain, Phase 4 step 2,
// migration 201).
//
// This is the first real search data in the product. Every keyword
// Hawlai has ever shown an owner was a model's guess — the SEO toolkit's
// own instruction asks for keywords competitors are "PROBABLY" ranking
// for. These are Google's own counts, and the tests below exist mostly
// to make sure nothing in the path quietly turns them back into a guess.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import {
  syncSearchQueries,
  topQueries,
  gaps,
  windowFor,
  formatQueriesForPrompt,
  recordSearchSignals,
  LAG_DAYS,
  WINDOW_DAYS,
  MIN_IMPRESSIONS_NO_CLICKS,
} from "@/lib/seo/searchQueries";
import { tokenWrite } from "@/lib/crypto/oauthSecrets";
import { generateSeoTask } from "@/lib/agents/seoToolkitAgent";
import { GROUPS } from "@/lib/automation/cronGroups";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";

const DEALER = "d1";
const NOW = new Date("2026-09-26T10:00:00Z");

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let upserted: Row[];

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let staged: any = null;
    let mode: "select" | "insert" | "upsert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const sorted = () => {
      let list = rows();
      for (const o of [...orders].reverse()) {
        list = [...list].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      }
      return list;
    };
    const run = () => {
      if (mode === "insert" || mode === "upsert") {
        const list = Array.isArray(staged) ? staged : [staged];
        if (mode === "upsert") upserted.push(...list);
        (tables[table] ??= []).push(...list.map((r: Row) => ({ id: crypto.randomUUID(), ...r })));
        return list[0];
      }
      if (mode === "update") {
        const t = rows()[0];
        if (t) Object.assign(t, staged);
        return t ?? null;
      }
      return sorted()[0] ?? null;
    };
    const api: any = {
      select: () => api,
      limit: () => api,
      order: (col: string, o: any) => (orders.push({ col, asc: o?.ascending !== false }), api),
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (r: any) => ((mode = "insert"), (staged = r), api),
      upsert: (r: any) => ((mode = "upsert"), (staged = r), api),
      update: (r: any) => ((mode = "update"), (staged = r), api),
      maybeSingle: async () => ({ data: run(), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) =>
        Promise.resolve(mode === "select" ? { data: sorted(), error: null } : { data: [run()], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const connected = (siteUrl: string | null = "sc-domain:hawlai.online") => ({
  id: DEALER,
  ...tokenWrite("search_console", "access_token", "tok"),
  ...tokenWrite("search_console", "refresh_token", "ref"),
  search_console_token_expiry: new Date(Date.now() + 3600_000).toISOString(),
  search_console_site_url: siteUrl,
  search_console_email: "owner@example.com",
});

const GOOGLE_ROWS = [
  { keys: ["candle making workshop shahjahanpur"], clicks: 3, impressions: 41, ctr: 0.0731, position: 8.4 },
  { keys: ["soy candles online india"], clicks: 0, impressions: 62, ctr: 0, position: 14.2 },
  { keys: ["candle by qaaf"], clicks: 5, impressions: 6, ctr: 0.833, position: 1.2 },
];

function googleReturns(rows: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rows }), { status: 200 })));
}

beforeEach(() => {
  upserted = [];
  tables = { dealerships: [connected()], search_queries: [], business_signals: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the window that is read", () => {
  it("ends a few days back, because Google settles its figures late", () => {
    const w = windowFor(NOW);
    expect(w.to).toBe("2026-09-23");
    expect(w.from).toBe("2026-08-26");
    const days = (new Date(w.to).getTime() - new Date(w.from).getTime()) / 86_400_000;
    expect(days).toBe(WINDOW_DAYS);
    expect(LAG_DAYS).toBeGreaterThan(0);
  });
});

describe("pulling and storing", () => {
  it("stores Google's figures exactly as given", async () => {
    googleReturns(GOOGLE_ROWS);
    const r = await syncSearchQueries(db(), DEALER, NOW);

    expect(r.stored).toBe(3);
    const stored = tables.search_queries.find((q) => q.query === "candle making workshop shahjahanpur")!;
    expect(stored).toMatchObject({ clicks: 3, impressions: 41, ctr: 0.0731, position: 8.4, window_to: "2026-09-23" });
    vi.unstubAllGlobals();
  });

  it("re-reading the same window CORRECTS the rows instead of doubling the numbers", async () => {
    googleReturns(GOOGLE_ROWS);
    await syncSearchQueries(db(), DEALER, NOW);
    expect(upserted[0]).toBeTruthy();
    // The upsert names the natural key, so a second read of the same
    // window replaces rather than adds.
    const src = readFileSync("src/lib/seo/searchQueries.ts", "utf8");
    expect(src).toContain('onConflict: "dealership_id,query,window_from,window_to"');
    const sql = readFileSync("supabase/migrations/201_search_queries.sql", "utf8");
    expect(sql).toContain("unique (dealership_id, query, window_from, window_to)");
    vi.unstubAllGlobals();
  });

  it("AN EXPIRED TOKEN IS REFRESHED AND THE NEW ONE IS SAVED, so tomorrow's run doesn't refresh again", async () => {
    tables.dealerships = [{ ...connected(), search_console_token_expiry: new Date(Date.now() - 60_000).toISOString() }];
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: GOOGLE_ROWS }), { status: 200 });
    }));

    await syncSearchQueries(db(), DEALER, NOW);

    expect(calls.some((c) => c.includes("oauth2.googleapis.com"))).toBe(true);
    const row = tables.dealerships[0];
    // Written encrypted, plaintext nulled, and the expiry moved forward.
    expect(row.search_console_access_token_encrypted).toBeTruthy();
    expect(row.search_console_access_token).toBeNull();
    expect(new Date(row.search_console_token_expiry).getTime()).toBeGreaterThan(Date.now());
    vi.unstubAllGlobals();
  });

  it("NOT CONNECTED IS NOT A FAILURE — it says so and stops", async () => {
    tables.dealerships = [{ id: DEALER }];
    const r = await syncSearchQueries(db(), DEALER, NOW);
    expect(r.skipped).toBe("Search Console isn't connected");
    expect(r.stored).toBe(0);
    expect(tables.business_signals).toHaveLength(0);
  });

  it("connected with no property selected says that, rather than reading someone else's", async () => {
    tables.dealerships = [connected(null)];
    const r = await syncSearchQueries(db(), DEALER, NOW);
    expect(r.skipped).toContain("no verified property");
  });

  it("no searches at all is recorded as a fact, not left blank", async () => {
    googleReturns([]);
    const r = await syncSearchQueries(db(), DEALER, NOW);
    expect(r.skipped).toContain("no searches");
    expect(tables.business_signals[0].summary).toContain("no searches reaching this business");
    expect(tables.business_signals[0].confidence).toBe("counted");
    vi.unstubAllGlobals();
  });
});

describe("what the numbers show", () => {
  const rows = GOOGLE_ROWS.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

  it("SEEN BUT NEVER CLICKED is the clearest gap there is", () => {
    const { seenNotClicked } = gaps(rows);
    expect(seenNotClicked.map((r) => r.query)).toEqual(["soy candles online india"]);
    // A term seen a handful of times is not evidence of anything.
    expect(gaps([{ query: "x", clicks: 0, impressions: MIN_IMPRESSIONS_NO_CLICKS - 1, ctr: 0, position: 9 }]).seenNotClicked).toEqual([]);
  });

  it("nearly ranking means found but below where people click", () => {
    const { nearlyThere } = gaps(rows);
    expect(nearlyThere.map((r) => r.query)).toEqual(["candle making workshop shahjahanpur", "soy candles online india"]);
    // Already at the top is not an opportunity.
    expect(gaps([{ query: "candle by qaaf", clicks: 5, impressions: 60, ctr: 0.8, position: 1.2 }]).nearlyThere).toEqual([]);
  });

  it("the signals are COUNTED, quote the real figures, and leave the advice to Strategy", async () => {
    await recordSearchSignals(db(), DEALER, rows, { from: "2026-08-26", to: "2026-09-23" });
    const byTopic = Object.fromEntries(tables.business_signals.map((s) => [s.topic, s]));

    expect(byTopic["search demand"]).toMatchObject({ source: "seo", confidence: "counted" });
    expect(byTopic["search demand"].evidence).toMatchObject({ queries: 3, impressions: 109, clicks: 8 });
    expect(byTopic["seen but not clicked"].summary).toContain("62 times and was never clicked");
    expect(byTopic["nearly ranking"].summary).toContain("position 8.4");
    // No instruction, no "you should" — the numbers and nothing more.
    for (const s of tables.business_signals) expect(s.summary).not.toMatch(/you should|we recommend/i);
  });

  it("too little to read anything into says exactly that", async () => {
    await recordSearchSignals(db(), DEALER, [{ query: "x", clicks: 0, impressions: 2, ctr: 0, position: 30 }], { from: "a", to: "b" });
    expect(tables.business_signals[0].summary).toContain("too little to read anything into");
  });
});

describe("reading the stored terms back", () => {
  it("only the most recent window, so two windows never blend", async () => {
    tables.search_queries = [
      { dealership_id: DEALER, query: "old term", clicks: 1, impressions: 90, ctr: 0.1, position: 5, window_to: "2026-08-23" },
      { dealership_id: DEALER, query: "new term", clicks: 2, impressions: 30, ctr: 0.1, position: 4, window_to: "2026-09-23" },
    ];
    const rows = await topQueries(db(), DEALER);
    expect(rows.map((r) => r.query)).toEqual(["new term"]);
  });

  it("nothing stored is an empty list, never a placeholder", async () => {
    expect(await topQueries(db(), DEALER)).toEqual([]);
  });
});

// ---- the guess this replaces ----------------------------------------------
describe("the keyword task stops guessing when there is real data", () => {
  let prompt = "";
  function anthropic() {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      prompt = String(JSON.parse(init.body).messages[0].content);
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"keywords":[]}' }], usage: {} }), { status: 200 });
    }));
  }

  const real = [{ query: "soy candles online india", clicks: 0, impressions: 62, ctr: 0, position: 14.2 }];

  it("THE REPLACEMENT: with real terms it is told to work only from them, and never to invent a volume", async () => {
    anthropic();
    await generateSeoTask("competitor_keywords", "Candle by Qaaf", "Shahjahanpur", "Home fragrance", null, undefined, undefined, real);

    expect(prompt).toContain("The searches people REALLY used");
    expect(prompt).toContain('"soy candles online india" — seen 62 times, clicked 0, average position 14.2');
    expect(prompt).toContain("Work ONLY from the real search terms given above");
    expect(prompt).toContain("never state a search volume or a ranking figure that is not printed there");
    // The old wording is gone: nothing is "probably" ranking any more.
    expect(prompt).not.toContain("probably ranking for");
    vi.unstubAllGlobals();
  });

  it("WITHOUT a connection the old behaviour is untouched — an owner who hasn't connected loses nothing", async () => {
    anthropic();
    await generateSeoTask("competitor_keywords", "Candle by Qaaf", "Shahjahanpur", "Home fragrance", null, undefined, undefined, []);
    expect(prompt).toContain("probably ranking for");
    expect(prompt).not.toContain("The searches people REALLY used");
    vi.unstubAllGlobals();
  });

  it("other SEO tasks are unaffected by the real data being present", async () => {
    anthropic();
    await generateSeoTask("meta_tags", "Candle by Qaaf", "Shahjahanpur", "Home fragrance", null, undefined, undefined, real);
    // The terms are still shown — useful context for a meta description —
    // but the task's own requirements are its own.
    expect(prompt).toContain("Meta title (under 60 chars)");
    expect(prompt).not.toContain("Work ONLY from the real search terms");
    vi.unstubAllGlobals();
  });

  it("formatting says whose numbers these are and forbids adding to them", () => {
    const text = formatQueriesForPrompt(real);
    expect(text).toContain("Google's own counts, not estimates");
    expect(formatQueriesForPrompt([])).toBe("");
  });
});

describe("it runs daily", () => {
  it("in the group for third-party calls, not the database-only one", () => {
    expect(GROUPS.heavy).toContain("search_console_sync");
    expect(GROUPS.signals).not.toContain("search_console_sync");
    expect(typeof DAILY_RUNNERS.search_console_sync).toBe("function");
  });
});
