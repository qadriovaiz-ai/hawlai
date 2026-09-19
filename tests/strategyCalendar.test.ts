// Advanced Strategy step 4: the next 90 days, week by week (2026-09-20).
// Code decides every week — dates, festival window (with the angle for how
// the business makes money), or what to work on from its own diagnosis and
// competitor positioning. A model writes one idea per week; each is
// checked: format, festival window, claims guard.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SeasonalEventRow } from "@/lib/expertise/seasonalCalendar";
import { angleFor, FESTIVAL_GUIDE } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import type { Diagnosis } from "@/lib/strategy/diagnosis";
import type { Positioning } from "@/lib/strategy/positioning/analysis";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let factsFixture: BusinessFacts | null;
let diagnosisFixture: Diagnosis | null;
let positioningFixture: any;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, created_at: new Date().toISOString(), ...payload };
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      const found = rows().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api,
      gte: (k: string, v: any) => (filters.push((r) => !(k in r) || String(r[k]) >= String(v)), api),
      eq: (k: string, v: any) => (filters.push((r) => !(k in r) || r[k] === v), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/claims/businessFacts", async (orig) => ({ ...(await orig<any>()), gatherBusinessFactsSafely: async () => factsFixture }));
vi.mock("@/lib/strategy/diagnosis", async (orig) => ({ ...(await orig<any>()), loadDiagnosis: async () => { if (!diagnosisFixture) throw new Error("orders table is down"); return diagnosisFixture; } }));
vi.mock("@/lib/strategy/positioning/run", async (orig) => ({ ...(await orig<any>()), latestPositioning: async () => positioningFixture }));

import { firstMonday, buildWeeks, focusQueue, weight, WEEKS, PLANS_A_DAY } from "@/lib/strategy/calendar/weeks";
import { seasonEvents } from "@/lib/expertise/seasonalCalendar";
import { verifyIdeas } from "@/lib/strategy/calendar/write";
import { GET, POST } from "@/app/api/strategy/calendar/route";
import { createHref } from "@/components/strategy/CalendarPanel";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const MIGRATION = readFileSync(join(__dirname, "../supabase/migrations/180_seasonal_events_india_2026_27.sql"), "utf-8");
const ROWS: SeasonalEventRow[] = Array.from(MIGRATION.matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})',\s*(\d+),/g)).map((m) => ({ name: m[1], event_date: m[2], lead_time_days: Number(m[3]) }));
const TODAY = "2026-09-20"; // a Sunday

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur", site: null, home: null,
    products: [{ id: "p1", name: "Lavender candle", kind: "product", price: 550, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [{ category: "business_story", title: "Materials", content: "Soy wax from a Kanpur supplier." }],
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: null, products: [], booking: null }, season: { today: TODAY, now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any, unreadable: [],
    ...over,
  } as BusinessFacts;
}

const DIAGNOSIS = {
  window: { days: 90, from: "2026-06-22", to: TODAY, label: "last 90 days" },
  models: ["products"],
  funnels: [{ name: "Store", steps: [{ key: "views", label: "Visitors", count: 400, fromPrevious: null }, { key: "leads", label: "Leads", count: 6, fromPrevious: 1.5 }], weakest: { from: "Visitors", to: "Leads", rate: 1.5, entered: 400 }, thin: null }],
  sources: [{ source: "instagram", leads: 6, won: 1, conversion: null, ranked: false }],
  sourcesThin: null,
  atRisk: { count: 3, total: 9, names: ["A", "B", "C"] },
  paid: null,
  gaps: [],
} as unknown as Diagnosis;

const POSITIONING = {
  competitorCount: 5,
  rows: [
    { key: "offers", label: "Offers and discounts", claimedBy: [], examples: [], yourFacts: ["Materials"], standing: "open" },
    { key: "materials", label: "Materials and quality", claimedBy: ["A", "B", "C"], examples: [], yourFacts: ["Materials"], standing: "crowded" },
  ],
  whiteSpace: ["offers"],
  crowdedYouHave: ["materials"],
  openUnbacked: [],
} as unknown as Positioning;

