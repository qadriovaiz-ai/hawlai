"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, Save, X, Brain } from "lucide-react";
import { Button, Card, EmptyState, Select, Textarea } from "@/components/ui";

const CATEGORY_LABELS: Record<string, string> = {
  campaign_performance: "Campaign Performance",
  audience_insight: "Audience Insight",
  content_preference: "Content Preference",
  timing: "Timing",
  general: "General",
};

export default function BusinessMemoryView() {
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newInsight, setNewInsight] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function load() {
    fetch("/api/business-memory").then((r) => r.json()).then((d) => setMemories(d.memories ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function addMemory() {
    if (!newInsight.trim()) return;
    await fetch("/api/business-memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ insight: newInsight, category: newCategory }) });
    setNewInsight(""); setShowForm(false);
    load();
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    try {
      await fetch("/api/business-memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, insight: editText }) });
      setEditingId(null);
      load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await fetch("/api/business-memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const byCategory: Record<string, any[]> = memories.reduce((acc: Record<string, any[]>, m: any) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-5">
      <div className="card p-4 flex items-start gap-3">
        <Brain className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          These are durable things Master Chat has learned about your business — real patterns, not routine facts. It uses these automatically in every conversation, without you needing to repeat context. Wrong or outdated? Edit or remove it below.
        </p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Add something to remember</p>
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-3.5 h-3.5" /> Add</Button>
        </div>
        {showForm && (
          <div className="space-y-2 bg-slate-200 rounded-lg p-3">
            <Textarea
              value={newInsight}
              onChange={(e) => setNewInsight(e.target.value)}
              placeholder="e.g. Our Diwali campaign got 3x the leads of a regular promo"
              rows={2}
            />
            <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-auto">
              {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Button onClick={addMemory}>Save</Button>
          </div>
        )}
      </Card>

      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : memories.length === 0 ? (
        <Card padding="none">
          <EmptyState title="Nothing remembered yet" description="This fills up as Master Chat notices real patterns, or you add one above." />
        </Card>
      ) : (
        Object.entries(byCategory).map(([category, items]: [string, any[]]) => (
          <Card key={category} className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{CATEGORY_LABELS[category] ?? category}</p>
            {items.map((m) => (
              <div key={m.id} className="bg-slate-200 rounded-lg p-3">
                {editingId === m.id ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => saveEdit(m.id)} loading={savingEdit}>{!savingEdit && <Save className="w-3 h-3" />} Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-3 h-3" /> Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-700 flex-1">{m.insight}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setEditingId(m.id); setEditText(m.insight); }} className="text-slate-400 hover:text-brand-500"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(m.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}
