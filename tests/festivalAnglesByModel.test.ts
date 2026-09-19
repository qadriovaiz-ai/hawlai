// Festival angles by how the business makes money (Strategy step 4 and
// industry-agnostic Phase 3 — one system, 2026-09-20).
//
// Every festival's angle was written for shops: "India's biggest gifting
// season — gifts for family…" reached a salon's and a B2B supplier's copy
// alike. Rules approved 2026-09-17: devotional and national days are
// greetings for everyone; for celebrations, services invite bookings,
// subscriptions greet members (a festive plan only if it's a real offer),
// and B2B sends client greetings — corporate gifting only when it sells
// something giftable.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FESTIVAL_GUIDE, angleFor, formatSeason, seasonFor, seasonEvents, type SeasonalEventRow } from "@/lib/expertise/seasonalCalendar";
import { gatherBusinessFacts, formatFactsForCopy } from "@/lib/claims/businessFacts";
import { syncSeasonalCalendarEntries } from "@/lib/agents/seasonalityAgent";

const MIGRATION = readFileSync(join(__dirname, "../supabase/migrations/180_seasonal_events_india_2026_27.sql"), "utf-8");
const ROWS: SeasonalEventRow[] = Array.from(MIGRATION.matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})',\s*(\d+),/g)).map((m) => ({ name: m[1], event_date: m[2], lead_time_days: Number(m[3]) }));

const guide = (name: string) => FESTIVAL_GUIDE.find((g) => g.name === name)!;
const DIWALI_ANGLE = guide("Diwali").angle;

describe("which festivals are for greetings only", () => {
  it("every festival has a kind; the devotional and national days are exactly these", () => {
    expect(FESTIVAL_GUIDE.every((g) => ["celebration", "devotional", "national"].includes(g.kind))).toBe(true);
    expect(FESTIVAL_GUIDE.filter((g) => g.kind === "devotional").map((g) => g.name).sort()).toEqual(["Chhath Puja", "Guru Nanak Jayanti", "Maha Shivratri", "Ram Navami"]);
    expect(FESTIVAL_GUIDE.filter((g) => g.kind === "national").map((g) => g.name).sort()).toEqual(["Independence Day", "Republic Day"]);
  });

  it("every dated event carries its festival's kind — the 90-day calendar reads it", () => {
    const events = seasonEvents(ROWS, "2026-10-25");
    expect(events.find((e) => e.name === "Diwali")!.kind).toBe("celebration");
    expect(events.find((e) => e.name === "Guru Nanak Jayanti")!.kind).toBe("devotional");
    expect(events.find((e) => e.name === "Republic Day")!.kind).toBe("national");
  });

  it("a devotional or national day reads the same for every kind of business — greetings, no selling angle", () => {
    for (const name of ["Guru Nanak Jayanti", "Independence Day"]) {
      for (const models of [["services"], ["b2b"], ["subscription"], ["products", "services"]] as any[]) {
        expect(angleFor(guide(name), { models, giftable: true })).toBe(guide(name).angle);
      }
    }
  });
});

describe("a celebration's angle, by how the business makes money", () => {
  const diwali = guide("Diwali");

  it("products: the shop's angle — gifting", () => {
    expect(angleFor(diwali, { models: ["products"], giftable: true })).toBe(DIWALI_ANGLE);
  });

  it("services: bookings ahead of the day — never a scarcity claim, never 'gifts'", () => {
    const a = angleFor(diwali, { models: ["services"], giftable: false });
    expect(a).toBe("people get ready for Diwali — invite them to book ahead of the day; never say slots are running out unless that's a fact");
    expect(a).not.toMatch(/gift/i);
  });

  it("subscription: members' greetings; a festive plan only if it's a real offer", () => {
    expect(angleFor(diwali, { models: ["subscription"], giftable: false })).toBe("greet members for Diwali; a festive plan or gift membership only if one is in the active offers");
  });

  it("B2B: client greetings — corporate gifting only when it sells something giftable", () => {
    expect(angleFor(diwali, { models: ["b2b"], giftable: true })).toBe("Diwali greetings to clients, and corporate gifting — its products as gifts for clients and teams");
    const nothingGiftable = angleFor(diwali, { models: ["b2b"], giftable: false });
    expect(nothingGiftable).toBe("Diwali greetings to clients only — nothing it sells is a gift, so no corporate-gifting pitch");
  });

  it("several models: one labelled line each; unknown: the guide's angle, as before", () => {
    expect(angleFor(diwali, { models: ["products", "services"], giftable: true })).toBe(`for products: ${DIWALI_ANGLE}; for services: people get ready for Diwali — invite them to book ahead of the day; never say slots are running out unless that's a fact`);
    expect(angleFor(diwali, { models: [], giftable: true })).toBe(DIWALI_ANGLE);
    expect(angleFor(diwali, null)).toBe(DIWALI_ANGLE);
  });
});

