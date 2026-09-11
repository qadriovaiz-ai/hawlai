import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";
import GrowthMetricsCard from "@/components/dashboard/GrowthMetricsCard";
import WebsiteAnalyticsCard from "@/components/dashboard/WebsiteAnalyticsCard";
import { computeAttribution } from "@/lib/analytics/attribution";
import { computeLtv, computeCohorts } from "@/lib/analytics/ltvCohorts";
import AdvancedAnalyticsSection from "@/components/dashboard/AdvancedAnalyticsSection";
import AnalyticsToolbar from "@/components/dashboard/AnalyticsToolbar";
import MetricOverlayChart from "@/components/dashboard/MetricOverlayChart";
import PeriodComparison from "@/components/dashboard/PeriodComparison";
import CampaignHistorySection from "@/components/dashboard/CampaignHistorySection";
import { fetchAllHistory, dailySeries, historyDates } from "@/lib/analytics/campaignHistory";
import { shortDate } from "@/lib/ads/campaignDeliveryDisplay";
import { resolveRange, RANGE_EXEMPT, previousPeriod, buildTrendBuckets, computeDelta } from "@/lib/analytics/dateRange";

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
  const prior = previousPeriod(range);

  // Date-governed sections (KPIs, trend, campaigns, source breakdown)
  // now respect the picker. Before this the page had NO date filtering
  // at all — five sections each carried a different implicit window
  // (all-time vs 6-month) while being read as the same period.
  //
  // leadsAllTime / touchpoints / orders are fetched UNFILTERED on
  // purpose: attribution, cohorts and LTV would become quietly wrong
  // if windowed — see RANGE_EXEMPT in dateRange.ts.
  const [{ data: leads }, { data: leadsAllTime }, { data: calls }, { data: appointments }, { data: perfHistory }, { data: touchpoints }, { data: orders }, { count: priorLeadCount }, { count: priorCallCount }, { count: priorAppointmentCount }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId).gte("created_at", range.from).lt("created_at", range.to),
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId).gte("created_at", range.from).lt("created_at", range.to),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId).gte("created_at", range.from).lt("created_at", range.to),
    // The WHOLE history, paged past Supabase's 1,000-row cap: the
    // performance section's date slider spans all of it, and a range's
    // figures need the snapshot just before the range (campaignHistory.ts).
    fetchAllHistory(supabase, dealershipId),
    // P3 8a — lead_touchpoints (migration 112) has been collecting
    // real multi-touch data all along; nothing ever read it for
    // attribution until now.
    supabase.from("lead_touchpoints").select("lead_id, channel, occurred_at").eq("dealership_id", dealershipId),
    // P3 8b/8c — repeat purchases were already recorded, just never
    // grouped per customer.
    supabase.from("orders").select("customer_phone, customer_name, total, created_at, payment_status, status").eq("dealership_id", dealershipId),
    // Previous equal-length window, for "vs previous period". Counts
    // only — head:true means no rows are transferred, just the count,
    // so the comparison costs three cheap index lookups rather than a
    // second full data fetch.
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).gte("created_at", prior.from).lt("created_at", prior.to),
    supabase.from("calls").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).gte("created_at", prior.from).lt("created_at", prior.to),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).gte("created_at", prior.from).lt("created_at", prior.to),
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

  // Trend — buckets derived from the SELECTED RANGE, adaptively
  // (daily / weekly / monthly by span).
  //
  // This replaces a hardcoded "last 6 months from today" that was
  // computed independently of the range. Once the underlying rows
  // became range-filtered, that combination was actively wrong: a
  // 7-day view rendered six month buckets with five of them empty.
  // Buckets and data must come from the same range or the chart
  // misrepresents the period it claims to show.
  const buckets = buildTrendBuckets(range);
  const countIn = (rows: { created_at: string }[] | null, b: { start: number; end: number }) =>
    (rows ?? []).filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= b.start && t < b.end;
    }).length;

  const monthlyTrend = buckets.map((b) => ({
    month: b.label, // key name kept — AnalyticsCharts already reads `month`
    leads: countIn(leads as any, b),
    calls: countIn(calls as any, b),
    appointments: countIn(appointments as any, b),
  }));

  // vs previous period — same length window immediately before.
  const deltas = {
    leads: computeDelta(leads?.length ?? 0, priorLeadCount ?? 0),
    calls: computeDelta(calls?.length ?? 0, priorCallCount ?? 0),
    appointments: computeDelta(appointments?.length ?? 0, priorAppointmentCount ?? 0),
  };

  // Campaign performance history. Every snapshot is a RUNNING TOTAL
  // (lifetime insights and all-time leads/revenue, once a day), so the
  // figures for any dates are differences between snapshots, never sums
  // — summing them counted a campaign's lifetime once per recorded day.
  // campaignHistory.ts does the arithmetic; CampaignHistorySection
  // applies the date slider in the browser.
  const history = perfHistory ?? [];

  // Meta campaign ids, to cross-reference with Ads Manager, and Hawlai's
  // own last-recorded status as the Status column's final fallback. The
  // LIVE status is read by the table itself after the page has drawn,
  // so Analytics never waits on Meta.
  const creativeIds = Array.from(new Set(history.map((r) => r.ad_creative_id)));
  const creativeInfo: Record<string, { metaCampaignId: string | null; localStatus: string | null }> = {};
  if (creativeIds.length > 0) {
    const { data } = await supabase
      .from("ad_creatives")
      .select("id, meta_campaign_id, meta_status")
      .eq("dealership_id", dealershipId)
      .in("id", creativeIds);
    for (const c of data ?? []) creativeInfo[c.id] = { metaCampaignId: c.meta_campaign_id ?? null, localStatus: c.meta_status ?? null };
  }

  // The overlay chart stays on the page's date picker. Daily changes,
  // like the charts below, clipped to the days the history covers.
  const historyDays = historyDates(history);
  const overlayFrom = historyDays.length ? (range.from.slice(0, 10) > historyDays[0] ? range.from.slice(0, 10) : historyDays[0]) : null;
  const overlayTo = historyDays.length ? (range.to.slice(0, 10) < historyDays[historyDays.length - 1] ? range.to.slice(0, 10) : historyDays[historyDays.length - 1]) : null;
  const overlayData = overlayFrom && overlayTo && overlayFrom <= overlayTo
    ? dailySeries(history, overlayFrom, overlayTo).map((d) => ({
        date: shortDate(d.date),
        spend: Math.round(d.spend),
        leads: d.leads,
        revenue: Math.round(d.revenue),
      }))
    : [];

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-0.5">Performance metrics and insights</p>
      </div>

      <AnalyticsToolbar />

      {/* KPI Metrics — governed by the date picker. Labelled with the
          active range so the numbers are never read as all-time. */}
      <PeriodComparison deltas={deltas} rangeLabel={range.label} />

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
      </div>

      <CampaignHistorySection history={history} creatives={creativeInfo} />

      <GrowthMetricsCard />
      <WebsiteAnalyticsCard />
    </div>
  );
}
