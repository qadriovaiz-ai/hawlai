import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Kanban, Phone, Car } from "lucide-react";
import { getTemperatureColor, getTemperatureIcon } from "@/lib/utils";
import LeadStageSelect from "@/components/leads/LeadStageSelect";

const STAGES = [
  { value: "new", label: "New", color: "border-t-slate-300" },
  { value: "ready_to_call", label: "Ready to Call", color: "border-t-purple-300" },
  { value: "called", label: "Called", color: "border-t-blue-300" },
  { value: "appointment_set", label: "Appointment Set", color: "border-t-green-300" },
  { value: "converted", label: "Converted", color: "border-t-emerald-400" },
  { value: "not_interested", label: "Not Interested", color: "border-t-gray-300" },
];

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  const leadsByStage: Record<string, any[]> = {};
  for (const stage of STAGES) leadsByStage[stage.value] = [];
  for (const lead of leads ?? []) {
    (leadsByStage[lead.status] ?? (leadsByStage[lead.status] = [])).push(lead);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Kanban className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">Your sales funnel, lead by lead</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {STAGES.map((stage) => {
          const stageLeads = leadsByStage[stage.value] ?? [];
          return (
            <div key={stage.value} className={`bg-slate-50 rounded-xl border-t-4 ${stage.color} p-3 space-y-2 min-h-[200px]`}>
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-slate-600">{stage.label}</p>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full w-5 h-5 flex items-center justify-center">
                  {stageLeads.length}
                </span>
              </div>

              {stageLeads.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-6">No leads</p>
              ) : (
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <div key={lead.id} className="bg-slate-100 rounded-lg border border-slate-200 p-2.5 space-y-1.5">
                      <Link href={`/dashboard/leads/${lead.id}`} className="block">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{lead.name}</p>
                          <span className={`badge text-[10px] px-1.5 py-0.5 ${getTemperatureColor(lead.lead_temperature)}`}>
                            {getTemperatureIcon(lead.lead_temperature)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1 text-[11px] text-slate-400">
                          {lead.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {lead.phone}
                            </span>
                          )}
                          {lead.vehicle && (
                            <span className="inline-flex items-center gap-1">
                              <Car className="w-3 h-3" /> {lead.vehicle}
                            </span>
                          )}
                        </div>
                      </Link>
                      <LeadStageSelect leadId={lead.id} currentStatus={lead.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
