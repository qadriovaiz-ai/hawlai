"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Bell, Plus, Trash2, ArrowRight, Search } from "lucide-react";
import { COMPETITOR_TASKS } from "@/lib/agents/competitorIntelAgent";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

export default function CompetitorIntelView() {
  const [competitorName, setCompetitorName] = useState("");
  const [selectedTask, setSelectedTask] = useState(COMPETITOR_TASKS[0].key);
  const [watches, setWatches] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [newWatch, setNewWatch] = useState("");
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/competitor-intel/generate" });

  function loadWatches() {
    fetch("/api/competitor-intel/watches").then((r) => r.json()).then((d) => { setWatches(d.watches ?? []); setAlerts(d.alerts ?? []); });
  }
  useEffect(() => { loadWatches(); }, []);

  async function addWatch() {
    if (!newWatch.trim()) return;
    await fetch("/api/competitor-intel/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorName: newWatch }),
    });
    setNewWatch("");
    loadWatches();
  }

  async function removeWatch(id: string) {
    await fetch("/api/competitor-intel/watches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadWatches();
  }

  const currentMeta = COMPETITOR_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/research" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Search className="w-4 h-4 text-brand-400" /> Competitor Ads — see what they're running on Meta</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      {/* New Product Alerts — real watched competitors */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> New Product Alerts</p>
        <p className="text-xs text-slate-400">Add competitors to watch — Hawlai checks daily for new launches/announcements and alerts you only when something genuinely new shows up.</p>
        <div className="flex items-center gap-2">
          <Input value={newWatch} onChange={(e) => setNewWatch(e.target.value)} placeholder="Competitor name" className="flex-1" />
          <Button size="sm" onClick={addWatch}><Plus className="w-3.5 h-3.5" /> Watch</Button>
        </div>
        {watches.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {watches.map((w) => (
              <Badge key={w.id} tone="neutral" className="gap-1.5">
                {w.competitor_name}
                <button onClick={() => removeWatch(w.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </Badge>
            ))}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400">Recent alerts</p>
            {alerts.map((a) => (
              <div key={a.id} className="bg-slate-200 rounded-lg p-2.5">
                <p className="text-sm font-medium text-slate-700">{a.competitor_name}: {a.title}</p>
                {a.summary && <p className="text-xs text-slate-500">{a.summary}</p>}
                {a.source_url && <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-500 hover:underline">Source</a>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Generator for the 4 web-search tasks */}
      <Card className="space-y-3">
        <Input value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} placeholder="Competitor name" />
        <div className="flex flex-wrap gap-1.5">
          {COMPETITOR_TASKS.map((t) => (
            <button key={t.key} onClick={() => { setSelectedTask(t.key); reset(); }} className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedTask === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Button onClick={() => generate({ taskType: selectedTask, competitorName })} loading={loading} disabled={!competitorName.trim()}>
          {!loading && <Sparkles className="w-4 h-4" />} Research {currentMeta?.label}
        </Button>
      </Card>

      <GeneratedOutputPanel
        output={output}
        editing={editing}
        draft={draft}
        saving={saving}
        copied={copied}
        outputId={outputId}
        onStartEditing={startEditing}
        onCancelEditing={cancelEditing}
        onSaveEdits={saveEdits}
        onCopy={copyOutput}
        onDraftChange={setDraft}
      />

      <GeneratedHistoryPanel
        items={history}
        onSelect={selectFromHistory}
        label={(h) => `${h.competitor_name} — ${COMPETITOR_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}`}
      />
    </div>
  );
}
