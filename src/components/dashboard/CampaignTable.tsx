"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUp, ArrowDown, SlidersHorizontal, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { statusCell, type LiveDelivery, type StatusTone } from "@/lib/ads/campaignDeliveryDisplay";
import { DEFAULT_VISIBLE, resolveVisibleColumns, serializeColumns, type ColumnKey } from "@/lib/analytics/campaignColumns";

// Sortable, column-configurable campaign table — Ads Manager style.
//
// No migration: sorting is UI state, and column preferences are a
// per-user DISPLAY setting rather than business data, so they live in
// localStorage. Persisting them server-side would mean a schema
// change and a round-trip for something that only affects how one
// person's screen looks.
//
// STATUS is read live from Meta after the page draws
// (/api/ads/campaign-status), so Analytics never waits on Meta. Until
// it answers, and whenever Meta can't be reached, the cell shows the
// last RECORDED status with its date — never a bare "Active" that Meta
// hasn't just confirmed (campaignDeliveryDisplay.ts).

export interface CampaignRow {
  /** ad_creatives id — how the live status is looked up. */
  id?: string;
  headline: string;
  spend: number;
  leads: number;
  revenue: number;
  conversions: number;
  days: number;
  /** Meta's campaign id, to find it in Ads Manager. */
  metaCampaignId?: string | null;
  /** Latest definitive status recorded on a daily snapshot, and its date. */
  recorded?: { state: string; date: string } | null;
  /** Hawlai's own last write (ad_creatives.meta_status) — never shown as confirmed. */
  localStatus?: string | null;
}

/** null while the live check is running. */
type LiveMap = Record<string, LiveDelivery> | null;

interface Column {
  key: ColumnKey;
  label: string;
  /** Sort value. Columns without one aren't sortable. */
  value?: (row: CampaignRow) => number | null;
  render: (row: CampaignRow, live: LiveMap) => React.ReactNode;
}

const TONE_CLASS: Record<StatusTone, string> = {
  good: "bg-green-500/10 text-green-500",
  neutral: "bg-slate-100 text-slate-600",
  warn: "bg-amber-500/10 text-amber-500",
  bad: "bg-red-500/10 text-red-400",
  muted: "bg-transparent text-slate-400 px-0",
};

