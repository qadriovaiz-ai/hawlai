"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Clock, Bell, Plus, Trash2, ArrowRight, TrendingUp, Radar } from "lucide-react";
import { RESEARCH_TASKS } from "@/lib/agents/researchAgentV2";

export default function ResearchAgentView() {
  const [selectedTask, setSelectedTask] = useState(RESEARCH_TASKS[0].key);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [watches, setWatches] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [newWatch, setNewWatch] = useState("");

  function loadWatches() {
    fetch("/api/research-agent/watches").then((r) => r.json()).then((d) => { setWatches(d.watches ?? []); setAlerts(d.alerts ?? []); });
  }
  useEffect(() => {
    fetch("/api/research-agent/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    loadWatches();
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/research-agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/research-agent/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  async function addWatch() {
    if (!newWatch.trim()) return;
    await fetch("/api/research-agent/watches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: newWatch }) });
    setNewWatch("");
    loadWatches();
  }
  async function removeWatch(id: string) {
    await fetch("/api/research-agent/watches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadWatches();
  }

  const currentMeta = RESEARCH_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/dashboard/social" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><TrendingUp className="w-4 h-4 text-purple-400" /> Viral Content</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
        <Link href="/dashboard/competitor-intel" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Radar className="w-4 h-4 text-purple-400" /> Competitor Reports</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
      </div>

      {/* News Monitoring — real topic watch */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> News Monitoring</p>
        <p className="text-xs text-slate-400">Watch any topic — your industry, a regulation, a keyword. Hawlai checks daily and shows only genuinely new stories.</p>
        <div className="flex items-center gap-2">
          <input value={newWatch} onChange={(e) => setNewWatch(e.target.value)} placeholder="Topic to watch" className="flex-1 text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
          <button onClick={addWatch} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Watch</button>
        </div>
        {watches.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {watches.map((w) => (
              <span key={w.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1.5">
                {w.topic}
                <button onClick={() => removeWatch(w.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400">Recent stories</p>
            {alerts.map((a) => (
              <div key={a.id} className="bg-slate-100 rounded-lg p-2.5">
                <p className="text-sm font-medium text-slate-700">{a.topic}: {a.title}</p>
                {a.summary && <p className="text-xs text-slate-500">{a.summary}</p>}
                {a.source_url && <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-500 hover:underline">Source</a>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generator */}
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {RESEARCH_TASKS.map((t) => (
            <button key={t.key} onClick={() => { setSelectedTask(t.key); setOutput(null); }} className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {currentMeta?.key === "customer_sentiment" && <p className="text-xs text-slate-400">Analyzes your own leads' qualification notes — no web search, real internal data.</p>}
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
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
                {RESEARCH_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
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
