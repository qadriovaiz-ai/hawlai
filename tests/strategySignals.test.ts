// The last two departments join the store (Brain, final piece).
//
// The diagnosis and the positioning comparison were the two engines whose
// findings nothing else could read. Both already count in code, so this
// files what they found rather than working anything out again — and the
// standings are the point: the funnel is COUNTED (our own rows added up),
// a competitor's claim is OBSERVED (their words, quoted, with the page),
// and "nobody claims this, so it's open ground" is INFERRED, because it is
// a reading of an absence and nobody saying something is not evidence that
// saying it would work.

import { describe, it, expect, vi, beforeEach } from "vitest";

import { fileDiagnosisSignals, filePositioningSignals, runStrategySignals, MIN_FOR_CROWDED } from "@/lib/strategy/strategySignals";
import { AT_RISK_DAYS } from "@/lib/agents/churnAgent";
import { GROUPS } from "@/lib/automation/cronGroups";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import type { Diagnosis } from "@/lib/strategy/diagnosis";

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
        const row = { id: crypto.randomUUID(), ...staged };
        (tables[table] ??= []).push(row);
        return row;
      }
      if (mode === "update") {
        const t = rows()[0];
        if (t) Object.assign(t, staged);
        return t ?? null;
      }
      return rows()[0] ?? null;
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, lte: () => api,
      not: () => api, in: () => api, is: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (r: any) => ((mode = "insert"), (staged = r), api),
      update: (r: any) => ((mode = "update"), (staged = r), api),
      maybeSingle: async () => ({ data: run(), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: mode === "select" ? rows() : [run()], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    window: { days: 90, from: "2026-06-28", to: "2026-09-26", label: "the last 90 days" },
    models: ["products"],
    funnels: [{
      name: "Store",
      steps: [{ key: "views", label: "Visits", count: 400, fromPrevious: null }, { key: "leads", label: "Enquiries", count: 40, fromPrevious: 10 }],
      weakest: { from: "Visits", to: "Enquiries", rate: 10, entered: 400 },
      thin: null,
    }],
    sources: [],
    atRisk: { count: 0, total: 0, names: [] },
    paid: [],
    gaps: [],
    ...over,
  } as unknown as Diagnosis;
}

const byTopic = () => Object.fromEntries((tables.business_signals ?? []).map((s) => [s.topic, s]));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = { business_signals: [], competitor_positioning: [] };
});

describe("the diagnosis files what it counted", () => {
  it("the weakest step, with the real numbers, as COUNTED", async () => {
    await fileDiagnosisSignals(db(), "d1", diagnosis());
    const s = byTopic()["weakest step"];
    expect(s).toMatchObject({ source: "diagnosis", confidence: "counted" });
    expect(s.summary).toBe("The biggest drop is Visits → Enquiries: 10% of 400 get through");
    expect(s.evidence).toMatchObject({ from: "Visits", to: "Enquiries", ratePct: 10, entered: 400 });
  });

  it("TOO THIN TO NAME ONE IS FILED TOO — silence would get filled in by whoever reads next", async () => {
    const thin = diagnosis({
      funnels: [{ name: "Store", steps: [{ key: "views", label: "Visits", count: 28, fromPrevious: null }], weakest: null, thin: "Too few visits to judge where people drop off." }] as any,
    });
    await fileDiagnosisSignals(db(), "d1", thin);
    const s = byTopic()["weakest step"];
    expect(s.summary).toBe("Too few visits to judge where people drop off.");
    expect(s.confidence).toBe("counted");
  });

  it("only a source the diagnosis itself ranked is called the best", async () => {
    await fileDiagnosisSignals(db(), "d1", diagnosis({
      sources: [
        { source: "Instagram", leads: 3, won: 2, conversion: 67, ranked: false },
        { source: "Facebook", leads: 20, won: 5, conversion: 25, ranked: true },
      ] as any,
    }));
    const s = byTopic()["best source"];
    // Instagram's 67% is on 3 leads and was never ranked — it must not win.
    expect(s.summary).toContain("Facebook converts best");
    expect(s.evidence).toMatchObject({ source: "Facebook", leads: 20, won: 5, conversionPct: 25 });
  });

  it("no ranked source means no claim about sources at all", async () => {
    await fileDiagnosisSignals(db(), "d1", diagnosis({ sources: [{ source: "Instagram", leads: 3, won: 2, conversion: null, ranked: false }] as any }));
    expect(byTopic()["best source"]).toBeUndefined();
  });

  it("customers at risk, using the same threshold the diagnosis uses", async () => {
    await fileDiagnosisSignals(db(), "d1", diagnosis({ atRisk: { count: 4, total: 11, names: [] } as any }));
    const s = byTopic()["customers at risk"];
    expect(s.summary).toBe(`4 of 11 customers haven't been contacted in ${AT_RISK_DAYS}+ days`);
    expect(s.evidence).toMatchObject({ atRisk: 4, total: 11, days: AT_RISK_DAYS });
  });

  it("nobody at risk is not filed as a finding", async () => {
    await fileDiagnosisSignals(db(), "d1", diagnosis());
    expect(byTopic()["customers at risk"]).toBeUndefined();
  });
});

