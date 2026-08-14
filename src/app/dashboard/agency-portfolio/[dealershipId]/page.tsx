import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame, Users, ShieldCheck, PhoneCall, CalendarDays } from "lucide-react";
import { formatDate, getTemperatureColor, getTemperatureIcon, getCallStatusColor, titleCaseFromSnake } from "@/lib/utils";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import { getBusinessDetailSummary } from "@/lib/agents/portfolioAgent";

// Read-only cross-client drill-in — master audit Part E1. Deliberately
// does NOT switch profiles.dealership_id or touch session state (an
// agency user checking a client shouldn't lose whatever business they
// were actively working in), and deliberately does NOT reuse the
// normal Overview page's components: that page fires a write
// (syncOpportunities) on every load and its Opportunity Feed has
// interactive approve/dismiss actions — wrong for a quick, read-only
// glance into a business that isn't the active one. No AI-generated
// health score/growth report here either, for the same "cheap enough
// to click into casually" reasoning as the portfolio grid itself.
export default async function AgencyPortfolioDetailPage({ params }: { params: Promise<{ dealershipId: string }> }) {
  const { dealershipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const activeDealershipId = profile?.dealership_id;
  if (!activeDealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, activeDealershipId);
  if (!hasFeature(limits, "multiBusiness")) redirect("/dashboard/agency-portfolio");

  // Ownership check — never trust the id in the URL. Only a business
  // this exact user owns can be viewed here.
  const { data: owned } = await supabase.from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!owned) notFound();

  const summary = await getBusinessDetailSummary(supabase, dealershipId);
  if (!summary) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/dashboard/agency-portfolio" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back to Portfolio
      </Link>

      <div className="card p-6">
        <h1 className="text-xl font-bold text-slate-900">{summary.dealershipName}</h1>
        <p className="text-slate-500 text-sm">{summary.city ?? "—"} · {summary.plan}</p>
        <p className="text-xs text-slate-400 mt-2">Read-only view — this doesn't switch your active business.</p>
      </div>

      {summary.pendingApprovals > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-700/40 rounded-xl p-4">
          <div className="w-9 h-9 bg-amber-500/20 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-sm font-semibold text-amber-700">
            {summary.pendingApprovals} action{summary.pendingApprovals > 1 ? "s" : ""} waiting for approval
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Total Leads" value={summary.totalLeads} color="bg-blue-500/10 text-blue-500" />
        <Kpi icon={Flame} label="Hot Leads" value={summary.hotLeads} color="bg-red-500/10 text-red-400" />
        <Kpi icon={PhoneCall} label="Recent Calls" value={summary.recentCalls.length} color="bg-purple-500/10 text-purple-400" />
        <Kpi icon={CalendarDays} label="Recent Appointments" value={summary.recentAppointments.length} color="bg-green-500/10 text-green-400" />
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Leads</h2>
        {summary.recentLeads.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No leads yet</p>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {summary.recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center gap-3 py-2.5">
                <span className="text-base">{getTemperatureIcon(lead.lead_temperature as any)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{lead.name ?? "Unknown"}</p>
                  <p className="text-xs text-slate-400">{formatDate(lead.created_at)}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getTemperatureColor(lead.lead_temperature as any)}`}>
                  {lead.ai_score ?? "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Calls</h2>
          {summary.recentCalls.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No calls yet</p>
          ) : (
            <div className="space-y-3">
              {summary.recentCalls.map((call) => (
                <div key={call.id} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{formatDate(call.created_at)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getCallStatusColor(call.status as any)}`}>{titleCaseFromSnake(call.status)}</span>
                  </div>
                  {call.summary && <p className="text-sm text-slate-600">{call.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Appointments</h2>
          {summary.recentAppointments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No appointments yet</p>
          ) : (
            <div className="space-y-3">
              {summary.recentAppointments.map((appt) => (
                <div key={appt.id} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{formatDate(appt.appointment_date)}</p>
                      <p className="text-xs text-slate-500">{appt.appointment_type.replace(/_/g, " ")}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${appt.status === "scheduled" ? "bg-blue-500/20 text-blue-500" : appt.status === "completed" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-400"}`}>
                      {appt.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  return (
    <div className="card p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
