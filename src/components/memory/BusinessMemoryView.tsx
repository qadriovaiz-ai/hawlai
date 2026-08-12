"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, Save, X, Brain } from "lucide-react";

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
    await fetch("/api/business-memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, insight: editText }) });
    setEditingId(null);
    load();
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
        <Brain className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          These are durable things Master Chat has learned about your business — real patterns, not routine facts. It uses these automatically in every conversation, without you needing to repeat context. Wrong or outdated? Edit or remove it below.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Add something to remember</p>
          <button onClick={() => setShowForm(!showForm)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        {showForm && (
          <div className="space-y-2 bg-slate-200 rounded-lg p-3">
            <textarea
              value={newInsight}
              onChange={(e) => setNewInsight(e.target.value)}
              placeholder="e.g. Our Diwali campaign got 3x the leads of a regular promo"
              rows={2}
              className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2"
            />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="text-sm bg-slate-100 border border-slate-200 rounded-lg px-2 py-2">
              {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button onClick={addMemory} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg">Save</button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : memories.length === 0 ? (
        <div className="card p-5">
          <p className="text-sm text-slate-400">Nothing remembered yet — this fills up as Master Chat notices real patterns, or you add one above.</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([category, items]: [string, any[]]) => (
          <div key={category} className="card p-5 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{CATEGORY_LABELS[category] ?? category}</p>
            {items.map((m) => (
              <div key={m.id} className="bg-slate-200 rounded-lg p-3">
                {editingId === m.id ? (
                  <div className="space-y-2">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveEdit(m.id)} className="text-xs bg-purple-600 text-white px-2.5 py-1 rounded-md flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-700 flex-1">{m.insight}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setEditingId(m.id); setEditText(m.insight); }} className="text-slate-400 hover:text-purple-500"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(m.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
