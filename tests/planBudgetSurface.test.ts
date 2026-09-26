// Phase 3 reaches the owner (Brain, Phase 3 surfacing).
//
// The libraries landed first and nothing called them. Two surfaces, split
// by what each thing actually is: a budget is a QUESTION, so it is a chat
// tool; which channels suit the business is STANDING INFORMATION, so it
// ships with the diagnosis on the Strategy page rather than behind a
// button.
//
// The refusals live in the library, not in a prompt — a model cannot talk
// its way past arithmetic. What these tests hold is that the surface
// doesn't undo them: no invented lead count, no projection without the
// measured figure it rests on, and a card that shows what is unknown
// instead of hiding it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const api: any = {
      select: (_cols?: string, opts?: any) => {
        api._count = opts?.count === "exact";
        return api;
      },
      order: () => api,
      limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      neq: () => api,
      gte: () => api,
      lt: () => api,
      lte: () => api,
      not: () => api,
      in: () => api,
      is: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null, count: rows().length }).then(res, rej),
    };
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { executeTool, extractArtifact, TOOLS } from "@/lib/agents/masterBrainV2";

const ctx: any = { id: "d1", name: "Candle by Qaaf", category: "Home fragrance", city: "Shahjahanpur", toneOfVoice: "warm" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    dealerships: [{ id: "d1", fb_page_id: "PAGE1", city: "Shahjahanpur", search_console_site_url: "sc-domain:hawlai.online" }],
    products: [{ dealership_id: "d1", name: "Lavender Candle", images: ["x.jpg"], price: 450, kind: "product", is_active: true }],
    search_queries: [{ dealership_id: "d1", query: "buy soy candles online", clicks: 0, impressions: 62, ctr: 0, position: 12, window_to: "2026-09-23" }],
    leads: [{ id: "l1", dealership_id: "d1" }],
    orders: [], page_events: [], campaign_performance_history: [], business_signals: [],
  };
});

describe("the tool the owner reaches it through", () => {
  it("is offered to the chat, and the description forbids adding a forecast", () => {
    const tool = TOOLS.find((t: any) => t.name === "plan_budget") as any;
    expect(tool).toBeTruthy();
    expect(tool.input_schema.required).toEqual(["budgetInr"]);
    expect(tool.description).toContain("these are splits, NOT forecasts");
    expect(tool.description).toContain("Never add a projection, a revenue figure or an ROI of your own");
    expect(tool.description).toContain("say why it couldn't");
  });

  it("A BUDGET WITH NO MEASURED COST PER LEAD RETURNS NO LEAD NUMBERS, and names what's missing", async () => {
    const result: any = await executeTool(db(), ctx, "plan_budget", { budgetInr: 50000 }, "");

    expect(result.budgetInr).toBe(50000);
    expect(result.scenarios.length).toBeGreaterThan(0);
    for (const s of result.scenarios) {
      expect(s.projectedLeadsTotal).toBeNull();
      for (const a of s.allocations) expect(a.projectedLeads).toBeNull();
      expect(s.unknowns.join(" ")).toContain("What a lead costs this business");
    }
    // And the note tells the model what to do about that.
    expect(result.note).toContain("there is NO lead number to give");
  });

  it("the channels it used are returned too, so the reply can say WHY a channel is in the split", async () => {
    const result: any = await executeTool(db(), ctx, "plan_budget", { budgetInr: 50000 }, "");
    const search = result.channels.find((c: any) => c.channel === "google_search");
    // 62 impressions of buying intent are on record, so this is not a guess.
    expect(search.standing).toBe("fits");
    expect(search.reasons[0]).toContain("62 impressions");
  });

  it("the card shows the split, and shows what ISN'T known rather than hiding it", async () => {
    const result: any = await executeTool(db(), ctx, "plan_budget", { budgetInr: 50000 }, "");
    const card: any = extractArtifact("plan_budget", { budgetInr: 50000 }, result);

    expect(card.kind).toBe("document");
    expect(card.label).toContain("₹50,000");
    expect(card.summary).toContain("not forecasts");
    const firstGroup = card.groups[0];
    expect(firstGroup.items[0].label).toMatch(/₹[\d,]+ \(\d+%\)/);
    // No lead figure anywhere, and the unknown is on the card.
    expect(JSON.stringify(card)).not.toMatch(/about \d+ leads/);
    expect(firstGroup.items.some((i: any) => i.label === "Not known yet")).toBe(true);
  });

  it("nothing fundable produces a card that says so, not an empty plan", async () => {
    // No photographs, no Facebook Page, no search demand.
    tables.products = [{ dealership_id: "d1", name: "Lavender Candle", images: [], price: 450, kind: "product", is_active: true }];
    tables.dealerships = [{ id: "d1", city: "Shahjahanpur" }];
    tables.search_queries = [];

    const result: any = await executeTool(db(), ctx, "plan_budget", { budgetInr: 50000 }, "");
    expect(result.scenarios).toEqual([]);
    expect(result.thin).toContain("None of the paid channels");
    expect(result.note).toContain("Don't offer a plan anyway");

    const card: any = extractArtifact("plan_budget", {}, result);
    expect(card.summary).toBe(result.thin);
    expect(card.groups).toBeUndefined();
  });

  it("a projection appears on the card ONLY with the campaign it was measured on", async () => {
    // A real campaign with a real cost per lead, in the history the
    // diagnosis reads.
    tables.campaign_performance_history = [
      { dealership_id: "d1", campaign_name: "Diwali gifting", spend: 4000, leads: 16, recorded_at: new Date().toISOString(), created_at: new Date().toISOString() },
    ];
    const result: any = await executeTool(db(), ctx, "plan_budget", { budgetInr: 50000 }, "");
    const card: any = extractArtifact("plan_budget", {}, result);
    const text = JSON.stringify(card);
    // Either there is no projection, or every projection names its basis.
    for (const s of result.scenarios) {
      for (const a of s.allocations) {
        if (a.projectedLeads !== null) expect(a.basis).toContain("actually cost");
      }
    }
    if (/about \d+ leads/.test(text)) expect(text).toContain("actually cost");
  });
});

describe("where channel fit is shown", () => {
  const route = readFileSync("src/app/api/strategy/diagnosis/route.ts", "utf8");
  const panel = readFileSync("src/components/strategy/DiagnosisPanel.tsx", "utf8");

  it("ships with the numbers, not behind the advice button — it costs nothing to compute", () => {
    expect(route).toContain("channelFit(fitInput)");
    // Returned on the plain read as well as the advice read.
    expect(route).toContain("NextResponse.json({ diagnosis, channels })");
  });

  it("A FAILURE THERE MUST NOT TAKE THE DIAGNOSIS DOWN — the diagnosis is the point of that route", () => {
    expect(route).toContain("channel fit skipped");
  });

  it("the three standings are shown as three plainly different things", () => {
    expect(panel).toContain("Already works here");
    expect(panel).toContain("Fits your facts");
    expect(panel).toContain("Untested");
    // "Recommended" would claim evidence an untested channel doesn't have.
    expect(panel).not.toContain("Recommended");
  });

  it("what a channel needs, and what would settle it, both reach the screen", () => {
    expect(panel).toContain("Needs:");
    expect(panel).toContain("To find out:");
  });

  it("both surfaces build their inputs from the same loader", () => {
    expect(route).toContain("loadFitInput");
    expect(readFileSync("src/lib/agents/masterBrainV2.ts", "utf8")).toContain("loadFitInput");
  });
});