function StatusBadge({ row, live }: { row: CampaignRow; live: LiveMap }) {
  const cell = statusCell(
    live === null ? "loading" : row.id ? (live[row.id] ?? null) : null,
    row.recorded ?? null,
    row.localStatus ?? null
  );
  return (
    <div className="min-w-[8.5rem]">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TONE_CLASS[cell.tone]}`}>{cell.text}</span>
      {cell.sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{cell.sub}</p>}
    </div>
  );
}

const COLUMNS: Column[] = [
  { key: "status", label: "Status", render: (r, live) => <StatusBadge row={r} live={live} /> },
  {
    key: "campaignId",
    label: "Campaign ID",
    render: (r) =>
      r.metaCampaignId ? (
        <code className="text-xs text-slate-500 select-all" title="Meta campaign ID — search for it in Ads Manager">
          {r.metaCampaignId}
        </code>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  { key: "days", label: "Days", value: (r) => r.days, render: (r) => <span className="text-slate-500">{r.days}</span> },
  { key: "spend", label: "Spend", value: (r) => r.spend, render: (r) => formatCurrency(r.spend) },
  { key: "leads", label: "Leads", value: (r) => r.leads, render: (r) => r.leads },
  {
    key: "costPerLead",
    label: "Cost/Lead",
    // null, not Infinity or 0 — a campaign with no leads has no
    // cost-per-lead, which is different from a cost of zero.
    value: (r) => (r.leads > 0 ? r.spend / r.leads : null),
    render: (r) => (r.leads > 0 ? formatCurrency(r.spend / r.leads) : "—"),
  },
  { key: "conversions", label: "Sales", value: (r) => r.conversions, render: (r) => r.conversions },
  { key: "revenue", label: "Revenue", value: (r) => r.revenue, render: (r) => (r.revenue > 0 ? formatCurrency(r.revenue) : "—") },
  {
    key: "roas",
    label: "ROAS",
    value: (r) => (r.spend > 0 && r.revenue > 0 ? r.revenue / r.spend : null),
    render: (r) =>
      r.spend > 0 && r.revenue > 0 ? (
        <span className={r.revenue / r.spend >= 1 ? "text-green-500" : "text-amber-500"}>
          {(r.revenue / r.spend).toFixed(1)}x
        </span>
      ) : (
        "—"
      ),
  },
];

const STORAGE_KEY = "hawlai_campaign_columns";

export default function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  // Default matches the previous hardcoded sort exactly, so the table
  // looks unchanged until someone actually interacts with it.
  const [sortKey, setSortKey] = useState<ColumnKey>("spend");
  const [descending, setDescending] = useState(true);
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [showPicker, setShowPicker] = useState(false);
  const [live, setLive] = useState<LiveMap>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // resolveVisibleColumns drops stale keys AND shows columns added
      // since the preference was saved — see campaignColumns.ts.
      if (saved) setVisible(resolveVisibleColumns(JSON.parse(saved)));
    } catch {
      // Corrupt or blocked storage — defaults are fine.
    }
  }, []);

  const statusShown = visible.includes("status");
  const idsKey = rows.map((r) => r.id ?? "").join(",");

  useEffect(() => {
    // Only asks Meta when the Status column is actually on screen.
    if (!statusShown) return;
    const ids = rows.map((r) => r.id).filter((id): id is string => !!id);
    if (ids.length === 0) {
      setLive({});
      return;
    }
    let cancelled = false;
    setLive(null);
    fetch("/api/ads/campaign-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (!cancelled) setLive(data.statuses ?? {});
      })
      .catch(() => {
        // Every row falls back to its last recorded status, marked as
        // not confirmed — never to a guess.
        if (!cancelled) setLive({});
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, statusShown]);

  function toggleColumn(key: ColumnKey) {
    // At least one column must remain, or the table becomes just a list
    // of names with no information in it.
    const next = visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
    if (next.length === 0) return;
    setVisible(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeColumns(next)));
    } catch {
      // Preference just won't persist; the table still works.
    }
  }

  function sortBy(key: ColumnKey) {
    if (key === sortKey) setDescending((d) => !d);
    else {
      setSortKey(key);
      setDescending(true); // a newly picked metric almost always wants highest-first
    }
  }

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey);
    if (!column?.value) return rows;
    const value = column.value;
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Rows with no value sort LAST in both directions. A campaign
      // with no ROAS isn't "worst ROAS" — it has no data, and letting
      // it top an ascending sort would read as the worst performer.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return descending ? bv - av : av - bv;
    });
  }, [rows, sortKey, descending]);

  const shownColumns = COLUMNS.filter((c) => visible.includes(c.key));

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setShowPicker((s) => !s)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 inline-flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3 h-3" /> Columns
          </button>

          {showPicker && (
            <>
              {/* Click-away layer so the menu closes without needing a
                  document listener. */}
              <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
              <div className="absolute right-0 mt-1 z-20 w-52 card p-2 shadow-lg">
                {COLUMNS.map((c) => {
                  const on = visible.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleColumn(c.key)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 text-left"
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-brand-600 border-brand-600" : "border-slate-300"}`}>
                        {on && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <span className="text-xs text-slate-700">{c.label}</span>
                    </button>
                  );
                })}
                <p className="text-[10px] text-slate-400 px-2 pt-1.5">Campaign name always shows.</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2 font-medium">Campaign</th>
              {shownColumns.map((c) => {
                if (!c.value) {
                  return (
                    <th key={c.key} className="pb-2 font-medium">
                      {c.label}
                    </th>
                  );
                }
                const active = sortKey === c.key;
                return (
                  <th key={c.key} className="pb-2 font-medium">
                    <button
                      onClick={() => sortBy(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-slate-600 transition-colors ${active ? "text-slate-700" : ""}`}
                    >
                      {c.label}
                      {active &&
                        (descending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.id ?? `${row.headline}-${i}`} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2 font-medium text-slate-800">{row.headline}</td>
                {shownColumns.map((c) => (
                  <td key={c.key} className="py-2 pr-3 text-slate-700">
                    {c.render(row, live)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
