"use client";

import { useState, useEffect } from "react";
import { Loader2, PhoneCall, MessageSquare, Sparkles, IndianRupee, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";

interface SpendData {
  month: string;
  revenue: { totalInr: number; subscriptionInr: number; overageInr: number; basis: string };
  cogs: { totalInr: number; exactInr: number; estimatedGapInr: number };
  grossProfitInr: number;
  grossMarginPct: number | null;
  exact: {
    claudeCostInr: number; vapiCostInr: number; geminiCostInr: number; elevenLabsCostInr: number; perplexityCostInr: number;
    totalCostInr: number; masterChatMessages: number; callCount: number; callMinutes: number;
  };
  estimated: { costInr: number; content: number; images: number; videos: number; note: string };
  byProvider: Record<string, number>;
  byOperation: Record<string, number>;
  byPlan: Record<string, { dealerships: number; revenueInr: number; costInr: number }>;
  dailySpendAlertInr: number | null;
  totalDealerships: number;
  perDealership: { id: string; name: string; plan: string; exactCostInr: number; revenueInr: number; grossProfitInr: number; calls: number; content: number; images: number; videos: number }[];
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function AdminSpendView() {
  const [data, setData] = useState<SpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(lastNMonths(1)[0]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/spend?month=${month}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [month]);

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  if (error) return <div className="card p-8 text-sm text-red-400">{error}</div>;
  if (!data) return null;

  const marginColor = data.grossMarginPct === null ? "text-slate-900"
    : data.grossMarginPct >= 60 ? "text-emerald-600"
    : data.grossMarginPct >= 40 ? "text-amber-600"
    : "text-red-500";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{data.totalDealerships} businesses on platform</p>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="input text-xs w-auto">
          {lastNMonths(6).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Unit economics — Section 17's core ask */}
      <div className="card p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-brand-500" /> Unit Economics — {data.month}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400">Revenue</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.revenue.totalInr)}</p>
            <p className="text-[10px] text-slate-400">{inr(data.revenue.subscriptionInr)} plans + {inr(data.revenue.overageInr)} overage</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">COGS</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.cogs.totalInr)}</p>
            <p className="text-[10px] text-slate-400">{inr(data.cogs.exactInr)} exact + {inr(data.cogs.estimatedGapInr)} est. gap</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Gross Profit</p>
            <p className={`text-lg font-bold ${data.grossProfitInr >= 0 ? "text-slate-900" : "text-red-500"}`}>{inr(data.grossProfitInr)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Gross Margin</p>
            <p className={`text-lg font-bold ${marginColor}`}>{data.grossMarginPct === null ? "—" : `${data.grossMarginPct}%`}</p>
          </div>
        </div>
        <p className="text-[10.5px] text-slate-400">{data.revenue.basis}</p>
        {data.dailySpendAlertInr !== null && (
          <p className="text-[10.5px] text-slate-400">
            Daily spend alert set at {inr(data.dailySpendAlertInr)}/day across all businesses — checked once daily against the previous complete day, notifying platform admins if crossed.
          </p>
        )}
      </div>

      {/* Exact cost by provider */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" /> Exact cost by provider (logged from real API responses)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Claude</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.exact.claudeCostInr)}</p>
            <p className="text-xs text-slate-400">{data.exact.masterChatMessages} Master Chat msgs</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1"><PhoneCall className="w-3 h-3" /> Vapi (calls)</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.exact.vapiCostInr)}</p>
            <p className="text-xs text-slate-400">{data.exact.callCount} calls · {data.exact.callMinutes} min</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Gemini (image/video)</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.exact.geminiCostInr)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">ElevenLabs (voice)</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.exact.elevenLabsCostInr)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Perplexity (research)</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.exact.perplexityCostInr)}</p>
            <p className="text-[10px] text-slate-400">inactive until API key set</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Exact Subtotal</p>
            <p className="text-lg font-bold text-slate-900">{inr(data.exact.totalCostInr)}</p>
          </div>
        </div>
      </div>

      {/* Estimated gap */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> Estimated gap (generations with no exact log)</p>
        {data.estimated.costInr === 0 ? (
          <p className="text-xs text-slate-500">No gap this month — every generation logged its real cost.</p>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{data.estimated.note}</p>
            </div>
            <p className="text-sm text-slate-600">
              {data.estimated.content} content · {data.estimated.images} images · {data.estimated.videos} videos → <span className="font-bold">{inr(data.estimated.costInr)}</span>
            </p>
          </>
        )}
      </div>

      {/* By plan */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">By plan</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400">
                <th className="text-left font-medium py-2 pr-3">Plan</th>
                <th className="text-right font-medium py-2 px-2">Businesses</th>
                <th className="text-right font-medium py-2 px-2">Revenue</th>
                <th className="text-right font-medium py-2 px-2">Cost</th>
                <th className="text-right font-medium py-2 pl-2">Margin</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.byPlan).map(([plan, v]) => {
                const margin = v.revenueInr > 0 ? Math.round(((v.revenueInr - v.costInr) / v.revenueInr) * 1000) / 10 : null;
                return (
                  <tr key={plan} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-700 capitalize">{plan}</td>
                    <td className="py-2 px-2 text-right text-slate-600 tabular-nums">{v.dealerships}</td>
                    <td className="py-2 px-2 text-right text-slate-600 tabular-nums">{inr(v.revenueInr)}</td>
                    <td className="py-2 px-2 text-right text-slate-600 tabular-nums">{inr(v.costInr)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-slate-600">{margin === null ? "—" : `${margin}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* By feature/operation */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">By feature</p>
        <div className="space-y-1.5">
          {Object.entries(data.byOperation).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([op, cost]) => (
            <div key={op} className="flex items-center justify-between text-xs">
              <span className="text-slate-600 capitalize">{op.replace(/_/g, " ")}</span>
              <span className="text-slate-500 tabular-nums">{inr(cost)}</span>
            </div>
          ))}
          {Object.keys(data.byOperation).length === 0 && <p className="text-xs text-slate-400 py-2">No usage logged this month yet.</p>}
        </div>
      </div>

      {/* By business */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">By business</p>
        <div className="space-y-2">
          {data.perDealership.map((d) => (
            <div key={d.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{d.name}</p>
                <p className="text-xs text-slate-400 capitalize">{d.plan} plan · {d.calls} calls · {d.content} content · {d.images} images · {d.videos} videos</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className={`text-sm font-bold ${d.grossProfitInr >= 0 ? "text-slate-700" : "text-red-500"}`}>{inr(d.grossProfitInr)}</p>
                <p className="text-[10px] text-slate-400">{inr(d.revenueInr)} rev − {inr(d.exactCostInr)} cost</p>
              </div>
            </div>
          ))}
          {data.perDealership.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No usage recorded this month yet.</p>}
        </div>
      </div>
    </div>
  );
}
