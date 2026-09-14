// India's marketing calendar — what's coming, what's on, what's over —
// for every path that writes copy or plans a campaign.
//
// WHY THIS EXISTS: seasonal timing only ever lived as advice text in the
// knowledge base, which only chat searched, by similarity. Generators
// had no idea what date it was relative to a festival, so nothing
// stopped a Diwali section sitting on a homepage into December, or a
// Diwali campaign starting on the day instead of weeks before.
//
// Two sources, never a guess:
//  - Movable festivals (Diwali, Holi, Navratri…) come from the
//    seasonal_events table. Their dates move every year, so they are
//    loaded from a verified source (DoPT holiday lists, Drik Panchang
//    for the three DoPT doesn't list) and approved by the owner of the
//    platform — migration 180. When the table runs out, the facts say
//    so rather than inventing next year's date.
//  - Fixed-date moments (Republic Day, Christmas…) and rule-based ones
//    (Mother's Day = 2nd Sunday of May) are worked out here.
//
// FESTIVAL_GUIDE holds what doesn't change year to year: the angle, the
// other names a festival goes by, how long a campaign should run ahead
// of it, and how long after the day it's still reasonable to mention.

export type FestivalGuide = {
  /** Exactly the seasonal_events.name used for this festival. */
  name: string;
  /** Lower-case words and phrases that mean this festival in copy. */
  aliases: string[];
  /** Days before the date a campaign should launch. seasonal_events.lead_time_days overrides it for movable festivals. */
  leadDays: number;
  /** Days after the date it's still in season (the festival runs on, or greetings are still natural). */
  graceDays: number;
  angle: string;
  /** Set for moments whose date is worked out in code, not loaded from seasonal_events. */
  date?: { month: number; day: number } | { month: number; weekday: number; nth: number };
};

