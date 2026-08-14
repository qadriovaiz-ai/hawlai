"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, Clock, Sparkles } from "lucide-react";
import ManagerWorkspace from "@/components/team/ManagerWorkspace";
import SalesLeadsView from "@/components/team/SalesLeadsView";
import { Button } from "@/components/ui/Button";

interface Task {
  id: string;
  title: string;
  brief: string | null;
  department: string | null;
  context: Record<string, any>;
  status: "open" | "in_progress" | "done";
  due_at: string | null;
  created_at: string;
}

const ROLE_GREETING: Record<string, string> = {
  designer: "Your design tasks",
  content_writer: "Your writing tasks",
  sales: "Your assigned leads",
  marketing_manager: "Your tasks",
  admin: "Your tasks",
  viewer: "Your tasks",
};

export default function TeamTasksPage() {
  const [role, setRole] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/team/my-tasks")
      .then((r) => r.json())
      .then((d) => { setRole(d.role ?? ""); setTasks(d.tasks ?? []); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: "in_progress" | "done") {
    setUpdating(id);
    await fetch(`/api/team/my-tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
    setUpdating(null);
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" /> Loading your tasks...</div>;

  if (["admin", "marketing_manager"].includes(role)) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-bold text-slate-900">{ROLE_GREETING[role] ?? "Your tasks"}</h1>
        <ManagerWorkspace />
      </div>
    );
  }

  if (role === "sales") {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-bold text-slate-900">{ROLE_GREETING[role] ?? "Your leads"}</h1>
        <SalesLeadsView />
      </div>
    );
  }

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").slice(0, 5);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">{ROLE_GREETING[role] ?? "Your tasks"}</h1>

      {open.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">
          Nothing assigned right now — you're all caught up.
        </div>
      )}

      <div className="space-y-3">
        {open.map((task) => (
          <div key={task.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-purple-600 font-medium">
                <Sparkles className="w-3.5 h-3.5" /> New from your team
              </div>
              {task.due_at && <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Due {new Date(task.due_at).toLocaleDateString()}</span>}
            </div>
            <p className="text-base font-semibold text-slate-900">{task.title}</p>
            {task.brief && <p className="text-sm text-slate-600 whitespace-pre-wrap">{task.brief}</p>}
            {task.context?.brandColors && (
              <p className="text-xs text-slate-400">Brand colors: {task.context.brandColors}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              {task.status === "open" && (
                <Button onClick={() => updateStatus(task.id, "in_progress")} disabled={updating === task.id} variant="secondary" size="sm">
                  Start
                </Button>
              )}
              <Button onClick={() => updateStatus(task.id, "done")} disabled={updating === task.id} loading={updating === task.id} size="sm">
                {updating !== task.id && <CheckCircle2 className="w-3.5 h-3.5" />} Mark Complete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-400 mb-2">Done recently</p>
          <div className="space-y-1.5">
            {done.map((task) => (
              <div key={task.id} className="text-sm text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> <span className="line-through">{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
