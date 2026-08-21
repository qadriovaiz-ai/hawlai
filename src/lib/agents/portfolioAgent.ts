// ------------------------------------------------------------------
// Agency portfolio / cross-client overview — master audit Part E1.
// ------------------------------------------------------------------
// Deliberately built from the same plain-Postgres queries every
// single-business page already uses (leads, calls, appointments,
// pending_approvals, campaign_performance_history) — batched with
// .in("dealership_id", ids) instead of looping per business, and
// reading the daily campaign_performance_history snapshot rather than
// making N live Meta API calls. No AI generation (health score,
// growth report) here on purpose: those are one live Claude call per
// business, fine for a single detail page, too expensive to run for
// every card on a portfolio grid or every casual drill-in click.
// ------------------------------------------------------------------

export interface PortfolioBusinessSummary {
  id: string;
  dealershipName: string;
  city: string | null;
  plan: string;
  totalLeads: number;
  hotLeads: number;
  pendingApprovals: number;
  callsMade: number;
  appointments: number;
  spend: number;
  campaignLeads: number;
  // Already computed internally to derive roas — exposed so the
  // portfolio aggregate can sum real revenue rather than reverse it
  // out of roas (which loses the value entirely when spend is 0).
  revenue: number;
  roas: number | null;
}

export interface PortfolioTotals {
  businessCount: number;
  totalLeads: number;
  hotLeads: number;
  pendingApprovals: number;
  callsMade: number;
  appointments: number;
  spend: number;
  revenue: number;
  // Blended: total revenue / total spend, NOT the average of each
  // business's roas — averaging ratios would let a tiny-spend
  // business with a freak return distort the whole portfolio.
  blendedRoas: number | null;
}

export function computePortfolioTotals(summaries: PortfolioBusinessSummary[]): PortfolioTotals {
  const totals = summaries.reduce(
    (acc, b) => ({
      totalLeads: acc.totalLeads + b.totalLeads,
      hotLeads: acc.hotLeads + b.hotLeads,
      pendingApprovals: acc.pendingApprovals + b.pendingApprovals,
      callsMade: acc.callsMade + b.callsMade,
      appointments: acc.appointments + b.appointments,
      spend: acc.spend + b.spend,
      revenue: acc.revenue + b.revenue,
    }),
    { totalLeads: 0, hotLeads: 0, pendingApprovals: 0, callsMade: 0, appointments: 0, spend: 0, revenue: 0 }
  );
  return {
    businessCount: summaries.length,
    ...totals,
    blendedRoas: totals.spend > 0 ? totals.revenue / totals.spend : null,
  };
}

async function batchCounts(supabase: any, table: string, ids: string[], extraFilter?: (q: any) => any) {
  if (ids.length === 0) return new Map<string, number>();
  let query = supabase.from(table).select("dealership_id").in("dealership_id", ids);
  if (extraFilter) query = extraFilter(query);
  const { data } = await query;
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.dealership_id, (counts.get(row.dealership_id) ?? 0) + 1);
  return counts;
}

