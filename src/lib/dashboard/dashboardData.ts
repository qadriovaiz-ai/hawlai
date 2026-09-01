// ------------------------------------------------------------------
// Dashboard data layer.
// ------------------------------------------------------------------
// The organising idea is §4.4: "not connected", "connected but no data
// yet", and "we couldn't load it" are THREE DIFFERENT ANSWERS, and
// collapsing them into a rendered 0 is a correctness bug, not a
// display choice. So every figure on this surface is returned as a
// Loaded<T> that names which of those it is, and the components have
// no way to render a number without first handling the other cases.
//
// This is not hypothetical here. analyticsAgent's getCampaignPerformance
// returns `{ spend: 0, leads: 0 }` when the Meta token is MISSING —
// identical to a genuinely idle campaign. That value has been feeding
// the Home screen, where "you spent ₹0" and "we can't see your ad
// account" look the same. This layer does not call it.
//
// NOT INCLUDED, by confirmed decision: reach and engagement rate. No
// organic insights are ingested anywhere in this codebase, so those
// two KPIs have no data source at all. They arrive when Meta Graph
// organic ingestion does — as its own initiative, not as a tile
// quietly filled with zeros.
// ------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDelta, previousPeriod, type ResolvedRange, type MetricDelta } from "@/lib/analytics/dateRange";

export type ChannelKey = "meta_ads" | "meta_page" | "whatsapp" | "google_ads";

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  meta_ads: "Meta Ads",
  meta_page: "Facebook & Instagram",
  whatsapp: "WhatsApp",
  google_ads: "Google Ads",
};

/**
 * A value that knows why it might be absent.
 *
 * `no_data` carries the reason so the empty state can explain what
 * would fill it, rather than showing a shrug.
 */
export type Loaded<T> =
  | { state: "ok"; value: T }
  | { state: "not_connected"; channel: ChannelKey }
  | { state: "no_data"; reason: string }
  | { state: "error"; message: string };

export interface Connections {
  metaPage: boolean;
  metaAds: boolean;
  whatsapp: boolean;
  googleAds: boolean;
}

/**
 * Connection state is derived from the dealership row, matching what
 * Settings → Integrations already does (`isMetaConnected = !!fb_page_id`).
 * There is no connection-status table in this schema, and inventing one
 * would put a second source of truth next to the credentials that
 * actually decide whether a call can be made.
 */
export function readConnections(dealership: Record<string, any> | null | undefined): Connections {
  return {
    metaPage: Boolean(dealership?.fb_page_id),
    metaAds: Boolean(dealership?.fb_ad_account_id),
    whatsapp: Boolean(dealership?.owner_whatsapp_verified),
    googleAds: Boolean(dealership?.google_ads_customer_id),
  };
}

export const DEALERSHIP_CONNECTION_FIELDS =
  "fb_page_id, fb_ad_account_id, owner_whatsapp_verified, google_ads_customer_id";

// ---------------- Channel attribution ----------------

// Raw `leads.source` values mapped to what a customer would call the
// channel. Same rule the activity feed established: internal strings
// are translated, and anything unrecognised is grouped rather than
// shown raw.
//
// Note `meta_ads_paid` is its own bucket and NOT split into Facebook
// vs Instagram. Meta reports paid placements together and we don't
// store which one delivered, so splitting it would mean inventing the
// division.
const SOURCE_TO_CHANNEL: Record<string, string> = {
  instagram: "Instagram",
  dm_instagram: "Instagram",
  dm_facebook: "Facebook",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  dm_whatsapp: "WhatsApp",
  meta_ads_paid: "Paid ads",
  website: "Website",
  booking_page: "Website",
  shopify: "Website",
  woocommerce: "Website",
  inbound_call: "Phone",
  ai_sales_agent: "Phone",
  email: "Email",
};

