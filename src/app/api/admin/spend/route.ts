import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { projectMonthEndSpend, projectedBudgetWarning } from "@/lib/analytics/spendProjection";
import { computeMarginSuggestions } from "@/lib/analytics/marginOptimization";

// Usage/Pricing/Cost-Control spec, Section 17 (Admin Cost Dashboard).
// EXTENDS the existing admin spend view — verified before touching it
// that api_usage_logs already carries real, exact rows for gemini and
// elevenlabs (logGeminiImageUsage/logVeoVideoUsage/logElevenLabsUsage,
// all live since the P0-era usage-logging rollout) and that
// content_generation/graphic_design/video_generation all pass
// logContext through to those functions from their real generation
// call sites. The PREVIOUS version of this route never read those
// rows — it only pulled anthropic+vapi as "exact" and then separately
// multiplied content_pieces/graphic_designs/video_generations row
// counts by flat per-unit guesses as "estimated", which DOUBLE-COUNTED
// cost that was already exactly logged. Fixed here: gemini/elevenlabs
// now count as exact; "estimated" is recomputed as the genuine GAP
// (rows in those tables with no matching exact log this month), not
// a blanket re-guess of everything.
const ESTIMATE_RATES_INR = { perContentPiece: 2, perImage: 3, perVideo: 40 };