describe("the weeks — decided in code", () => {
  it("a quarter starts on the Monday on or after today", () => {
    expect(firstMonday("2026-09-20")).toBe("2026-09-21"); // Sunday → next day
    expect(firstMonday("2026-09-21")).toBe("2026-09-21"); // Monday → today
    expect(firstMonday("2026-09-22")).toBe("2026-09-28"); // Tuesday → next Monday
  });

  const weeks = buildWeeks({ today: TODAY, festivals: ROWS, angle: { models: ["services"], giftable: false }, diagnosis: DIAGNOSIS, positioning: POSITIONING });

  it("thirteen whole weeks, Monday to Sunday, back to back", () => {
    expect(weeks).toHaveLength(WEEKS);
    expect(weeks[0]).toMatchObject({ week: 1, starts: "2026-09-21", ends: "2026-09-27" });
    expect(weeks[12]).toMatchObject({ week: 13, starts: "2026-12-14", ends: "2026-12-20" });
  });

  it("the week with Diwali in it is Diwali's — its day — with the angle for how this business makes money", () => {
    const w = weeks.find((x) => x.starts <= "2026-11-08" && "2026-11-08" <= x.ends)!;
    expect(w.festival).toMatchObject({ name: "Diwali", date: "2026-11-08", phase: "day" });
    expect(w.festival!.angle).toBe(angleFor(FESTIVAL_GUIDE.find((g) => g.name === "Diwali")!, { models: ["services"], giftable: false }));
    expect(w.focus.kind).toBe("festival");
  });

  it("a week before the day, in the window, is a launch week; other celebrations in their windows are listed too", () => {
    const w = weeks.find((x) => x.starts === "2026-10-26")!; // Diwali 8 Nov, window from 18 Oct
    expect(w.festival!.phase).toBe("launch");
    expect([w.festival!.name, ...w.alsoFestivals]).toContain("Diwali");
  });

  it("devotional and national days are greetings only — never a week's festival", () => {
    const gurpurab = ROWS.find((r) => r.name === "Guru Nanak Jayanti" && r.event_date.startsWith("2026"))!;
    const w = weeks.find((x) => x.starts <= gurpurab.event_date && gurpurab.event_date <= x.ends)!;
    expect(w.greetings).toContain("Guru Nanak Jayanti");
    expect(weeks.every((x) => x.festival?.name !== "Guru Nanak Jayanti")).toBe(true);
  });

  it("the bigger occasion owns a week: Diwali over Dhanteras, Diwali's run-up over Karwa Chauth's day — Dussehra on its own day", () => {
    const at = (starts: string) => weeks.find((w) => w.starts === starts)!;
    expect(at("2026-11-02").festival).toMatchObject({ name: "Diwali", phase: "day" }); // Dhanteras 6 Nov, Diwali 8 Nov
    expect(at("2026-11-02").alsoFestivals).toContain("Dhanteras");
    expect(at("2026-10-26").festival).toMatchObject({ name: "Diwali", phase: "launch" }); // Karwa Chauth's day is this week
    expect(at("2026-10-26").alsoFestivals).toContain("Karwa Chauth");
    expect(at("2026-10-19").festival).toMatchObject({ name: "Dussehra", phase: "day" }); // Diwali's window has opened
  });

  it("a festival's weight: its season's length in full on the week of its day, 80% in a launch week", () => {
    const diwali = seasonEvents(ROWS, TODAY).find((e) => e.name === "Diwali" && e.date === "2026-11-08")!;
    expect(weight(diwali, "2026-11-02", "2026-11-08")).toBe(26); // 21 days' lead + 5 in season
    expect(weight(diwali, "2026-10-26", "2026-11-01")).toBeCloseTo(20.8, 5);
  });

  it("in the festive season the in-between weeks are few; they take the counted focuses in turn", () => {
    expect(weeks.filter((w) => !w.festival).map((w) => w.focus.kind)).toEqual(["weakest_step", "open_ground"]);
    // A quieter season (no movable dates loaded): the focuses cycle.
    const quiet = buildWeeks({ today: "2027-04-04", festivals: [], angle: { models: ["products"], giftable: true }, diagnosis: DIAGNOSIS, positioning: POSITIONING });
    const plain = quiet.filter((w) => !w.festival).map((w) => w.focus.kind);
    expect(plain.slice(0, 5)).toEqual(["weakest_step", "open_ground", "sharper", "win_back", "weakest_step"]);
  });

  it("every number in a focus is counted in code", () => {
    const q = focusQueue(DIAGNOSIS, POSITIONING);
    expect(q.map((f) => f.detail)).toEqual([
      "your weakest step: 1.5% of 400 got from visitors to leads in the last 90 days",
      "open ground: 0 of 5 competitors talk about it, and you have something real to say",
      "crowded: 3 of 5 competitors say it — say it with your own specifics",
      "3 of 9 customers haven't been back in a while",
    ]);
    expect(focusQueue(null, null)).toEqual([{ kind: "story", label: "What makes you different", detail: "from your own story — the details no competitor can copy" }]);
  });

  it("past the last loaded festival date, a week says the dates aren't known — and plans no festival", () => {
    const short = ROWS.filter((r) => r.event_date <= "2026-10-31");
    const ws = buildWeeks({ today: TODAY, festivals: short, angle: { models: ["products"], giftable: true }, diagnosis: null, positioning: null });
    const late = ws.filter((w) => w.starts > "2026-10-31");
    expect(late.every((w) => w.datesUnknown)).toBe(true);
    expect(late.some((w) => w.festival?.name === "Diwali")).toBe(false);
    expect(ws.filter((w) => w.starts <= "2026-10-31").every((w) => !w.datesUnknown)).toBe(true);
  });
});

