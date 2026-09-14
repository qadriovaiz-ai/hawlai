// Every copy path knows where today sits in India's festival calendar.
//
// THE FAILURE THIS EXISTS FOR: seasonal timing lived only as knowledge-
// base advice that chat searched by similarity. Nothing told a generator
// that Diwali was over, so a Diwali section could sit on a homepage into
// December; nothing said a festive campaign should launch weeks before
// the day. Festival dates were never loaded because a guessed date is a
// fabricated fact — migration 180 loads approved ones.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FESTIVAL_GUIDE,
  seasonFor,
  seasonEvents,
  outOfSeasonFestival,
  formatSeason,
  indiaToday,
  type SeasonalEventRow,
} from "@/lib/expertise/seasonalCalendar";
import { gatherBusinessFacts, formatFactsForCopy, formatFactsForPrompt, COPY_TRUTH_RULES } from "@/lib/claims/businessFacts";

// The rows migration 180 loads, parsed from the migration itself — so a
// typo in a name or date there fails here, not silently in production.
const MIGRATION = readFileSync(join(__dirname, "../supabase/migrations/180_seasonal_events_india_2026_27.sql"), "utf-8");
const ROWS: SeasonalEventRow[] = Array.from(MIGRATION.matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})',\s*(\d+),/g)).map((m) => ({
  name: m[1],
  event_date: m[2],
  lead_time_days: Number(m[3]),
}));

describe("migration 180's dates", () => {
  it("loads all 29 approved dates, each named exactly as a festival the guide knows", () => {
    expect(ROWS).toHaveLength(29);
    const known = new Set(FESTIVAL_GUIDE.filter((g) => !g.date).map((g) => g.name));
    expect(ROWS.filter((r) => !known.has(r.name))).toEqual([]);
  });

  it.each([
    ["Diwali", "2026-11-08", 0],
    ["Dhanteras", "2026-11-06", 5],
    ["Sharad Navratri", "2026-10-11", 0],
    ["Dussehra", "2026-10-20", 2],
    ["Holi", "2027-03-23", 2],
    ["Akshaya Tritiya", "2027-05-09", 0],
    ["Raksha Bandhan", "2027-08-17", 2],
    ["Diwali", "2027-10-29", 5],
  ])("%s is on %s (weekday %i, as the source lists it)", (name, date, weekday) => {
    expect(ROWS).toContainEqual(expect.objectContaining({ name, event_date: date }));
    expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(weekday);
  });

  it("Navratri runs nine days into Dussehra, both years — the two sources agree", () => {
    const d = (name: string, year: string) => ROWS.find((r) => r.name === name && r.event_date.startsWith(year))!.event_date;
    const gap = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
    expect(gap(d("Sharad Navratri", "2026"), d("Dussehra", "2026"))).toBe(9);
    expect(gap(d("Sharad Navratri", "2027"), d("Dussehra", "2027"))).toBe(9);
    expect(gap(d("Dhanteras", "2026"), d("Diwali", "2026"))).toBe(2);
    expect(gap(d("Dhanteras", "2027"), d("Diwali", "2027"))).toBe(2);
  });

  it("adds the out-of-season notification kind, keeping every existing kind", () => {
    expect(MIGRATION).toContain("'out_of_season_content'");
    for (const k of ["competitor_alert", "hot_lead", "platform_spend_alert", "lead_merge_needs_review"]) expect(MIGRATION).toContain(`'${k}'`);
  });
});

describe("dates worked out in code", () => {
  it.each([
    ["Mother's Day", "2026", "2026-05-10"],
    ["Mother's Day", "2027", "2027-05-09"],
    ["Father's Day", "2026", "2026-06-21"],
    ["Father's Day", "2027", "2027-06-20"],
    ["Christmas", "2026", "2026-12-25"],
    ["Republic Day", "2027", "2027-01-26"],
  ])("%s %s is %s", (name, year, date) => {
    const events = seasonEvents([], `${year}-03-01`);
    expect(events.filter((e) => e.name === name).map((e) => e.date)).toContain(date);
  });

  it("'today' is India's date, not UTC's — a festival starts at Indian midnight", () => {
    expect(indiaToday(new Date("2026-11-07T20:00:00Z"))).toBe("2026-11-08");
    expect(indiaToday(new Date("2026-11-07T18:00:00Z"))).toBe("2026-11-07");
  });
});

