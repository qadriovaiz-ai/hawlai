"use client";

import { useState, useEffect } from "react";
import { StickyNote, CheckSquare, Plus, Loader2, IndianRupee, Check } from "lucide-react";

export default function LeadCrmPanel({ leadId, initialDealValue }: { leadId: string; initialDealValue: number | null }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [newTask, setNewTask] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [dealValue, setDealValue] = useState(initialDealValue?.toString() ?? "");
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealSaved, setDealSaved] = useState(false);

  // Notes/tasks don't have GET routes yet — fetched via a lightweight
  // combined call instead, since this panel needs both together.
  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/crm-data`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? []);
        setTasks(data.tasks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      });
      setNewNote("");
      loadAll();
    } finally {
      setSavingNote(false);
    }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    setSavingTask(true);
    try {
      await fetch(`/api/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTask }),
      });
      setNewTask("");
      loadAll();
    } finally {
      setSavingTask(false);
    }
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    const nextStatus = currentStatus === "completed" ? "pending" : "completed";
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function saveDealValue() {
    setSavingDeal(true);
    setDealSaved(false);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_value: dealValue ? Number(dealValue) : null }),
      });
      setDealSaved(true);
      setTimeout(() => setDealSaved(false), 2000);
    } finally {
      setSavingDeal(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-100 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <IndianRupee className="w-4 h-4 text-green-600" /> Deal Value
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
            placeholder="e.g. 850000"
            className="flex-1 p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={saveDealValue} disabled={savingDeal} className="btn-secondary text-xs">
            {savingDeal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : dealSaved ? <Check className="w-3.5 h-3.5" /> : "Save"}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">Set this once the sale closes — used to calculate real ROAS.</p>
      </div>

      <div className="bg-slate-100 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <CheckSquare className="w-4 h-4 text-purple-600" /> Tasks
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="e.g. Call back tomorrow"
            className="flex-1 p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={addTask} disabled={savingTask} className="btn-secondary text-xs">
            {savingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-300 mx-auto" />
        ) : tasks.length === 0 ? (
          <p className="text-xs text-slate-400">No tasks yet</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <label key={task.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={task.status === "completed"}
                  onChange={() => toggleTask(task.id, task.status)}
                  className="rounded border-slate-300"
                />
                <span className={task.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}>
                  {task.title}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-100 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <StickyNote className="w-4 h-4 text-amber-600" /> Notes
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="Add a note..."
            className="flex-1 p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={addNote} disabled={savingNote} className="btn-secondary text-xs">
            {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-300 mx-auto" />
        ) : notes.length === 0 ? (
          <p className="text-xs text-slate-400">No notes yet</p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2.5">
                {note.note}
                <p className="text-[10px] text-slate-400 mt-1">{new Date(note.created_at).toLocaleDateString("en-IN")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
