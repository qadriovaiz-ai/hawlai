// Whether an AI assistant names this business, tracked over time
// (Brain, Phase 1b, migration 199).
//
// THE THING THAT BLOCKED A TREND: the AEO check asked the model to
// invent three or four buyer questions on every run. Fine for a
// snapshot, useless for movement — "not mentioned" last month and
// "mentioned" this month could be answers to different questions, so the
// change means nothing. The question set is now derived in code and is
// the same every run.

import { describe, it, expect, vi, beforeEach } from "vitest";

import { aeoQuestions, aeoQuestionsFor, MAX_QUESTIONS } from "@/lib/seo/aeoQuestions";
import { recordPresence, aeoTrend, recordAeoSignals } from "@/lib/seo/aeoPresence";

const DEALER = "d1";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let staged: any = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (mode === "insert") {
        const list = Array.isArray(staged) ? staged : [staged];
        const made = list.map((r: Row) => ({ id: crypto.randomUUID(), ...r }));
        (tables[table] ??= []).push(...made);
        return made[0];
      }
      if (mode === "update") {
        const t = rows()[0];
        if (t) Object.assign(t, staged);
        return t ?? null;
      }
      return rows()[0] ?? null;
    };
    const api: any = {
      select: () => api,
      order: (col: string, o: any) => {
        sortBy = { col, asc: o?.ascending !== false };
        return api;
      },
      limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (r: any) => ((mode = "insert"), (staged = r), api),
      update: (r: any) => ((mode = "update"), (staged = r), api),
      maybeSingle: async () => ({ data: run(), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => {
        if (mode !== "select") return Promise.resolve({ data: [run()], error: null }).then(res, rej);
        let list = rows();
        if (sortBy) {
          const { col, asc } = sortBy;
          list = [...list].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
        }
        return Promise.resolve({ data: list, error: null }).then(res, rej);
      },
    };
    let sortBy: { col: string; asc: boolean } | null = null;
    return api;
  };
  return { from };
}

