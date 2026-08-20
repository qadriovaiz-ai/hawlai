"use client";

import { useState, useEffect } from "react";
import { Loader2, Target, Bot, User, CheckCircle2, Circle, XCircle, Clock } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

interface GoalTask {
  id: string;
  title: string;
  status: string;
  type: "human" | "agent";
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  target_metric: string | null;
  target_value: number | null;
  deadline: string | null;
  status: string;
  tasks: GoalTask[];
  completedCount: number;
  totalCount: number;
}

const TASK_STATUS_ICON: Record<string, typeof CheckCircle2> = {
  done: CheckCircle2,
  cancelled: XCircle,
};

// Deliberately renders nothing when there are no goals — /dashboard/
// tasks already has its own empty state for the task list below this,
// and most dealers won't have created a goal yet, so this shouldn't
// add a second, redundant "nothing here" block above it.
export default function GoalsSection() {
  const [goals, setGoals] = useState<Goal[] | null>(null);

  useEffect(() => {
    fetch("/api/owner-goals")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) setGoals(d.goals ?? []);
      })
      .catch(() => {});
  }, []);

  if (goals === null) return <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading goals...</div>;
  if (goals.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-500">Goals</p>
      {goals.map((goal) => {
        const pct = goal.totalCount > 0 ? Math.round((goal.completedCount / goal.totalCount) * 100) : 0;
        return (
          <div key={goal.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-brand-500 shrink-0" />
                  <p className="text-sm font-semibold text-slate-900">{goal.title}</p>
                  {goal.status !== "active" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 border border-slate-300/80">
                      {goal.status === "completed" ? "Completed" : "Abandoned"}
                    </span>
                  )}
                </div>
                {goal.description && <p className="text-xs text-slate-500 mt-1">{goal.description}</p>}
              </div>
              <span className="text-xs font-medium text-slate-500 shrink-0 tabular-nums">{goal.completedCount}/{goal.totalCount} done</span>
            </div>

            {goal.totalCount > 0 && (
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}

            {(goal.target_metric || goal.deadline) && (
              <div className="flex flex-wrap gap-1.5">
                {goal.target_metric && (
                  <span className="badge bg-slate-200 text-slate-500 border-slate-300/80">
                    Target: {goal.target_value != null ? (goal.target_metric.toLowerCase().includes("revenue") || goal.target_metric.toLowerCase().includes("spend") ? formatCurrency(goal.target_value) : goal.target_value) : ""} {goal.target_metric}
                  </span>
                )}
                {goal.deadline && (
                  <span className="badge bg-slate-200 text-slate-500 border-slate-300/80">
                    <Clock className="w-3 h-3 inline mr-1 -mt-0.5" /> By {formatDate(goal.deadline)}
                  </span>
                )}
              </div>
            )}

            {goal.tasks.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                {goal.tasks.map((task) => {
                  const StatusIcon = TASK_STATUS_ICON[task.status] ?? Circle;
                  return (
                    <div key={task.id} className="flex items-center gap-2 text-xs">
                      <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${task.status === "done" ? "text-green-500" : task.status === "cancelled" ? "text-red-400" : "text-slate-300"}`} />
                      {task.type === "human" ? <User className="w-3 h-3 text-slate-400 shrink-0" /> : <Bot className="w-3 h-3 text-brand-400 shrink-0" />}
                      <span className={`truncate ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-600"}`}>{task.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
