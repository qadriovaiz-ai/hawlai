// One visitor's page views, grouped into a visit — V2.
//
// V1 recorded WHICH page. This is what makes a sequence of pages into a
// thing you can reason about: three pages in one sitting is a visit,
// three pages a week apart is three.
//
// WHAT V3 NEEDS FROM THIS, which is why it exists: an intent score has
// to be about a VISIT. "Looked at pricing twice" means twice in one
// sitting; twice in a month is a different fact and a weaker one.
//
// ─────────────────────────────────────────────────────────────────────
// THREE THINGS THIS CANNOT KNOW, STATED HERE RATHER THAN IMPLIED
// ─────────────────────────────────────────────────────────────────────
//
// 1. WHERE A VISIT ENDS IS A CONVENTION, NOT A MEASUREMENT. Nothing in
//    a browser tells a server "I have finished". The thirty-minute
//    inactivity gap below is the web-analytics convention, chosen
//    because it is the one every other tool uses and the owner may
//    compare — not because thirty minutes is a fact about his
//    customers. It is named as a constant so it can be argued with.
//
// 2. TIME ON A VISIT IS ALWAYS AN UNDERCOUNT. The last event's
//    timestamp is when the visitor arrived on the final page, never
//    when they left it, so a visit's measured span misses the time
//    spent on the page they actually read. `measuredSeconds` is "at
//    least this", and a ONE-EVENT visit gets null rather than zero:
//    "we cannot tell how long" is not "they left immediately", the same
//    distinction `daysSinceChange` keeps for an unreadable date.
//
// 3. ONLY A CONSENTED VISITOR CAN BE GROUPED AT ALL. `visitor_id` is
//    withheld without consent (lib/utils.ts), by design — so visits are
//    a measure of consented visitors, and page views are the measure of
//    everyone. A report must not present one as the other, which is a
//    mistake this file's own author made in R4 and fixed here.
//
// Pure: no I/O in the grouping. `readVisits` does the reading, and every
// rule above is testable without a database.

import type { Counted } from "@/lib/growth/audit";

/**
 * The inactivity gap that ends a visit.
 *
 * A CONVENTION, NOT A FINDING. Thirty minutes is what Google Analytics
 * and every tool after it has used, so an owner comparing two numbers is
 * comparing like with like. Changing it changes every visit count in the
 * product, which is why it is one named constant and not a literal
 * buried in a loop.
 */
export const VISIT_GAP_MINUTES = 30;

/** One page_events row, as far as grouping cares. */
export type VisitEvent = {
  visitor_id?: string | null;
  created_at?: string | null;
  path?: string | null;
  event_type?: string | null;
};

export type Visit = {
  visitorId: string;
  startedAt: string;
  endedAt: string;
  /** Distinct pages, in the order first seen. */
  pages: string[];
  /** How many `view` events — repeats of one page counted each time. */
  pageViews: number;
  /**
   * The span from first event to last, in seconds.
   *
   * AN UNDERCOUNT, ALWAYS — see the header. Null for a visit with one
   * event, where nothing can be said about duration at all.
   */
  measuredSeconds: number | null;
  /** How many times the busiest page was seen in this visit. */
  mostSeenPageCount: number;
};

function time(value: unknown): number | null {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : null;
}

/**
 * Group events into visits.
 *
 * EVENTS WITHOUT A VISITOR ID ARE DROPPED, not bundled into an
 * "anonymous" visit — they are different people, and one visit made of
 * forty strangers is worse than no visit at all.
 *
 * AN UNREADABLE TIMESTAMP IS DROPPED TOO. A row that cannot be placed in
 * time cannot be placed in a visit, and guessing would put it in the
 * wrong one.
 */
