// What the departments have noticed, in one place (Brain, Phase 0b,
// migration 198).
//
// The vision's Cross-Intelligence chain — market research notices
// something, competitors confirm it, search demand agrees, strategy
// concludes — needs departments that can read each other. Before this
// there were exactly two cross-department edges in the whole system.
//
// The thing worth protecting here is `confidence`. "3 competitors added
// delivery" (observed) and "delivery is becoming an expectation"
// (inferred) are not the same sentence, and a consumer that cannot tell
// them apart will eventually state the second as the first.

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  recordSignal,
  readSignals,
  formatSignalsForPrompt,
  fingerprintOf,
  FRESH_DAYS,
  type StoredSignal,
} from "@/lib/signals/signals";

const DEALER = "d1";
const NOW = new Date("2026-09-26T10:00:00Z");

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let inFilter: [string, any[]] | null = null;
    let staged: Row | null = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () =>
      (tables[table] ?? [])
        .filter((r) => filters.every(([k, v]) => r[k] === v))
        .filter((r) => !inFilter || inFilter[1].includes(r[inFilter[0]]));
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
      select: () => api,
      order: () => api,
      limit: () => api,
      in: (k: string, v: any[]) => ((inFilter = [k, v]), api),
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (row: Row) => ((mode = "insert"), (staged = row), api),
      update: (row: Row) => ((mode = "update"), (staged = row), api),
      maybeSingle: async () => ({ data: run(), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => {
        if (mode !== "select") return Promise.resolve({ data: [run()], error: null }).then(res, rej);
        return Promise.resolve({ data: rows(), error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from };
}

const competitorSignal = {
  source: "competitor_monitor" as const,
  topic: "Aroma Co",
  summary: "Aroma Co: now offering same-day delivery in Shahjahanpur",
  evidence: { competitor: "Aroma Co", headline: "Same-day delivery launched" },
  confidence: "observed" as const,
  sourceUrl: "https://aromaco.in/news",
};

beforeEach(() => {
  tables = { business_signals: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("writing a signal", () => {
  it("is filed with its evidence, its standing and when it expires", async () => {
    expect(await recordSignal(db(), DEALER, competitorSignal, NOW)).toBe(true);
    const row = tables.business_signals[0];
    expect(row).toMatchObject({
      dealership_id: DEALER,
      source: "competitor_monitor",
      confidence: "observed",
      source_url: "https://aromaco.in/news",
    });
    expect(row.evidence).toEqual({ competitor: "Aroma Co", headline: "Same-day delivery launched" });
    // News goes stale; the expiry says when.
    const days = (new Date(row.expires_at).getTime() - NOW.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(FRESH_DAYS.competitor_monitor);
  });

  it("THE SAME OBSERVATION TWICE IS ONE SIGNAL, and seeing it again restarts its clock", async () => {
    await recordSignal(db(), DEALER, competitorSignal, NOW);
    const later = new Date("2026-10-10T10:00:00Z");
    await recordSignal(db(), DEALER, competitorSignal, later);

    expect(tables.business_signals).toHaveLength(1);
    const row = tables.business_signals[0];
    expect(row.last_seen_at).toBe(later.toISOString());
    // Still true a fortnight on, so the expiry is measured from TODAY,
    // not from the day it was first seen — otherwise a standing fact
    // quietly lapses while it is still the case.
    const days = (new Date(row.expires_at).getTime() - later.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(FRESH_DAYS.competitor_monitor);
  });

  it("a note that can't be filed never takes the real work down with it", async () => {
    const broken = { from: () => { throw new Error("down"); } };
    expect(await recordSignal(broken, DEALER, competitorSignal, NOW)).toBe(false);
    // And nothing half-written.
    expect(await recordSignal(db(), DEALER, { ...competitorSignal, summary: "  " }, NOW)).toBe(false);
    expect(tables.business_signals).toHaveLength(0);
  });

  it("the fingerprint ignores spacing and case, so a reworded gap isn't a new signal", () => {
    expect(fingerprintOf(["competitor_monitor", "Aroma Co", "Same-Day  Delivery"]))
      .toBe(fingerprintOf(["competitor_monitor", "aroma co", "same-day delivery"]));
  });
});

describe("reading signals back", () => {
  const stale = {
    source: "topic_monitor" as const,
    topic: "candle market",
    summary: "Soy wax prices rose 8% last quarter",
    evidence: {},
    confidence: "observed" as const,
  };

  it("EXPIRED SIGNALS ARE LEFT OUT — old news is not today's news", async () => {
    await recordSignal(db(), DEALER, competitorSignal, new Date("2026-01-01T00:00:00Z"));
    await recordSignal(db(), DEALER, stale, NOW);

    const live = await readSignals(db(), DEALER, { now: NOW });
    expect(live.map((s) => s.topic)).toEqual(["candle market"]);
  });

  it("a reader can insist on counted facts only", async () => {
    await recordSignal(db(), DEALER, { ...stale, source: "content_results", confidence: "counted", summary: "40 visits, 2 leads from the workshop post" }, NOW);
    await recordSignal(db(), DEALER, { ...stale, source: "positioning", confidence: "inferred", summary: "Nobody local claims same-day" }, NOW);

    const counted = await readSignals(db(), DEALER, { minConfidence: "counted", now: NOW });
    expect(counted).toHaveLength(1);
    expect(counted[0].confidence).toBe("counted");

    const both = await readSignals(db(), DEALER, { minConfidence: "observed", now: NOW });
    expect(both.map((s) => s.confidence).sort()).toEqual(["counted"]);
  });

  it("another business's signals are never returned", async () => {
    await recordSignal(db(), "d2", competitorSignal, NOW);
    expect(await readSignals(db(), DEALER, { now: NOW })).toEqual([]);
  });

  it("a database that falls over returns nothing, not a crash", async () => {
    const broken = { from: () => { throw new Error("down"); } };
    expect(await readSignals(broken, DEALER)).toEqual([]);
  });
});

describe("handing signals to a model", () => {
  const signals: StoredSignal[] = [
    { id: "1", source: "content_results", topic: "workshop post", summary: "The workshop post brought 2 leads", evidence: { visits: 40, leads: 2 }, confidence: "counted", sourceUrl: null, observedAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() },
    { id: "2", source: "positioning", topic: "delivery", summary: "Nobody local claims same-day delivery", evidence: {}, confidence: "inferred", sourceUrl: null, observedAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() },
  ];

  it("EVERY LINE CARRIES ITS STANDING, so an inferred line can't be restated as a measured one", () => {
    const text = formatSignalsForPrompt(signals);
    expect(text).toContain("counted from this business's own records");
    expect(text).toContain("a reading of the above, not a measured fact");
    expect(text).toContain("you may NOT restate an inferred line as a measured fact");
    // Numbers come from the evidence, printed, so a quote can be checked.
    expect(text).toContain("visits: 40, leads: 2");
  });

  it("nothing noticed yet says nothing at all, rather than an empty heading", () => {
    expect(formatSignalsForPrompt([])).toBe("");
  });
});

// ---- the producers that already run daily ---------------------------------
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/ai/claude", () => ({
  callClaude: async () => ({
    ok: true,
    data: {
      content: [{
        type: "text",
        text: JSON.stringify({ items: [{ title: "Same-day delivery launched", summary: "Aroma Co now delivers same day.", sourceUrl: "https://aromaco.in/news" }] }),
      }],
    },
  }),
  aiFailureNote: () => undefined,
  isPlatformOutage: () => false,
}));

import { checkCompetitorAlerts } from "@/lib/automation/competitorMonitor";

describe("the monitors that already run every day", () => {
  it("A REAL PRODUCER FILLS THE STORE — the same finding becomes news for the owner AND input for the other departments", async () => {
    tables = {
      business_signals: [],
      competitor_watches: [{ dealership_id: DEALER, competitor_name: "Aroma Co" }],
      dealerships: [{ id: DEALER, business_category: "Home fragrance" }],
      competitor_alerts: [],
    };

    const result = await checkCompetitorAlerts(db(), DEALER);
    expect(result.newAlerts).toBe(1);

    // The owner's feed, as before.
    expect(tables.competitor_alerts).toHaveLength(1);
    // And the cross-department signal, quoting the competitor rather than
    // concluding anything from them.
    expect(tables.business_signals).toHaveLength(1);
    expect(tables.business_signals[0]).toMatchObject({
      source: "competitor_monitor",
      topic: "Aroma Co",
      confidence: "observed",
      source_url: "https://aromaco.in/news",
    });
    expect(tables.business_signals[0].summary).toContain("Same-day delivery launched");
  });
});