export const FESTIVAL_GUIDE: FestivalGuide[] = [
  // ---- worked out in code ----
  { name: "New Year", aliases: ["new year", "new year's", "nye"], leadDays: 14, graceDays: 3, date: { month: 1, day: 1 }, angle: "fresh starts and resolutions; reflecting on the year gone by" },
  { name: "Republic Day", aliases: ["republic day"], leadDays: 7, graceDays: 1, date: { month: 1, day: 26 }, angle: "patriotic greetings; keep the national flag and emblem out of product promotions" },
  { name: "Valentine's Day", aliases: ["valentine", "valentine's", "valentines"], leadDays: 14, graceDays: 1, date: { month: 2, day: 14 }, angle: "gifting for someone special" },
  { name: "Mother's Day", aliases: ["mother's day", "mothers day", "mother’s day"], leadDays: 14, graceDays: 1, date: { month: 5, weekday: 0, nth: 2 }, angle: "gifts and thanks for mothers" },
  { name: "Father's Day", aliases: ["father's day", "fathers day", "father’s day"], leadDays: 14, graceDays: 1, date: { month: 6, weekday: 0, nth: 3 }, angle: "gifts and thanks for fathers" },
  { name: "Independence Day", aliases: ["independence day"], leadDays: 7, graceDays: 1, date: { month: 8, day: 15 }, angle: "patriotic greetings; keep the national flag and emblem out of product promotions" },
  { name: "Christmas", aliases: ["christmas", "xmas"], leadDays: 21, graceDays: 2, date: { month: 12, day: 25 }, angle: "gifting, festive decor and cosy evenings" },

  // ---- dates from seasonal_events ----
  { name: "Makar Sankranti / Pongal", aliases: ["makar sankranti", "sankranti", "pongal", "uttarayan"], leadDays: 7, graceDays: 2, angle: "harvest festival — kites in the north and west, Pongal in Tamil Nadu" },
  { name: "Basant Panchami", aliases: ["basant panchami", "vasant panchami", "saraswati puja"], leadDays: 7, graceDays: 1, angle: "spring, the colour yellow, new beginnings" },
  { name: "Maha Shivratri", aliases: ["shivratri", "maha shivratri", "mahashivratri"], leadDays: 7, graceDays: 1, angle: "a devotional day — respectful greetings, soft sell only" },
  { name: "Eid al-Fitr", aliases: ["eid", "eid ul fitr", "eid-ul-fitr", "id-ul-fitr", "eid al-fitr", "ramzan eid", "ramadan eid", "eid mubarak"], leadDays: 14, graceDays: 2, angle: "family feasts, Eid gifting and greetings" },
  { name: "Holi", aliases: ["holi", "holika"], leadDays: 14, graceDays: 2, angle: "colour, joy and family gatherings; also financial year-end sales season" },
  { name: "Gudi Padwa / Ugadi", aliases: ["gudi padwa", "ugadi", "cheti chand"], leadDays: 7, graceDays: 1, angle: "new year in Maharashtra, Karnataka and Andhra — fresh starts" },
  { name: "Baisakhi", aliases: ["baisakhi", "vaisakhi"], leadDays: 7, graceDays: 1, angle: "harvest and new year celebrations, especially in Punjab" },
  { name: "Ram Navami", aliases: ["ram navami", "rama navami"], leadDays: 7, graceDays: 1, angle: "a devotional day — greetings rather than hard sales" },
  { name: "Akshaya Tritiya", aliases: ["akshaya tritiya", "akha teej"], leadDays: 14, graceDays: 1, angle: "an auspicious day for new purchases and beginnings" },
  { name: "Eid al-Adha", aliases: ["eid", "bakrid", "bakri eid", "eid ul adha", "eid-ul-adha", "id-ul-zuha", "eid al-adha", "eid mubarak"], leadDays: 7, graceDays: 2, angle: "family gatherings and greetings" },
  { name: "Raksha Bandhan", aliases: ["raksha bandhan", "rakhi", "rakshabandhan"], leadDays: 14, graceDays: 1, angle: "gifting between brothers and sisters — mind delivery cut-offs" },
  { name: "Janmashtami", aliases: ["janmashtami", "krishna janmashtami", "gokulashtami"], leadDays: 7, graceDays: 1, angle: "festive decor and midnight celebrations" },
  { name: "Ganesh Chaturthi", aliases: ["ganesh chaturthi", "vinayaka chaturthi", "ganeshotsav", "ganpati"], leadDays: 7, graceDays: 10, angle: "welcoming Ganpati home, a ten-day festival especially big in Maharashtra" },
  { name: "Onam", aliases: ["onam", "thiruvonam"], leadDays: 7, graceDays: 2, angle: "Kerala's harvest festival — family feasts and new clothes" },
  { name: "Sharad Navratri", aliases: ["navratri", "navaratri", "garba", "dandiya"], leadDays: 21, graceDays: 9, angle: "nine festive nights — the festive build-up begins and ad costs start rising" },
  { name: "Durga Puja", aliases: ["durga puja", "pujo", "durgotsav"], leadDays: 21, graceDays: 2, angle: "especially big in Bengal and the east — new things, festive homes" },
  { name: "Dussehra", aliases: ["dussehra", "dasara", "dussera", "vijayadashami", "vijaya dashami"], leadDays: 21, graceDays: 2, angle: "new beginnings; festive momentum builds toward Diwali" },
  { name: "Karwa Chauth", aliases: ["karwa chauth", "karva chauth"], leadDays: 10, graceDays: 1, angle: "gifts between husbands and wives" },
  { name: "Dhanteras", aliases: ["dhanteras", "dhantrayodashi", "dhanatrayodashi"], leadDays: 21, graceDays: 1, angle: "the auspicious buying day two days before Diwali — new things for the home" },
  { name: "Diwali", aliases: ["diwali", "deepavali", "deepawali", "divali"], leadDays: 21, graceDays: 5, angle: "India's biggest gifting season — gifts for family, friends, clients and hosts; lights and home decor. Launch 2–3 weeks ahead, not on the day" },
  { name: "Bhai Dooj", aliases: ["bhai dooj", "bhai duj", "bhaiya dooj", "bhau beej"], leadDays: 10, graceDays: 1, angle: "gifting between brothers and sisters, closing the Diwali week" },
  { name: "Chhath Puja", aliases: ["chhath", "chhath puja", "chhat puja"], leadDays: 7, graceDays: 1, angle: "a devotional festival of Bihar, Jharkhand and eastern UP — respectful greetings" },
  { name: "Guru Nanak Jayanti", aliases: ["guru nanak jayanti", "gurpurab", "guru purab", "guru nanak"], leadDays: 7, graceDays: 1, angle: "a devotional day — greetings rather than hard sales" },
];

