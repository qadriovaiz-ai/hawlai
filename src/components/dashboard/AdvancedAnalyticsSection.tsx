import { formatCurrency } from "@/lib/utils";
import { GitBranch, Repeat, LayersIcon } from "lucide-react";
import type { AttributionResult } from "@/lib/analytics/attribution";
import type { LtvSummary, CohortRow } from "@/lib/analytics/ltvCohorts";

// P3 piece 8 — multi-touch attribution (8a), true LTV (8b), cohorts
// (8c). Server component: every number is computed server-side from
// real rows, nothing fetched client-side.
export default function AdvancedAnalyticsSection({
  attribution,
  ltv,
  cohorts,
}: {
  attribution: AttributionResult;
  ltv: LtvSummary;
  cohorts: CohortRow[];
}) {
  return (
    <div className="space-y-6">
      {/* ---- 8a: Multi-touch attribution ---- */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-brand-500" />
          <p className="text-sm font-semibold text-slate-700">Channel attribution</p>
        </div>

        {attribution.channels.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">No touchpoint data yet — this fills in as leads come through tracked channels.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400">
                    <th className="text-left font-medium py-2 pr-3">Channel</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">First touch</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Last touch</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Linear</th>
                    <th className="text-right font-medium py-2 pl-2 whitespace-nowrap">Touches</th>
                  </tr>
                </thead>
                <tbody>
                  {attribution.channels.map((c) => (
                    <tr key={c.channel} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-700 capitalize whitespace-nowrap">{c.channel.replace(/_/g, " ")}</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums whitespace-nowrap">{formatCurrency(c.firstTouch.revenue)}</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums whitespace-nowrap">{formatCurrency(c.lastTouch.revenue)}</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums whitespace-nowrap">{formatCurrency(c.linear.revenue)}</td>
                      <td className="py-2 pl-2 text-right text-slate-400 tabular-nums">{c.totalTouches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10.5px] text-slate-400">
              Three models shown side by side because they genuinely disagree — first-touch credits what started the journey, last-touch what closed it, linear splits credit across every distinct channel involved. Which one to trust depends on how long your sales cycle is.
              {attribution.convertedLeadsWithTouchpoints < attribution.convertedLeadsTotal && (
                <> Based on {attribution.convertedLeadsWithTouchpoints} of {attribution.convertedLeadsTotal} converted leads — the rest have no touchpoint history recorded yet.</>
              )}
            </p>
          </>
        )}
      </div>

      {/* ---- 8b: LTV ---- */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-brand-500" />
          <p className="text-sm font-semibold text-slate-700">
            {ltv.isEssentiallySinglePurchase ? "Average customer value" : "Customer lifetime value"}
          </p>
        </div>

        {ltv.customerCount === 0 ? (
          <p className="text-xs text-slate-400 py-3">No paid orders yet — this fills in once customers start buying.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={ltv.isEssentiallySinglePurchase ? "Avg order value" : "Avg lifetime value"} value={formatCurrency(ltv.avgLtv)} />
              <Stat label="Customers" value={String(ltv.customerCount)} />
              <Stat label="Orders per customer" value={ltv.avgOrdersPerCustomer.toFixed(2)} />
              <Stat label="Repeat buyers" value={`${Math.round(ltv.repeatRate * 100)}%`} />
            </div>

            {/* The honesty rule — see ltvCohorts.ts's header. */}
            {ltv.isEssentiallySinglePurchase && (
              <p className="text-[10.5px] text-amber-600 bg-amber-500/10 border border-amber-300/40 rounded-lg px-2.5 py-2">
                Almost nobody here buys twice ({ltv.repeatCustomerCount} of {ltv.customerCount} customers), so this is really average order value, not lifetime value. That's normal and fine for one-off-purchase businesses — it isn't a sign anything's wrong.
              </p>
            )}

            {ltv.customers.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <p className="text-[10.5px] font-medium text-slate-400 uppercase tracking-wide">Top customers by spend</p>
                {ltv.customers.slice(0, 5).map((c) => (
                  <div key={c.customerKey} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate">{c.name}</span>
                    <span className="text-slate-500 tabular-nums shrink-0 ml-3">
                      {formatCurrency(c.totalSpend)} <span className="text-slate-400">· {c.orderCount} order{c.orderCount === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- 8c: Cohorts ---- */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <LayersIcon className="w-4 h-4 text-brand-500" />
          <p className="text-sm font-semibold text-slate-700">Cohorts by acquisition month</p>
        </div>

        {cohorts.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">Not enough lead history yet for cohort analysis.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400">
                    <th className="text-left font-medium py-2 pr-3">Cohort</th>
                    <th className="text-right font-medium py-2 px-2">Leads</th>
                    <th className="text-right font-medium py-2 px-2">Converted</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Conv. rate</th>
                    <th className="text-right font-medium py-2 px-2">Revenue</th>
                    <th className="text-right font-medium py-2 pl-2 whitespace-nowrap">Avg days</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.cohort} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">{c.cohort}</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums">{c.leadCount}</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums">{c.convertedCount}</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums">{Math.round(c.conversionRate * 100)}%</td>
                      <td className="py-2 px-2 text-right text-slate-600 tabular-nums whitespace-nowrap">{formatCurrency(c.revenue)}</td>
                      <td className="py-2 pl-2 text-right text-slate-400 tabular-nums">{c.avgDaysToConvert ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10.5px] text-slate-400">
              Each row is everyone acquired in that month, tracked forward. Recent cohorts naturally show lower conversion — they've had less time to convert, not worse quality. "Avg days" only counts conversions recorded since conversion-time tracking was added, so older cohorts may show "—".
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 rounded-lg p-3">
      <p className="text-sm font-bold text-slate-800 tabular-nums">{value}</p>
      <p className="text-[10.5px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