describe("each idea is checked before it's kept", () => {
  const weeks = buildWeeks({ today: TODAY, festivals: ROWS, angle: { models: ["products"], giftable: true }, diagnosis: DIAGNOSIS, positioning: POSITIONING });
  const diwaliWeek = weeks.find((w) => w.festival?.name === "Diwali" && w.festival.phase === "day")!.week;
  const plainWeek = weeks.find((w) => !w.festival && w.greetings.length === 0)!.week;
  const f = facts();

  it("a good idea is kept as written", () => {
    const r = verifyIdeas(weeks, { weeks: [{ week: plainWeek, title: "Why Kanpur soy wax", format: "carousel", idea: "Show where the soy wax comes from and why paraffin was rejected." }] }, f);
    expect(r.weeks.find((w) => w.week === plainWeek)!.idea).toEqual({ title: "Why Kanpur soy wax", format: "carousel", idea: "Show where the soy wax comes from and why paraffin was rejected." });
    expect(r.removed).toEqual([]);
  });

  it("a week's own festival is fine; another festival — or one in a week without any — is dropped, and the focus stays", () => {
    const r = verifyIdeas(weeks, { weeks: [
      { week: diwaliWeek, title: "Diwali evenings", format: "instagram_post", idea: "Lavender candles for Diwali evenings at home." },
      { week: plainWeek, title: "Christmas glow", format: "instagram_post", idea: "Candles for Christmas." },
    ] }, f);
    expect(r.weeks.find((w) => w.week === diwaliWeek)!.idea).not.toBeNull();
    const plain = r.weeks.find((w) => w.week === plainWeek)!;
    expect(plain.idea).toBeNull();
    expect(plain.ideaNote).toBe("No idea kept for this week — it talks about Christmas, which isn't this week. The focus above still stands.");
    expect(plain.focus.kind).not.toBe("festival");
  });

  it("the other festivals in a week's window, and its greetings days, may be named too", () => {
    const gurpurab = weeks.find((w) => w.greetings.includes("Guru Nanak Jayanti"))!.week;
    const r = verifyIdeas(weeks, { weeks: [
      { week: diwaliWeek, title: "Dhanteras to Diwali", format: "carousel", idea: "Lavender candles from Dhanteras through Diwali night." },
      { week: gurpurab, title: "Gurpurab greetings", format: "instagram_post", idea: "A quiet Guru Nanak Jayanti greeting with a lit candle." },
    ] }, f);
    expect(r.removed).toEqual([]);
    expect(r.weeks.find((w) => w.week === diwaliWeek)!.idea).not.toBeNull();
    expect(r.weeks.find((w) => w.week === gurpurab)!.idea).not.toBeNull();
  });

  it("an offer the business doesn't have is dropped by the claims guard", () => {
    const r = verifyIdeas(weeks, { weeks: [{ week: plainWeek, title: "Flat 30% off", format: "instagram_post", idea: "Announce 30% off every candle this week." }] }, f);
    expect(r.weeks.find((w) => w.week === plainWeek)!.idea).toBeNull();
    expect(r.removed[0]).toMatch(new RegExp(`^week ${plainWeek}: it said something your facts don't back`));
  });

  it("a format Hawlai doesn't make, or an empty idea, is dropped; a week with no idea says so", () => {
    const r = verifyIdeas(weeks, { weeks: [
      { week: 1, title: "Podcast", format: "podcast", idea: "Record one." },
      { week: 2, title: "", format: "carousel", idea: "x" },
    ] }, f);
    expect(r.weeks[0].ideaNote).toBe('No idea kept for this week — "podcast" isn\'t a format Hawlai makes. The focus above still stands.');
    expect(r.weeks[1].ideaNote).toBe("No idea kept for this week — it came back empty. The focus above still stands.");
    expect(r.weeks[2].ideaNote).toBe("No idea was written for this week. The focus above still stands.");
  });

  it("a second idea for the same week is ignored", () => {
    const r = verifyIdeas(weeks, { weeks: [
      { week: plainWeek, title: "First", format: "carousel", idea: "Show the soy wax." },
      { week: plainWeek, title: "Second", format: "carousel", idea: "Show the wicks." },
    ] }, f);
    expect(r.weeks.find((w) => w.week === plainWeek)!.idea!.title).toBe("First");
  });
});

