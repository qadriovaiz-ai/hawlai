// What the market is saying, as things worth doing (Brain, Phase 2).
//
// The vision asks for an Opportunity Score — Demand × Relevance ×
// Commercial intent × Competition gap × Capability. Multiplying five
// subjective one-to-ten guesses gives a precise-looking number with
// nothing under it, so this does the honest version: demand is counted
// from Google's impressions, intent is decided in code from the words,
// capability is checked against the real catalogue, the competition gap
// is described as observed, and customer relevance — which cannot be
// measured here — is SAID to be unknown rather than filled in to
// complete the formula.
//
// The tests below mostly exist to stop that discipline eroding.

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  marketOpportunities,
  intentOf,
  catalogueCovers,
  STRONG_DEMAND,
  PATTERN_COMPETITORS,
} from "@/lib/opportunities/marketOpportunities";
import type { StoredSignal } from "@/lib/signals/signals";

const NOW = "2026-09-26T10:00:00Z";
const q = (query: string, impressions: number, clicks: number, position: number) => ({ query, impressions, clicks, position, ctr: impressions ? clicks / impressions : 0 });

const signal = (over: Partial<StoredSignal>): StoredSignal => ({
  id: "s", source: "competitor_monitor", topic: "x", summary: "x", evidence: {}, confidence: "observed",
  sourceUrl: null, observedAt: NOW, lastSeenAt: NOW, ...over,
});

const CATALOGUE = [{ name: "Candle Making Workshop" }, { name: "Lavender Candle" }];

describe("what the searcher was trying to do, decided in code", () => {
  it("buying words are a buyer", () => {
    expect(intentOf("buy soy candles online")).toBe("transactional");
    expect(intentOf("candle workshop near me")).toBe("transactional");
    expect(intentOf("affordable candle making class price")).toBe("transactional");
  });

  it("learning words are not", () => {
    expect(intentOf("how to make soy candles")).toBe("informational");
    expect(intentOf("why do candles tunnel")).toBe("informational");
  });

  it("BOTH AT ONCE IS A BUYER — 'how much does it cost' is somebody deciding", () => {
    expect(intentOf("how much does a candle workshop cost")).toBe("transactional");
  });

  it("neither is unclear, and is not forced into a box", () => {
    expect(intentOf("candle by qaaf")).toBe("unclear");
  });
});

describe("whether the business already covers it", () => {
  it("matches on the words that matter", () => {
    expect(catalogueCovers("candle making workshop shahjahanpur", CATALOGUE)).toBe(true);
    expect(catalogueCovers("lavender candles online", CATALOGUE)).toBe(true);
  });

  it("something genuinely absent is absent", () => {
    expect(catalogueCovers("reed diffuser refill", CATALOGUE)).toBe(false);
    expect(catalogueCovers("", CATALOGUE)).toBe(false);
    expect(catalogueCovers("anything", [])).toBe(false);
  });
});

describe("the opportunities themselves", () => {
  it("SEEN AND NEVER CLICKED is the strongest one, and it quotes the real figures", () => {
    const out = marketOpportunities({ queries: [q("soy candles online india", 62, 0, 14.2)], signals: [], catalogue: CATALOGUE });
    const o = out.find((x) => x.type === "search_seen_not_clicked")!;
    expect(o.title).toContain("showed you 62 times");
    expect(o.description).toContain("62 impressions and 0 clicks");
    expect(o.description).toContain("position 14.2");
    expect(o.priority).toBe("high"); // 62 is past STRONG_DEMAND
  });

  it("a smaller version of the same thing is medium, not high", () => {
    const out = marketOpportunities({ queries: [q("soy candles online india", STRONG_DEMAND - 20, 0, 14)], signals: [], catalogue: CATALOGUE });
    expect(out.find((x) => x.type === "search_seen_not_clicked")!.priority).toBe("medium");
  });

  it("A HANDFUL OF IMPRESSIONS IS NOT AN OPPORTUNITY", () => {
    const out = marketOpportunities({ queries: [q("soy candles", 3, 0, 40)], signals: [], catalogue: CATALOGUE });
    expect(out).toEqual([]);
  });

  it("real buying demand the catalogue doesn't name", () => {
    const out = marketOpportunities({ queries: [q("buy reed diffuser refill online", 80, 1, 12)], signals: [], catalogue: CATALOGUE });
    const o = out.find((x) => x.type === "demand_without_offer")!;
    expect(o.title).toContain("nothing named for it");
    expect(o.description).toContain("80 impressions");
  });

  it("demand the catalogue DOES cover is not reported as a gap", () => {
    const out = marketOpportunities({ queries: [q("book candle making workshop", 90, 2, 6)], signals: [], catalogue: CATALOGUE });
    expect(out.some((x) => x.type === "demand_without_offer")).toBe(false);
  });

  it("an informational search is not treated as unmet buying demand", () => {
    const out = marketOpportunities({ queries: [q("how to make reed diffusers at home", 200, 3, 9)], signals: [], catalogue: CATALOGUE });
    expect(out.some((x) => x.type === "demand_without_offer")).toBe(false);
  });

  it("ONE COMPETITOR IS NEWS; TWO IS A PATTERN", () => {
    const one = marketOpportunities({
      queries: [],
      signals: [signal({ evidence: { competitor: "Aroma Co", headline: "Same-day delivery launched" } })],
      catalogue: CATALOGUE,
    });
    expect(one.some((x) => x.type === "competitor_pattern")).toBe(false);

    const two = marketOpportunities({
      queries: [],
      signals: [
        signal({ id: "a", evidence: { competitor: "Aroma Co", headline: "Same-day delivery launched" } }),
        signal({ id: "b", evidence: { competitor: "Wick & Co", headline: "Now offering delivery across the city" } }),
      ],
      catalogue: CATALOGUE,
    });
    const o = two.find((x) => x.type === "competitor_pattern")!;
    expect(o.title).toContain(`${PATTERN_COMPETITORS} competitors have moved on "delivery"`);
    expect(o.description).toContain("Aroma Co");
    expect(o.description).toContain("Wick & Co");
  });

  it("the same competitor twice is still one competitor", () => {
    const out = marketOpportunities({
      queries: [],
      signals: [
        signal({ id: "a", evidence: { competitor: "Aroma Co", headline: "Delivery launched" } }),
        signal({ id: "b", evidence: { competitor: "Aroma Co", headline: "Delivery expanded" } }),
      ],
      catalogue: CATALOGUE,
    });
    expect(out.some((x) => x.type === "competitor_pattern")).toBe(false);
  });

  it("only the strongest competitor pattern is raised — a list of themes is noise", () => {
    const out = marketOpportunities({
      queries: [],
      signals: [
        signal({ id: "a", evidence: { competitor: "A", headline: "Delivery and gifting launched" } }),
        signal({ id: "b", evidence: { competitor: "B", headline: "Delivery and gifting added" } }),
      ],
      catalogue: CATALOGUE,
    });
    expect(out.filter((x) => x.type === "competitor_pattern")).toHaveLength(1);
  });

  it("an AI answer naming someone else is described as OBSERVED, not as a measurement", () => {
    const out = marketOpportunities({
      queries: [],
      signals: [signal({
        source: "aeo", confidence: "observed",
        summary: 'Not named for "best candle workshop in Shahjahanpur" — Aroma Co, Wick & Co are',
        evidence: { question: "best candle workshop in Shahjahanpur", competitorsNamed: ["Aroma Co", "Wick & Co"] },
      })],
      catalogue: CATALOGUE,
    });
    const o = out.find((x) => x.type === "not_named_in_answers")!;
    expect(o.title).toContain("Aroma Co and Wick & Co");
    expect(o.description).toContain("what a live search returned, not a measurement");
  });
});

