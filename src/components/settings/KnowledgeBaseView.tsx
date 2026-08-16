"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, Save, X, BookOpen } from "lucide-react";
import { Button, Card, EmptyState, Input, Select, Textarea } from "@/components/ui";

const CATEGORY_LABELS: Record<string, string> = {
  hours: "Hours",
  pricing_note: "Pricing Note",
  policy: "Policy",
  faq: "FAQ",
  general: "General",
};

export default function KnowledgeBaseView() {
  const [facts, setFacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("faq");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function load() {
    fetch("/api/business-knowledge").then((r) => r.json()).then((d) => setFacts(d.facts ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function addFact() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/business-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, content: newContent, category: newCategory }),
      });
      setNewTitle(""); setNewContent(""); setNewCategory("faq"); setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    try {
      await fetch("/api/business-knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: editTitle, content: editContent }),
      });
      setEditingId(null);
      load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(fact: any) {
    setFacts((prev) => prev.map((f) => (f.id === fact.id ? { ...f, is_active: !f.is_active } : f)));
    await fetch("/api/business-knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fact.id, is_active: !fact.is_active }),
    });
  }

  async function remove(id: string) {
    setFacts((prev) => prev.filter((f) => f.id !== id));
    await fetch("/api/business-knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const byCategory: Record<string, any[]> = facts.reduce((acc: Record<string, any[]>, f: any) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-5">
      <div className="card p-4 flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Real facts about your business — hours, pricing notes, policies, FAQs. The AI uses only what's active here
          when it answers questions on a call; anything not listed, it says a team member will follow up on rather
          than guessing.
        </p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Add a fact</p>
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-3.5 h-3.5" /> Add</Button>
        </div>
        {showForm && (
          <div className="space-y-2 bg-slate-200 rounded-lg p-3">
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title — e.g. Weekend hours" />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="The actual fact, in plain language — e.g. We're open 10am–8pm Saturday and Sunday, closed Mondays"
              rows={2}
            />
            <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-auto">
              {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Button onClick={addFact} loading={saving}>Save</Button>
          </div>
        )}
      </Card>

      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : facts.length === 0 ? (
        <Card padding="none">
          <EmptyState title="No facts added yet" description="Add hours, pricing notes, policies, or FAQs above so the AI can answer with real information on calls." />
        </Card>
      ) : (
        Object.entries(byCategory).map(([category, items]: [string, any[]]) => (
          <Card key={category} className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{CATEGORY_LABELS[category] ?? category}</p>
            {items.map((f) => (
              <div key={f.id} className={`bg-slate-200 rounded-lg p-3 ${!f.is_active ? "opacity-50" : ""}`}>
                {editingId === f.id ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={2} />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => saveEdit(f.id)} loading={savingEdit}>{!savingEdit && <Save className="w-3 h-3" />} Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-3 h-3" /> Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{f.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{f.content}</p>
                      {!f.is_active && <p className="text-[10px] text-amber-500 mt-1">Off — not used on calls</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleActive(f)}
                        title={f.is_active ? "Turn off" : "Turn on"}
                        className={`w-8 h-5 rounded-full transition-colors relative ${f.is_active ? "bg-brand-600" : "bg-slate-400"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-slate-100 rounded-full shadow-sm transition-transform ${f.is_active ? "translate-x-3.5" : "translate-x-0.5"}`} />
                      </button>
                      <button onClick={() => { setEditingId(f.id); setEditTitle(f.title); setEditContent(f.content); }} className="text-slate-400 hover:text-brand-500"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(f.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
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
