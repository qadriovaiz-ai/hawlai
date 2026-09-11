// Campaign Performance History, read correctly.
//
// EVERY SNAPSHOT IS A RUNNING TOTAL. The daily job stores Meta's
// LIFETIME insights for each campaign (date_preset=maximum) and its
// all-time lead and order counts, once a day. The Analytics page used
// to ADD those rows together: two days of history showed a campaign's
// lifetime spend twice, ten days showed it roughly ten times, and the
// Spend-over-time chart plotted running totals labelled as spend.
//
// The value for any date range is a DIFFERENCE: the campaign's last
// running total on or before the range's end, minus its last running
// total before the range's start. A day's own value is its total minus
// the previous recorded day's. That is what the table, the chart and
// the date-range slider all use.
//
// null means Meta could not be read that day. It is skipped, never read
// as zero — a zero in a running total would show, the next day, as the
// campaign's entire spend arriving at once.
//
// Whatever a campaign had spent before its first snapshot is counted on
// that first day: the history begins where it begins.

export type HistoryRow = {
  ad_creative_id: string;
  snapshot_date: string;
  headline: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  revenue: number | null;
  conversions: number | null;
  delivery_status: string | null;
};

export const METRICS = ["spend", "impressions", "clicks", "leads", "revenue", "conversions"] as const;
export type Metric = (typeof METRICS)[number];
export type MetricTotals = Record<Metric, number>;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A database row (select "*", so it works before or after migration 176) → a HistoryRow. */
export function toHistoryRow(r: Record<string, any>): HistoryRow {
  return {
    ad_creative_id: String(r.ad_creative_id),
    snapshot_date: String(r.snapshot_date).slice(0, 10),
    headline: r.headline ?? null,
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    leads: num(r.leads),
    revenue: num(r.revenue),
    conversions: num(r.conversions),
    delivery_status: r.delivery_status ?? null,
  };
}

/** YYYY-MM-DD plus n days, in UTC. */
export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Guards the calendar walk against a corrupt date; ten years of daily history is far beyond any real table. */
const MAX_DAYS = 3660;

/** Every calendar day from the first snapshot to the last, inclusive — the slider's steps. */
export function historyDates(rows: HistoryRow[]): string[] {
  if (rows.length === 0) return [];
  let first = rows[0].snapshot_date;
  let last = first;
  for (const r of rows) {
    if (r.snapshot_date < first) first = r.snapshot_date;
    if (r.snapshot_date > last) last = r.snapshot_date;
  }
  const out: string[] = [];
  for (let d = first; d <= last && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

function byCampaign(rows: HistoryRow[]): Map<string, HistoryRow[]> {
  const map = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const list = map.get(r.ad_creative_id);
    if (list) list.push(r);
    else map.set(r.ad_creative_id, [r]);
  }
  for (const list of map.values()) list.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  return map;
}

/** The latest readable running total on or before `date` (or strictly before it). Null if none. */
function runningTotal(series: HistoryRow[], metric: Metric, date: string, inclusive: boolean): number | null {
  let value: number | null = null;
  for (const r of series) {
    if (inclusive ? r.snapshot_date > date : r.snapshot_date >= date) break;
    if (r[metric] !== null) value = r[metric];
  }
  return value;
}

export type CampaignRange = {
  id: string;
  headline: string;
  /** Days recorded inside the range. */
  days: number;
  totals: MetricTotals;
  /** Latest definitive delivery status on any snapshot, and its date. */
  recorded: { state: string; date: string } | null;
};

/** Per campaign, what happened between `from` and `to` (inclusive YYYY-MM-DD). */
export function rangeTotals(rows: HistoryRow[], from: string, to: string): CampaignRange[] {
  const out: CampaignRange[] = [];
  for (const [id, series] of byCampaign(rows)) {
    const inRange = series.filter((r) => r.snapshot_date >= from && r.snapshot_date <= to);
    if (inRange.length === 0) continue;

    const totals = {} as MetricTotals;
    for (const m of METRICS) {
      const end = runningTotal(series, m, to, true);
      const before = runningTotal(series, m, from, false) ?? 0;
      // A running total should only grow. If it shrank (a lead deleted,
      // an order refunded), the range shows nothing rather than a negative.
      totals[m] = end === null ? 0 : Math.max(0, end - before);
    }

    let headline = "Untitled";
    let recorded: CampaignRange["recorded"] = null;
    for (const r of series) {
      if (r.headline) headline = r.headline;
      if (r.delivery_status && r.delivery_status !== "unknown") recorded = { state: r.delivery_status, date: r.snapshot_date };
    }
    out.push({ id, headline, days: inRange.length, totals, recorded });
  }
  return out;
}

export type DailyPoint = { date: string; spend: number; leads: number; revenue: number };

/** Every calendar day between `from` and `to`, with what was actually spent and earned THAT day, summed across campaigns. */
export function dailySeries(rows: HistoryRow[], from: string, to: string): DailyPoint[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
  const acc = new Map<string, DailyPoint>(days.map((d) => [d, { date: d, spend: 0, leads: 0, revenue: 0 }]));

  const series_metrics = ["spend", "leads", "revenue"] as const;
  for (const series of byCampaign(rows).values()) {
    // The running total just before the window, so the window's first
    // day shows only that day's change.
    const prev: Record<(typeof series_metrics)[number], number | null> = {
      spend: runningTotal(series, "spend", from, false),
      leads: runningTotal(series, "leads", from, false),
      revenue: runningTotal(series, "revenue", from, false),
    };
    for (const r of series) {
      if (r.snapshot_date < from || r.snapshot_date > to) continue;
      const point = acc.get(r.snapshot_date);
      if (!point) continue;
      for (const m of series_metrics) {
        const v = r[m];
        if (v === null) continue; // unreadable that day: no change recorded, baseline unchanged
        point[m] += Math.max(0, v - (prev[m] ?? 0));
        prev[m] = v;
      }
    }
  }
  return days.map((d) => {
    const p = acc.get(d)!;
    return { date: d, spend: Math.round(p.spend * 100) / 100, leads: p.leads, revenue: Math.round(p.revenue * 100) / 100 };
  });
}

/**
 * Supabase caps a response at 1,000 rows. History grows by one row per
 * campaign per day, so a single select silently loses the newest (or
 * oldest) days once a business has run a few campaigns for a few months.
 * Paged, in a stable order.
 *
 * select("*") on purpose: delivery_status comes from migration 176, and
 * naming it would fail the whole history on a database that hasn't run it.
 */
export const HISTORY_PAGE_SIZE = 1000;

export async function fetchAllHistory(
  supabase: any,
  dealershipId: string,
  maxPages = 100
): Promise<{ data: HistoryRow[] | null; error: { message: string } | null; truncated: boolean }> {
  const all: HistoryRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const start = page * HISTORY_PAGE_SIZE;
    const { data, error } = await supabase
      .from("campaign_performance_history")
      .select("*")
      .eq("dealership_id", dealershipId)
      .order("snapshot_date", { ascending: true })
      .order("ad_creative_id", { ascending: true })
      .range(start, start + HISTORY_PAGE_SIZE - 1);
    if (error) return { data: null, error, truncated: false };
    for (const r of data ?? []) all.push(toHistoryRow(r));
    if (!data || data.length < HISTORY_PAGE_SIZE) return { data: all, error: null, truncated: false };
  }
  return { data: all, error: null, truncated: true };
}
