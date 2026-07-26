"use client";

import { useState, useEffect } from "react";
import { Loader2, PhoneCall, Sparkles, Image as ImageIcon, Video, IndianRupee, AlertCircle } from "lucide-react";

interface SpendData {
  totals: { calls: number; callMinutes: number; content: number; images: number; videos: number };
  estimatedCostINR: number;
  totalDealerships: number;
  perDealership: { id: string; name: string; plan: string; calls: number; content: number; images: number; videos: number; estimatedCostINR: number }[];
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

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Costs below are rough estimates from round-number per-unit rates (e.g. ~₹7/call-minute), not a reconciliation against actual provider invoices. Use them as a directional guide, not exact billing.
        </p>
      </div>

      <div className="card p-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div>
          <p className="text-xs text-slate-400 flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Est. Cost</p>
          <p className="text-xl font-bold text-slate-900">₹{data.estimatedCostINR.toLocaleString("en-IN")}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 flex items-center gap-1"><PhoneCall className="w-3 h-3" /> Calls</p>
          <p className="text-xl font-bold text-slate-900">{data.totals.calls}</p>
          <p className="text-xs text-slate-400">{data.totals.callMinutes} min</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Content</p>
          <p className="text-xl font-bold text-slate-900">{data.totals.content}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Images</p>
          <p className="text-xl font-bold text-slate-900">{data.totals.images}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 flex items-center gap-1"><Video className="w-3 h-3" /> Videos</p>
          <p className="text-xl font-bold text-slate-900">{data.totals.videos}</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">By Business ({data.totalDealerships} total on platform)</p>
        <div className="space-y-2">
          {data.perDealership.map((d) => (
            <div key={d.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">{d.name}</p>
                <p className="text-xs text-slate-400 capitalize">{d.plan} plan · {d.calls} calls · {d.content} content · {d.images} images · {d.videos} videos</p>
              </div>
              <p className="text-sm font-bold text-slate-700">₹{d.estimatedCostINR.toLocaleString("en-IN")}</p>
            </div>
          ))}
          {data.perDealership.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No usage recorded this month yet.</p>}
        </div>
      </div>
    </div>
  );
}
