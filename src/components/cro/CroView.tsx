"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle, CheckCircle2, TrendingUp, FlaskConical, Sparkles } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";
import type { BadgeTone } from "@/components/ui";

const CRO_TASKS = [
  { key: "landing_page", label: "Landing Page Copy" },
  { key: "cta", label: "CTA Suggestions" },
  { key: "form", label: "Form Optimization" },
  { key: "ux", label: "UX Suggestions" },
];

// Was a hardcoded solid light-mode map (bg-red-100 text-red-600) — the
// exact "two design languages coexisting" example the design audit
// flagged, sitting one field away from this same file's Badge-eligible
// impact pill on a page reachable one click from SEO's own (correctly
// dark-theme-translucent) version of the identical concept.
const IMPACT_TONE: Record<string, BadgeTone> = { high: "negative", medium: "warning", low: "neutral" };

export default function CroView() {
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(true);

  const [taskKey, setTaskKey] = useState("landing_page");
  const {
    loading: taskLoading, output: taskOutput, outputId: taskOutputId, editing: taskEditing, draft: taskDraft,
    saving: taskSaving, copied: taskCopied, history: taskHistory,
    generate: runTask, startEditing: startEditingTask, cancelEditing: cancelEditingTask, saveEdits: saveTaskEdits,
    copyOutput: copyTaskOutput, selectFromHistory: selectTaskFromHistory, reset: resetTask, setDraft: setTaskDraft,
  } = useGeneratedOutput({ endpoint: "/api/cro/generate" });
  const [taskError, setTaskError] = useState<string | null>(null);

  const [abTest, setAbTest] = useState<any>(null);
  const [abResults, setAbResults] = useState<any>(null);
  const [abLoading, setAbLoading] = useState(true);
  const [abForm, setAbForm] = useState({ element: "headline", variantA: "", variantB: "" });
  const [abSaving, setAbSaving] = useState(false);
  const [applyingWinner, setApplyingWinner] = useState<"A" | "B" | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  function loadReport() {
    setReportLoading(true);
    fetch("/api/cro").then((r) => r.json()).then(setReport).finally(() => setReportLoading(false));
  }
  function loadAbTest() {
    setAbLoading(true);
    fetch("/api/cro/ab-test").then((r) => r.json()).then((d) => { setAbTest(d.test); setAbResults(d.results); }).finally(() => setAbLoading(false));
  }
  useEffect(() => { loadReport(); loadAbTest(); }, []);

  async function handleRunTask() {
    setTaskError(null);
    try {
      await runTask({ taskType: taskKey });
    } catch (err: any) {
      setTaskError(err.message ?? "Something went wrong");
    }
  }

  async function startAbTest() {
    if (!abForm.variantA.trim() || !abForm.variantB.trim()) return;
    setAbSaving(true);
    try {
      await fetch("/api/cro/ab-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(abForm) });
      loadAbTest();
    } finally {
      setAbSaving(false);
    }
  }

  async function toggleAbTest(active: boolean) {
    setAbTest((prev: any) => ({ ...prev, active }));
    await fetch("/api/cro/ab-test", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
  }

  // Master audit Part B3 — the step that actually closes the loop:
  // writes the winning variant into the live landing page and ends
  // the test, instead of leaving the result as something to act on
  // manually elsewhere.
  async function applyWinner(variant: "A" | "B") {
    setApplyingWinner(variant);
    setAppliedMessage(null);
    try {
      const res = await fetch("/api/cro/ab-test", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ winner: variant }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to apply winner");
      setAppliedMessage(`Variant ${variant} is now live as your ${abTest.element === "headline" ? "headline" : "CTA"}.`);
      loadAbTest();
    } finally {
      setApplyingWinner(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Audit report */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-slate-400" /> Page Health Check</p>
        {reportLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {report?.conversionRate != null ? <>Roughly <span className="font-semibold text-slate-900">{report.conversionRate}</span> leads per launched campaign.</> : "Not enough campaign data yet to estimate a conversion rate."}
            </p>
            <div className="space-y-2">
              {(report?.suggestions ?? []).map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">{s.issue}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.fix}</p>
                  </div>
                  <Badge tone={IMPACT_TONE[s.impact] ?? "neutral"} className="shrink-0">{s.impact}</Badge>
                </div>
              ))}
              {report && (report.suggestions ?? []).length === 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" /> No issues found — page basics look good.</div>
              )}
            </div>
          </>
        )}
      </Card>

      {/* AI suggestions by task */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Sparkles className="w-4 h-4 text-slate-400" /> AI Suggestions</p>
        <div className="flex flex-wrap gap-1.5">
          {CRO_TASKS.map((t) => (
            <button key={t.key} onClick={() => { setTaskKey(t.key); resetTask(); }} className={`text-xs px-3 py-1.5 rounded-lg border ${taskKey === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Button onClick={handleRunTask} loading={taskLoading}>
          {!taskLoading && <Sparkles className="w-4 h-4" />} Generate Suggestions
        </Button>

        {taskError && <p className="text-xs text-red-400">{taskError}</p>}
      </Card>

      <GeneratedOutputPanel
        title="AI Suggestions Result"
        output={taskOutput}
        editing={taskEditing}
        draft={taskDraft}
        saving={taskSaving}
        copied={taskCopied}
        outputId={taskOutputId}
        onStartEditing={startEditingTask}
        onCancelEditing={cancelEditingTask}
        onSaveEdits={saveTaskEdits}
        onCopy={copyTaskOutput}
        onDraftChange={setTaskDraft}
      />

      <GeneratedHistoryPanel
        items={taskHistory}
        onSelect={selectTaskFromHistory}
        label={(h) => CRO_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
        title="Recent Suggestions"
      />

      {/* A/B testing */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-slate-400" /> A/B Testing (Live)</p>

        {abLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : abTest ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Testing: <span className="font-medium text-slate-700 capitalize">{abTest.element}</span></p>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={abTest.active} onChange={(e) => toggleAbTest(e.target.checked)} className="w-4 h-4 accent-brand-600" /> Active
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(["A", "B"] as const).map((v) => (
                <div key={v} className="p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Variant {v}</p>
                  <p className="text-sm text-slate-700 mb-2">{v === "A" ? abTest.variant_a : abTest.variant_b}</p>
                  <p className="text-xs text-slate-500">{abResults?.[v]?.views ?? 0} views · {abResults?.[v]?.submits ?? 0} leads</p>
                  <p className="text-sm font-bold text-brand-600 mb-2">{abResults?.[v]?.conversionRate != null ? `${abResults[v].conversionRate.toFixed(1)}%` : "—"}</p>
                  <Button
                    onClick={() => applyWinner(v)}
                    loading={applyingWinner === v}
                    disabled={!abResults?.[v]?.views}
                    size="sm"
                    variant="secondary"
                  >
                    Apply as winner
                  </Button>
                </div>
              ))}
            </div>
            {appliedMessage && <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" /> {appliedMessage}</div>}
            <p className="text-xs text-slate-400">Visitors are randomly assigned a variant on your live landing page. Results update automatically as traffic comes in. Applying a winner writes it in as the permanent {abTest.element === "headline" ? "headline" : "CTA"} and ends the test.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">No active test. Compare two versions of your headline or CTA on real visitors.</p>
            <Select value={abForm.element} onChange={(e) => setAbForm({ ...abForm, element: e.target.value })}>
              <option value="headline">Headline</option>
              <option value="cta">Call-to-Action</option>
            </Select>
            <Input value={abForm.variantA} onChange={(e) => setAbForm({ ...abForm, variantA: e.target.value })} placeholder="Variant A text" />
            <Input value={abForm.variantB} onChange={(e) => setAbForm({ ...abForm, variantB: e.target.value })} placeholder="Variant B text" />
            <Button onClick={startAbTest} loading={abSaving}>
              {abSaving ? "Starting..." : "Start Test"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
