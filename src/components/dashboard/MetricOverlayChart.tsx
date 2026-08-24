"use client";

import { useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// Multi-metric overlay — spend vs leads vs revenue on one chart,
// the way Ads Manager does it.
//
// ComposedChart (already in recharts 2.13, no new dependency) rather
// than stacking separate charts, because the whole point is seeing
// whether spend and leads actually move together.
//
// TWO Y-AXES, and that's load-bearing: revenue is in tens of thousands
// of rupees while leads are single or double digits. On a shared axis
// the leads line flattens to the baseline and reads as zero. Money
// goes left, counts go right.

export interface OverlayPoint {
  date: string;
  spend: number;
  leads: number;
  revenue: number;
}

type MetricKey = "spend" | "leads" | "revenue";

const METRICS: { key: MetricKey; label: string; color: string; axis: "money" | "count" }[] = [
  { key: "spend", label: "Spend", color: "#a5b4fc", axis: "money" },
  { key: "revenue", label: "Revenue", color: "#5dcaa5", axis: "money" },
  { key: "leads", label: "Leads", color: "#f0a868", axis: "count" },
];

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function MetricOverlayChart({ data, rangeLabel }: { data: OverlayPoint[]; rangeLabel: string }) {
  const [active, setActive] = useState<Record<MetricKey, boolean>>({ spend: true, leads: true, revenue: true });

  function toggle(key: MetricKey) {
    // Never allow zero metrics — an empty chart looks broken rather
    // than intentional, so the last active one can't be switched off.
    const enabledCount = Object.values(active).filter(Boolean).length;
    if (active[key] && enabledCount === 1) return;
    setActive({ ...active, [key]: !active[key] });
  }

  const hasData = data.some((d) => d.spend > 0 || d.leads > 0 || d.revenue > 0);

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-700">Performance over time</p>
          <p className="text-xs text-slate-400">{rangeLabel}</p>
        </div>
        <div className="flex gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className={`text-[11px] px-2 py-1 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
                active[m.key] ? "border-slate-300 bg-slate-100 text-slate-700" : "border-slate-200 text-slate-400"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: active[m.key] ? m.color : "#cbd5e1" }}
              />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-400 text-center py-12">No activity in this period.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="overlaySpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a5b4fc" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a5b4fc" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
            {/* Money left, counts right — see the header comment. */}
            <YAxis
              yAxisId="money"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
              formatter={(value: any, name: any) => {
                const metric = METRICS.find((m) => m.label === name);
                return [metric?.axis === "money" ? inr(Number(value)) : value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {active.spend && (
              <Area
                yAxisId="money"
                type="monotone"
                dataKey="spend"
                name="Spend"
                stroke="#a5b4fc"
                strokeWidth={2}
                fill="url(#overlaySpend)"
              />
            )}
            {active.revenue && (
              <Line yAxisId="money" type="monotone" dataKey="revenue" name="Revenue" stroke="#5dcaa5" strokeWidth={2} dot={false} />
            )}
            {active.leads && (
              <Line yAxisId="count" type="monotone" dataKey="leads" name="Leads" stroke="#f0a868" strokeWidth={2} dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <p className="text-[10.5px] text-slate-400">
        Money is on the left axis, lead count on the right — they&apos;re very different scales, so a shared axis would flatten the leads line to nothing.
      </p>
    </div>
  );
}