export async function getPortfolioSummaries(supabase: any, ownerId: string): Promise<PortfolioBusinessSummary[]> {
  const { data: dealerships } = await supabase
    .from("dealerships")
    .select("id, dealership_name, city, plan")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (!dealerships || dealerships.length === 0) return [];

  const ids = dealerships.map((d: any) => d.id);

  const [{ data: leads }, pendingApprovals, callsCount, appointmentsCount, { data: latestSnapshot }] = await Promise.all([
    supabase.from("leads").select("dealership_id, lead_temperature").in("dealership_id", ids),
    batchCounts(supabase, "pending_approvals", ids, (q) => q.eq("status", "pending")),
    batchCounts(supabase, "calls", ids),
    batchCounts(supabase, "appointments", ids),
    supabase
      .from("campaign_performance_history")
      .select("dealership_id, snapshot_date, spend, leads, revenue")
      .in("dealership_id", ids)
      .order("snapshot_date", { ascending: false })
      .limit(500),
  ]);

  const leadCounts = new Map<string, { total: number; hot: number }>();
  for (const l of leads ?? []) {
    const entry = leadCounts.get(l.dealership_id) ?? { total: 0, hot: 0 };
    entry.total++;
    if (l.lead_temperature === "hot") entry.hot++;
    leadCounts.set(l.dealership_id, entry);
  }

  // latestSnapshot is ordered snapshot_date desc across ALL
  // dealerships/campaigns — a dealership can have several campaign
  // rows sharing its most recent date. First pass finds that date per
  // dealership (the first occurrence seen, since iteration is
  // globally date-desc); second pass sums only rows matching it, so
  // an older day's rows for the same dealership are never mixed in.
  const latestDatePerDealership = new Map<string, string>();
  for (const row of latestSnapshot ?? []) {
    if (!latestDatePerDealership.has(row.dealership_id)) latestDatePerDealership.set(row.dealership_id, row.snapshot_date);
  }
  const campaignTotals = new Map<string, { spend: number; leads: number; revenue: number }>();
  for (const row of latestSnapshot ?? []) {
    if (row.snapshot_date !== latestDatePerDealership.get(row.dealership_id)) continue;
    const existing = campaignTotals.get(row.dealership_id);
    if (existing) {
      existing.spend += row.spend ?? 0;
      existing.leads += row.leads ?? 0;
      existing.revenue += row.revenue ?? 0;
    } else {
      campaignTotals.set(row.dealership_id, { spend: row.spend ?? 0, leads: row.leads ?? 0, revenue: row.revenue ?? 0 });
    }
  }

  return dealerships.map((d: any) => {
    const lead = leadCounts.get(d.id) ?? { total: 0, hot: 0 };
    const campaign = campaignTotals.get(d.id) ?? { spend: 0, leads: 0, revenue: 0 };
    return {
      id: d.id,
      dealershipName: d.dealership_name,
      city: d.city,
      plan: d.plan,
      totalLeads: lead.total,
      hotLeads: lead.hot,
      pendingApprovals: pendingApprovals.get(d.id) ?? 0,
      callsMade: callsCount.get(d.id) ?? 0,
      appointments: appointmentsCount.get(d.id) ?? 0,
      spend: campaign.spend,
      campaignLeads: campaign.leads,
      revenue: campaign.revenue,
      roas: campaign.spend > 0 ? campaign.revenue / campaign.spend : null,
    };
  });
}

export interface BusinessDetailSummary {
  dealershipName: string;
  city: string | null;
  plan: string;
  totalLeads: number;
  hotLeads: number;
  pendingApprovals: number;
  recentLeads: { id: string; name: string; lead_temperature: string; ai_score: number; created_at: string }[];
  recentCalls: { id: string; status: string; summary: string | null; created_at: string }[];
  recentAppointments: { id: string; appointment_date: string; status: string; appointment_type: string }[];
}

export async function getBusinessDetailSummary(supabase: any, dealershipId: string): Promise<BusinessDetailSummary | null> {
  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, city, plan").eq("id", dealershipId).maybeSingle();
  if (!dealership) return null;

  const [{ data: leads }, { data: pending }, { data: recentCalls }, { data: recentAppointments }] = await Promise.all([
    supabase.from("leads").select("id, name, lead_temperature, ai_score, created_at").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(200),
    supabase.from("pending_approvals").select("id").eq("dealership_id", dealershipId).eq("status", "pending"),
    supabase.from("calls").select("id, status, summary, created_at").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(5),
    supabase.from("appointments").select("id, appointment_date, status, appointment_type").eq("dealership_id", dealershipId).order("appointment_date", { ascending: false }).limit(5),
  ]);

  const allLeads = leads ?? [];
  return {
    dealershipName: dealership.dealership_name,
    city: dealership.city,
    plan: dealership.plan,
    totalLeads: allLeads.length,
    hotLeads: allLeads.filter((l: any) => l.lead_temperature === "hot").length,
    pendingApprovals: pending?.length ?? 0,
    recentLeads: allLeads.slice(0, 5),
    recentCalls: recentCalls ?? [],
    recentAppointments: recentAppointments ?? [],
  };
}
