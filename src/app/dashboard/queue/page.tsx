import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, Eye, ArrowRight } from "lucide-react";
import { formatCurrency, formatDate, getTemperatureColor, getTemperatureIcon } from "@/lib/utils";
import MarkCalledButton from "@/components/calls/MarkCalledButton";
import DraftMessagePreview from "@/components/leads/DraftMessagePreview";

export default async function QueuePage() {
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
    .eq("status", "ready_to_call")
    .order("ai_score", { ascending: false });

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Call Queue</h1>
        <p className="text-slate-500 text-sm mt-0.5">Leads ready to be called, sorted by AI score</p>
      </div>

      {!leads || leads.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-slate-700 font-medium">No leads in the queue</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Add leads to the queue from the Leads page</p>
          <Link href="/dashboard/leads" className="btn-primary inline-flex">
            Go to Leads <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{leads.length} leads waiting to be called</p>
          {leads.map((lead, i) => (
            <div key={lead.id} className="card p-4 space-y-2">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-slate-900">{lead.name}</p>
                    <span className={`badge ${getTemperatureColor(lead.lead_temperature)}`}>
                      {getTemperatureIcon(lead.lead_temperature)} {lead.lead_temperature}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {lead.vehicle ?? "Unknown vehicle"} • {lead.purchase_year ?? "—"} • {lead.budget ? formatCurrency(lead.budget) : "—"}
                  </p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-xs text-slate-400">AI Score</p>
                  <p className="text-xl font-bold text-slate-900">{lead.ai_score}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`tel:${lead.phone}`}
                    className="btn-primary"
                  >
                    <Phone className="w-4 h-4" /> Call {lead.phone}
                  </a>
                  <MarkCalledButton leadId={lead.id} dealershipId={dealershipId} />
                  <Link href={`/dashboard/leads/${lead.id}`} className="btn-secondary px-2 py-2">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </div>
              {lead.draft_followup_message && <DraftMessagePreview message={lead.draft_followup_message} phone={lead.phone} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
