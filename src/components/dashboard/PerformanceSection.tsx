import { Users, IndianRupee, Target, BarChart3, Megaphone, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DataStateNote } from "./DataStateNote";
import { UNTRACKED_CHANNELS, type DashboardData, type Loaded } from "@/lib/dashboard/dashboardData";
import type { MetricDelta } from "@/lib/analytics/dateRange";

// The period-governed half of Home: KPIs, channel split, campaigns.
// Server component — every number is computed server-side and there's
// nothing interactive here, so it ships no JS. The range selector
// above it is the only client piece.

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
      {/* percent is null at small baselines by design — see computeDelta.
          A 1 -> 2 move is "+100%" and is really one extra lead. */}
      {delta.percent !== null && <span className="text-slate-400">({up ? "+" : ""}{delta.percent}%)</span>}
    </span>
  );
}

function Tile({
  label,
  icon: Icon,
  color,
  children,
}: {
  label: string;
  icon: typeof Users;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-h-[3.25rem]">{children}</div>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function CountTile({ label, icon, color, metric }: { label: string; icon: typeof Users; color: string; metric: Loaded<MetricDelta> }) {
  return (
    <Tile label={label} icon={icon} color={color}>
      {metric.state === "ok" ? (
        <>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{metric.value.current}</p>
          <div className="mt-0.5"><DeltaBadge delta={metric.value} /></div>
        </>
      ) : (
        <DataStateNote state={metric} compact />
      )}
    </Tile>
  );
}

export default function PerformanceSection({ data, rangeLabel }: { data: DashboardData; rangeLabel: string }) {
  const { kpis, channels, campaigns } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CountTile label={`New leads · ${rangeLabel}`} icon={Users} color="bg-brand-500/10 text-brand-500" metric={kpis.newLeads} />

        <Tile label={`Ad spend · ${rangeLabel}`} icon={IndianRupee} color="bg-purple-500/10 text-purple-500">
          {kpis.adSpend.state === "ok" ? (
            <>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(kpis.adSpend.value.current)}</p>
              <div className="mt-0.5"><DeltaBadge delta={kpis.adSpend.value} /></div>
            </>
          ) : (
            <DataStateNote state={kpis.adSpend} compact />
          )}
        </Tile>

        <Tile label={`Cost per lead · ${rangeLabel}`} icon={Target} color="bg-blue-500/10 text-blue-500">
          {kpis.costPerLead.state === "ok" ? (
            kpis.costPerLead.value.current === null ? (
              // Spend with no attributed leads. Deliberately not shown
              // as ₹0 — that would read as "leads are free" when it
              // actually means the money bought nothing yet.
              <>
                <p className="text-2xl font-bold text-slate-900">—</p>
                <p className="text-[10.5px] text-amber-600 mt-0.5">Spend recorded, no leads from ads yet</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(kpis.costPerLead.value.current)}</p>
                {kpis.costPerLead.value.previous !== null && (
                  <p className="text-[10.5px] text-slate-400 mt-0.5 tabular-nums">
                    was {formatCurrency(kpis.costPerLead.value.previous)}
                  </p>
                )}
              </>
            )
          ) : (
            <DataStateNote state={kpis.costPerLead} compact />
          )}
        </Tile>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---- Channel breakdown ---- */}
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" /> Where leads came from
          </p>

          {channels.state === "ok" ? (
            <>
              <div className="space-y-2">
                {channels.value.map((c) => {
                  const total = channels.value.reduce((s, x) => s + x.leads, 0);
                  const pct = total > 0 ? Math.round((c.leads / total) * 100) : 0;
                  return (
                    <div key={c.channel}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600">{c.channel}</span>
                        <span className="text-slate-500 tabular-nums">{c.leads} · {pct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Stated rather than omitted: a channel we don't track
                  must not look like a channel that sends nothing. */}
              <p className="text-[10.5px] text-slate-400 pt-1 border-t border-slate-200/70">
                {UNTRACKED_CHANNELS.join(", ")} isn&apos;t shown — Hawlai doesn&apos;t record it as a lead source yet, so a zero
                here would be misleading rather than informative.
              </p>
            </>
          ) : (
            <DataStateNote state={channels} />
          )}
        </div>

        {/* ---- Active campaigns ---- */}
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-slate-400" /> Campaigns · {rangeLabel}
          </p>

          {campaigns.state === "ok" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-200/70">
                    <th className="pb-2 font-medium">Campaign</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Spend</th>
                    <th className="pb-2 font-medium text-right">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.value.slice(0, 8).map((c, i) => (
                    <tr key={`${c.name}-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-slate-700 truncate max-w-[10rem]">{c.name}</td>
                      <td className="py-2">
                        <span className={`text-[10.5px] ${c.status === "ACTIVE" ? "text-green-600" : "text-slate-400"}`}>
                          {c.status === "ACTIVE" ? "Running" : c.status === "PAUSED" ? "Paused" : c.status}
                        </span>
                      </td>
                      <td className="py-2 text-slate-700 text-right tabular-nums">{formatCurrency(c.spend)}</td>
                      <td className="py-2 text-slate-700 text-right tabular-nums">{c.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DataStateNote state={campaigns} />
          )}
        </div>
      </div>
    </div>
  );
}