/** The month-by-month picture, for planning beyond the dated events. */
export const MONTH_GUIDE: Record<number, string> = {
  1: "New Year resolutions and Republic Day — 'fresh start' campaigns",
  2: "Valentine's Day — gifting for someone special",
  3: "Holi (colour, joy, family); many brands run financial year-end sales",
  4: "summer begins — comfort and heat-relief angles where they fit; wedding season (April–June) is a big gifting window for home and lifestyle brands",
  5: "summer and wedding season — gifting for weddings and housewarmings; Mother's Day",
  6: "summer and the tail of wedding season; Father's Day",
  7: "monsoon — cosy, indoor themes (a natural fit for candles and home fragrance)",
  8: "monsoon, Raksha Bandhan and Independence Day",
  9: "Ganesh Chaturthi, then Navratri — the festive build-up begins and ad competition rises",
  10: "Navratri, Dussehra and the run-up to Diwali — festive campaigns should already be live",
  11: "Diwali season (when it falls in November) and its gifting week, then Guru Nanak Jayanti",
  12: "Christmas and New Year — gifting, plus 'reflect on the year' angles",
};

export type SeasonalEventRow = { name: string; event_date: string; lead_time_days?: number | null };

export type SeasonEvent = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  launchFrom: string;
  seasonEnds: string;
  daysAway: number;
  angle: string;
  aliases: string[];
};

export type OutOfSeason = { festival: string; where: string; text: string; endedDaysAgo: number };

export type Season = {
  today: string;
  /** Today falls between the festival's date and the end of its grace period. */
  now: SeasonEvent[];
  /** The campaign window has opened (today is on or after launchFrom) but the day hasn't come. */
  launchNow: SeasonEvent[];
  /** Within the next 60 days, window not yet open — plan these. */
  planAhead: SeasonEvent[];
  /** Season ended within the last 30 days — not to be written for. */
  justEnded: SeasonEvent[];
  monthGuide: string;
  /** The last date movable festivals are loaded up to; null when none are. */
  datesKnownUntil: string | null;
  /** Filled in by gatherBusinessFacts from the business's own published pages. */
  outOfSeason: OutOfSeason[];
};

const DAY = 24 * 60 * 60 * 1000;
const guideByName = new Map(FESTIVAL_GUIDE.map((g) => [g.name, g]));

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string): Date {
  return new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
}

function addDays(s: string, n: number): string {
  return ymd(new Date(parseYmd(s).getTime() + n * DAY));
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / DAY);
}

/** Today in India, as YYYY-MM-DD — a festival day starts at Indian midnight, not UTC's. */
export function indiaToday(now: Date = new Date()): string {
  return ymd(new Date(now.getTime() + 5.5 * 60 * 60 * 1000));
}

function fixedDate(g: FestivalGuide, year: number): string | null {
  if (!g.date) return null;
  if ("day" in g.date) return `${year}-${String(g.date.month).padStart(2, "0")}-${String(g.date.day).padStart(2, "0")}`;
  const first = new Date(Date.UTC(year, g.date.month - 1, 1));
  const offset = (g.date.weekday - first.getUTCDay() + 7) % 7;
  return ymd(new Date(Date.UTC(year, g.date.month - 1, 1 + offset + (g.date.nth - 1) * 7)));
}

