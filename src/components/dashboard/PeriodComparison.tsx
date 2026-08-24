import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { MetricDelta } from "@/lib/analytics/dateRange";

// "vs previous period" — the Ads-Manager comparison row.
//
// Server component: everything is already computed page-side, so
// there's nothing interactive here and no reason to ship JS for it.
//
// Shows the ABSOLUTE change always, and the percentage only when the
// baseline is large enough for one to mean anything (see computeDelta).
// A move from 1 lead to 2 is "+100%", which reads as a breakthrough
// and is really one extra lead — so at small volumes only the real
// number is shown.

const METRICS: { key: "leads" | "calls" | "appointments"; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "calls", label: "Calls" },
  { key: "appointments", label: "Appointments" },
];

function DeltaBadge({ delta }: { delta: MetricDelta }) {
  if (delta.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-400">
        <Minus className="w-3 h-3" /> no change
      </span>
    );
  }

  const up = delta.direction === "up";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium ${up ? "text-green-600" : "text-red-500"}`}>
      <Icon className="w-3 h-3" />
      {up ? "+" : ""}{delta.absolute}
      {delta.percent !== null && <span className="text-slate-400">({up ? "+" : ""}{delta.percent}%)</span>}
    </span>
  );
}

export default function PeriodComparison({
  deltas,
  rangeLabel,
}: {
  deltas: { leads: MetricDelta; calls: MetricDelta; appointments: MetricDelta };
  rangeLabel: string;
}) {
  // Nothing happened in either window — a row of zeros and "no change"
  // is noise, so it simply doesn't render.
  const hasActivity = METRICS.some((m) => deltas[m.key].current > 0 || deltas[m.key].previous > 0);
  if (!hasActivity) return null;

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2.5 flex-wrap">
        <p className="text-sm font-semibold text-slate-700">Compared to the previous period</p>
        <p className="text-[10.5px] text-slate-400">{rangeLabel} vs the {rangeLabel.toLowerCase().replace(/^last /, "")} before it</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {METRICS.map(({ key, label }) => {
          const d = deltas[key];
          return (
            <div key={key}>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{d.current}</p>
              <p className="text-xs text-slate-500">{label}</p>
              <div className="mt-0.5">
                <DeltaBadge delta={d} />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">was {d.previous}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
