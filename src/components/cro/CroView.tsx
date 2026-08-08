"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle, CheckCircle2, TrendingUp, FlaskConical, Sparkles, Pencil, Save, X } from "lucide-react";
import { OutputRenderer, EditableOutput } from "@/components/shared/GeneratedOutputEditor";

const CRO_TASKS = [
  { key: "landing_page", label: "Landing Page Copy" },
  { key: "cta", label: "CTA Suggestions" },
  { key: "form", label: "Form Optimization" },
  { key: "ux", label: "UX Suggestions" },
];

const IMPACT_COLOR: Record<string, string> = { high: "bg-red-100 text-red-600", medium: "bg-amber-100 text-amber-600", low: "bg-slate-100 text-slate-500" };

export default function CroView() {
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(true);

  const [taskKey, setTaskKey] = useState("landing_page");
  const [taskOutput, setTaskOutput] = useState<any>(null);
  const [taskOutputId, setTaskOutputId] = useState<string | null>(null);
  const [taskEditing, setTaskEditing] = useState(false);
  const [taskDraft, setTaskDraft] = useState<any>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [abTest, setAbTest] = useState<any>(null);
  const [abResults, setAbResults] = useState<any>(null);
  const [abLoading, setAbLoading] = useState(true);
  const [abForm, setAbForm] = useState({ element: "headline", variantA: "", variantB: "" });
  const [abSaving, setAbSaving] = useState(false);

  function loadReport() {
    setReportLoading(true);
    fetch("/api/cro").then((r) => r.json()).then(setReport).finally(() => setReportLoading(false));
  }
  function loadAbTest() {
    setAbLoading(true);
    fetch("/api/cro/ab-test").then((r) => r.json()).then((d) => { setAbTest(d.test); setAbResults(d.results); }).finally(() => setAbLoading(false));
  }
  useEffect(() => { loadReport(); loadAbTest(); }, []);

  async function runTask() {
    setTaskLoading(true);
    setTaskError(null);
    setTaskOutput(null);
    setTaskOutputId(null);
    setTaskEditing(false);
    try {
      const res = await fetch("/api/cro/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskType: taskKey }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setTaskOutput(data.output);
      setTaskOutputId(data.id);
    } catch (err: any) {
      setTaskError(err.message);
    } finally {
      setTaskLoading(false);
    }
  }

  function startEditingTask() {
    setTaskDraft(JSON.parse(JSON.stringify(taskOutput)));
    setTaskEditing(true);
  }

  async function saveTaskEdits() {
    if (!taskOutputId) return;
    setTaskSaving(true);
    try {
      const res = await fetch("/api/cro/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskOutputId, output: taskDraft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setTaskOutput(taskDraft);
      setTaskEditing(false);
    } finally {
      setTaskSaving(false);
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

  return (
    <div className="space-y-5">
      {/* Audit report */}
      <div className="card p-5 space-y-3">
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
                  <span className={`text-[10px] px-2 py-1 rounded-full shrink-0 ${IMPACT_COLOR[s.impact] ?? IMPACT_COLOR.low}`}>{s.impact}</span>
                </div>
              ))}
              {report && (report.suggestions ?? []).length === 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" /> No issues found — page basics look good.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* AI suggestions by task */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Sparkles className="w-4 h-4 text-slate-400" /> AI Suggestions</p>
          {taskOutput && (
            taskEditing ? (
              <div className="flex items-center gap-3">
                <button onClick={() => setTaskEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  onClick={saveTaskEdits}
                  disabled={taskSaving || !taskOutputId}
                  className="text-xs text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-2.5 py-1 rounded-md flex items-center gap-1"
                >
                  {taskSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                </button>
              </div>
            ) : (
              taskOutputId && (
                <button onClick={startEditingTask} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )
            )
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CRO_TASKS.map((t) => (
            <button key={t.key} onClick={() => { setTaskKey(t.key); setTaskOutput(null); }} className={`text-xs px-3 py-1.5 rounded-lg border ${taskKey === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={runTask} disabled={taskLoading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {taskLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate Suggestions
        </button>

        {taskError && <p className="text-xs text-red-400">{taskError}</p>}

        {taskOutput && (taskEditing ? <EditableOutput output={taskDraft} onChange={setTaskDraft} /> : <OutputRenderer output={taskOutput} />)}
      </div>

      {/* A/B testing */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-slate-400" /> A/B Testing (Live)</p>

        {abLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : abTest ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Testing: <span className="font-medium text-slate-700 capitalize">{abTest.element}</span></p>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={abTest.active} onChange={(e) => toggleAbTest(e.target.checked)} className="w-4 h-4 accent-purple-600" /> Active
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(["A", "B"] as const).map((v) => (
                <div key={v} className="p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Variant {v}</p>
                  <p className="text-sm text-slate-700 mb-2">{v === "A" ? abTest.variant_a : abTest.variant_b}</p>
                  <p className="text-xs text-slate-500">{abResults?.[v]?.views ?? 0} views · {abResults?.[v]?.submits ?? 0} leads</p>
                  <p className="text-sm font-bold text-purple-600">{abResults?.[v]?.conversionRate != null ? `${abResults[v].conversionRate.toFixed(1)}%` : "—"}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">Visitors are randomly assigned a variant on your live landing page. Results update automatically as traffic comes in.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">No active test. Compare two versions of your headline or CTA on real visitors.</p>
            <select value={abForm.element} onChange={(e) => setAbForm({ ...abForm, element: e.target.value })} className="text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 w-full">
              <option value="headline">Headline</option>
              <option value="cta">Call-to-Action</option>
            </select>
            <input value={abForm.variantA} onChange={(e) => setAbForm({ ...abForm, variantA: e.target.value })} placeholder="Variant A text" className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2" />
            <input value={abForm.variantB} onChange={(e) => setAbForm({ ...abForm, variantB: e.target.value })} placeholder="Variant B text" className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2" />
            <button onClick={startAbTest} disabled={abSaving} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">
              {abSaving ? "Starting..." : "Start Test"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
