"use client";

import { useState, useEffect } from "react";
import { Loader2, PhoneCall, ClipboardList, Users2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: string;
  department: string | null;
  due_at: string | null;
  team_members: { email: string; role: string } | null;
}
interface Lead {
  id: string;
  name: string;
  lead_temperature: string;
  status: string;
}
interface Member {
  id: string;
  email: string;
  role: string;
  status: string;
}

const TEMP_COLOR: Record<string, string> = { hot: "text-red-500", warm: "text-amber-500", cold: "text-slate-400" };

export default function ManagerWorkspace() {
  const [tab, setTab] = useState<"tasks" | "leads" | "team">("tasks");
  const [data, setData] = useState<{ tasks: Task[]; leads: Lead[]; leadCounts: Record<string, number>; teamMembers: Member[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team/workspace").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" /> Loading workspace...</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5">
        {[
          { key: "tasks", label: "Team Tasks", icon: ClipboardList },
          { key: "leads", label: "Leads", icon: PhoneCall },
          { key: "team", label: "Team", icon: Users2 },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${tab === t.key ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <div className="space-y-2">
          {data.tasks.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No tasks yet.</p>}
          {data.tasks.map((t) => (
            <div key={t.id} className="card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{t.title}</p>
                <p className="text-xs text-slate-400">{t.team_members?.email ?? "AI"} · {t.department ?? "general"}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${t.status === "done" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"}`}>{t.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "leads" && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-red-500 font-semibold">{data.leadCounts.hot ?? 0} Hot</span>
            <span className="text-amber-500 font-semibold">{data.leadCounts.warm ?? 0} Warm</span>
            <span className="text-slate-400 font-semibold">{data.leadCounts.cold ?? 0} Cold</span>
          </div>
          {data.leads.map((l) => (
            <div key={l.id} className="card p-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">{l.name}</p>
              <span className={`text-xs font-medium ${TEMP_COLOR[l.lead_temperature] ?? "text-slate-400"}`}>{l.lead_temperature}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-2">
          {data.teamMembers.map((m) => (
            <div key={m.id} className="card p-3 flex items-center justify-between">
              <p className="text-sm text-slate-900">{m.email}</p>
              <span className="text-xs text-slate-400 capitalize">{m.role.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
