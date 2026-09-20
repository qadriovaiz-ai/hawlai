// Advanced Strategy step 5a (2026-09-20): what the owner accepts from
// their positioning becomes the Brand Voice every generator reads.
//
// The page sends only the choice. The pillars are rebuilt on the server
// from the business's own saved comparison, so nothing a request body
// carries can land in Brand Voice — and nothing is written at all until
// Replace or Add is pressed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "upsert" = "select";
  let payload: Row | null = null;
  const run = () => {
    if (op === "upsert") {
      const rows = (tables[table] ??= []);
      const i = rows.findIndex((r) => r.dealership_id === payload!.dealership_id);
      if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ id: `${table}-1`, ...payload });
      return { data: null, error: null };
    }
    return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const api: any = {
    select: () => api, order: () => api, limit: () => api, eq: (c: string, v: any) => (filters.push((r) => !(c in r) || r[c] === v), api),
    upsert: (p: Row) => ((op = "upsert"), (payload = p), api),
    single: async () => ({ data: run().data?.[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => query(t) });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));

import { GET, POST } from "@/app/api/strategy/positioning/pillars/route";
import { pillarsFrom, mergePillars, MAX_PILLARS } from "@/lib/strategy/pillars";

const ADVICE = {
  statement: "Candles that say exactly what they are made of.",
  angles: [
    { theme: "materials", title: "Name your wax", why: "None of the 3 competitors name theirs." },
    { theme: "handmade", title: "Show the 24-hour set", why: "Your own record says each candle sets for 24 hours." },
  ],
  removed: [],
};

const accept = (body: Row) => POST(new Request("https://hawlai.test/api/strategy/positioning/pillars", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    brand_profiles: [{ dealership_id: "d1", messaging_pillars: ["20 years in Shahjahanpur"] }],
    competitor_positioning: [{ id: "r1", dealership_id: "d1", status: "analysed", created_at: "2026-09-20T05:00:00Z", analysis: { advice: ADVICE } }],
  };
});
afterEach(() => vi.restoreAllMocks());

describe("what's on offer", () => {
  it("the kept angles become the pillars, in order — and the statement comes along", () => {
    expect(pillarsFrom(ADVICE)).toEqual({
      statement: "Candles that say exactly what they are made of.",
      pillars: ["Name your wax", "Show the 24-hour set"],
    });
    expect(pillarsFrom(null)).toEqual({ statement: null, pillars: [] });
    expect(pillarsFrom({ angles: [{ title: "  Spaced   out  " }, { title: "spaced out" }, { title: "" }] }).pillars).toEqual(["Spaced out"]);
  });

  it("never more than the limit", () => {
    const many = { angles: Array.from({ length: 9 }, (_, i) => ({ title: `Angle ${i}` })) };
    expect(pillarsFrom(many).pillars).toHaveLength(MAX_PILLARS);
    expect(mergePillars(["A", "B", "C", "D", "E", "F"], ["G"])).toHaveLength(MAX_PILLARS);
  });

  it("adding keeps what's there, drops repeats, and appends the rest", () => {
    expect(mergePillars(["20 years in Shahjahanpur"], ["Name your wax", "20 YEARS IN SHAHJAHANPUR"])).toEqual(["20 years in Shahjahanpur", "Name your wax"]);
  });

  it("GET shows both sides", async () => {
    const body = await (await GET()).json();
    expect(body).toMatchObject({
      offered: { pillars: ["Name your wax", "Show the 24-hour set"], statement: "Candles that say exactly what they are made of." },
      current: ["20 years in Shahjahanpur"],
      from: "2026-09-20T05:00:00Z",
    });
  });
});

describe("accepting — only on the click, only what was verified", () => {
  it("Replace puts the comparison's pillars in, and keeps the statement", async () => {
    const res = await accept({ mode: "replace" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pillars: ["Name your wax", "Show the 24-hour set"], replaced: ["20 years in Shahjahanpur"] });
    expect(tables.brand_profiles[0]).toMatchObject({
      dealership_id: "d1",
      messaging_pillars: ["Name your wax", "Show the 24-hour set"],
      positioning_statement: "Candles that say exactly what they are made of.",
    });
    expect(tables.brand_profiles[0].positioning_accepted_at).toBeTruthy();
  });

  it("Add keeps what was there", async () => {
    await accept({ mode: "add" });
    expect(tables.brand_profiles[0].messaging_pillars).toEqual(["20 years in Shahjahanpur", "Name your wax", "Show the 24-hour set"]);
  });

  it("pillars sent in the request body are ignored — only the saved comparison counts", async () => {
    await accept({ mode: "replace", pillars: ["We are the cheapest in India"], statement: "Cheapest, guaranteed" });
    expect(tables.brand_profiles[0].messaging_pillars).toEqual(["Name your wax", "Show the 24-hour set"]);
    expect(tables.brand_profiles[0].positioning_statement).not.toContain("Cheapest");
  });

  it("without a choice, or with nothing to accept, nothing is written", async () => {
    const noMode = await accept({});
    expect(noMode.status).toBe(400);
    expect(tables.brand_profiles[0].messaging_pillars).toEqual(["20 years in Shahjahanpur"]);

    tables.competitor_positioning = [];
    const nothing = await accept({ mode: "replace" });
    expect(nothing.status).toBe(400);
    expect((await nothing.json()).error).toBe("There's nothing to accept yet — run a competitor comparison first.");
    expect(tables.brand_profiles[0].messaging_pillars).toEqual(["20 years in Shahjahanpur"]);
  });

  it("another business's comparison is never the source", async () => {
    tables.competitor_positioning = [{ id: "theirs", dealership_id: "d2", status: "analysed", created_at: "2026-09-20T06:00:00Z", analysis: { advice: ADVICE } }];
    expect((await accept({ mode: "replace" })).status).toBe(400);
    expect(tables.brand_profiles[0].messaging_pillars).toEqual(["20 years in Shahjahanpur"]);
  });

  it("the page only offers the choice — it doesn't write anything itself", () => {
    const panel = readFileSync("src/components/strategy/PositioningPanel.tsx", "utf8");
    expect(panel).toContain('body: JSON.stringify({ mode }),');
    expect(panel).toContain('onClick={() => accept("replace")}');
    expect(panel).toContain('onClick={() => accept("add")}');
    // The page never PATCHes the brand profile behind the owner's back.
    expect(panel).not.toContain("/api/brand-profile");
  });

  it("migration 195 gives the accepted positioning somewhere to land", () => {
    const sql = readFileSync("supabase/migrations/195_strategy_loop.sql", "utf8");
    expect(sql).toContain("alter table brand_profiles add column if not exists positioning_statement text;");
    expect(sql).toContain("alter table brand_profiles add column if not exists positioning_accepted_at timestamptz;");
  });
});