describe("where today sits", () => {
  it("20 Oct 2026: Dussehra is on, Diwali's window has opened, Ganesh Chaturthi is over", () => {
    const s = seasonFor(ROWS, "2026-10-20");
    expect(s.now.map((e) => e.name)).toEqual(expect.arrayContaining(["Dussehra", "Sharad Navratri", "Durga Puja"]));
    expect(s.launchNow.map((e) => e.name)).toEqual(["Karwa Chauth", "Dhanteras", "Diwali"]);
    expect(s.justEnded.map((e) => e.name)).toContain("Ganesh Chaturthi");
    expect(s.planAhead.map((e) => e.name)).toEqual(expect.arrayContaining(["Bhai Dooj", "Guru Nanak Jayanti"]));
    // Only the next 60 days — Holi in March is too far out to plan around now.
    expect(s.planAhead.map((e) => e.name)).not.toContain("Holi");
    expect(Math.max(...s.planAhead.map((e) => e.daysAway))).toBeLessThanOrEqual(60);
  });

  it("a campaign window opens 2–3 weeks ahead, not on the day: Diwali 2026 opens 18 Oct", () => {
    expect(seasonFor(ROWS, "2026-10-17").launchNow.map((e) => e.name)).not.toContain("Diwali");
    expect(seasonFor(ROWS, "2026-10-17").planAhead.find((e) => e.name === "Diwali")?.launchFrom).toBe("2026-10-18");
    expect(seasonFor(ROWS, "2026-10-18").launchNow.map((e) => e.name)).toContain("Diwali");
  });

  it("the Season block says what to write for, what not to, and how far dates are known", () => {
    const text = formatSeason(seasonFor(ROWS, "2026-10-20"));
    expect(text).toContain("this month: Navratri, Dussehra and the run-up to Diwali");
    expect(text).toMatch(/Campaign window open: Diwali on 8 Nov, 19 day\(s\) away — India's biggest gifting season/);
    expect(text).toMatch(/Over — don't write for it: Ganesh Chaturthi/);
    expect(text).toContain("Festival dates are loaded up to 29 Oct 2027; don't state a festival date beyond that.");
  });

  it("with no dates loaded it says so, rather than implying there are no festivals", () => {
    expect(formatSeason(seasonFor([], "2026-10-20"))).toContain("No festival dates are loaded; don't state any festival date.");
  });
});

describe("copy still selling a festival that's over", () => {
  it("a Diwali heading in December is out of season", () => {
    expect(outOfSeasonFestival("Diwali Gifting — light up their home", ROWS, "2026-12-05")).toEqual({ festival: "Diwali", endedDaysAgo: 27 });
  });

  it("the same heading during Diwali's campaign window is fine", () => {
    expect(outOfSeasonFestival("Diwali Gifting — light up their home", ROWS, "2026-10-25")).toBeNull();
    expect(outOfSeasonFestival("Diwali Gifting", ROWS, "2026-11-12")).toBeNull(); // Diwali week still on
  });

  it("'Eid Mubarak' isn't flagged in the run-up to the second Eid", () => {
    expect(outOfSeasonFestival("Eid Mubarak from us", ROWS, "2027-04-01")).toEqual({ festival: "Eid al-Fitr", endedDaysAgo: 22 });
    expect(outOfSeasonFestival("Eid Mubarak from us", ROWS, "2027-05-12")).toBeNull();
  });

  it("words that merely contain a festival's name don't count", () => {
    expect(outOfSeasonFestival("Holiday gifting, sorted", ROWS, "2027-06-01")).toBeNull();
  });

  it("a mention long after the season (90+ days) is treated as evergreen, not a forgotten campaign", () => {
    expect(outOfSeasonFestival("Perfect for Diwali gifting", ROWS, "2027-03-01")).toBeNull();
  });
});

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let failing: Set<string>;

function db() {
  const from = (table: string) => {
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, eq: () => api,
      maybeSingle: async () => result((tables[table] ?? [])[0] ?? null),
      single: async () => result((tables[table] ?? [])[0] ?? null),
      then: (res: any, rej: any) => Promise.resolve(result(tables[table] ?? [])).then(res, rej),
    };
    const result = (data: any) => (failing.has(table) ? { data: null, error: { message: `${table} is down` } } : { data, error: null });
    return api;
  };
  return { from };
}

describe("through gatherBusinessFacts — what every generator is given", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-05T06:00:00Z"));
    failing = new Set();
    tables = {
      dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance" }],
      websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
      website_pages: [{ slug: "home", title: "Home", page_type: "home", sections: [{ type: "hero", headline: "A mood, not just a candle." }, { type: "text", headline: "Diwali Gifting", body: "Gift a glow this Diwali." }] }],
      products: [{ id: "p1", name: "Lavender candle", price: 550, is_active: true }],
      seasonal_events: ROWS,
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("the live site's leftover Diwali section is named in the facts copy and CRO both see", async () => {
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.season.today).toBe("2026-12-05");
    expect(f.season.outOfSeason).toEqual([{ festival: "Diwali", endedDaysAgo: 27, where: "the Home page", text: "Diwali Gifting" }]);
    expect(formatFactsForCopy(f)).toContain('OUT OF SEASON on this business\'s live website: the Home page says "Diwali Gifting" — Diwali was 27 days ago.');
    expect(formatFactsForPrompt(f)).toContain('Out of season: the Home page still says "Diwali Gifting" — Diwali was 27 days ago.');
    expect(formatFactsForCopy(f)).toMatch(/Campaign window open: Christmas on 25 Dec/);
  });

  it("an unpublished site isn't flagged — no customer sees it", async () => {
    tables.websites[0].published = false;
    expect((await gatherBusinessFacts(db(), "d1")).season.outOfSeason).toEqual([]);
  });

  it("if festival dates can't be read, the facts say so instead of pretending there are none", async () => {
    failing.add("seasonal_events");
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.unreadable).toContain("festival dates");
    expect(formatFactsForCopy(f)).toContain("No festival dates are loaded");
  });

  it("the truth rules every generator carries include festival timing", () => {
    expect(COPY_TRUTH_RULES).toContain("write for a festival only while it's happening or its campaign window is open");
    expect(COPY_TRUTH_RULES).toContain("Festive campaigns launch 2–3 weeks before the day, not on it");
  });
});
