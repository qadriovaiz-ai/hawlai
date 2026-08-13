"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Copy, Check, Clock, Users, BarChart3, Info, Pencil, Save, X } from "lucide-react";
import { EMAIL_TASKS } from "@/lib/agents/emailMarketingAgent";
import { EditableOutput } from "@/components/shared/GeneratedOutputEditor";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

export default function EmailMarketingTools() {
  const [selectedTask, setSelectedTask] = useState(EMAIL_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const [segments, setSegments] = useState<any>(null);
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/email/generate" });

  useEffect(() => {
    fetch("/api/email/segments").then((r) => r.json()).then(setSegments);
  }, []);

  const currentMeta = EMAIL_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      {/* Real segmentation from actual leads */}
      <Card className="space-y-3">
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
                <Badge key={k} tone="brand">{k.replace(/_/g, " ")}: {v}</Badge>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your leads...</p>
        )}
      </Card>

      {/* Analytics — real numbers where they're real, honest about the gap where they're not */}
      <EmailAnalyticsCard />

      {/* Content generator for the other 7 tasks */}
      <Card className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); reset(); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-brand-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, offer, or context (optional)"
          className="mt-2"
        />
        <Button onClick={() => generate({ taskType: selectedTask, topic })} loading={loading} className="mt-2">
          {!loading && <Sparkles className="w-4 h-4" />}
          Generate {currentMeta?.label}
        </Button>
      </Card>

      {output && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Result</p>
            <div className="flex items-center gap-3">
              {editing ? (
                <>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                  <Button size="sm" onClick={saveEdits} loading={saving} disabled={!outputId}>
                    {!saving && <Save className="w-3.5 h-3.5" />} Save
                  </Button>
                </>
              ) : (
                <>
                  {outputId && (
                    <button onClick={startEditing} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button onClick={copyOutput} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
                  </button>
                </>
              )}
            </div>
          </div>
          {editing ? <EditableOutput output={draft} onChange={setDraft} /> : <EmailOutputRenderer output={output} />}
        </Card>
      )}

      <GeneratedHistoryPanel
        items={history}
        onSelect={selectFromHistory}
        label={(h) => EMAIL_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
      />
    </div>
  );
}

// Email-specific output shapes (emails/sections/tips) aren't covered by
// the shared GeneratedOutputEditor's shape-sniffing — kept local rather
// than forced through the generic renderer, which would lose the
// "Step 1 / Subject / Body" structure for a flat key-value dump.
function EmailOutputRenderer({ output }: { output: any }) {
  if (output.emails) {
    return <div className="space-y-3">{output.emails.map((e: any, i: number) => (
      <div key={i} className="bg-slate-200 rounded-lg p-3">
        <p className="text-xs text-brand-500 font-semibold">Step {e.step}</p>
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
    <Card className="space-y-3">
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
    </Card>
  );
}
