"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Copy, Check, Clock, Users, BarChart3, Info, Pencil, Save, X } from "lucide-react";
import { EMAIL_TASKS } from "@/lib/agents/emailMarketingAgent";
import { EditableOutput } from "@/components/shared/GeneratedOutputEditor";

export default function EmailMarketingTools() {
  const [selectedTask, setSelectedTask] = useState(EMAIL_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
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
    setOutputId(null);
    setEditing(false);
    try {
      const res = await fetch("/api/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask, topic }),
      });
      const data = await res.json();
      setOutput(data.output);
      setOutputId(data.id);
      fetch("/api/email/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    setDraft(JSON.parse(JSON.stringify(output)));
    setEditing(true);
  }

  async function saveEdits() {
    if (!outputId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/email/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: outputId, output: draft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setOutput(draft);
      setEditing(false);
      fetch("/api/email/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setSaving(false);
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
                <div key={k} className="bg-slate-200 rounded-lg p-2.5 text-center">
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

      {/* Analytics — real numbers where they're real, honest about the gap where they're not */}
      <EmailAnalyticsCard />

      {/* Content generator for the other 7 tasks */}
      <div className="card p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); setOutput(null); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-purple-400"
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
            <div className="flex items-center gap-3">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving || !outputId}
                    className="text-xs text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-2.5 py-1 rounded-md flex items-center gap-1"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                </>
              ) : (
                <>
                  {outputId && (
                    <button onClick={startEditing} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button onClick={copyOutput} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
                  </button>
                </>
              )}
            </div>
          </div>
          {editing ? <EditableOutput output={draft} onChange={setDraft} /> : <OutputRenderer output={output} />}
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => { setOutput(h.output); setOutputId(h.id); setEditing(false); }}
                className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5"
              >
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
      <div key={i} className="bg-slate-200 rounded-lg p-3">
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
        <div key={i} className="bg-slate-200 rounded-lg p-3">
          <p className="text-sm font-semibold text-slate-700">{s.heading}</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap mt-1">{s.body}</p>
        </div>
      ))}
    </div>;
  }
  if (output.tips) return <ul className="space-y-1.5">{output.tips.map((t: any, i: number) => (
    <li key={i} className="text-sm text-slate-700 bg-slate-200 rounded-lg p-2.5">
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

function EmailAnalyticsCard() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    fetch("/api/email/stats").then((r) => r.json()).then(setStats);
  }, []);

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Analytics (last 30 days)</p>
      {!stats ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : stats.totalSent === 0 ? (
        <p className="text-xs text-slate-400">No emails sent yet — numbers will show up here once you do.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-200 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-800">{stats.totalSent}</p>
              <p className="text-xs text-slate-400">Sent</p>
            </div>
            <div className="bg-slate-200 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-800">{stats.openRate !== null ? `${stats.openRate}%` : "—"}</p>
              <p className="text-xs text-slate-400">Open rate</p>
            </div>
            <div className="bg-slate-200 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-800">{stats.clickRate !== null ? `${stats.clickRate}%` : "—"}</p>
              <p className="text-xs text-slate-400">Click rate</p>
            </div>
          </div>
          {stats.gmailSentCount > 0 && (
            <div className="bg-slate-200 rounded-lg p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                {stats.gmailSentCount} of these were sent through your connected Gmail — open/click tracking only works for the {stats.resendSentCount} sent through Hawlai's own sender, since Gmail's API doesn't give a tracking webhook. Open/click rates above are based only on the Resend-sent ones.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
