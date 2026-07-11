import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, Car, Calendar, DollarSign, Zap } from "lucide-react";
import { formatCurrency, formatDate, getTemperatureColor, getTemperatureIcon, getStatusColor, getStatusLabel } from "@/lib/utils";
import AddToQueueButton from "@/components/leads/AddToQueueButton";
import CreateAppointmentModal from "@/components/appointments/CreateAppointmentModal";
import GenerateMessageButton from "@/components/leads/GenerateMessageButton";
import LeadCrmPanel from "@/components/leads/LeadCrmPanel";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) notFound();

  const { data: calls } = await supabase.from("calls").select("*").eq("lead_id", id).order("created_at", { ascending: false });
  const { data: appointments } = await supabase.from("appointments").select("*").eq("lead_id", id).order("appointment_date", { ascending: true });

  const vehicleAge = lead.purchase_year ? new Date().getFullYear() - lead.purchase_year : null;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back */}
      <Link href="/dashboard/leads" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back to Leads
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center text-xl font-bold text-brand-700">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{lead.name}</h1>
              <p className="text-slate-500 text-sm">{lead.email ?? "No email"}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`badge ${getTemperatureColor(lead.lead_temperature)}`}>
                  {getTemperatureIcon(lead.lead_temperature)} {lead.lead_temperature} lead
                </span>
                <span className={`badge ${getStatusColor(lead.status)}`}>
                  {getStatusLabel(lead.status)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AddToQueueButton leadId={lead.id} currentStatus={lead.status} />
            <CreateAppointmentModal leadId={lead.id} leadName={lead.name} dealershipId={lead.dealership_id} />
            <GenerateMessageButton leadId={lead.id} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Info */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 bg-brand-100 rounded flex items-center justify-center">
              <span className="text-xs text-brand-600">👤</span>
            </span>
            Customer Information
          </h2>
          <dl className="space-y-3">
            {[
              { icon: Phone, label: "Phone", value: lead.phone },
              { icon: Mail, label: "Email", value: lead.email },
              { icon: Car, label: "Vehicle", value: lead.vehicle },
              { icon: Calendar, label: "Purchase Year", value: lead.purchase_year ? `${lead.purchase_year} (${vehicleAge} years ago)` : null },
              { icon: DollarSign, label: "Budget", value: lead.budget ? formatCurrency(lead.budget) : null },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-sm font-medium text-slate-900">{value ?? "—"}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3">
              <span className="text-slate-400 mt-0.5 shrink-0 text-sm">📅</span>
              <div>
                <p className="text-xs text-slate-500">Lead Added</p>
                <p className="text-sm font-medium text-slate-900">{formatDate(lead.created_at)}</p>
              </div>
            </div>
          </dl>
        </div>

        {/* AI Analysis */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center">
              <Zap className="w-3 h-3 text-purple-600" />
            </span>
            AI Analysis
          </h2>

          {/* Score */}
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Qualification Score</span>
              <span className="text-2xl font-bold text-slate-900">{lead.ai_score}<span className="text-sm text-slate-400">/100</span></span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full">
              <div
                className={`h-2 rounded-full ${lead.ai_score >= 70 ? "bg-red-500" : lead.ai_score >= 40 ? "bg-amber-500" : "bg-blue-400"}`}
                style={{ width: `${lead.ai_score}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {lead.ai_score >= 70 ? "High replacement probability" : lead.ai_score >= 40 ? "Moderate replacement probability" : "Low replacement probability"}
            </p>
          </div>

          {/* Reason */}
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
            <p className="text-xs font-semibold text-purple-700 mb-1">Qualification Reason</p>
            <p className="text-sm text-purple-900 leading-relaxed">
              {lead.qualification_reason ?? "Insufficient data for detailed analysis."}
            </p>
          </div>
        </div>
      </div>

      {/* Call History */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Call History ({calls?.length ?? 0})</h2>
        {!calls || calls.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No calls recorded yet</p>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <div key={call.id} className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">{formatDate(call.created_at)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{call.status}</span>
                </div>
                {call.summary && <p className="text-sm text-slate-600">{call.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointments */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Appointments ({appointments?.length ?? 0})</h2>
        {!appointments || appointments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No appointments scheduled</p>
        ) : (
          <div className="space-y-3">
            {appointments.map((appt) => (
              <div key={appt.id} className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{formatDate(appt.appointment_date)}</p>
                    <p className="text-xs text-slate-500">{appt.appointment_type.replace(/_/g, " ")}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${appt.status === "scheduled" ? "bg-blue-100 text-blue-700" : appt.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {appt.status}
                  </span>
                </div>
                {appt.notes && <p className="text-xs text-slate-500 mt-1">{appt.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">CRM</p>
        <LeadCrmPanel leadId={lead.id} initialDealValue={lead.deal_value ?? null} />
      </div>
    </div>
  );
}
