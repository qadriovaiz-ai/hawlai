"use client";

import { useState, useEffect } from "react";
import { Loader2, ThumbsUp, ThumbsDown, AlertTriangle, ShieldAlert, Gauge } from "lucide-react";

export default function AiQualityView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/feedback-stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        {data.totalRated === 0 ? (
          <p className="text-sm text-slate-400">No feedback yet — thumbs up/down on Master Chat responses will show up here.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-200 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-800">{data.totalRated}</p>
              <p className="text-xs text-slate-400">Total rated</p>
            </div>
            <div className="bg-slate-200 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-green-500 flex items-center justify-center gap-1"><ThumbsUp className="w-4 h-4" /> {data.up}</p>
              <p className="text-xs text-slate-400">{data.upRate}% positive</p>
            </div>
            <div className="bg-slate-200 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-red-400 flex items-center justify-center gap-1"><ThumbsDown className="w-4 h-4" /> {data.down}</p>
              <p className="text-xs text-slate-400">Needs review</p>
            </div>
          </div>
        )}
      </div>

      {/* P2 17a — AI self-generated quality signals, distinct from the
          human feedback above: how often the AI's own advisory checks
          actually flag something, and how confident it reports being
          in its own ad copy. */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-purple-400" /> Self-checks, last 30 days</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">{data.flagRate?.pct != null ? `${data.flagRate.pct}%` : "—"}</p>
            <p className="text-xs text-slate-400">Brand voice / compliance flag rate ({data.flagRate?.flaggedCount ?? 0} of {data.flagRate?.artifactCount ?? 0})</p>
          </div>
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1"><Gauge className="w-4 h-4 text-slate-500" /> {data.creativeScoreStats?.avg ?? "—"}</p>
            <p className="text-xs text-slate-400">Avg ad creative confidence score ({data.creativeScoreStats?.count ?? 0} generated)</p>
          </div>
        </div>
        {data.creativeScoreStats && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="text-red-400">{data.creativeScoreStats.low} scored &lt;50</span>
            <span>·</span>
            <span className="text-amber-500">{data.creativeScoreStats.mid} scored 50-74</span>
            <span>·</span>
            <span className="text-green-500">{data.creativeScoreStats.high} scored 75+</span>
          </div>
        )}
        <p className="text-xs text-slate-400">These are advisory-only checks — none of them block or auto-regenerate anything today (see P2 16a for that).</p>
      </div>

      {data.toolsInDownVoted?.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Tools showing up most in down-voted responses</p>
          <div className="flex flex-wrap gap-2">
            {data.toolsInDownVoted.map((t: any) => (
              <span key={t.tool} className="text-xs bg-amber-500/10 text-amber-600 px-2.5 py-1 rounded-full">{t.tool} ({t.count})</span>
            ))}
          </div>
          <p className="text-xs text-slate-400">If one tool/department shows up repeatedly here, that's the highest-leverage place to add more knowledge base coverage or fix the underlying agent.</p>
        </div>
      )}

      {data.recentDownVoted?.length > 0 && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Recent down-voted responses</p>
          {data.recentDownVoted.map((m: any) => (
            <div key={m.id} className="bg-slate-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{m.dealershipName}</span>
                <span>{new Date(m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              </div>
              <p className="text-sm text-slate-700 line-clamp-4 whitespace-pre-wrap">{m.content}</p>
              {m.toolsUsed?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {m.toolsUsed.map((t: string) => <span key={t} className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
