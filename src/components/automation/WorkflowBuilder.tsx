"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Zap, X } from "lucide-react";
import { EMAIL_TASKS } from "@/lib/agents/emailMarketingAgent";
import { Button, Card, EmptyState, Input, Select, Textarea } from "@/components/ui";

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
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Workflow Builder</p>
        <Button size="sm" onClick={() => setShowBuilder(!showBuilder)}>
          {showBuilder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showBuilder ? "Cancel" : "New Workflow"}
        </Button>
      </div>

      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 text-xs text-amber-800">
        Runs once daily. Only Email steps send automatically here — WhatsApp still needs a tap-to-send (see WhatsApp Marketing), and SMS isn't connected. Enabling a workflow is your approval for every email it sends.
      </div>

      {showBuilder && (
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name, e.g. New Lead Nurture" />

          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Trigger</p>
            <div className="flex gap-1.5">
              {TRIGGERS.map((t) => (
                <button key={t.key} onClick={() => setTriggerType(t.key)} className={`text-xs px-2.5 py-1.5 rounded-lg border ${triggerType === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400">Steps (in order)</p>
            {steps.map((step, i) => (
              <div key={i} className="bg-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-500">Step {i + 1} — send after</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} value={step.delayDays} onChange={(e) => updateStep(i, "delayDays", Number(e.target.value))} className="w-14 text-xs bg-slate-200 border border-slate-300 rounded px-1.5 py-1 text-center" />
                    <span className="text-xs text-slate-500">days</span>
                    {steps.length > 1 && <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-500 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                <Select value={step.emailTaskType} onChange={(e) => updateStep(i, "emailTaskType", e.target.value)} className="text-xs">
                  {EMAIL_TASKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  <option value="custom">Custom message</option>
                </Select>
                {step.emailTaskType === "custom" && (
                  <>
                    <Input value={step.customSubject} onChange={(e) => updateStep(i, "customSubject", e.target.value)} placeholder="Subject" className="text-xs" />
                    <Textarea value={step.customBody} onChange={(e) => updateStep(i, "customBody", e.target.value)} placeholder="Email body" rows={3} className="text-xs" />
                  </>
                )}
              </div>
            ))}
            <button onClick={addStep} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add another step</button>
          </div>

          <Button onClick={handleCreate} loading={saving} disabled={!name}>
            {!saving && <Zap className="w-4 h-4" />} Create Workflow
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading workflows...</p>
        ) : workflows.length === 0 ? (
          <EmptyState title="No workflows yet" description="Create one above." />
        ) : (
          workflows.map((w) => (
            <div key={w.id} className="flex items-center justify-between bg-slate-200 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-slate-700">{w.name}</p>
                <p className="text-xs text-slate-400">{TRIGGERS.find((t) => t.key === w.trigger_type)?.label} · {(w.workflow_steps ?? []).length} step(s) · {w.sentCount} sent</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={w.enabled} onChange={(e) => toggleWorkflow(w.id, e.target.checked)} className="w-5 h-5 accent-brand-600" />
                <button onClick={() => deleteWorkflow(w.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
