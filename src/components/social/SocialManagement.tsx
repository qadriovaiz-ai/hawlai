"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Copy, Check, Clock, Users, ArrowRight, BarChart3 } from "lucide-react";
import { SOCIAL_TASKS } from "@/lib/agents/socialManagementAgent";

export default function SocialManagement() {
  const [selectedTask, setSelectedTask] = useState(SOCIAL_TASKS[0].key);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/social/management").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/social/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask, inputText }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/social/management").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2).replace(/[{}"\[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const currentMeta = SOCIAL_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4" /> Social Media Management</p>

      <Link href="/dashboard/insights" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><BarChart3 className="w-4 h-4 text-purple-400" /> Analytics & Engagement Numbers</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {SOCIAL_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); setOutput(null); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-purple-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {currentMeta?.needsInput && (
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste the DM or comment text here"
            className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400"
          />
        )}

        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate {currentMeta?.label}
        </button>
      </div>

      {output && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Result</p>
            <button onClick={copyOutput} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
            </button>
          </div>
          <OutputRenderer output={output} />
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOutput(h.output)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                <span className="font-medium text-slate-700">{SOCIAL_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  const arrayKey = Object.keys(output).find((k) => Array.isArray(output[k]));
  if (arrayKey) {
    return (
      <div className="space-y-1.5">
        {output[arrayKey].map((item: any, i: number) => (
          <div key={i} className="bg-slate-100 rounded-lg p-2.5 text-sm text-slate-700">
            {typeof item === "string" ? item : (
              <>
                {(item.scenario || item.tactic || item.tip || item.trend) && (
                  <p className="font-semibold text-slate-800">{item.scenario || item.tactic || item.tip || item.trend}</p>
                )}
                <p className="text-xs text-slate-500">{item.template || item.howTo || item.why || item.howToUse || JSON.stringify(item)}</p>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(output).map(([key, val]: [string, any]) => (
        <div key={key}>
          <p className="text-xs font-semibold text-slate-400 capitalize">{key.replace(/_/g, " ")}</p>
          {Array.isArray(val) ? (
            <ul className="space-y-1">{val.map((v: any, i: number) => <li key={i} className="text-sm">• {typeof v === "string" ? v : JSON.stringify(v)}</li>)}</ul>
          ) : (
            <p className="whitespace-pre-wrap">{typeof val === "string" ? val : JSON.stringify(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