/**
 * Google is deliberately absent from the map above.
 *
 * Nothing in this codebase ever writes a Google lead source — no
 * organic search, no Google Ads lead attribution. A "Google" bar would
 * therefore sit at zero forever, which reads as "Google sends you
 * nothing" when the truth is "we don't track it". Per §4.4 that's the
 * exact failure this layer exists to prevent, so the channel isn't
 * listed at all until something populates it.
 */
export const UNTRACKED_CHANNELS = ["Google"] as const;

export interface ChannelCount {
  channel: string;
  leads: number;
}

export function channelBreakdown(sources: (string | null)[]): ChannelCount[] {
  const counts = new Map<string, number>();
  for (const raw of sources) {
    const channel = SOURCE_TO_CHANNEL[raw ?? ""] ?? "Other";
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([channel, leads]) => ({ channel, leads }))
    .sort((a, b) => b.leads - a.leads);
}

// ---------------- KPIs ----------------

export interface DashboardKpis {
  newLeads: Loaded<MetricDelta>;
  adSpend: Loaded<MetricDelta>;
  /** null current value means "spend recorded but no leads" — not zero cost. */
  costPerLead: Loaded<{ current: number | null; previous: number | null }>;
}

export interface CampaignRow {
  name: string;
  platform: string;
  status: string;
  spend: number;
  leads: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  channels: Loaded<ChannelCount[]>;
  campaigns: Loaded<CampaignRow[]>;
  connections: Connections;
}

