"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Clock, Bell, Plus, Trash2, ArrowRight, Search } from "lucide-react";
import { COMPETITOR_TASKS } from "@/lib/agents/competitorIntelAgent";

export default function CompetitorIntelView() {
  const [competitorName, setCompetitorName] = useState("");
  const [selectedTask, setSelectedTask] = useState(COMPETITOR_TASKS[0].key);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [watches, setWatches] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [newWatch, setNewWatch] = useState("");

  function loadWatches() {
    fetch("/api/competitor-intel/watches").then((r) => r.json()).then((d) => { setWatches(d.watches ?? []); setAlerts(d.alerts ?? []); });
  }
  useEffect(() => {
    fetch("/api/competitor-intel/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    loadWatches();
  }, []);

  async function handleGenerate() {
    if (!competitorName.trim()) return;
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/competitor-intel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask, competitorName }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/competitor-intel/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

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
      <Link href="/dashboard/research" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Search className="w-4 h-4 text-purple-400" /> Competitor Ads — see what they're running on Meta</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      {/* New Product Alerts — real watched competitors */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> New Product Alerts</p>
        <p className="text-xs text-slate-400">Add competitors to watch — Hawlai checks daily for new launches/announcements and alerts you only when something genuinely new shows up.</p>
        <div className="flex items-center gap-2">
          <input value={newWatch} onChange={(e) => setNewWatch(e.target.value)} placeholder="Competitor name" className="flex-1 text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
          <button onClick={addWatch} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Watch</button>
        </div>
        {watches.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {watches.map((w) => (
              <span key={w.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1.5">
                {w.competitor_name}
                <button onClick={() => removeWatch(w.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400">Recent alerts</p>
            {alerts.map((a) => (
              <div key={a.id} className="bg-slate-100 rounded-lg p-2.5">
                <p className="text-sm font-medium text-slate-700">{a.competitor_name}: {a.title}</p>
                {a.summary && <p className="text-xs text-slate-500">{a.summary}</p>}
                {a.source_url && <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-500 hover:underline">Source</a>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generator for the 4 web-search tasks */}
      <div className="card p-5 space-y-3">
        <input value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} placeholder="Competitor name" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
        <div className="flex flex-wrap gap-1.5">
          {COMPETITOR_TASKS.map((t) => (
            <button key={t.key} onClick={() => { setSelectedTask(t.key); setOutput(null); }} className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={handleGenerate} disabled={loading || !competitorName.trim()} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Research {currentMeta?.label}
        </button>
      </div>

      {output && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Result</p>
          <OutputRenderer output={output} />
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOutput(h.output)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                <span className="font-medium text-slate-700">{h.competitor_name}</span> — {COMPETITOR_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(output).map(([key, val]: [string, any]) => (
        <div key={key}>
          <p className="text-xs font-semibold text-slate-400 capitalize">{key.replace(/_/g, " ")}</p>
          {Array.isArray(val) ? (
            <ul className="space-y-1">{val.map((v: any, i: number) => <li key={i} className="text-sm bg-slate-100 rounded-lg p-2">{typeof v === "string" ? v : JSON.stringify(v)}</li>)}</ul>
          ) : (
            <p className="whitespace-pre-wrap">{typeof val === "string" ? val : JSON.stringify(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