function monthBounds(monthParam: string | null): { start: Date; label: string } {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), label: monthParam };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}` };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  // Filters (Section 17) — date (month) and dealership narrow the
  // actual DB query; plan/provider/feature are returned as breakdown
  // dimensions (byProvider/byOperation/byPlan) rather than each
  // needing its own query-param combination, so the admin UI can
  // inspect/filter by them without a combinatorial API surface.
  const { searchParams } = new URL(request.url);
  const { start: monthStart, label: monthLabel } = monthBounds(searchParams.get("month"));
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const dealershipFilter = searchParams.get("dealershipId");
  const since = monthStart.toISOString();
  const until = monthEnd.toISOString();

  const service = createServiceClient();

  const [{ data: usageLogs }, { data: content }, { data: images }, { data: videos }, { data: dealerships }, { data: planLimitsRows }, { data: callingRows }, { data: alertSetting }] = await Promise.all([
    service.from("api_usage_logs").select("dealership_id, service, operation, input_tokens, output_tokens, duration_seconds, cost_inr, created_at").gte("created_at", since).lt("created_at", until),
    service.from("content_pieces").select("dealership_id").gte("created_at", since).lt("created_at", until),
    service.from("graphic_designs").select("dealership_id").gte("created_at", since).lt("created_at", until),
    service.from("video_generations").select("dealership_id").gte("created_at", since).lt("created_at", until),
    service.from("dealerships").select("id, dealership_name, plan"),
    service.from("plan_limits").select("plan, price_inr"),
    // Real overage revenue — same source /dashboard/billing already
    // shows the customer, so admin totals never diverge from what a
    // business is actually being asked to pay.
    service.from("calling_minutes_usage").select("dealership_id, extra_charge_inr").eq("billing_month", `${monthStart.toISOString().slice(0, 8)}01`),
    service.from("platform_settings").select("value").eq("key", "daily_spend_alert_inr").maybeSingle(),
  ]);

  const priceByPlan = new Map((planLimitsRows ?? []).map((r: any) => [r.plan, r.price_inr as number]));
  const overageByDealership = new Map((callingRows ?? []).map((r: any) => [r.dealership_id, Number(r.extra_charge_inr) || 0]));

  const logs = (usageLogs ?? []).filter((l) => !dealershipFilter || l.dealership_id === dealershipFilter);
  const byService = (svc: string) => logs.filter((l) => l.service === svc);

  const claudeLogs = byService("anthropic");
  const vapiLogs = byService("vapi");
  const geminiLogs = byService("gemini");
  const elevenlabsLogs = byService("elevenlabs");
  const perplexityLogs = byService("perplexity");

  const sumCost = (rows: typeof logs) => rows.reduce((sum, l) => sum + Number(l.cost_inr), 0);
  const exactClaudeCostInr = sumCost(claudeLogs);
  const exactVapiCostInr = sumCost(vapiLogs);
  const exactGeminiCostInr = sumCost(geminiLogs);
  const exactElevenLabsCostInr = sumCost(elevenlabsLogs);
  const exactPerplexityCostInr = sumCost(perplexityLogs);
  const exactTotalCostInr = exactClaudeCostInr + exactVapiCostInr + exactGeminiCostInr + exactElevenLabsCostInr + exactPerplexityCostInr;

  const totalCallMinutes = vapiLogs.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0) / 60;
  const totalMasterChatMessages = claudeLogs.filter((l) => l.operation === "master_chat").length;

  // Genuine gap only — rows in content_pieces/graphic_designs/
  // video_generations with no matching exact log this month, not a
  // blanket re-guess of already-logged operations.
  const contentRows = (content ?? []).filter((c) => !dealershipFilter || c.dealership_id === dealershipFilter);
  const imageRows = (images ?? []).filter((c) => !dealershipFilter || c.dealership_id === dealershipFilter);
  const videoRows = (videos ?? []).filter((c) => !dealershipFilter || c.dealership_id === dealershipFilter);
  const contentLoggedCount = claudeLogs.filter((l) => l.operation === "content_generation").length;
  const imageLoggedCount = geminiLogs.filter((l) => l.operation === "graphic_design").length;
  const videoLoggedCount = geminiLogs.filter((l) => l.operation === "video_generation").length;
  const unloggedContent = Math.max(0, contentRows.length - contentLoggedCount);
  const unloggedImages = Math.max(0, imageRows.length - imageLoggedCount);
  const unloggedVideos = Math.max(0, videoRows.length - videoLoggedCount);
  const estimatedGapCostInr = unloggedContent * ESTIMATE_RATES_INR.perContentPiece + unloggedImages * ESTIMATE_RATES_INR.perImage + unloggedVideos * ESTIMATE_RATES_INR.perVideo;

  const cogsInr = exactTotalCostInr + estimatedGapCostInr;

  // Revenue — Section 17. No invoices/billing_events table exists yet
  // (Section 24's suggested tables, not built), so this is each
  // dealership's CURRENT plan price, applied uniformly, plus real
  // calling-overage charges for the selected month. Accurate for the
  // current month; for a past month this reflects "if everyone were
  // on today's plan," not necessarily what was actually billed then —
  // labeled as such in the response rather than presented as
  // historical fact.
  const allDealerships = (dealerships ?? []).filter((d) => !dealershipFilter || d.id === dealershipFilter);
  const subscriptionRevenueInr = allDealerships.reduce((sum, d) => sum + (priceByPlan.get(d.plan ?? "free") ?? 0), 0);
  const overageRevenueInr = allDealerships.reduce((sum, d) => sum + (overageByDealership.get(d.id) ?? 0), 0);
  const revenueInr = subscriptionRevenueInr + overageRevenueInr;
  const grossProfitInr = revenueInr - cogsInr;
  const grossMarginPct = revenueInr > 0 ? (grossProfitInr / revenueInr) * 100 : null;

  const byPlan = new Map<string, { dealerships: number; revenueInr: number; costInr: number }>();
  for (const d of allDealerships) {
    const plan = d.plan ?? "free";
    const entry = byPlan.get(plan) ?? { dealerships: 0, revenueInr: 0, costInr: 0 };
    entry.dealerships += 1;
    entry.revenueInr += (priceByPlan.get(plan) ?? 0) + (overageByDealership.get(d.id) ?? 0);
    entry.costInr += logs.filter((l) => l.dealership_id === d.id).reduce((s, l) => s + Number(l.cost_inr), 0);
    byPlan.set(plan, entry);
  }

  const byOperation = new Map<string, number>();
  for (const l of logs) byOperation.set(l.operation, (byOperation.get(l.operation) ?? 0) + Number(l.cost_inr));

  const perDealership = allDealerships.map((d) => {
    const dLogs = logs.filter((l) => l.dealership_id === d.id);
    const dExactCost = sumCost(dLogs);
    const dContent = contentRows.filter((c) => c.dealership_id === d.id).length;
    const dImages = imageRows.filter((c) => c.dealership_id === d.id).length;
    const dVideos = videoRows.filter((c) => c.dealership_id === d.id).length;
    const dRevenue = (priceByPlan.get(d.plan ?? "free") ?? 0) + (overageByDealership.get(d.id) ?? 0);
    const dCost = Math.round(dExactCost * 100) / 100; // gap estimate isn't split per-dealership below unit granularity
    return {
      id: d.id, name: d.dealership_name, plan: d.plan ?? "free",
      exactCostInr: dCost,
      revenueInr: Math.round(dRevenue * 100) / 100,
      grossProfitInr: Math.round((dRevenue - dCost) * 100) / 100,
      calls: dLogs.filter((l) => l.service === "vapi").length, content: dContent, images: dImages, videos: dVideos,
    };
  }).filter((d) => d.exactCostInr > 0 || d.revenueInr > 0)
    .sort((a, b) => b.revenueInr - b.exactCostInr - (a.revenueInr - a.exactCostInr));

  // Daily spend alert threshold (Phase 3b) — shown so the operator
  // can see what it's currently set to alongside the actual numbers.
  const alertThresholdInr = Number(alertSetting?.value);
  const dailySpendAlertInr = Number.isFinite(alertThresholdInr) && alertThresholdInr > 0 ? alertThresholdInr : null;

  // Predictive cost monitoring (Phase 4 / 3) — CURRENT MONTH ONLY.
  // This route can also render a past month, where "at this rate the
  // month will reach X" is meaningless: the month already ended and
  // the real total is right there. Returned as null in that case so
  // the UI shows nothing rather than a nonsense projection.
  const now = new Date();
  const isCurrentMonth =
    monthStart.getUTCFullYear() === now.getUTCFullYear() && monthStart.getUTCMonth() === now.getUTCMonth();
  const projection = isCurrentMonth ? projectMonthEndSpend(logs, now) : null;
  const projectionWarning = projection ? projectedBudgetWarning(projection, dailySpendAlertInr) : null;

  // Margin optimization (Phase 4 / 4) — rule-based findings over the
  // real revenue/cost numbers computed above, not AI-generated.
  const byPlanObject = Object.fromEntries(
    Array.from(byPlan.entries()).map(([k, v]) => [k, { dealerships: v.dealerships, revenueInr: Math.round(v.revenueInr * 100) / 100, costInr: Math.round(v.costInr * 100) / 100 }])
  );
  const byOperationObject = Object.fromEntries(Array.from(byOperation.entries()).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  const marginSuggestions = computeMarginSuggestions({
    revenueInr: Math.round(revenueInr * 100) / 100,
    cogsInr: Math.round(cogsInr * 100) / 100,
    grossMarginPct: grossMarginPct === null ? null : Math.round(grossMarginPct * 10) / 10,
    byPlan: byPlanObject,
    byOperation: byOperationObject,
    perDealership,
  });

  return NextResponse.json({
    month: monthLabel,
    since,
    filters: { dealershipId: dealershipFilter ?? null },
    dailySpendAlertInr,
    projection,
    projectionWarning,
    revenue: {
      totalInr: Math.round(revenueInr * 100) / 100,
      subscriptionInr: Math.round(subscriptionRevenueInr * 100) / 100,
      overageInr: Math.round(overageRevenueInr * 100) / 100,
      basis: "Each business's current plan price + this month's real calling overage. No billing/invoice history exists yet, so past months reflect today's plan assignments, not necessarily what was actually charged then.",
    },
    cogs: {
      totalInr: Math.round(cogsInr * 100) / 100,
      exactInr: Math.round(exactTotalCostInr * 100) / 100,
      estimatedGapInr: Math.round(estimatedGapCostInr),
    },
    grossProfitInr: Math.round(grossProfitInr * 100) / 100,
    grossMarginPct: grossMarginPct === null ? null : Math.round(grossMarginPct * 10) / 10,
    exact: {
      claudeCostInr: Math.round(exactClaudeCostInr * 100) / 100,
      vapiCostInr: Math.round(exactVapiCostInr * 100) / 100,
      geminiCostInr: Math.round(exactGeminiCostInr * 100) / 100,
      elevenLabsCostInr: Math.round(exactElevenLabsCostInr * 100) / 100,
      perplexityCostInr: Math.round(exactPerplexityCostInr * 100) / 100,
      totalCostInr: Math.round(exactTotalCostInr * 100) / 100,
      masterChatMessages: totalMasterChatMessages,
      callCount: vapiLogs.length,
      callMinutes: Math.round(totalCallMinutes),
    },
    estimated: {
      costInr: Math.round(estimatedGapCostInr),
      content: unloggedContent,
      images: unloggedImages,
      videos: unloggedVideos,
      note: "Only the genuine gap — content/image/video generations this month with no matching exact-cost log. Most generation paths already log exact cost; this should normally be small or zero.",
    },
    byProvider: {
      anthropic: Math.round(exactClaudeCostInr * 100) / 100,
      vapi: Math.round(exactVapiCostInr * 100) / 100,
      gemini: Math.round(exactGeminiCostInr * 100) / 100,
      elevenlabs: Math.round(exactElevenLabsCostInr * 100) / 100,
      perplexity: Math.round(exactPerplexityCostInr * 100) / 100,
    },
    byOperation: byOperationObject,
    byPlan: byPlanObject,
    marginSuggestions,
    perDealership,
    totalDealerships: allDealerships.length,
  });
}
