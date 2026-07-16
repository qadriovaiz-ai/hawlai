"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Copy, Check, Clock, Users, BarChart3, Info } from "lucide-react";
import { EMAIL_TASKS } from "@/lib/agents/emailMarketingAgent";

export default function EmailMarketingTools() {
  const [selectedTask, setSelectedTask] = useState(EMAIL_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [segments, setSegments] = useState<any>(null);

  useEffect(() => {
    fetch("/api/email/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    fetch("/api/email/segments").then((r) => r.json()).then(setSegments);
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask, topic }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/email/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2).replace(/[{}"\[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const currentMeta = EMAIL_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      {/* Real segmentation from actual leads */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4" /> Segmentation</p>
        {segments ? (
          <>
            <p className="text-xs text-slate-400">{segments.emailableLeads} of {segments.totalLeads} leads have an email address on file.</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(segments.byTemperature ?? {}).map(([k, v]: [string, any]) => (
                <div key={k} className="bg-slate-100 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold text-slate-800">{v}</p>
                  <p className="text-xs text-slate-400 capitalize">{k}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(segments.byStatus ?? {}).map(([k, v]: [string, any]) => (
                <span key={k} className="text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded-full">{k.replace(/_/g, " ")}: {v}</span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your leads...</p>
        )}
      </div>

      {/* Analytics — honest guidance, not fake numbers */}
      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Analytics</p>
        <div className="bg-slate-100 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Hawlai sends email through your own Gmail with send-only access — there's no open/click tracking yet, so real open rates or click rates aren't available here. To track opens and clicks, a dedicated email service (with tracking pixels/link wrapping) would need to be connected. For now, replies and lead status changes in your Leads page are the most reliable signal that an email worked.
          </p>
        </div>
      </div>

      {/* Content generator for the other 7 tasks */}
      <div className="card p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TASKS.map((t) => (
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
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, offer, or context (optional)"
          className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400 mt-2"
        />
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 mt-2">
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
                <span className="font-medium text-slate-700">{EMAIL_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  if (output.emails) {
    return <div className="space-y-3">{output.emails.map((e: any, i: number) => (
      <div key={i} className="bg-slate-100 rounded-lg p-3">
        <p className="text-xs text-purple-500 font-semibold">Step {e.step}</p>
        <p className="text-sm font-semibold text-slate-800">{e.subject}</p>
        <p className="text-xs text-slate-600 whitespace-pre-wrap mt-1">{e.body}</p>
      </div>
    ))}</div>;
  }
  if (output.sections) {
    return <div className="space-y-2">
      {output.subject && <p className="text-sm font-semibold text-slate-800">Subject: {output.subject}</p>}
      {output.sections.map((s: any, i: number) => (
        <div key={i} className="bg-slate-100 rounded-lg p-3">
          <p className="text-sm font-semibold text-slate-700">{s.heading}</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap mt-1">{s.body}</p>
        </div>
      ))}
    </div>;
  }
  if (output.tips) return <ul className="space-y-1.5">{output.tips.map((t: any, i: number) => (
    <li key={i} className="text-sm text-slate-700 bg-slate-100 rounded-lg p-2.5">
      <span className="font-semibold">{t.tactic}</span>
      <p className="text-xs text-slate-500">{t.howTo}</p>
    </li>
  ))}</ul>;
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {output.subject && <p className="font-semibold text-slate-800">Subject: {output.subject}</p>}
      {output.previewText && <p className="text-xs text-slate-400">Preview: {output.previewText}</p>}
      {output.body && <p className="whitespace-pre-wrap">{output.body}</p>}
      {!output.subject && !output.body && Object.entries(output).map(([key, val]: [string, any]) => (
        <p key={key} className="whitespace-pre-wrap">{typeof val === "string" ? val : JSON.stringify(val)}</p>
      ))}
    </div>
  );
}
