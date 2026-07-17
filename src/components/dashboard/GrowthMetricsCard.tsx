"use client";

import { useState, useEffect } from "react";
import { Loader2, TrendingUp, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function GrowthMetricsCard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/analytics/growth-metrics").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading growth metrics...</div>;

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Growth Metrics</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{data.cac !== null ? formatCurrency(data.cac) : "—"}</p>
          <p className="text-xs text-slate-400">CAC</p>
        </div>
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{data.ltv !== null ? formatCurrency(data.ltv) : "—"}</p>
          <p className="text-xs text-slate-400">Avg. Deal Value</p>
        </div>
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{data.conversionRate !== null ? `${data.conversionRate.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-slate-400">Conversion Rate</p>
        </div>
      </div>
      <div className="bg-slate-50 rounded-lg p-2.5 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          CAC = total ad spend ÷ converted leads. "Avg. Deal Value" is the average deal_value of converted leads — a single-purchase estimate, not true LTV, since repeat-purchase tracking per customer isn't collected yet. {data.convertedLeads} of {data.totalLeads} leads converted.
        </p>
      </div>
    </div>
  );
}
