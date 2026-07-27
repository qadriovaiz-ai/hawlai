"use client";

import { useState, useEffect } from "react";
import { Loader2, PhoneCall, MessageSquare, Sparkles, IndianRupee, CheckCircle2, AlertCircle } from "lucide-react";

interface SpendData {
  exact: { claudeCostInr: number; vapiCostInr: number; totalCostInr: number; masterChatMessages: number; callCount: number; callMinutes: number };
  estimated: { costInr: number; content: number; images: number; videos: number };
  totalDealerships: number;
  perDealership: { id: string; name: string; plan: string; exactCostInr: number; estimatedCostInr: number; calls: number; content: number; images: number; videos: number }[];
}

export default function AdminSpendView() {
  const [data, setData] = useState<SpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/spend")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setData(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  if (error) return <div className="card p-8 text-sm text-red-400">{error}</div>;
  if (!data) return null;

  const grandTotal = data.exact.totalCostInr + data.estimated.costInr;

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Total This Month (exact + estimated)</p>
          <p className="text-2xl font-bold text-slate-900">₹{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
        </div>
        <p className="text-xs text-slate-400">{data.totalDealerships} businesses on platform</p>
      </div>

      {/* Exact section */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" /> Exact (logged from real API responses)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Master Chat</p>
            <p className="text-lg font-bold text-slate-900">₹{data.exact.claudeCostInr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-slate-400">{data.exact.masterChatMessages} messages</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1"><PhoneCall className="w-3 h-3" /> AI Calls</p>
            <p className="text-lg font-bold text-slate-900">₹{data.exact.vapiCostInr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-slate-400">{data.exact.callCount} calls · {data.exact.callMinutes} min</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Exact Subtotal</p>
            <p className="text-lg font-bold text-slate-900">₹{data.exact.totalCostInr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Estimated section */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> Estimated (not yet instrumented with exact logging)</p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Content/image/video generation from department pages (outside Master Chat) don't log exact token/cost yet — these are round-number-per-unit guesses (~₹2/content, ~₹3/image, ~₹40/video), not real provider billing.
          </p>
        </div>
        <p className="text-sm text-slate-600">
          {data.estimated.content} content · {data.estimated.images} images · {data.estimated.videos} videos → <span className="font-bold">₹{data.estimated.costInr.toLocaleString("en-IN")}</span>
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">By Business</p>
        <div className="space-y-2">
          {data.perDealership.map((d) => (
            <div key={d.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">{d.name}</p>
                <p className="text-xs text-slate-400 capitalize">{d.plan} plan · {d.calls} calls · {d.content} content · {d.images} images · {d.videos} videos</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-700">₹{(d.exactCostInr + d.estimatedCostInr).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                <p className="text-[10px] text-slate-400">₹{d.exactCostInr.toFixed(2)} exact + ₹{d.estimatedCostInr} est.</p>
              </div>
            </div>
          ))}
          {data.perDealership.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No usage recorded this month yet.</p>}
        </div>
      </div>
    </div>
  );
}
