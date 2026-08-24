import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";
import CampaignPerformanceCharts from "@/components/dashboard/CampaignPerformanceCharts";
import GrowthMetricsCard from "@/components/dashboard/GrowthMetricsCard";
import WebsiteAnalyticsCard from "@/components/dashboard/WebsiteAnalyticsCard";
import { formatCurrency } from "@/lib/utils";
import { History } from "lucide-react";
import { computeAttribution } from "@/lib/analytics/attribution";
import { computeLtv, computeCohorts } from "@/lib/analytics/ltvCohorts";
import AdvancedAnalyticsSection from "@/components/dashboard/AdvancedAnalyticsSection";
import AnalyticsToolbar from "@/components/dashboard/AnalyticsToolbar";
import MetricOverlayChart from "@/components/dashboard/MetricOverlayChart";
import { resolveRange, RANGE_EXEMPT } from "@/lib/analytics/dateRange";

export default async function AnalyticsPage({
  searchParams,
}: {
  // Optional because /dashboard/insights renders this component
  // directly rather than as a route — it has no searchParams of its
  // own to pass, and should keep working with the default range.
  searchParams?: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const params = searchParams ? await searchParams : {};
  const range = resolveRange(params.range, params.from, params.to);

  // Date-governed sections (KPIs, trend, campaigns, source breakdown)
  // now respect the picker. Before this the page had NO date filtering
  // at all — five sections each carried a different implicit window
  // (all-time vs 6-month) while being read as the same period.
  //
  // leadsAllTime / touchpoints / orders are fetched UNFILTERED on
  // purpose: attribution, cohorts and LTV would become quietly wrong
  // if windowed — see RANGE_EXEMPT in dateRange.ts.
  const [{ data: leads }, { data: leadsAllTime }, { data: calls }, { data: appointments }, { data: perfHistory }, { data: touchpoints }, { data: orders }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId).gte("created_at", range.from).lt("created_at", range.to),
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId).gte("created_at", range.from).lt("created_at", range.to),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId).gte("created_at", range.from).lt("created_at", range.to),
    supabase.from("campaign_performance_history").select("*").eq("dealership_id", dealershipId).gte("snapshot_date", range.from.slice(0, 10)).lte("snapshot_date", range.to.slice(0, 10)).order("snapshot_date", { ascending: false }),
    // P3 8a — lead_touchpoints (migration 112) has been collecting
    // real multi-touch data all along; nothing ever read it for
    // attribution until now.
    supabase.from("lead_touchpoints").select("lead_id, channel, occurred_at").eq("dealership_id", dealershipId),
    // P3 8b/8c — repeat purchases were already recorded, just never
    // grouped per customer.
    supabase.from("orders").select("customer_phone, customer_name, total, created_at, payment_status, status").eq("dealership_id", dealershipId),
  ]);

  // These three deliberately use the UNFILTERED lead set (confirmed
  // decision). Filtering them to the picker's window would change what
  // they mean rather than what they cover:
  //   attribution — needs each lead's full journey; a windowed
  //     touchpoint set drops earlier touches and over-credits last-touch
  //   LTV — is lifetime value by definition; windowed, it's a
  //     different metric wearing the same label
  //   cohorts — track acquisition months forward; a 30-day window
  //     shows one partial cohort and destroys the comparison
  const convertedLeads = (leadsAllTime ?? []).filter((l) => l.status === "converted").map((l) => ({ id: l.id, deal_value: l.deal_value }));
  const attribution = computeAttribution(convertedLeads, touchpoints ?? []);
  const ltv = computeLtv(orders ?? []);
  const cohorts = computeCohorts((leadsAllTime ?? []).map((l) => ({ created_at: l.created_at, status: l.status, converted_at: l.converted_at ?? null, deal_value: l.deal_value })));

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l) => l.lead_temperature === "hot").length ?? 0;
  const qualifiedLeads = leads?.filter((l) => l.lead_temperature !== "cold").length ?? 0;

  const qualificationRate = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;
  const hotPct = totalLeads > 0 ? Math.round((hotLeads / totalLeads) * 100) : 0;
  const appointmentRate = totalLeads > 0 ? Math.round(((appointments?.length ?? 0) / totalLeads) * 100) : 0;
  const callCompletionRate = (calls?.length ?? 0) > 0
    ? Math.round((calls?.filter((c) => c.status === "completed").length ?? 0) / (calls?.length ?? 1) * 100)
    : 0;

  // Score distribution
  const scoreBuckets = [
    { range: "0–20", min: 0, max: 20 },
    { range: "21–40", min: 21, max: 40 },
    { range: "41–60", min: 41, max: 60 },
    { range: "61–80", min: 61, max: 80 },
    { range: "81–100", min: 81, max: 100 },
  ].map(({ range, min, max }) => ({
    range,
    count: leads?.filter((l) => l.ai_score >= min && l.ai_score <= max).length ?? 0,
  }));

  // Source breakdown — derived from the data rather than a hardcoded
  // list. The old fixed list (csv_upload/website/referral/walk_in/
  // social_media) silently dropped every lead whose source wasn't on
  // it, most notably "meta_ads_paid" — the value the Meta lead webhook
  // actually writes — so paid-social leads were invisible here.
  //
  // Revenue per source closes the audit's channel-attribution gap:
  // campaign ROAS only ever counted leads carrying a meta_campaign_id,
  // so revenue from organic, referral, walk-in and email leads existed
  // in the CRM but appeared nowhere in any performance view. This
  // breakdown is single-touch (one source stamped per lead) and stays
  // that way deliberately — real multi-touch attribution now exists
  // separately in AdvancedAnalyticsSection below (P3 8a), built on
  // lead_touchpoints. Keeping both is intentional: this one answers
  // "where did leads come from", that one answers "what actually
  // earned the credit".
  const sourceTotals = new Map<string, { count: number; revenue: number; conversions: number }>();
  for (const lead of leads ?? []) {
    const key = lead.source || "unknown";
    const entry = sourceTotals.get(key) ?? { count: 0, revenue: 0, conversions: 0 };
    entry.count += 1;
    if (lead.status === "converted" && lead.deal_value != null) {
      entry.revenue += Number(lead.deal_value);
      entry.conversions += 1;
    }
    sourceTotals.set(key, entry);
  }
  const sourceData = Array.from(sourceTotals.entries())
    .map(([source, v]) => ({ source: source.replace(/_/g, " "), ...v }))
    .sort((a, b) => b.count - a.count);

  // Monthly trend
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { month: d.toLocaleString("en-IN", { month: "short" }), monthNum: d.getMonth(), year: d.getFullYear() };
  });
  const monthlyTrend = months.map(({ month, monthNum, year }) => ({
    month,
    leads: leads?.filter((l) => { const d = new Date(l.created_at); return d.getMonth() === monthNum && d.getFullYear() === year; }).length ?? 0,
    calls: calls?.filter((c) => { const d = new Date(c.created_at); return d.getMonth() === monthNum && d.getFullYear() === year; }).length ?? 0,
    appointments: appointments?.filter((a) => { const d = new Date(a.created_at); return d.getMonth() === monthNum && d.getFullYear() === year; }).length ?? 0,
  }));

  // Lifetime totals per campaign from the permanent daily-snapshot
  // history — this survives even if a campaign is later paused,
  // deleted on Meta, or Facebook access is ever lost, since it's our
  // own stored copy, not a live re-fetch from Meta each time.
  const campaignTotals = new Map<string, { headline: string; spend: number; leads: number; revenue: number; conversions: number; days: number }>();
  for (const row of perfHistory ?? []) {
    const existing = campaignTotals.get(row.ad_creative_id) ?? { headline: row.headline ?? "Untitled", spend: 0, leads: 0, revenue: 0, conversions: 0, days: 0 };
    existing.spend += Number(row.spend ?? 0);
    existing.leads += Number(row.leads ?? 0);
    existing.revenue += Number(row.revenue ?? 0);
    existing.conversions += Number(row.conversions ?? 0);
    existing.days += 1;
    campaignTotals.set(row.ad_creative_id, existing);
  }
  const campaignTotalsList = Array.from(campaignTotals.values()).sort((a, b) => b.spend - a.spend);

  // Aggregate the same permanent history by date (summed across all
  // campaigns) for the time-series charts — same data source as the
  // per-campaign table below, just grouped differently.
  const dailyTotals = new Map<string, { date: string; spend: number; leads: number; revenue: number }>();
  for (const row of perfHistory ?? []) {
    const existing = dailyTotals.get(row.snapshot_date) ?? { date: row.snapshot_date, spend: 0, leads: 0, revenue: 0 };
    existing.spend += Number(row.spend ?? 0);
    existing.leads += Number(row.leads ?? 0);
    existing.revenue += Number(row.revenue ?? 0);
    dailyTotals.set(row.snapshot_date, existing);
  }
  const dailyChartData = Array.from(dailyTotals.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Overlay series — the same daily snapshot rows, shaped for the
  // multi-metric chart. Reuses dailyChartData rather than re-querying:
  // spend/leads/revenue already sit together on each row, which is
  // exactly what makes overlaying them meaningful.
  const overlayData = dailyChartData.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    spend: Math.round(d.spend),
    leads: d.leads,
    revenue: Math.round(d.revenue),
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-0.5">Performance metrics and insights</p>
      </div>

      <AnalyticsToolbar />

      {/* KPI Metrics — governed by the date picker. Labelled with the
          active range so the numbers are never read as all-time. */}
      <p className="text-xs text-slate-400 -mb-2">Showing {range.label.toLowerCase()}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Qualification Rate", value: `${qualificationRate}%`, sub: "Hot + Warm leads", color: "bg-brand-500/10 text-brand-300" },
          { label: "Hot Lead Percentage", value: `${hotPct}%`, sub: "Of all leads", color: "bg-red-500/10 text-red-300" },
          { label: "Appointment Rate", value: `${appointmentRate}%`, sub: "Leads to appointments", color: "bg-green-500/10 text-green-300" },
          { label: "Call Completion", value: `${callCompletionRate}%`, sub: "Calls answered", color: "bg-purple-500/10 text-purple-300" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mb-3 ${color}`}>
              {label}
            </div>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <AnalyticsCharts
        scoreBuckets={scoreBuckets}
        sourceData={sourceData}
        monthlyTrend={monthlyTrend}
      />

      <AdvancedAnalyticsSection
        attribution={attribution}
        ltv={ltv}
        cohorts={cohorts}
        exemptLabels={RANGE_EXEMPT}
      />

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Campaign Performance — Meta-style graphs</p>
        <MetricOverlayChart data={overlayData} rangeLabel={range.label} />
        <div className="mt-6">
          <CampaignPerformanceCharts data={dailyChartData} />
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Campaign Performance History</p>
        </div>
        <p className="text-xs text-slate-400">
          Saved permanently in Hawlai — this survives even if a campaign is later paused, deleted on Meta, or Facebook access changes. Updates once a day automatically.
        </p>
        {campaignTotalsList.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No history recorded yet — this fills in once a launched campaign has run for at least a day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium">Days Tracked</th>
                  <th className="pb-2 font-medium">Total Spend</th>
                  <th className="pb-2 font-medium">Total Leads</th>
                  <th className="pb-2 font-medium">Avg. Cost/Lead</th>
                  <th className="pb-2 font-medium">Sales</th>
                  <th className="pb-2 font-medium">Revenue</th>
                  <th className="pb-2 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaignTotalsList.map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{c.headline}</td>
                    <td className="py-2 text-slate-500">{c.days}</td>
                    <td className="py-2 text-slate-700">{formatCurrency(c.spend)}</td>
                    <td className="py-2 text-slate-700">{c.leads}</td>
                    <td className="py-2 text-slate-700">{c.leads > 0 ? formatCurrency(c.spend / c.leads) : "—"}</td>
                    <td className="py-2 text-slate-700">{c.conversions}</td>
                    <td className="py-2 text-slate-700">{c.revenue > 0 ? formatCurrency(c.revenue) : "—"}</td>
                    <td className="py-2 font-medium">
                      {c.spend > 0 && c.revenue > 0 ? (
                        <span className={c.revenue / c.spend >= 1 ? "text-green-400" : "text-amber-400"}>
                          {(c.revenue / c.spend).toFixed(1)}x
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GrowthMetricsCard />
      <WebsiteAnalyticsCard />
    </div>
  );
}