beforeEach(() => {
  tables = { aeo_presence: [], business_signals: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the questions are the same every run", () => {
  const candle = { category: "Home fragrance", city: "Shahjahanpur", items: [{ name: "Candle Making Workshop", kind: "service" as const }], models: ["products", "services"] };

  it("derived from what the business is, deterministically", () => {
    const a = aeoQuestions(candle);
    const b = aeoQuestions({ ...candle, items: [...candle.items] });
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(a).toContain("best home fragrance in Shahjahanpur");
    expect(a).toContain("best affordable home fragrance in Shahjahanpur");
    // Named after the thing a buyer would actually book.
    expect(a).toContain("how much does candle making workshop cost in Shahjahanpur");
  });

  it("a shop is asked where to BUY, a service business where to BOOK", () => {
    const shop = aeoQuestions({ category: "Home fragrance", city: "Lucknow", items: [{ name: "Lavender Candle", kind: "product" }], models: ["products"] });
    expect(shop.some((q) => q.startsWith("where to buy lavender candle"))).toBe(true);
    expect(shop.some((q) => q.includes("cost"))).toBe(false);
  });

  it("no city: the question a person without one would actually ask", () => {
    const q = aeoQuestions({ category: "Home fragrance", items: [], models: [] });
    expect(q[0]).toBe("best home fragrance near me");
  });

  it("nothing to ask about is no questions, not invented ones", () => {
    expect(aeoQuestions({ category: null })).toEqual([]);
    expect(aeoQuestions({ category: "business" })).toEqual([]);
  });

  it("both callers build the set the same way", () => {
    const fromRows = aeoQuestionsFor(
      { business_category: "Home fragrance", city: "Shahjahanpur" },
      { products: [{ name: "Candle Making Workshop", kind: "service" }], businessModels: { models: ["products", "services"] } } as any
    );
    expect(fromRows).toEqual(aeoQuestions(candle));
  });
});

describe("a run, and what changed since the last one", () => {
  const first = [
    { question: "best home fragrance in Shahjahanpur", mentioned: false, competitors: ["Aroma Co"] },
    { question: "best affordable home fragrance in Shahjahanpur", mentioned: false, competitors: [] },
  ];
  const second = [
    { question: "best home fragrance in Shahjahanpur", mentioned: true, competitors: ["Aroma Co"] },
    { question: "best affordable home fragrance in Shahjahanpur", mentioned: false, competitors: ["Aroma Co", "Wick & Co"] },
  ];

  it("THE FIRST CHECK SAYS SO — no trend is invented from one run", async () => {
    await recordPresence(db(), DEALER, first, 40, new Date("2026-09-01T00:00:00Z"));
    const t = (await aeoTrend(db(), DEALER))!;
    expect(t.mentionedNow).toBe(0);
    expect(t.total).toBe(2);
    expect(t.mentionedBefore).toBeNull();
    expect(t.thin).toContain("first check");
    expect(t.gained).toEqual([]);
  });

  it("movement is per question, against the same question", async () => {
    await recordPresence(db(), DEALER, first, 40, new Date("2026-09-01T00:00:00Z"));
    await recordPresence(db(), DEALER, second, 55, new Date("2026-09-26T00:00:00Z"));

    const t = (await aeoTrend(db(), DEALER))!;
    expect(t.mentionedNow).toBe(1);
    expect(t.mentionedBefore).toBe(0);
    expect(t.gained).toEqual(["best home fragrance in Shahjahanpur"]);
    expect(t.lost).toEqual([]);
    expect(t.thin).toBeNull();
  });

  it("losing a mention is reported as plainly as winning one", async () => {
    await recordPresence(db(), DEALER, second, 55, new Date("2026-09-01T00:00:00Z"));
    await recordPresence(db(), DEALER, first, 40, new Date("2026-09-26T00:00:00Z"));
    const t = (await aeoTrend(db(), DEALER))!;
    expect(t.lost).toEqual(["best home fragrance in Shahjahanpur"]);
    expect(t.mentionedBefore).toBe(1);
  });

  it("A CHANGED QUESTION IS NOT PROGRESS — it says the runs can't be compared", async () => {
    await recordPresence(db(), DEALER, [{ question: "old wording", mentioned: false, competitors: [] }], 40, new Date("2026-09-01T00:00:00Z"));
    await recordPresence(db(), DEALER, [{ question: "new wording", mentioned: true, competitors: [] }], 55, new Date("2026-09-26T00:00:00Z"));
    const t = (await aeoTrend(db(), DEALER))!;
    expect(t.gained).toEqual([]);
    expect(t.thin).toContain("can't be compared");
  });

  it("nothing recorded yet is null, not an empty trend", async () => {
    expect(await aeoTrend(db(), DEALER)).toBeNull();
  });
});

describe("what the other departments are told", () => {
  it("our own count is COUNTED; who the search named instead is OBSERVED", async () => {
    await recordPresence(db(), DEALER, [
      { question: "best home fragrance in Shahjahanpur", mentioned: true, competitors: [] },
      { question: "best affordable home fragrance in Shahjahanpur", mentioned: false, competitors: ["Aroma Co", "Wick & Co"] },
    ], 55, new Date("2026-09-26T00:00:00Z"));

    const trend = (await aeoTrend(db(), DEALER))!;
    await recordAeoSignals(db(), DEALER, trend);

    const counted = tables.business_signals.find((s) => s.confidence === "counted")!;
    expect(counted.source).toBe("aeo");
    expect(counted.summary).toContain("Named in 1 of 2");
    expect(counted.evidence).toMatchObject({ mentioned: 1, questions: 2 });

    const observed = tables.business_signals.find((s) => s.confidence === "observed")!;
    expect(observed.summary).toContain("Not named for");
    expect(observed.summary).toContain("Aroma Co");
    expect(observed.evidence.competitorsNamed).toEqual(["Aroma Co", "Wick & Co"]);
  });

  it("re-running rewrites the standing signal rather than piling up a new one each time", async () => {
    const rows = [{ question: "best home fragrance in Shahjahanpur", mentioned: true, competitors: [] }];
    await recordPresence(db(), DEALER, rows, 55, new Date("2026-09-01T00:00:00Z"));
    await recordAeoSignals(db(), DEALER, (await aeoTrend(db(), DEALER))!);
    await recordPresence(db(), DEALER, rows, 60, new Date("2026-09-26T00:00:00Z"));
    await recordAeoSignals(db(), DEALER, (await aeoTrend(db(), DEALER))!);

    expect(tables.business_signals.filter((s) => s.topic === "answer presence")).toHaveLength(1);
  });
});
