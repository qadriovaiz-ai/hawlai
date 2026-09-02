import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Gauge, IndianRupee, ArrowRight, Rocket, ShieldCheck, Palette } from "lucide-react";
import { formatDate, formatCurrency, getTemperatureColor, getTemperatureIcon } from "@/lib/utils";
import { getCampaignPerformanceState } from "@/lib/agents/analyticsAgent";
import { syncOpportunities, getOpenOpportunities } from "@/lib/agents/opportunityAgent";
import { generateGrowthReport, type GrowthReport } from "@/lib/agents/growthAdvisorAgent";
import OpportunityFeed from "@/components/dashboard/OpportunityFeed";
import ActivityFeed from "@/components/activity/ActivityFeed";
import HawlaiWorkingOn from "@/components/dashboard/HawlaiWorkingOn";
import WelcomeChatCard from "@/components/dashboard/WelcomeChatCard";
import AnalyticsToolbar from "@/components/dashboard/AnalyticsToolbar";
import PerformanceSection from "@/components/dashboard/PerformanceSection";
import { resolveRange } from "@/lib/analytics/dateRange";
import { getDashboardData, readConnections, DEALERSHIP_CONNECTION_FIELDS } from "@/lib/dashboard/dashboardData";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id, full_name").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/auth/login");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select(`dealership_name, onboarding_completed, business_category, ${DEALERSHIP_CONNECTION_FIELDS}`)
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

  // Governs the performance section ONLY. Opportunities and the growth
  // report deliberately ignore it: they answer "what should I do now",
  // not "what happened in this window", and making them shift under a
  // 7-day filter would change what they mean rather than what they show.
  const params = (await searchParams) ?? {};
  const range = resolveRange(params.range, params.from, params.to);
  const connections = readConnections(dealership);
  const dashboardData = await getDashboardData(supabase, dealershipId, range, connections);


  // Promise.allSettled, not Promise.all: this page synthesizes five
  // independent data sources (leads, ad performance, opportunities, an
  // LLM-generated growth report, pending approvals). One of them being
  // slow or failing — the growth report calls Claude — shouldn't take
  // the whole Home screen down; each section degrades on its own.
  const [leadsRes, performanceRes, opportunitiesRes, growthRes, approvalsRes, brandProfileRes] = await Promise.allSettled([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }),
    getCampaignPerformanceState(supabase, dealershipId),
    getOpenOpportunities(supabase, dealershipId),
    generateGrowthReport(supabase, dealershipId, dealership?.business_category ?? "car dealership"),
    supabase.from("pending_approvals").select("id").eq("dealership_id", dealershipId).eq("status", "pending"),
    supabase.from("brand_profiles").select("id").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const leads = leadsRes.status === "fulfilled" ? leadsRes.value.data : null;
  const performanceState = performanceRes.status === "fulfilled" ? performanceRes.value : null;
  const opportunities = opportunitiesRes.status === "fulfilled" ? opportunitiesRes.value : [];
  const growth: GrowthReport | null = growthRes.status === "fulfilled" ? growthRes.value : null;
  const pendingApprovals = approvalsRes.status === "fulfilled" ? (approvalsRes.value.data?.length ?? 0) : 0;

  // Master audit Part B — onboarding consistency. WelcomeChatCard's
  // "Skip for now" marks onboarding_completed = true while writing no
  // brand_profiles row, so every downstream agent silently falls back
  // to generic tone and nothing ever re-prompts. onboarding_completed
  // alone therefore isn't a reliable completeness signal; the presence
  // of a brand profile is. Surfaced as a dismissible-by-completion
  // prompt rather than by re-blocking the app — skipping was a
  // deliberate choice, this just makes it recoverable.
  const brandProfileMissing =
    brandProfileRes.status === "fulfilled" && !brandProfileRes.value.data;

  // I previously annotated this as safe on the grounds that revenue is
  // summed from our OWN attributed leads. That was wrong. The sum runs
  // over performance.campaigns, and getCampaignPerformanceState returns
  // no campaigns when the Meta token is missing — so a business with
  // real attributed revenue would have shown Rs 0. Same false zero,
  // just one step further from the token.
  //
  // null now, rendered as an em dash, because unreadable is not zero.
  const totalRevenue =
    performanceState?.state === 'ok'
      ? performanceState.value.campaigns.reduce((sum, c) => sum + c.revenue, 0)
      : null;
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
  // Only the genuinely period-independent tiles remain here. Leads
  // Today, Active Campaigns and Marketing ROI moved into
  // PerformanceSection, which is range-aware and — more importantly —
  // distinguishes "no ad account connected" from "zero". All three
  // were sourced from getCampaignPerformance, which returns
  // spend/leads of 0 when the Meta token is MISSING, so an unconnected
  // dealer was being shown "Active Campaigns: 0" and "Marketing ROI: —"
  // as though their marketing had produced nothing.
  const kpis: { label: string; value: string | number; icon: typeof Gauge; color: string; title?: string }[] = [
    {
      label: "Business Health",
      value: growth ? `${growth.healthScore}/100` : "—",
      icon: Gauge,
      color: scoreColorClass,
      title: growth?.headline ?? "Couldn't load right now",
    },
    { label: "Revenue (Lifetime)", value: totalRevenue === null ? "—" : formatCurrency(totalRevenue), icon: IndianRupee, color: "bg-green-500/10 text-green-400", title: totalRevenue === null ? "Ad account not connected, so attributed revenue can not be read" : undefined },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.full_name ?? "there"}</h1>
        {growth && <p className="text-slate-500 text-sm mt-0.5">{growth.headline}</p>}
      </div>

      {/* ---- What needs my attention? ----
          Heading only renders when there IS something — an empty
          "Needs your attention" header on a clean day is noise. */}
      {(brandProfileMissing || pendingApprovals > 0) && (
        <h2 className="text-sm font-semibold text-slate-700 -mb-2">Needs your attention</h2>
      )}

      {brandProfileMissing && (
        <Link
          href="/dashboard/settings/brand"
          className="flex items-center gap-3 bg-brand-500/10 border border-brand-700/40 rounded-xl p-4 hover:bg-brand-500/15 transition-colors"
        >
          <div className="w-9 h-9 bg-brand-500/20 rounded-lg flex items-center justify-center shrink-0">
            <Palette className="w-4 h-4 text-brand-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-300">Finish setting up your brand</p>
            <p className="text-xs text-brand-500">
              Onboarding was skipped, so everything generated for you uses a generic tone. Takes a minute to fix.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-brand-400" />
        </Link>
      )}

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

      {/* ---- What is Hawlai working on? ----
          Renders nothing when there's no live work — see the component.
          Placed above results because "happening now" is more
          actionable than "already happened". */}
      <HawlaiWorkingOn />

      {/* ---- Performance (range-governed) ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700">Performance</h2>
        </div>
        <AnalyticsToolbar />
        <PerformanceSection data={dashboardData} rangeLabel={range.label} />
      </div>

      {/* ---- At a glance ----
          Kept out of the section above because neither figure is
          period-based: health is a current assessment and revenue is
          lifetime. Labelled so nobody reads them as following the
          range selector, matching the RANGE_EXEMPT convention the
          analytics page already uses. */}
      <div>
        <div className="flex items-baseline gap-2 mb-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700">At a glance</h2>
          <span className="text-[10.5px] text-slate-400">Not affected by the date range</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
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
      </div>

      <ActivityFeed
        limit={10}
        title="What Hawlai has done"
        historyOnly
        emptyMessage="Nothing yet — this fills in as Hawlai works."
      />

      {/* ---- What should I do? ----
          growth.nextActions (AI-generated advice) and OpportunityFeed
          (detected, actionable openings) are both recommendations, so
          they now sit together under one heading instead of being
          separated by five KPI cards. */}
      {((growth && growth.nextActions.length > 0) || opportunities.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Hawlai recommends</h2>

          {growth && growth.nextActions.length > 0 && (
            <div className="card p-5">
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

          <OpportunityFeed initial={opportunities} />
        </div>
      )}

      <Link
        href="/dashboard/marketing?tab=launch"
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
