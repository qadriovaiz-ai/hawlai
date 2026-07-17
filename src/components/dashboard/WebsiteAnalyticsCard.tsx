"use client";

import { useState, useEffect } from "react";
import { Loader2, Globe, MousePointer } from "lucide-react";

export default function WebsiteAnalyticsCard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/analytics/website").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading website analytics...</div>;

  if (!data.published) {
    return (
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1"><Globe className="w-4 h-4" /> Website Analytics</p>
        <p className="text-xs text-slate-400">Publish your landing page in the Website section to start tracking visitors, engagement, and click heatmaps here.</p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Globe className="w-4 h-4" /> Website Analytics — last 30 days</p>

      {/* Funnel */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{data.views}</p>
          <p className="text-xs text-slate-400">Page Views</p>
        </div>
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{data.chatOpens}</p>
          <p className="text-xs text-slate-400">Chat Opened</p>
        </div>
        <div className="bg-slate-100 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-800">{data.formSubmits}</p>
          <p className="text-xs text-slate-400">Leads Captured</p>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span>Engagement rate: <span className="font-semibold text-slate-700">{data.engagementRate !== null ? `${data.engagementRate.toFixed(1)}%` : "—"}</span></span>
        <span>Conversion rate: <span className="font-semibold text-slate-700">{data.conversionRate !== null ? `${data.conversionRate.toFixed(1)}%` : "—"}</span></span>
      </div>

      {/* Heatmap */}
      <div>
        <p className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1"><MousePointer className="w-3.5 h-3.5" /> Click Heatmap</p>
        {data.heatmapPoints.length === 0 ? (
          <p className="text-xs text-slate-400">No clicks recorded yet.</p>
        ) : (
          <div className="relative w-full aspect-[3/4] bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
            {data.heatmapPoints.map((p: any, i: number) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: 24,
                  height: 24,
                  transform: "translate(-50%, -50%)",
                  background: "radial-gradient(circle, rgba(239,68,68,0.5) 0%, rgba(239,68,68,0) 70%)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
