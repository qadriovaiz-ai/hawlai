"use client";

import { useState, useEffect } from "react";
import { Loader2, PhoneCall, Clock } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  ai_score: number;
  lead_temperature: "hot" | "warm" | "cold";
  status: string;
  qualification_reason: string | null;
  created_at: string;
}

const TEMP_STYLE: Record<string, string> = {
  hot: "bg-red-100 text-red-600",
  warm: "bg-amber-100 text-amber-600",
  cold: "bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New", ready_to_call: "Ready to Call", called: "Called",
  appointment_set: "Appointment Set", converted: "Converted", not_interested: "Not Interested",
};

export default function SalesLeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/team/my-leads").then((r) => r.json()).then((d) => setLeads(d.leads ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await fetch(`/api/team/my-leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
    setUpdating(null);
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" /> Loading your leads...</div>;

  if (leads.length === 0) {
    return <div className="text-center py-12 text-sm text-slate-400">No leads assigned to you yet.</div>;
  }

  const groups = {
    hot: leads.filter((l) => l.lead_temperature === "hot"),
    warm: leads.filter((l) => l.lead_temperature === "warm"),
    cold: leads.filter((l) => l.lead_temperature === "cold"),
  };

  return (
    <div className="space-y-6">
      {(["hot", "warm", "cold"] as const).map((temp) => groups[temp].length > 0 && (
        <div key={temp} className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded inline-block ${TEMP_STYLE[temp]}`}>{temp} ({groups[temp].length})</p>
          {groups[temp].map((lead) => (
            <div key={lead.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{lead.name}</p>
                  {lead.phone && <p className="text-xs text-slate-400">{lead.phone}</p>}
                </div>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {STATUS_LABELS[lead.status] ?? lead.status}</span>
              </div>
              {lead.qualification_reason && <p className="text-xs text-slate-500">{lead.qualification_reason}</p>}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5" /> Call
                  </a>
                )}
                <select
                  value={lead.status}
                  disabled={updating === lead.id}
                  onChange={(e) => updateStatus(lead.id, e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 disabled:opacity-50"
                >
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