/** Rounds money to paise, so summed numerics don't surface floating-point dust. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getDashboardData(
  supabase: SupabaseClient,
  dealershipId: string,
  range: ResolvedRange,
  connections: Connections
): Promise<DashboardData> {
  const prev = previousPeriod(range);

  // allSettled so one failing source degrades to its own error state
  // instead of blanking the surface — the same reasoning the Home page
  // already applies to its five sources.
  const [leadsRes, prevLeadsRes, perfRes, prevPerfRes, creativesRes] = await Promise.allSettled([
    supabase
      .from("leads")
      .select("source, created_at")
      .eq("dealership_id", dealershipId)
      .gte("created_at", range.from)
      .lt("created_at", range.to),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("dealership_id", dealershipId)
      .gte("created_at", prev.from)
      .lt("created_at", prev.to),
    supabase
      .from("campaign_performance_history")
      .select("ad_creative_id, headline, spend, leads, snapshot_date")
      .eq("dealership_id", dealershipId)
      .gte("snapshot_date", range.from.slice(0, 10))
      .lt("snapshot_date", range.to.slice(0, 10)),
    supabase
      .from("campaign_performance_history")
      .select("spend, leads")
      .eq("dealership_id", dealershipId)
      .gte("snapshot_date", prev.from.slice(0, 10))
      .lt("snapshot_date", prev.to.slice(0, 10)),
    supabase
      .from("ad_creatives")
      .select("id, headline, meta_status")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched"),
  ]);

  // ---- New leads ----
  let newLeads: Loaded<MetricDelta>;
  if (leadsRes.status !== "fulfilled" || leadsRes.value.error) {
    newLeads = { state: "error", message: "Couldn't load your leads." };
  } else {
    const current = leadsRes.value.data?.length ?? 0;
    const previous = prevLeadsRes.status === "fulfilled" ? prevLeadsRes.value.count ?? 0 : 0;
    // Leads aren't gated on any channel — a walk-in typed in by hand is
    // still a lead — so this never reports "not connected".
    newLeads =
      current === 0 && previous === 0
        ? { state: "no_data", reason: "No leads yet in this period. New enquiries from your ads, website and WhatsApp land here." }
        : { state: "ok", value: computeDelta(current, previous) };
  }

  // ---- Ad spend & cost per lead ----
  let adSpend: Loaded<MetricDelta>;
  let costPerLead: DashboardKpis["costPerLead"];

  if (!connections.metaAds) {
    // The distinction that matters: no ad account linked is not ₹0 spent.
    adSpend = { state: "not_connected", channel: "meta_ads" };
    costPerLead = { state: "not_connected", channel: "meta_ads" };
  } else if (perfRes.status !== "fulfilled" || perfRes.value.error) {
    adSpend = { state: "error", message: "Couldn't load your ad spend." };
    costPerLead = { state: "error", message: "Couldn't load your ad spend." };
  } else {
    const rows = perfRes.value.data ?? [];
    const prevRows = prevPerfRes.status === "fulfilled" ? prevPerfRes.value.data ?? [] : [];

    const spend = money(rows.reduce((s: number, r: any) => s + Number(r.spend ?? 0), 0));
    const prevSpend = money(prevRows.reduce((s: number, r: any) => s + Number(r.spend ?? 0), 0));
    const adLeads = rows.reduce((s: number, r: any) => s + Number(r.leads ?? 0), 0);
    const prevAdLeads = prevRows.reduce((s: number, r: any) => s + Number(r.leads ?? 0), 0);

    if (rows.length === 0 && prevRows.length === 0) {
      const reason = "No campaign data recorded yet. This fills in once a launched campaign has run for a day.";
      adSpend = { state: "no_data", reason };
      costPerLead = { state: "no_data", reason };
    } else {
      adSpend = { state: "ok", value: computeDelta(spend, prevSpend) };
      // Cost per lead uses AD-ATTRIBUTED leads, not total leads.
      // Dividing ad spend by every lead — including walk-ins and
      // referrals the ads never touched — would flatter the number.
      costPerLead = {
        state: "ok",
        value: {
          current: adLeads > 0 ? money(spend / adLeads) : null,
          previous: prevAdLeads > 0 ? money(prevSpend / prevAdLeads) : null,
        },
      };
    }
  }

  // ---- Channel breakdown ----
  let channels: Loaded<ChannelCount[]>;
  if (leadsRes.status !== "fulfilled" || leadsRes.value.error) {
    channels = { state: "error", message: "Couldn't load channel data." };
  } else {
    const counts = channelBreakdown((leadsRes.value.data ?? []).map((l: any) => l.source));
    channels =
      counts.length === 0
        ? { state: "no_data", reason: "No leads in this period, so there's nothing to split by channel yet." }
        : { state: "ok", value: counts };
  }

  // ---- Campaigns ----
  let campaigns: Loaded<CampaignRow[]>;
  if (!connections.metaAds) {
    campaigns = { state: "not_connected", channel: "meta_ads" };
  } else if (perfRes.status !== "fulfilled" || perfRes.value.error) {
    campaigns = { state: "error", message: "Couldn't load your campaigns." };
  } else {
    const statusById = new Map<string, { status: string; headline: string }>();
    if (creativesRes.status === "fulfilled" && !creativesRes.value.error) {
      for (const c of creativesRes.value.data ?? []) {
        statusById.set(c.id, { status: c.meta_status ?? "UNKNOWN", headline: c.headline ?? "Untitled" });
      }
    }

    const totals = new Map<string, CampaignRow>();
    for (const row of perfRes.value.data ?? []) {
      const meta = statusById.get(row.ad_creative_id);
      const existing = totals.get(row.ad_creative_id) ?? {
        name: row.headline ?? meta?.headline ?? "Untitled",
        platform: "Meta",
        // Falls back to a neutral label rather than guessing ACTIVE:
        // history rows outlive their creative, so a deleted campaign
        // has no status to report and shouldn't claim to be running.
        status: meta?.status ?? "Not available",
        spend: 0,
        leads: 0,
      };
      existing.spend = money(existing.spend + Number(row.spend ?? 0));
      existing.leads += Number(row.leads ?? 0);
      totals.set(row.ad_creative_id, existing);
    }

    const list = Array.from(totals.values()).sort((a, b) => b.spend - a.spend);
    campaigns =
      list.length === 0
        ? { state: "no_data", reason: "No campaigns have run in this period yet." }
        : { state: "ok", value: list };
  }

  return { kpis: { newLeads, adSpend, costPerLead }, channels, campaigns, connections };
}
