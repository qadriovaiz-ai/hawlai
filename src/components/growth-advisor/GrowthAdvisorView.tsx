"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Clock, ArrowRight, Gauge, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const TASKS = [
  { key: "revenue_forecast", label: "Revenue Forecast" },
  { key: "growth_opportunities", label: "Growth Opportunities" },
  { key: "budget_recommendations", label: "Budget Recommendations" },
  { key: "expansion_strategy", label: "Expansion Strategy" },
];

export default function GrowthAdvisorView() {
  const [selectedTask, setSelectedTask] = useState(TASKS[0].key);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/growth-advisor/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/growth-advisor/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskType: selectedTask }) });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/growth-advisor/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  const currentMeta = TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/reports" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Gauge className="w-4 h-4 text-purple-400" /> Business Health Score & Next Best Actions</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TASKS.map((t) => (
            <button key={t.key} onClick={() => { setSelectedTask(t.key); setOutput(null); }} className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {selectedTask === "revenue_forecast" && <p className="text-xs text-slate-400">Computed from your actual last-8-weeks lead volume, conversion rate, and average deal value — not a guess.</p>}
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate {currentMeta?.label}
        </button>
      </div>

      {output && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Result</p>
          {selectedTask === "revenue_forecast" ? <ForecastRenderer output={output} /> : <OutputRenderer output={output} />}
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOutput(h.output)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                {TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ForecastRenderer({ output }: { output: any }) {
  const max = Math.max(...output.weeklyLeadCounts, 1);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Weekly leads (last 8 weeks)</p>
        <div className="flex items-end gap-1.5 h-20">
          {output.weeklyLeadCounts.map((c: number, i: number) => (
            <div key={i} className="flex-1 bg-purple-500/30 rounded-t" style={{ height: `${(c / max) * 100}%`, minHeight: c > 0 ? 4 : 0 }} title={`${c} leads`} />
          ))}
        </div>
      </div>
      {output.forecast30Days ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-100 rounded-lg p-2.5 text-center"><p className="text-sm font-bold text-slate-700">{formatCurrency(output.forecast30Days.low)}</p><p className="text-xs text-slate-400">Low</p></div>
          <div className="bg-purple-500/10 rounded-lg p-2.5 text-center"><p className="text-sm font-bold text-purple-600">{formatCurrency(output.forecast30Days.mid)}</p><p className="text-xs text-slate-400">Expected</p></div>
          <div className="bg-slate-100 rounded-lg p-2.5 text-center"><p className="text-sm font-bold text-slate-700">{formatCurrency(output.forecast30Days.high)}</p><p className="text-xs text-slate-400">High</p></div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Not enough conversion/deal-value data yet for a numeric forecast.</p>
      )}
      <p className="text-sm text-slate-600">{output.narrative}</p>
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  const arrayKey = Object.keys(output).find((k) => Array.isArray(output[k]));
  if (arrayKey) {
    return (
      <div className="space-y-1.5">
        {output.overallGuidance && <p className="text-sm text-slate-600 italic">{output.overallGuidance}</p>}
        {output.readiness && <p className="text-sm font-semibold text-purple-600 capitalize">Readiness: {output.readiness}</p>}
        {output.reasoning && <p className="text-sm text-slate-600">{output.reasoning}</p>}
        {output[arrayKey].map((item: any, i: number) => (
          <div key={i} className="bg-slate-100 rounded-lg p-2.5 text-sm text-slate-700">
            {typeof item === "string" ? item : (
              <>
                {(item.opportunity || item.campaign) && <p className="font-semibold text-slate-800">{item.opportunity || item.campaign} {item.action && <span className="text-xs text-purple-500">({item.action})</span>}</p>}
                <p className="text-xs text-slate-500">{item.why || item.reasoning || JSON.stringify(item)}</p>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-slate-700 whitespace-pre-wrap">{JSON.stringify(output)}</p>;
}