export function groupIntoVisits(
  events: VisitEvent[] | null | undefined,
  gapMinutes: number = VISIT_GAP_MINUTES
): Visit[] {
  const gapMs = Math.max(1, gapMinutes) * 60_000;

  const usable = (events ?? [])
    .map((e) => ({ e, at: time(e.created_at), id: String(e.visitor_id ?? "").trim() }))
    .filter((r): r is { e: VisitEvent; at: number; id: string } => r.at !== null && r.id !== "")
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  const byVisitor = new Map<string, { e: VisitEvent; at: number }[]>();
  for (const row of usable) {
    const list = byVisitor.get(row.id) ?? [];
    list.push({ e: row.e, at: row.at });
    byVisitor.set(row.id, list);
  }

  const out: Visit[] = [];
  for (const [visitorId, rows] of byVisitor) {
    let current: { e: VisitEvent; at: number }[] = [];
    const flush = () => {
      if (!current.length) return;
      out.push(visitFrom(visitorId, current));
      current = [];
    };
    for (const row of rows) {
      const previous = current[current.length - 1];
      // THE GAP IS MEASURED FROM THE LAST EVENT, not from the visit's
      // start: a visitor reading for an hour with no pause longer than
      // the gap is on one visit, which is what a sitting is.
      if (previous && row.at - previous.at > gapMs) flush();
      current.push(row);
    }
    flush();
  }

  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.visitorId.localeCompare(b.visitorId));
}

function visitFrom(visitorId: string, rows: { e: VisitEvent; at: number }[]): Visit {
  const first = rows[0];
  const last = rows[rows.length - 1];

  const pages: string[] = [];
  const seen = new Map<string, number>();
  let pageViews = 0;
  for (const { e } of rows) {
    if (e.event_type === "view") pageViews += 1;
    const path = String(e.path ?? "").trim();
    if (!path) continue;
    if (!seen.has(path)) pages.push(path);
    seen.set(path, (seen.get(path) ?? 0) + 1);
  }

  return {
    visitorId,
    startedAt: new Date(first.at).toISOString(),
    endedAt: new Date(last.at).toISOString(),
    pages,
    pageViews,
    // NULL, NOT ZERO, for a single event. Nothing can be said about how
    // long one timestamp lasted.
    measuredSeconds: rows.length > 1 ? Math.round((last.at - first.at) / 1000) : null,
    mostSeenPageCount: seen.size ? Math.max(...seen.values()) : 0,
  };
}

export type VisitSummary = {
  visits: number;
  /** Visits with more than one event, the only ones with a duration. */
  measurable: number;
  /** The median, not the mean: one visitor who left a tab open is not the typical visit. */
  medianSeconds: number | null;
  pagesPerVisit: number | null;
  counted: Counted[];
};

/**
 * What the owner can be told about a set of visits.
 *
 * THE MEDIAN, NOT THE MEAN. One tab left open overnight moves a mean
 * enough to make a sentence about "how long people stay" untrue, and at
 * thirty visits a month one outlier is most of the average.
 */
export function summarise(visits: Visit[]): VisitSummary {
  const measurable = visits.filter((v) => v.measuredSeconds !== null);
  const seconds = measurable.map((v) => v.measuredSeconds as number).sort((a, b) => a - b);
  const median = seconds.length
    ? seconds.length % 2
      ? seconds[(seconds.length - 1) / 2]
      : Math.round((seconds[seconds.length / 2 - 1] + seconds[seconds.length / 2]) / 2)
    : null;

  const totalPages = visits.reduce((n, v) => n + v.pages.length, 0);

  return {
    visits: visits.length,
    measurable: measurable.length,
    medianSeconds: median,
    // NULL WITH NO VISITS, not zero: "nobody came" and "everybody saw
    // no pages" are different things to say.
    pagesPerVisit: visits.length ? Math.round((totalPages / visits.length) * 10) / 10 : null,
    counted: [
      { label: "visits", value: visits.length, source: "page_events" },
      { label: "visits long enough to time", value: measurable.length, source: "page_events" },
    ],
  };
}

/**
 * Read a window's events and group them.
 *
 * THE OWNER'S OWN VISITS ARE EXCLUDED IN THE QUERY — migration 207's
 * incident, where visits went 28 to 31 while he tested his own shop and
 * his clicks were most of the signal.
 */
export async function readVisits(
  supabase: any,
  dealershipId: string,
  opts: { sinceDays?: number; now?: Date } = {}
): Promise<Visit[] | null> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.sinceDays ?? 7) * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("page_events")
    .select("visitor_id, created_at, path, event_type")
    .eq("dealership_id", dealershipId)
    .eq("is_internal", false)
    .not("visitor_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  // A FAILED READ IS NOT A WEEK WITH NO VISITS. Null means the caller
  // says nothing about visits rather than reporting that nobody came.
  if (error || !Array.isArray(data)) return null;
  return groupIntoVisits(data as VisitEvent[]);
}
