"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import CampaignPerformanceCharts from "@/components/dashboard/CampaignPerformanceCharts";
import CampaignTable, { type CampaignRow } from "@/components/dashboard/CampaignTable";
import DateRangeSlider from "@/components/dashboard/DateRangeSlider";
import { historyDates, rangeTotals, dailySeries, type HistoryRow } from "@/lib/analytics/campaignHistory";
import { rangeLabel } from "@/lib/analytics/dateRangeSlider";
import { shortDate } from "@/lib/ads/campaignDeliveryDisplay";

// The performance charts, the date-range slider under them, and the
// Campaign Performance History table — one window of dates for all.
//
// The slider spans the WHOLE recorded history and filters in the
// browser: the rows are already here, so dragging never re-fetches
// anything. The label moves live with the handles; the charts and table
// follow a moment later (debounced) so dragging stays smooth once the
// history is long.
//
// Figures are range DIFFERENCES of the snapshots' running totals, not
// sums — see campaignHistory.ts.

const APPLY_DELAY_MS = 120;

export default function CampaignHistorySection({
  history,
  creatives,
}: {
  history: HistoryRow[];
  /** Per ad_creatives id: Meta's campaign id and Hawlai's last recorded status. */
  creatives: Record<string, { metaCampaignId: string | null; localStatus: string | null }>;
}) {
  const dates = useMemo(() => historyDates(history), [history]);
  const last = Math.max(0, dates.length - 1);

  // Full range on load: both handles at the extremes.
  const [selected, setSelected] = useState<[number, number]>([0, last]);
  const [applied, setApplied] = useState<[number, number]>([0, last]);

  // If the history itself changes length (a refresh), start from the full range again.
  useEffect(() => {
    setSelected([0, last]);
    setApplied([0, last]);
  }, [last]);

  useEffect(() => {
    const t = setTimeout(() => setApplied(selected), APPLY_DELAY_MS);
    return () => clearTimeout(t);
  }, [selected]);

  const from = dates[applied[0]];
  const to = dates[applied[1]];

  const series = useMemo(() => (from && to ? dailySeries(history, from, to) : []), [history, from, to]);

  const rows: CampaignRow[] = useMemo(() => {
    if (!from || !to) return [];
    return rangeTotals(history, from, to).map((c) => ({
      id: c.id,
      headline: c.headline,
      days: c.days,
      spend: c.totals.spend,
      impressions: c.totals.impressions,
      clicks: c.totals.clicks,
      leads: c.totals.leads,
      revenue: c.totals.revenue,
      conversions: c.totals.conversions,
      recorded: c.recorded,
      metaCampaignId: creatives[c.id]?.metaCampaignId ?? null,
      localStatus: creatives[c.id]?.localStatus ?? null,
    }));
  }, [history, from, to, creatives]);

  // Every campaign in the history, independent of the window: the table
  // asks Meta for live status once for all of them, not on every drag.
  const allIds = useMemo(() => Array.from(new Set(history.map((r) => r.ad_creative_id))), [history]);

  const label = rangeLabel(dates, selected[0], selected[1]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">Campaign performance over time</p>
        {label && (
          <p className="text-sm text-slate-600 tabular-nums" aria-live="polite">
            {label}
          </p>
        )}
      </div>

      <CampaignPerformanceCharts data={series} />

      {dates.length > 0 && (
        <div className="card px-5 py-4 space-y-2">
          <DateRangeSlider
            count={dates.length}
            start={selected[0]}
            end={selected[1]}
            onChange={(s, e) => setSelected([s, e])}
            valueText={(i) => shortDate(dates[i])}
            minLabel={shortDate(dates[0])}
            maxLabel={shortDate(dates[last])}
          />
          {dates.length === 1 && (
            <p className="text-[11px] text-slate-400">One day of history so far — the slider opens up once a second day is recorded.</p>
          )}
        </div>
      )}

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Campaign Performance History</p>
        </div>
        <p className="text-xs text-slate-400">
          Saved permanently in Hawlai — this survives even if a campaign is later paused, deleted on Meta, or Facebook access changes. Updates once a day automatically. Figures cover the dates selected above. Status is checked with Meta when you open this page; if Meta can&apos;t be reached, the last recorded status is shown with its date.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            {history.length === 0
              ? "No history recorded yet — this fills in once a launched campaign has run for at least a day."
              : "No campaign has a recorded day in the selected dates."}
          </p>
        ) : (
          <CampaignTable rows={rows} allIds={allIds} />
        )}
      </div>
    </div>
  );
}
