"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Gauge, TrendingUp, Pencil, Save, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { EditableOutput } from "@/components/shared/GeneratedOutputEditor";
import { Badge, Button, Card, type BadgeTone } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

const TASKS = [
  { key: "revenue_forecast", label: "Revenue Forecast" },
  { key: "growth_opportunities", label: "Growth Opportunities" },
  { key: "budget_recommendations", label: "Budget Recommendations" },
  { key: "expansion_strategy", label: "Expansion Strategy" },
];

export default function GrowthAdvisorView() {
  const [selectedTask, setSelectedTask] = useState(TASKS[0].key);
  const {
    loading, output, outputId, editing, draft, saving, history,
    generate, startEditing, cancelEditing, saveEdits, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/growth-advisor/generate" });

  const currentMeta = TASKS.find((t) => t.key === selectedTask);
  const isForecast = selectedTask === "revenue_forecast";

  function selectHistoryItem(h: any) {
    setSelectedTask(h.task_type);
    selectFromHistory(h);
  }

  return (
    <div className="space-y-5">
      <Link href="/dashboard/reports" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Gauge className="w-4 h-4 text-brand-400" /> Business Health Score & Next Best Actions</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TASKS.map((t) => (
            <button key={t.key} onClick={() => { setSelectedTask(t.key); reset(); }} className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedTask === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {isForecast && <p className="text-xs text-slate-400">Computed from your actual last-8-weeks lead volume, conversion rate, and average deal value — not a guess.</p>}
        <Button onClick={() => generate({ taskType: selectedTask })} loading={loading}>
          {!loading && <Sparkles className="w-4 h-4" />} Generate {currentMeta?.label}
        </Button>
      </Card>

      {output && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Result</p>
            {editing ? (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={saveEdits} loading={saving} disabled={!outputId}>
                  {!saving && <Save className="w-3.5 h-3.5" />} Save
                </Button>
              </div>
            ) : (
              outputId && (
                <button onClick={startEditing} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )
            )}
          </div>
          {editing ? (
            <EditableOutput output={draft} onChange={setDraft} />
          ) : isForecast ? (
            <ForecastRenderer output={output} />
          ) : (
            <GrowthOutputRenderer output={output} />
          )}
        </Card>
      )}

      <GeneratedHistoryPanel
        items={history}
        onSelect={selectHistoryItem}
        label={(h) => TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
      />
    </div>
  );
}

function ForecastRenderer({ output }: { output: any }) {
  const max = Math.max(...output.weeklyLeadCounts, 1);
  const trendTone: BadgeTone = output.trendDirection === "growing" ? "positive" : output.trendDirection === "declining" ? "negative" : "neutral";
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-slate-400 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Weekly leads (last 8 weeks)</p>
          {output.trendDirection && <Badge tone={trendTone} className="uppercase text-[10px] font-semibold">{output.trendDirection}</Badge>}
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {output.weeklyLeadCounts.map((c: number, i: number) => (
            <div key={i} className="flex-1 bg-brand-500/30 rounded-t" style={{ height: `${(c / max) * 100}%`, minHeight: c > 0 ? 4 : 0 }} title={`${c} leads`} />
          ))}
        </div>
      </div>
      {output.forecast30Days ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-200 rounded-lg p-2.5 text-center"><p className="text-sm font-bold text-slate-700">{formatCurrency(output.forecast30Days.low)}</p><p className="text-xs text-slate-400">Low</p></div>
          <div className="bg-brand-500/10 rounded-lg p-2.5 text-center"><p className="text-sm font-bold text-brand-600">{formatCurrency(output.forecast30Days.mid)}</p><p className="text-xs text-slate-400">Expected</p></div>
          <div className="bg-slate-200 rounded-lg p-2.5 text-center"><p className="text-sm font-bold text-slate-700">{formatCurrency(output.forecast30Days.high)}</p><p className="text-xs text-slate-400">High</p></div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Not enough conversion/deal-value data yet for a numeric forecast.</p>
      )}
      <p className="text-sm text-slate-600">{output.narrative}</p>
    </div>
  );
}

function GrowthOutputRenderer({ output }: { output: any }) {
  const arrayKey = Object.keys(output).find((k) => Array.isArray(output[k]));
  if (arrayKey) {
    return (
      <div className="space-y-1.5">
        {output.overallGuidance && <p className="text-sm text-slate-600 italic">{output.overallGuidance}</p>}
        {output.readiness && <p className="text-sm font-semibold text-brand-600 capitalize">Readiness: {output.readiness}</p>}
        {output.reasoning && <p className="text-sm text-slate-600">{output.reasoning}</p>}
        {output[arrayKey].map((item: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-2.5 text-sm text-slate-700">
            {typeof item === "string" ? item : (
              <>
                {(item.opportunity || item.campaign) && <p className="font-semibold text-slate-800">{item.opportunity || item.campaign} {item.action && <span className="text-xs text-brand-500">({item.action})</span>}</p>}
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
