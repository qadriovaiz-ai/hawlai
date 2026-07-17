"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Zap, X } from "lucide-react";
import { EMAIL_TASKS } from "@/lib/agents/emailMarketingAgent";

const TRIGGERS = [
  { key: "new_lead", label: "New Lead Created" },
  { key: "appointment_booked", label: "Appointment Booked" },
];

interface StepDraft {
  delayDays: number;
  emailTaskType: string;
  customSubject: string;
  customBody: string;
}

export default function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState(TRIGGERS[0].key);
  const [steps, setSteps] = useState<StepDraft[]>([{ delayDays: 0, emailTaskType: "welcome_email", customSubject: "", customBody: "" }]);
  const [saving, setSaving] = useState(false);

  function loadWorkflows() {
    fetch("/api/automation/workflows").then((r) => r.json()).then((d) => setWorkflows(d.workflows ?? [])).finally(() => setLoading(false));
  }
  useEffect(loadWorkflows, []);

  function addStep() {
    setSteps([...steps, { delayDays: steps.length === 0 ? 0 : 3, emailTaskType: "follow_up", customSubject: "", customBody: "" }]);
  }
  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }
  function updateStep(i: number, field: keyof StepDraft, value: any) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  async function handleCreate() {
    if (!name || steps.length === 0) return;
    setSaving(true);
    try {
      await fetch("/api/automation/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, triggerType, steps }),
      });
      setName("");
      setSteps([{ delayDays: 0, emailTaskType: "welcome_email", customSubject: "", customBody: "" }]);
      setShowBuilder(false);
      loadWorkflows();
    } finally {
      setSaving(false);
    }
  }

  async function toggleWorkflow(id: string, enabled: boolean) {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, enabled } : w)));
    await fetch(`/api/automation/workflows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function deleteWorkflow(id: string) {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/automation/workflows/${id}`, { method: "DELETE" });
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Workflow Builder</p>
        <button onClick={() => setShowBuilder(!showBuilder)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
          {showBuilder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showBuilder ? "Cancel" : "New Workflow"}
        </button>
      </div>

      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 text-xs text-amber-800">
        Runs once daily. Only Email steps send automatically here — WhatsApp still needs a tap-to-send (see WhatsApp Marketing), and SMS isn't connected. Enabling a workflow is your approval for every email it sends.
      </div>

      {showBuilder && (
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name, e.g. New Lead Nurture" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />

          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Trigger</p>
            <div className="flex gap-1.5">
              {TRIGGERS.map((t) => (
                <button key={t.key} onClick={() => setTriggerType(t.key)} className={`text-xs px-2.5 py-1.5 rounded-lg border ${triggerType === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400">Steps (in order)</p>
            {steps.map((step, i) => (
              <div key={i} className="bg-slate-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-500">Step {i + 1} — send after</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} value={step.delayDays} onChange={(e) => updateStep(i, "delayDays", Number(e.target.value))} className="w-14 text-xs bg-white border border-slate-200 rounded px-1.5 py-1 text-center" />
                    <span className="text-xs text-slate-500">days</span>
                    {steps.length > 1 && <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-500 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                <select value={step.emailTaskType} onChange={(e) => updateStep(i, "emailTaskType", e.target.value)} className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                  {EMAIL_TASKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  <option value="custom">Custom message</option>
                </select>
                {step.emailTaskType === "custom" && (
                  <>
                    <input value={step.customSubject} onChange={(e) => updateStep(i, "customSubject", e.target.value)} placeholder="Subject" className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5" />
                    <textarea value={step.customBody} onChange={(e) => updateStep(i, "customBody", e.target.value)} placeholder="Email body" rows={3} className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5" />
                  </>
                )}
              </div>
            ))}
            <button onClick={addStep} className="text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add another step</button>
          </div>

          <button onClick={handleCreate} disabled={saving || !name} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Create Workflow
          </button>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading workflows...</p>
        ) : workflows.length === 0 ? (
          <p className="text-xs text-slate-400">No workflows yet — create one above.</p>
        ) : (
          workflows.map((w) => (
            <div key={w.id} className="flex items-center justify-between bg-slate-100 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-slate-700">{w.name}</p>
                <p className="text-xs text-slate-400">{TRIGGERS.find((t) => t.key === w.trigger_type)?.label} · {(w.workflow_steps ?? []).length} step(s) · {w.sentCount} sent</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={w.enabled} onChange={(e) => toggleWorkflow(w.id, e.target.checked)} className="w-5 h-5 accent-purple-600" />
                <button onClick={() => deleteWorkflow(w.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
