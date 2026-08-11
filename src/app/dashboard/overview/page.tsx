import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Gauge, IndianRupee, TrendingUp, Megaphone, Flame, ArrowRight, Rocket, ShieldCheck } from "lucide-react";
import { formatDate, formatCurrency, getTemperatureColor, getTemperatureIcon } from "@/lib/utils";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";
import { syncOpportunities, getOpenOpportunities } from "@/lib/agents/opportunityAgent";
import { generateGrowthReport, type GrowthReport } from "@/lib/agents/growthAdvisorAgent";
import OpportunityFeed from "@/components/dashboard/OpportunityFeed";
import WelcomeChatCard from "@/components/dashboard/WelcomeChatCard";

export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id, full_name").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/auth/login");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, onboarding_completed, business_category")
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Promise.allSettled, not Promise.all: this page synthesizes five
  // independent data sources (leads, ad performance, opportunities, an
  // LLM-generated growth report, pending approvals). One of them being
  // slow or failing — the growth report calls Claude — shouldn't take
  // the whole Home screen down; each section degrades on its own.
  const [leadsRes, performanceRes, opportunitiesRes, growthRes, approvalsRes] = await Promise.allSettled([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }),
    getCampaignPerformance(supabase, dealershipId),
    getOpenOpportunities(supabase, dealershipId),
    generateGrowthReport(supabase, dealershipId, dealership?.business_category ?? "car dealership"),
    supabase.from("pending_approvals").select("id").eq("dealership_id", dealershipId).eq("status", "pending"),
  ]);

  const leads = leadsRes.status === "fulfilled" ? leadsRes.value.data : null;
  const performance = performanceRes.status === "fulfilled" ? performanceRes.value : null;
  const opportunities = opportunitiesRes.status === "fulfilled" ? opportunitiesRes.value : [];
  const growth: GrowthReport | null = growthRes.status === "fulfilled" ? growthRes.value : null;
  const pendingApprovals = approvalsRes.status === "fulfilled" ? (approvalsRes.value.data?.length ?? 0) : 0;

  const leadsToday = leads?.filter((l) => new Date(l.created_at) >= todayStart).length ?? 0;
  const activeCampaigns = performance?.campaigns.filter((c) => c.meta_status === "ACTIVE").length ?? 0;
  const totalRevenue = performance?.campaigns.reduce((s, c) => s + c.revenue, 0) ?? 0;
  const totalSpend = performance?.totals.spend ?? 0;
  const recentLeads = leads?.slice(0, 5) ?? [];

  const scoreColorClass = !growth
    ? "bg-slate-200 text-slate-500"
    : growth.healthScore >= 70
    ? "bg-green-500/10 text-green-400"
    : growth.healthScore >= 40
    ? "bg-amber-500/10 text-amber-400"
    : "bg-red-500/10 text-red-400";

  // Ordered actionable-today-first, longer-horizon-last: what changed
  // recently belongs above what's true in general.
  const kpis: { label: string; value: string | number; icon: typeof Gauge; color: string; title?: string }[] = [
    { label: "Leads Today", value: leadsToday, icon: Flame, color: "bg-red-500/10 text-red-400" },
    { label: "Active Campaigns", value: activeCampaigns, icon: Megaphone, color: "bg-blue-500/10 text-blue-400" },
    {
      label: "Marketing ROI",
      value: totalSpend > 0 && totalRevenue > 0 ? `${(totalRevenue / totalSpend).toFixed(1)}x` : "—",
      icon: TrendingUp,
      color: "bg-brand-500/10 text-brand-400",
    },
    {
      label: "Business Health",
      value: growth ? `${growth.healthScore}/100` : "—",
      icon: Gauge,
      color: scoreColorClass,
      title: growth?.headline ?? "Couldn't load right now",
    },
    { label: "Revenue (Lifetime)", value: formatCurrency(totalRevenue), icon: IndianRupee, color: "bg-green-500/10 text-green-400" },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.full_name ?? "there"}</h1>
        {growth && <p className="text-slate-500 text-sm mt-0.5">{growth.headline}</p>}
      </div>

      {pendingApprovals > 0 && (
        <Link
          href="/dashboard/approvals"
          className="flex items-center gap-3 bg-amber-500/10 border border-amber-700/40 rounded-xl p-4 hover:bg-amber-500/15 transition-colors"
        >
          <div className="w-9 h-9 bg-amber-500/20 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">
              {pendingApprovals} action{pendingApprovals > 1 ? "s" : ""} waiting for your approval
            </p>
            <p className="text-xs text-amber-500/80">Review and decide before agents can proceed</p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400" />
        </Link>
      )}

      {growth && growth.nextActions.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">What to do next</h2>
          <ol className="space-y-2.5">
            {growth.nextActions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="w-5 h-5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, title }) => (
          <div key={label} className="card p-5" title={title}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <OpportunityFeed initial={opportunities} />

      <Link
        href="/dashboard/marketing"
        className="flex items-center gap-3 bg-brand-500/10 border border-brand-700/40 rounded-xl p-4 hover:bg-brand-500/15 transition-colors"
      >
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
          <Rocket className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-brand-300">Launch New Ad</p>
          <p className="text-xs text-brand-500">Give a photo + requirement, AI will get the full ad ready</p>
        </div>
        <ArrowRight className="w-4 h-4 text-brand-400" />
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
          <div className="divide-y divide-slate-200/80">
            {recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center gap-3 py-2.5">
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
