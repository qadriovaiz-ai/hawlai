"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUp, ArrowDown, SlidersHorizontal, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// Sortable, column-configurable campaign table — Ads Manager style.
//
// No migration: sorting is UI state, and column preferences are a
// per-user DISPLAY setting rather than business data, so they live in
// localStorage. Persisting them server-side would mean a schema
// change and a round-trip for something that only affects how one
// person's screen looks.

export interface CampaignRow {
  headline: string;
  spend: number;
  leads: number;
  revenue: number;
  conversions: number;
  days: number;
}

type ColumnKey = "days" | "spend" | "leads" | "costPerLead" | "conversions" | "revenue" | "roas";

interface Column {
  key: ColumnKey;
  label: string;
  /** Derived columns can't be read straight off the row. */
  value: (row: CampaignRow) => number | null;
  render: (row: CampaignRow) => React.ReactNode;
}

const COLUMNS: Column[] = [
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
const DEFAULT_VISIBLE: ColumnKey[] = ["days", "spend", "leads", "costPerLead", "conversions", "revenue", "roas"];

export default function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  // Default matches the previous hardcoded sort exactly, so the table
  // looks unchanged until someone actually interacts with it.
  const [sortKey, setSortKey] = useState<ColumnKey>("spend");
  const [descending, setDescending] = useState(true);
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filtered against the known columns so a stale saved key from
        // an older version can't render a broken header.
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((k: string) => COLUMNS.some((c) => c.key === k));
          if (valid.length > 0) setVisible(valid);
        }
      }
    } catch {
      // Corrupt or blocked storage — defaults are fine.
    }
  }, []);

  function toggleColumn(key: ColumnKey) {
    // At least one metric column must remain, or the table becomes
    // just a list of names with no information in it.
    const next = visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
    if (next.length === 0) return;
    setVisible(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    if (!column) return rows;
    return [...rows].sort((a, b) => {
      const av = column.value(a);
      const bv = column.value(b);
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
              <tr key={`${row.headline}-${i}`} className="border-b border-slate-50 last:border-0">
                <td className="py-2 font-medium text-slate-800">{row.headline}</td>
                {shownColumns.map((c) => (
                  <td key={c.key} className="py-2 text-slate-700">
                    {c.render(row)}
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
