// The daily check that tells an owner their site or calendar is still
// selling a festival that's over.
//
// THE FAILURE: an old Diwali section sat on a homepage into December.
// Nobody is re-reading their own homepage every week, so the platform
// has to notice — once per festival per place, not a daily nag — and it
// has to run whether or not the owner turned on Seasonal Campaigns,
// because it only warns and never changes anything.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSeasonalCalendar, flagOutOfSeasonContent } from "@/lib/agents/seasonalityAgent";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserted: { table: string; row: Row }[];
let failing: Set<string>;

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const result = (data: any) => (failing.has(table) ? { data: null, error: { message: `${table} is down` } } : { data, error: null });
    const api: any = {
      select: () => api, order: () => api, limit: () => api,
      gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      insert: async (row: Row) => (inserted.push({ table, row }), { error: null }),
      maybeSingle: async () => result(rows()[0] ?? null),
      single: async () => result(rows()[0] ?? null),
      then: (res: any, rej: any) => Promise.resolve(result(rows())).then(res, rej),
    };
    return api;
  };
  return { from };
}

const MIGRATION = readFileSync(join(__dirname, "../supabase/migrations/180_seasonal_events_india_2026_27.sql"), "utf-8");
const FESTIVALS = Array.from(MIGRATION.matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})',\s*(\d+),/g)).map((m, i) => ({ id: `e${i}`, name: m[1], event_date: m[2], lead_time_days: Number(m[3]) }));

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", seasonal_campaigns_enabled: false }],
  seasonal_events: FESTIVALS,
  websites: [{ id: "w1", dealership_id: "d1", published: true }],
  website_pages: [
    { website_id: "w1", slug: "home", title: "Home", sections: [{ type: "hero", headline: "A mood, not just a candle." }, { type: "text", headline: "Diwali Gifting", body: "Gift a glow this Diwali." }] },
    { website_id: "w1", slug: "about", title: "About", sections: [{ type: "text", headline: "Hand-poured in Lucknow" }] },
  ],
  marketing_calendar: [
    { id: "c1", dealership_id: "d1", title: "Diwali campaign", status: "planned" },
    { id: "c2", dealership_id: "d1", title: "Dussehra campaign", status: "completed" },
    { id: "c3", dealership_id: "d1", title: "Christmas campaign", status: "planned" },
  ],
});

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const notifications = () => inserted.filter((i) => i.table === "notifications").map((i) => i.row);

beforeEach(() => {
  vi.useFakeTimers();
  tables = STORE();
  inserted = [];
  failing = new Set();
});
afterEach(() => vi.useRealTimers());

describe("the live case: 5 Dec 2026, Diwali was 8 Nov", () => {
  // The home page mentions Diwali twice (heading and body) — still one flag for that page.
  it("flags the homepage's Diwali section and the still-planned Diwali campaign — nothing else", async () => {
    at("2026-12-05T06:00:00Z");
    const r = await flagOutOfSeasonContent(db(), "d1");
    expect(r).toEqual({
      flagged: [
        { festival: "Diwali", where: "the Home page of your website", text: "Diwali Gifting" },
        { festival: "Diwali", where: '"Diwali campaign" in your Content Calendar', text: "Diwali campaign" },
      ],
    });
  });

  it("notifies the owner once per festival, year and place, pointing at where to fix it", async () => {
    at("2026-12-05T06:00:00Z");
    await flagOutOfSeasonContent(db(), "d1");
    expect(notifications()).toEqual([
      {
        dealership_id: "d1",
        kind: "out_of_season_content",
        title: "Diwali is over, but the Home page of your website still mentions it",
        body: '"Diwali Gifting" — Diwali was 27 days ago. Update or remove it so customers don\'t see an old campaign.',
        href: "/dashboard/website-builder",
        dedupe_key: "out_of_season:Diwali:2026:the Home page of your website",
      },
      expect.objectContaining({ href: "/dashboard/calendar", dedupe_key: 'out_of_season:Diwali:2026:"Diwali campaign" in your Content Calendar' }),
    ]);
  });
});

describe("no false alarms", () => {
  it("during Diwali's campaign window nothing is flagged", async () => {
    at("2026-10-25T06:00:00Z");
    expect(await flagOutOfSeasonContent(db(), "d1")).toEqual({ flagged: [] });
    expect(notifications()).toEqual([]);
  });

  it("an unpublished website isn't checked — no customer sees it", async () => {
    at("2026-12-05T06:00:00Z");
    tables.websites[0].published = false;
    const r = (await flagOutOfSeasonContent(db(), "d1")) as any;
    expect(r.flagged.map((f: any) => f.where)).toEqual(['"Diwali campaign" in your Content Calendar']);
  });

  it("a campaign already marked completed isn't flagged", async () => {
    at("2026-10-24T06:00:00Z"); // Dussehra (20 Oct) is over, Diwali's window is open
    const r = (await flagOutOfSeasonContent(db(), "d1")) as any;
    expect(r.flagged).toEqual([]);
  });
});

describe("the daily run", () => {
  it("runs the warning even with Seasonal Campaigns off, creating no calendar entries", async () => {
    at("2026-12-05T06:00:00Z");
    const r = await runSeasonalCalendar(db(), "d1");
    expect(r).toEqual({ entriesCreated: 0, outOfSeason: expect.arrayContaining([expect.objectContaining({ festival: "Diwali" })]) });
    expect(inserted.filter((i) => i.table === "marketing_calendar")).toEqual([]);
  });

  it("a check that couldn't read the festival dates is reported as a failure, not as 'nothing found'", async () => {
    at("2026-12-05T06:00:00Z");
    failing.add("seasonal_events");
    const r = await runSeasonalCalendar(db(), "d1");
    expect(r).toEqual({ entriesCreated: 0, error: "festival dates couldn't be read: seasonal_events is down" });
  });

  it("with Seasonal Campaigns on, a planning entry opens with the launch timing and the festival's angle", async () => {
    at("2026-10-18T06:00:00Z");
    tables.dealerships[0].seasonal_campaigns_enabled = true;
    tables.marketing_calendar = [];
    await runSeasonalCalendar(db(), "d1");
    const diwali = inserted.find((i) => i.table === "marketing_calendar" && i.row.title === "Diwali campaign")!.row;
    expect(diwali.notes).toBe(
      "Diwali is on 2026-11-08. Campaigns should be live from today, 21 days ahead — not on the day. Angle: India's biggest gifting season — gifts for family, friends, clients and hosts; lights and home decor. Launch 2–3 weeks ahead, not on the day."
    );
    expect(diwali.scheduled_date).toBe("2026-10-18");
  });
});

describe("wired into the cron", () => {
  it("the daily run calls it for the seasonal_calendar subsystem, as one logged run", () => {
    const route = readFileSync(join(__dirname, "../src/app/api/autopilot/daily-run/route.ts"), "utf-8");
    expect(route).toMatch(/only\("seasonal_calendar"\)\) results\[id\]\.seasonalCalendar = await run\(id, "seasonal_calendar", \(\) => runSeasonalCalendar\(supabase, id\)\)/);
    expect(route.match(/"seasonal_calendar"/g)).toHaveLength(2);
  });
});
