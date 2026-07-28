"use client";

import { useState, useEffect } from "react";
import { Loader2, Bot, User, Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface Task {
  id: string;
  title: string;
  brief: string | null;
  department: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  assigned_role: string | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  team_members: { email: string; role: string } | null;
}

const TABS = [
  { key: "open", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Completed" },
];

const EMPTY_MESSAGES: Record<string, string> = {
  open: "Nothing pending — ask Hawlai for something in AI Employee.",
  in_progress: "Nothing in progress right now.",
  done: "Nothing completed yet — finished work will show up here.",
};

export default function TasksView() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "in_progress" | "done">("open");

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/owner-tasks")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load tasks");
        setTasks(d.tasks ?? []);
      })
      .catch((err) => setError(err.message ?? "Something went wrong loading your tasks"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading tasks...</div>;

  if (error) {
    return (
      <div className="card p-8 text-center space-y-3">
        <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
        <p className="text-sm text-slate-600">{error}</p>
        <button onClick={load} className="text-xs text-purple-600 flex items-center gap-1.5 mx-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }

  const filtered = (tasks ?? []).filter((t) => t.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${tab === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}
          >
            {t.label} ({(tasks ?? []).filter((x) => x.status === t.key).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">{EMPTY_MESSAGES[tab]}</div>
      )}

      <div className="space-y-2">
        {filtered.map((task) => (
          <div key={task.id} className="card p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              {task.team_members ? <User className="w-4 h-4 text-slate-500" /> : <Bot className="w-4 h-4 text-purple-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
              {task.brief && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.brief}</p>}
              <p className="text-xs text-slate-400 mt-1">
                {task.team_members ? `Assigned: ${task.team_members.email}` : "Handled by Hawlai"}
                {task.due_at && <> · <Clock className="w-3 h-3 inline" /> Due {new Date(task.due_at).toLocaleDateString()}</>}
              </p>
            </div>
            {task.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