describe("the route", () => {
  let prompts: string[];
  function anthropic(reply: (prompt: string) => { status: number; body: any }) {
    prompts = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      const prompt = String(JSON.parse(init.body).messages[0].content);
      prompts.push(prompt);
      const r = reply(prompt);
      return new Response(JSON.stringify(r.body), { status: r.status });
    }));
  }
  const ok = (weeks: any[]) => ({ status: 200, body: { content: [{ type: "text", text: JSON.stringify({ weeks }) }], usage: { input_tokens: 3000, output_tokens: 1500 } } });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-20T06:00:00Z"));
    resetOperatorAlerts();
    vi.spyOn(console, "error").mockImplementation(() => {});
    factsFixture = facts();
    diagnosisFixture = DIAGNOSIS;
    positioningFixture = { created_at: "2026-09-20T05:00:00Z", analysis: { positioning: POSITIONING } };
    tables = { profiles: [{ id: "u1", dealership_id: "d1" }], seasonal_events: ROWS, strategy_quarters: [], api_usage_logs: [] };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plans, checks and saves — for this business, with the numbers it started from", async () => {
    anthropic(() => ok([{ week: 9, title: "From visitor to enquiry", format: "instagram_post", idea: "Show how to order a lavender candle in two taps." }]));
    const res = await POST();
    expect(res.status).toBe(200);
    const saved = tables.strategy_quarters[0];
    expect(saved).toMatchObject({ dealership_id: "d1", starts_on: "2026-09-21", ends_on: "2026-12-20" });
    expect(saved.weeks).toHaveLength(13);
    expect(saved.weeks[8].idea).toEqual({ title: "From visitor to enquiry", format: "instagram_post", idea: "Show how to order a lavender candle in two taps." });
    expect(saved.baseline.funnels[0].steps.map((s: any) => s.count)).toEqual([400, 6]);
    expect(saved.baseline.atRisk).toEqual({ count: 3, total: 9 });
    expect(saved.cost_inr).toBeGreaterThan(0);
    expect(saved.notes.positioningFrom).toBe("2026-09-20T05:00:00Z");
    // The model saw the weeks code decided, with their festival angles.
    expect(prompts[0]).toMatch(/Week 9 \(16 Nov–22 Nov\): focus — Visitors → Leads \(your weakest step: 1\.5% of 400/);
    expect(prompts[0]).toMatch(/Week 1 \(21 Sept?–27 Sept?\): focus — Sharad Navratri/);
    expect(prompts[0]).toMatch(/Festival: Diwali — angle for this business: India's biggest gifting season/);
  });

  it("if the model fails, the weeks are still saved — with the reason instead of ideas", async () => {
    anthropic(() => ({ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } }));
    const res = await POST();
    expect(res.status).toBe(200);
    const saved = tables.strategy_quarters[0];
    expect(saved.weeks.every((w: any) => w.idea === null && w.ideaNote.startsWith("No idea written — "))).toBe(true);
    expect(saved.notes.aiFailure).toBe("AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.");
    expect(saved.weeks.find((w: any) => w.festival?.name === "Diwali")).toBeTruthy();
  });

  it("an unreadable diagnosis doesn't stop the plan — it's said, and the weeks use what there is", async () => {
    diagnosisFixture = null;
    anthropic(() => ok([]));
    await POST();
    const saved = tables.strategy_quarters[0];
    expect(saved.notes.diagnosis).toMatch(/^Couldn't read your last 90 days \(orders table is down\)/);
    expect(saved.baseline).toBeNull();
    expect(saved.weeks.some((w: any) => w.focus.kind === "weakest_step")).toBe(false);
  });

  it(`at most ${PLANS_A_DAY} plans a day — the next is refused before any model call`, async () => {
    anthropic(() => ok([]));
    for (let i = 0; i < PLANS_A_DAY; i++) expect((await POST()).status).toBe(200);
    const calls = prompts.length;
    const res = await POST();
    expect(res.status).toBe(429);
    expect(prompts.length).toBe(calls);
    // Another business's plans don't count against this one.
    tables.strategy_quarters.forEach((q) => (q.dealership_id = "d2"));
    expect((await POST()).status).toBe(200);
  });

  it("GET returns this business's latest plan only", async () => {
    tables.strategy_quarters = [
      { id: "old", dealership_id: "d1", created_at: "2026-09-01T00:00:00Z", weeks: [] },
      { id: "new", dealership_id: "d1", created_at: "2026-09-19T00:00:00Z", weeks: [] },
      { id: "theirs", dealership_id: "d2", created_at: "2026-09-20T00:00:00Z", weeks: [] },
    ];
    expect((await (await GET()).json()).quarter.id).toBe("new");
  });
});

