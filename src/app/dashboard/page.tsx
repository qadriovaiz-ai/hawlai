import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Flame, PhoneCall, Calendar, Rocket, ArrowRight, IndianRupee, TrendingDown } from "lucide-react";
import { formatDate, formatCurrency, getTemperatureColor, getTemperatureIcon } from "@/lib/utils";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";
import { syncOpportunities, getOpenOpportunities } from "@/lib/agents/opportunityAgent";
import OpportunityFeed from "@/components/dashboard/OpportunityFeed";
import WelcomeChatCard from "@/components/dashboard/WelcomeChatCard";

export default async function DashboardHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id, full_name").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/auth/login");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, onboarding_completed")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.onboarding_completed) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <WelcomeChatCard dealershipName={dealership?.dealership_name ?? "your business"} ownerName={profile?.full_name ?? null} />
      </div>
    );
  }

  await syncOpportunities(supabase, dealershipId);

  const [{ data: leads }, { data: appointments }, performance, opportunities] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }),
    supabase.from("appointments").select("id").eq("dealership_id", dealershipId),
    getCampaignPerformance(supabase, dealershipId),
    getOpenOpportunities(supabase, dealershipId),
  ]);

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l) => l.lead_temperature === "hot").length ?? 0;
  const inQueue = leads?.filter((l) => l.status === "ready_to_call").length ?? 0;
  const totalAppointments = appointments?.length ?? 0;
  const recentLeads = leads?.slice(0, 5) ?? [];

  const kpis = [
    { label: "Total Leads", value: totalLeads, icon: Users, color: "bg-brand-500/10 text-brand-400" },
    { label: "Hot Leads", value: hotLeads, icon: Flame, color: "bg-red-500/10 text-red-400" },
    { label: "In Call Queue", value: inQueue, icon: PhoneCall, color: "bg-purple-500/10 text-purple-400" },
    { label: "Appointments", value: totalAppointments, icon: Calendar, color: "bg-green-500/10 text-green-400" },
    { label: "Total Ad Spend", value: formatCurrency(performance.totals.spend), icon: IndianRupee, color: "bg-amber-500/10 text-amber-400" },
    {
      label: "Cost / Lead",
      value: performance.totals.cost_per_lead !== null ? formatCurrency(performance.totals.cost_per_lead) : "—",
      icon: TrendingDown,
      color: "bg-blue-500/10 text-blue-400",
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Quick overview of your leads and activity</p>
      </div>

      <OpportunityFeed initial={opportunities} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard/marketing"
        className="flex items-center gap-3 bg-purple-500/10 border border-purple-700/40 rounded-xl p-4 hover:bg-purple-500/20 transition-colors"
      >
        <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center shrink-0">
          <Rocket className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-purple-300">Launch New Ad</p>
          <p className="text-xs text-purple-500">Give a photo + requirement, AI will get the full ad ready</p>
        </div>
        <ArrowRight className="w-4 h-4 text-purple-400" />
      </Link>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Recent Leads</h2>
          <Link href="/dashboard/leads" className="text-xs text-brand-400 font-medium hover:underline">
            View all
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No leads yet</p>
        ) : (
          <div className="space-y-2">
            {recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="text-base">{getTemperatureIcon(lead.lead_temperature)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{lead.name ?? "Unknown"}</p>
                  <p className="text-xs text-slate-400">{formatDate(lead.created_at)}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getTemperatureColor(lead.lead_temperature)}`}>
                  {lead.ai_score ?? "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