describe("the dimension it cannot measure", () => {
  it("SAYS SO, on every opportunity where it matters, rather than quietly completing the formula", () => {
    const out = marketOpportunities({
      queries: [q("soy candles online india", 62, 0, 14.2), q("buy reed diffuser refill", 80, 1, 12)],
      signals: [
        signal({ id: "a", evidence: { competitor: "A", headline: "Delivery launched" } }),
        signal({ id: "b", evidence: { competitor: "B", headline: "Delivery added" } }),
      ],
      catalogue: CATALOGUE,
    });
    for (const type of ["search_seen_not_clicked", "demand_without_offer", "competitor_pattern"]) {
      expect(out.find((x) => x.type === type)!.description, type).toContain("not something Hawlai can measure");
    }
  });

  it("NO SCORE OUT OF A HUNDRED anywhere — bands are all the evidence supports", () => {
    const out = marketOpportunities({ queries: [q("soy candles online india", 62, 0, 14.2)], signals: [], catalogue: CATALOGUE });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/\/100|score/i);
    for (const o of out) expect(["high", "medium", "low"]).toContain(o.priority);
  });

  it("nothing to say is nothing said", () => {
    expect(marketOpportunities({ queries: [], signals: [], catalogue: CATALOGUE })).toEqual([]);
  });
});

// ---- it reaches the feed the owner already reads ---------------------------
let tables: Record<string, any[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let staged: any = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const api: any = {
      select: () => api,
      limit: () => api,
      order: (col: string, o: any) => (orders.push({ col, asc: o?.ascending !== false }), api),
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      neq: () => api,
      not: () => api,
      lt: () => api,
      in: () => api,
      is: () => api,
      insert: (r: any) => {
        mode = "insert";
        staged = Array.isArray(r) ? r : [r];
        (tables[table] ??= []).push(...staged);
        return api;
      },
      update: (r: any) => ((mode = "update"), (staged = r), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: mode === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/agents/optimizationAgent", () => ({ analyzeCampaigns: async () => ({ recommendations: [] }) }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    leads: [], pending_approvals: [], ad_creatives: [], brand_profiles: [{ id: "b1", dealership_id: "d1" }],
    collab_applications: [], abandoned_carts: [], goals: [], affiliates: [], opportunities: [],
    products: [{ dealership_id: "d1", name: "Candle Making Workshop", is_active: true }],
    search_queries: [{ dealership_id: "d1", query: "soy candles online india", clicks: 0, impressions: 62, ctr: 0, position: 14.2, window_to: "2026-09-23" }],
    business_signals: [],
  };
});

describe("it lands in the opportunities feed", () => {
  it("a counted search gap becomes an open opportunity, in the feed the owner already reads", async () => {
    const { syncOpportunities } = await import("@/lib/agents/opportunityAgent");
    await syncOpportunities(db(), "d1");

    const raised = tables.opportunities.find((o) => o.type === "search_seen_not_clicked");
    expect(raised).toBeTruthy();
    expect(raised.reference_id).toBe("soy candles online india");
    expect(raised.priority).toBe("high");
    expect(raised.action_href).toBe("/dashboard/seo");
  });

  it("A FAILURE IN THIS PART LEAVES THE REST OF THE FEED INTACT", async () => {
    // Search data unreadable: the ordinary opportunities must still land.
    tables.pending_approvals = [{ id: "a1", dealership_id: "d1", status: "pending" }];
    delete (tables as any).search_queries;
    const { syncOpportunities } = await import("@/lib/agents/opportunityAgent");
    await syncOpportunities(db(), "d1");
    expect(tables.opportunities.some((o) => o.type === "pending_approvals")).toBe(true);
  });
});
