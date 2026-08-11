"use client";

import { useState, useEffect } from "react";
import { Loader2, Bot, User, Clock, CheckCircle2, AlertCircle, RefreshCw, X, ListChecks } from "lucide-react";
import { titleCaseFromSnake, formatRelativeTime } from "@/lib/utils";

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
  const [actingId, setActingId] = useState<string | null>(null);

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

  async function handleAction(id: string, status: "done" | "cancelled") {
    setActingId(id);
    try {
      const res = await fetch(`/api/owner-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Couldn't update this task — try again");
      // Cheapest correct option: this task can move between any of the
      // three tabs (done/cancelled both leave "open" and "in_progress"),
      // so refetch rather than patch local state into the right bucket.
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading tasks...</div>;

  if (error) {
    return (
      <div className="card p-8 text-center space-y-3">
        <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
        <p className="text-sm text-slate-600">{error}</p>
        <button onClick={load} className="text-xs text-brand-600 flex items-center gap-1.5 mx-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }

  // Cancelled tasks have nowhere to live in a 3-tab (Pending/In Progress/
  // Completed) structure — grouping them with Completed ("no longer
  // active," same as done) rather than adding a 4th tab for what should
  // be a rare status, or silently dropping them from view entirely once
  // cancelled.
  const inTab = (t: Task) => t.status === tab || (tab === "done" && t.status === "cancelled");
  const filtered = (tasks ?? []).filter(inTab);
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${tab === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"}`}
          >
            {t.label} ({(tasks ?? []).filter((x) => x.status === t.key || (t.key === "done" && x.status === "cancelled")).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <ListChecks className="w-5 h-5 text-brand-400" />
          </div>
          <p className="text-sm text-slate-500">{EMPTY_MESSAGES[tab]}</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((task) => {
          const isCancelled = task.status === "cancelled";
          const overdue = task.due_at && !["done", "cancelled"].includes(task.status) && new Date(task.due_at).getTime() < now;
          const canAct = task.status === "open" || task.status === "in_progress";

          return (
            <div key={task.id} className={`card p-4 flex items-start gap-3 ${isCancelled ? "opacity-60" : ""}`}>
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                {task.team_members ? <User className="w-4 h-4 text-slate-500" /> : <Bot className="w-4 h-4 text-brand-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                  {task.department && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/80">
                      {titleCaseFromSnake(task.department)}
                    </span>
                  )}
                  {isCancelled && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-700/30">
                      Cancelled
                    </span>
                  )}
                </div>
                {task.brief && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.brief}</p>}
                <p className={`text-xs mt-1 ${overdue ? "text-amber-500 font-medium" : "text-slate-400"}`}>
                  {task.team_members ? `Assigned: ${task.team_members.email}` : "Handled by Hawlai"}
                  {task.due_at && (
                    <> · <Clock className="w-3 h-3 inline -mt-0.5" /> {overdue ? "Overdue — was due" : "Due"} {formatRelativeTime(task.due_at)}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {task.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {canAct && (
                  <>
                    <button
                      onClick={() => handleAction(task.id, "done")}
                      disabled={actingId === task.id}
                      title="Mark done"
                      className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors disabled:opacity-40"
                    >
                      {actingId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleAction(task.id, "cancelled")}
                      disabled={actingId === task.id}
                      title="Cancel"
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