describe("the Season block every generator reads", () => {
  // 25 Oct 2026: Diwali (8 Nov) is in its campaign window.
  const season = seasonFor(ROWS, "2026-10-25");

  it("prints the angle for this business, for what's on now and what's in its window", () => {
    const services = formatSeason(season, { models: ["services"], giftable: false });
    expect(services).toContain("Campaign window open: Diwali on 8 Nov, 14 day(s) away — people get ready for Diwali — invite them to book ahead of the day");
    expect(services).not.toContain(DIWALI_ANGLE);
    expect(formatSeason(season)).toContain(`Diwali on 8 Nov, 14 day(s) away — ${DIWALI_ANGLE}`);
  });
});

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let inserted: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api,
      eq: (k: string, v: any) => (filters.push((r) => !(k in r) || r[k] === v), api),
      insert: (v: Row) => ((inserted = v), (tables[table] ??= []).push(v), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(inserted ? { data: null, error: null } : { data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

describe("through the facts and the seasonal calendar entries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    tables = {
      dealerships: [{ id: "d1", dealership_name: "glow_salon", business_category: "Salon", business_models: ["services"], seasonal_campaigns_enabled: true }],
      products: [{ id: "s1", dealership_id: "d1", name: "Bridal makeup", kind: "service", price: 5000, is_active: true }],
      seasonal_events: ROWS.map((r, i) => ({ id: `e${i}`, ...r })),
      marketing_calendar: [],
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a salon's copy facts carry the services angle for Diwali, not the shop's gifting", async () => {
    const copy = formatFactsForCopy(await gatherBusinessFacts(db() as any, "d1"));
    expect(copy).toContain("Diwali on 8 Nov, 14 day(s) away — people get ready for Diwali — invite them to book ahead of the day");
    expect(copy).not.toContain(DIWALI_ANGLE);
  });

  it("a B2B business selling a product gets corporate gifting; the seasonal calendar entry says so", async () => {
    tables.dealerships[0].business_models = ["b2b"];
    tables.products = [{ id: "p1", dealership_id: "d1", name: "Candle hamper", kind: "product", price: 900, is_active: true }];
    await syncSeasonalCalendarEntries(db() as any, "d1");
    const diwali = tables.marketing_calendar.find((m) => m.title === "Diwali campaign")!;
    expect(diwali.notes).toContain("Angle: Diwali greetings to clients, and corporate gifting");
    expect(diwali.dealership_id).toBe("d1");
  });

  it("a B2B business with nothing giftable gets client greetings only", async () => {
    tables.dealerships[0].business_models = ["b2b"];
    await syncSeasonalCalendarEntries(db() as any, "d1");
    const diwali = tables.marketing_calendar.find((m) => m.title === "Diwali campaign")!;
    expect(diwali.notes).toContain("Angle: Diwali greetings to clients only — nothing it sells is a gift");
  });

  it("the calendar entries read this business's catalogue, not another's", async () => {
    tables.dealerships[0].business_models = ["b2b"];
    tables.products = [{ id: "p9", dealership_id: "d2", name: "Someone else's hamper", kind: "product", price: 900, is_active: true }];
    await syncSeasonalCalendarEntries(db() as any, "d1");
    expect(tables.marketing_calendar.find((m) => m.title === "Diwali campaign")!.notes).toContain("greetings to clients only");
  });
});
