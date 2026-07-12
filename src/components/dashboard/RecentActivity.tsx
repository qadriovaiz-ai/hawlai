import Link from "next/link";
import { formatDate, getTemperatureColor, getTemperatureIcon } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import type { Lead } from "@/types";

export default function RecentActivity({ leads }: { leads: Partial<Lead>[] }) {
  if (leads.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-400 text-sm">No leads yet. Upload your first CSV to get started.</p>
        <Link href="/dashboard/leads" className="btn-primary mt-4 inline-flex">
          Upload Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Recent Leads</h3>
        <Link href="/dashboard/leads" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="divide-y divide-slate-50">
        {leads.map((lead) => (
          <div key={lead.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-200 transition-colors">
            <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-slate-600">
                {lead.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{lead.name}</p>
              <p className="text-xs text-slate-500 truncate">{lead.vehicle ?? "—"}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`badge ${getTemperatureColor(lead.lead_temperature ?? "cold")}`}>
                {getTemperatureIcon(lead.lead_temperature ?? "cold")} {lead.lead_temperature}
              </span>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                {lead.ai_score ?? 0}
              </span>
              <span className="text-xs text-slate-400">
                {lead.created_at ? formatDate(lead.created_at) : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
