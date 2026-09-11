// The one set of numbers a report is built from.
//
// WHY: the Reports page's AI summary said "Trace where the ₹550 revenue
// came from" directly beside a Revenue card showing ₹0. They were two
// different numbers from two different places: the card summed leads'
// deal values (₹0), while the Health Score text came from the growth
// report, which counted campaign-attributed revenue including a real
// ₹550 website order. Neither was wrong about its own definition; the
// page just never used one.
//
// Everything a report says — the cards, the executive summary, the
// health-score narrative — now comes from this one object, gathered
// once (reportBundle.ts), with one definition of each figure.
//
// NOT AFFECTED by the snapshot over-counting fixed for Analytics: ad
// spend here is Meta's live lifetime total per campaign (insights with
// date_preset=maximum, read with the user-token-first ads token and
// retries), not a sum of daily campaign_performance_history snapshots.

import { getCampaignPerformanceState } from "@/lib/agents/analyticsAgent";

/** Paid, real orders — the same statuses campaign attribution counts. */
export const PAID_ORDER_STATUSES = new Set(["confirmed", "shipped", "delivered"]);

export interface BusinessNumbers {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  convertedLeads: number;
  leadsByStage: Record<string, number>;
  pendingApprovals: number;
  campaignsLaunched: number;
  liveCampaigns: number;
  /** false when the Meta account is disconnected or the load failed, so consumers can label the gap instead of printing zeros. */
  adDataReadable: boolean;
  adDataState: "ok" | "no_data" | "not_connected" | "error";
  /** null when ad data couldn't be read. Never conflate with 0. */
  totalSpend: number | null;
  costPerLead: number | null;
  /** Converted leads' deal values. */
  leadRevenue: number;
  /** Paid website orders. */
  orderRevenue: number;
  paidOrders: number;
  /** leadRevenue + orderRevenue — what the Revenue card shows. */
  totalRevenue: number;
  /** Revenue credited to ad campaigns; null when ad data couldn't be read. */
  adAttributedRevenue: number | null;
  /** adAttributedRevenue / totalSpend. */
  roas: number | null;
  appointmentsScheduled: number;
  appointmentsCompleted: number;
  callsMade: number;
  onboardingCompleted: boolean;
}

const money = (v: number) => Math.round(v * 100) / 100;

export async function gatherBusinessNumbers(supabase: any, dealershipId: string): Promise<BusinessNumbers> {
  const [leadsR, approvalsR, campaignsR, apptsR, callsR, ordersR, dealershipR, performance] = await Promise.all([
    supabase.from("leads").select("lead_temperature, status, deal_value").eq("dealership_id", dealershipId),
    supabase.from("pending_approvals").select("id").eq("dealership_id", dealershipId).eq("status", "pending"),
    supabase.from("ad_creatives").select("id").eq("dealership_id", dealershipId).eq("status", "launched"),
    supabase.from("appointments").select("status").eq("dealership_id", dealershipId),
    supabase.from("calls").select("id").eq("dealership_id", dealershipId),
    supabase.from("orders").select("total, status").eq("dealership_id", dealershipId),
    supabase.from("dealerships").select("onboarding_completed").eq("id", dealershipId).maybeSingle(),
    getCampaignPerformanceState(supabase, dealershipId),
  ]);

  for (const [label, r] of [["leads", leadsR], ["approvals", approvalsR], ["campaigns", campaignsR], ["appointments", apptsR], ["calls", callsR], ["orders", ordersR]] as const) {
    if (r?.error) console.error(`[business-numbers] ${label} read failed:`, r.error.message);
  }

  const leads: any[] = leadsR?.data ?? [];
  const leadsByStage: Record<string, number> = {};
  for (const l of leads) leadsByStage[l.status] = (leadsByStage[l.status] ?? 0) + 1;
  const converted = leads.filter((l) => l.status === "converted");
  const leadRevenue = money(converted.reduce((s, l) => s + (Number(l.deal_value) || 0), 0));

  const paid = (ordersR?.data ?? []).filter((o: any) => PAID_ORDER_STATUSES.has(o.status));
  const orderRevenue = money(paid.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0));

  const state = performance.state as BusinessNumbers["adDataState"];
  const perf = performance.state === "ok" ? performance.value : null;
  const totalSpend = perf ? perf.totals.spend : null;
  const adAttributedRevenue = perf ? money(perf.campaigns.reduce((s, c) => s + (c.revenue ?? 0), 0)) : state === "no_data" ? 0 : null;
  const appts: any[] = apptsR?.data ?? [];

  return {
    totalLeads: leads.length,
    hotLeads: leads.filter((l) => l.lead_temperature === "hot").length,
    warmLeads: leads.filter((l) => l.lead_temperature === "warm").length,
    coldLeads: leads.filter((l) => l.lead_temperature === "cold").length,
    convertedLeads: converted.length,
    leadsByStage,
    pendingApprovals: (approvalsR?.data ?? []).length,
    campaignsLaunched: (campaignsR?.data ?? []).length,
    liveCampaigns: perf ? perf.campaigns.filter((c) => c.meta_status === "ACTIVE").length : 0,
    adDataReadable: state === "ok",
    adDataState: state,
    totalSpend,
    costPerLead: perf?.totals.cost_per_lead ?? null,
    leadRevenue,
    orderRevenue,
    paidOrders: paid.length,
    totalRevenue: money(leadRevenue + orderRevenue),
    adAttributedRevenue,
    roas: totalSpend !== null && totalSpend > 0 && adAttributedRevenue !== null ? adAttributedRevenue / totalSpend : null,
    appointmentsScheduled: appts.filter((a) => a.status === "scheduled").length,
    appointmentsCompleted: appts.filter((a) => a.status === "completed").length,
    callsMade: (callsR?.data ?? []).length,
    onboardingCompleted: Boolean(dealershipR?.data?.onboarding_completed),
  };
}