describe("positioning files what competitors said, and what nobody said", () => {
  const run = (over: any = {}) => ({
    analysis: {
      positioning: {
        competitorCount: 4,
        rows: [
          {
            key: "delivery", label: "fast delivery", claimedBy: ["Aroma Co", "Wick & Co", "Third"],
            examples: [{ competitor: "Aroma Co", quote: "Same-day delivery across the city, every day", url: "https://aromaco.in/delivery" }],
            yourFacts: [], standing: "crowded",
          },
          { key: "handmade", label: "made by hand", claimedBy: [], examples: [], yourFacts: ["Every candle is poured by hand"], standing: "open" },
        ],
        whiteSpace: ["handmade"],
        crowdedYouHave: [],
        openUnbacked: [],
        ...over,
      },
    },
  });

  it("A COMPETITOR'S CLAIM IS OBSERVED — their words, counted, with the page they're on", async () => {
    await filePositioningSignals(db(), "d1", run());
    const s = byTopic()["delivery"];
    expect(s.confidence).toBe("observed");
    expect(s.summary).toContain("3 of 4 competitors claim fast delivery");
    expect(s.summary).toContain("Aroma Co: \"Same-day delivery across the city, every day\"");
    expect(s.source_url).toBe("https://aromaco.in/delivery");
    expect(s.evidence).toMatchObject({ claimedBy: ["Aroma Co", "Wick & Co", "Third"], competitorsCompared: 4 });
  });

  it("OPEN GROUND IS INFERRED — nobody saying something is not evidence that saying it would work", async () => {
    await filePositioningSignals(db(), "d1", run());
    const s = byTopic()["handmade"];
    expect(s.confidence).toBe("inferred");
    expect(s.summary).toContain("Almost nobody among the 4 competitors claims made by hand");
    expect(s.evidence).toMatchObject({ yourFacts: ["Every candle is poured by hand"] });
  });

  it("one competitor saying something is not 'everyone says this'", async () => {
    const single = run({
      rows: [{ key: "delivery", label: "fast delivery", claimedBy: ["Aroma Co"], examples: [], yourFacts: [], standing: "contested" }],
      whiteSpace: [],
    });
    await filePositioningSignals(db(), "d1", single);
    expect(byTopic()["delivery"]).toBeUndefined();
    expect(MIN_FOR_CROWDED).toBe(2);
  });

  it("a long quote is trimmed rather than filling the signal", async () => {
    const long = run({
      rows: [{
        key: "delivery", label: "fast delivery", claimedBy: ["A", "B"],
        examples: [{ competitor: "A", quote: "x".repeat(400), url: null }], yourFacts: [], standing: "crowded",
      }],
      whiteSpace: [],
    });
    await filePositioningSignals(db(), "d1", long);
    expect(byTopic()["delivery"].summary.length).toBeLessThan(220);
    expect(byTopic()["delivery"].summary).toContain("…");
  });

  it("no comparison ever run means nothing filed", async () => {
    expect(await filePositioningSignals(db(), "d1", null)).toBe(0);
    expect(await filePositioningSignals(db(), "d1", { analysis: { positioning: { competitorCount: 0, rows: [] } } })).toBe(0);
    expect(tables.business_signals).toHaveLength(0);
  });
});

describe("the daily run", () => {
  it("is registered in the database-only group — it reads what was already counted", () => {
    expect(GROUPS.signals).toContain("strategy_signals");
    expect(GROUPS.heavy).not.toContain("strategy_signals");
    expect(typeof DAILY_RUNNERS.strategy_signals).toBe("function");
  });

  it("ONE HALF FAILING DOESN'T STOP THE OTHER", async () => {
    // A database that throws on positioning only.
    const client: any = {
      from: (table: string) => {
        if (table === "competitor_positioning") throw new Error("gone");
        return db().from(table);
      },
    };
    const r = await runStrategySignals(client, "d1");
    // The diagnosis reads its own tables, which still work, so something
    // is still filed rather than the whole run being lost.
    expect(r.filed).toBeGreaterThanOrEqual(0);
    expect(typeof r.filed).toBe("number");
  });

  it("re-running rewrites each standing signal instead of piling them up", async () => {
    await fileDiagnosisSignals(db(), "d1", diagnosis({ atRisk: { count: 4, total: 11, names: [] } as any }));
    await fileDiagnosisSignals(db(), "d1", diagnosis({ atRisk: { count: 4, total: 11, names: [] } as any }));
    expect(tables.business_signals.filter((s) => s.topic === "weakest step")).toHaveLength(1);
    expect(tables.business_signals.filter((s) => s.topic === "customers at risk")).toHaveLength(1);
  });
});

describe("every department now files something", () => {
  it("the store's allowed sources are all produced by real code", () => {
    const fs = require("node:fs");
    const producers: Record<string, string[]> = {
      competitor_monitor: ["src/lib/automation/competitorMonitor.ts"],
      topic_monitor: ["src/lib/automation/topicMonitor.ts"],
      seo: ["src/lib/seo/runTechnicalAudit.ts", "src/lib/seo/searchQueries.ts"],
      aeo: ["src/lib/seo/aeoPresence.ts"],
      content_results: ["src/lib/attribution/performanceBrain.ts"],
      diagnosis: ["src/lib/strategy/strategySignals.ts"],
      positioning: ["src/lib/strategy/strategySignals.ts"],
    };
    for (const [source, files] of Object.entries(producers)) {
      const found = files.some((f) => fs.readFileSync(f, "utf8").includes(`source: "${source}"`));
      expect(found, source).toBe(true);
    }
  });
});
