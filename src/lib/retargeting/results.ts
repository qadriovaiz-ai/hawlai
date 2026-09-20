// What retargeting actually brought back, per audience (Retargeting R5,
// approved 2026-09-20).
//
// Counted from the business's OWN records, not from Meta: an ad launched
// for an audience records which one it was for (ad_creatives
// .retarget_audience_key, migration 194), Meta gives back the campaign id,
// and orders and leads already carry the campaign they came from. So an
// order tagged with a retargeting campaign is a sale that campaign brought
// back, and a booking made by a lead from it is a booking it brought back.
//
// WHAT THIS IS NOT: Meta's own attribution. Meta counts a conversion when
// someone SAW an ad and later bought, across devices, for up to 7 days —
// a different and usually larger number. These are only the orders and
// bookings that arrived through the link in the ad, which is the number
// the owner can check against their own orders list.
//
// Everything is filtered by the business, and by the audience's exact id,
// so a tier's results are that tier's.

export type AudienceResults = {
  /** Ads launched for this audience that Meta gave a campaign id for. */
  campaigns: number;
  orders: number;
  revenueInr: number;
  /** Enquiries that came from those campaigns. */
  leads: number;
  /** Bookings made by those enquirers. */
  bookings: number;
  /** When the first of those ads went out — what the numbers are "since". */
  since: string | null;
};

export const EMPTY_RESULTS: AudienceResults = { campaigns: 0, orders: 0, revenueInr: 0, leads: 0, bookings: 0, since: null };

/**
 * Results for every audience this business has advertised to, by audience id.
 *
 * @param since only ads launched on or after this — what a quarter brought
 *   back is what its own ads brought back (Strategy step 5).
 */
export async function resultsByAudience(service: any, dealershipId: string, since?: string | null): Promise<Record<string, AudienceResults>> {
  let query = service
    .from("ad_creatives")
    .select("retarget_audience_key, meta_campaign_id, created_at")
    .eq("dealership_id", dealershipId)
    .not("retarget_audience_key", "is", null)
    .not("meta_campaign_id", "is", null);
  if (since) query = query.gte("created_at", since);
  const { data: ads } = await query;

  const byCampaign = new Map<string, string>();
  const out: Record<string, AudienceResults> = {};
  for (const ad of ads ?? []) {
    const key = String(ad.retarget_audience_key);
    const campaign = String(ad.meta_campaign_id);
    if (!key || !campaign) continue;
    byCampaign.set(campaign, key);
    const row = (out[key] ??= { ...EMPTY_RESULTS });
    row.campaigns += 1;
    const at = ad.created_at ? String(ad.created_at) : null;
    if (at && (!row.since || at < row.since)) row.since = at;
  }
  if (byCampaign.size === 0) return out;

  const campaigns = [...byCampaign.keys()];
  const [{ data: orders }, { data: leads }] = await Promise.all([
    service.from("orders").select("meta_campaign_id, total, status").eq("dealership_id", dealershipId).in("meta_campaign_id", campaigns),
    service.from("leads").select("id, meta_campaign_id").eq("dealership_id", dealershipId).in("meta_campaign_id", campaigns),
  ]);

  for (const o of orders ?? []) {
    // A cancelled order isn't money brought back.
    if (String(o.status ?? "") === "cancelled") continue;
    const key = byCampaign.get(String(o.meta_campaign_id));
    if (!key) continue;
    out[key].orders += 1;
    out[key].revenueInr += Number(o.total) || 0;
  }

  const leadKeys = new Map<string, string>();
  for (const l of leads ?? []) {
    const key = byCampaign.get(String(l.meta_campaign_id));
    if (!key) continue;
    out[key].leads += 1;
    leadKeys.set(String(l.id), key);
  }

  if (leadKeys.size > 0) {
    const { data: appointments } = await service
      .from("appointments")
      .select("lead_id, status")
      .eq("dealership_id", dealershipId)
      .in("lead_id", [...leadKeys.keys()]);
    for (const a of appointments ?? []) {
      if (String(a.status ?? "") === "cancelled") continue;
      const key = leadKeys.get(String(a.lead_id));
      if (key) out[key].bookings += 1;
    }
  }

  for (const key of Object.keys(out)) out[key].revenueInr = Math.round(out[key].revenueInr);
  return out;
}

/** The line under a card: what this audience brought back, or that it hasn't yet. */
export function resultsLine(r: AudienceResults | undefined): string | null {
  if (!r || r.campaigns === 0) return null;
  const parts: string[] = [];
  if (r.orders > 0) parts.push(`${r.orders} order${r.orders === 1 ? "" : "s"}${r.revenueInr > 0 ? ` · ₹${r.revenueInr.toLocaleString("en-IN")}` : ""}`);
  if (r.bookings > 0) parts.push(`${r.bookings} booking${r.bookings === 1 ? "" : "s"}`);
  if (r.leads > 0 && r.bookings === 0) parts.push(`${r.leads} enquir${r.leads === 1 ? "y" : "ies"}`);
  if (parts.length === 0) return `Nothing back yet from ${r.campaigns} ad${r.campaigns === 1 ? "" : "s"} to this group.`;
  return `Brought back: ${parts.join(" · ")}`;
}