describe("Create this", () => {
  it("opens Content Marketing with the week's format and idea filled in", () => {
    const href = createHref({ idea: { title: "Why soy wax", format: "carousel", idea: "Show the Kanpur supplier." } } as any)!;
    const u = new URL(href, "https://x.test");
    expect(u.pathname).toBe("/dashboard/content-marketing");
    expect(u.searchParams.get("type")).toBe("carousel");
    expect(u.searchParams.get("topic")).toBe("Why soy wax — Show the Kanpur supplier.");
    expect(createHref({ idea: null } as any)).toBeNull();
  });

  it("Content Marketing fills them in from the link — only a format it knows", () => {
    const view = readFileSync(join(__dirname, "../src/components/content/ContentMarketingView.tsx"), "utf-8");
    expect(view).toContain('if (type && CONTENT_TYPES.some((t) => t.key === type)) setSelectedType(type as typeof selectedType);');
    expect(view).toContain("if (given) setTopic(given.slice(0, 500));");
  });

  it("every calendar format is a real Content Marketing type", async () => {
    const { CONTENT_TYPES } = await import("@/lib/agents/contentMarketingAgent");
    const { CALENDAR_FORMATS } = await import("@/lib/strategy/calendar/weeks");
    for (const f of CALENDAR_FORMATS) expect(CONTENT_TYPES.some((t: any) => t.key === f)).toBe(true);
  });
});
