"use client";

import { useState, useEffect } from "react";
import { Loader2, ThumbsUp, ThumbsDown, AlertTriangle } from "lucide-react";

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