/** Every dated occurrence: fixed moments for last, this and next year, plus the loaded movable ones. */
export function seasonEvents(rows: SeasonalEventRow[], today: string): SeasonEvent[] {
  const year = Number(today.slice(0, 4));
  const raw: { name: string; date: string; lead: number; guide: FestivalGuide | undefined }[] = [];
  for (const g of FESTIVAL_GUIDE) {
    if (!g.date) continue;
    for (const y of [year - 1, year, year + 1]) raw.push({ name: g.name, date: fixedDate(g, y)!, lead: g.leadDays, guide: g });
  }
  for (const r of rows) {
    if (!r?.name || !r?.event_date) continue;
    const guide = guideByName.get(r.name);
    raw.push({ name: r.name, date: String(r.event_date).slice(0, 10), lead: Number(r.lead_time_days ?? guide?.leadDays ?? 21), guide });
  }
  return raw
    .map(({ name, date, lead, guide }) => ({
      name,
      date,
      launchFrom: addDays(date, -lead),
      seasonEnds: addDays(date, guide?.graceDays ?? 1),
      daysAway: daysBetween(today, date),
      angle: guide?.angle ?? "",
      aliases: guide?.aliases ?? [name.toLowerCase()],
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function seasonFor(rows: SeasonalEventRow[], today: string = indiaToday()): Season {
  const events = seasonEvents(rows, today);
  const movable = rows.map((r) => String(r?.event_date ?? "").slice(0, 10)).filter(Boolean).sort();
  return {
    today,
    now: events.filter((e) => e.date <= today && today <= e.seasonEnds),
    launchNow: events.filter((e) => e.launchFrom <= today && today < e.date),
    planAhead: events.filter((e) => today < e.launchFrom && e.daysAway <= 60),
    justEnded: events.filter((e) => e.seasonEnds < today && daysBetween(e.seasonEnds, today) <= 30),
    monthGuide: MONTH_GUIDE[Number(today.slice(5, 7))],
    datesKnownUntil: movable.length ? movable[movable.length - 1] : null,
    outOfSeason: [],
  };
}

function normaliseText(s: string): string {
  return ` ${s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, " ")} `;
}

/**
 * The festival a piece of copy is still talking about after its season
 * ended — the Diwali-section-in-December failure.
 *
 * Only flagged when NO festival going by that name is current or has its
 * campaign window open (so "Eid Mubarak" isn't flagged in the run-up to
 * the second Eid), and only for a season that ended within 90 days —
 * beyond that a mention is more likely evergreen ("perfect for Diwali
 * gifting" in an About page) than a forgotten campaign.
 */
export function outOfSeasonFestival(text: string, rows: SeasonalEventRow[], today: string): { festival: string; endedDaysAgo: number } | null {
  const hay = normaliseText(text);
  const events = seasonEvents(rows, today);
  const mentioned = (e: SeasonEvent) => e.aliases.some((a) => hay.includes(normaliseText(a)));
  const hits = events.filter(mentioned);
  if (!hits.length) return null;
  const mentionedAliases = new Set(hits.flatMap((e) => e.aliases.filter((a) => hay.includes(normaliseText(a)))));
  const live = events.some((e) => e.launchFrom <= today && today <= e.seasonEnds && e.aliases.some((a) => mentionedAliases.has(a)));
  if (live) return null;
  const ended = hits
    .filter((e) => e.seasonEnds < today && daysBetween(e.seasonEnds, today) <= 90)
    .sort((a, b) => b.seasonEnds.localeCompare(a.seasonEnds))[0];
  return ended ? { festival: ended.name, endedDaysAgo: daysBetween(ended.date, today) } : null;
}

function prettyDate(s: string): string {
  return parseYmd(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The Season block of the VERIFIED FACTS. */
export function formatSeason(s: Season): string {
  const lines = [`Season (today is ${prettyDate(s.today)} ${s.today.slice(0, 4)}) — this month: ${s.monthGuide}.`];
  for (const e of s.now) lines.push(`- Happening now: ${e.name} (${prettyDate(e.date)}) — ${e.angle}.`);
  for (const e of s.launchNow) lines.push(`- Campaign window open: ${e.name} on ${prettyDate(e.date)}, ${e.daysAway} day(s) away — ${e.angle}.`);
  for (const e of s.planAhead.slice(0, 5)) lines.push(`- Plan ahead: ${e.name} on ${prettyDate(e.date)} (${e.daysAway} days away) — campaigns should launch from ${prettyDate(e.launchFrom)}.`);
  for (const e of s.justEnded) lines.push(`- Over — don't write for it: ${e.name} (${prettyDate(e.date)}).`);
  for (const o of s.outOfSeason) lines.push(`- OUT OF SEASON on this business's live website: ${o.where} says "${o.text.slice(0, 80)}" — ${o.festival} was ${o.endedDaysAgo} days ago. Suggest the owner updates it.`);
  lines.push(
    s.datesKnownUntil
      ? `Festival dates are loaded up to ${prettyDate(s.datesKnownUntil)} ${s.datesKnownUntil.slice(0, 4)}; don't state a festival date beyond that.`
      : "No festival dates are loaded; don't state any festival date."
  );
  return lines.join("\n");
}

export const SEASON_TRUTH_RULE =
  "- Festival timing: write for a festival only while it's happening or its campaign window is open (see Season) — never for one that's over, unless the owner explicitly asks to plan its next occurrence. Festive campaigns launch 2–3 weeks before the day, not on it. Never state a festival date that isn't in the facts.";
