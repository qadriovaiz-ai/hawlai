// Live delivery status for the Campaign Performance History table.
//
// Called by the table AFTER the Analytics page has drawn, so the page
// never waits on Meta. Each campaign goes through readCampaignState —
// all three levels, the ids on file checked against Meta's hierarchy,
// transient errors retried — so "Active" here means exactly what it
// means when activation is verified.
//
// A campaign Meta can't be read for comes back "unknown" with
// checkedAt: null, and the table falls back to the last recorded status
// with its date. It is never guessed.
//
// The token comes from loadMetaAdsToken, the same place every other
// campaign-status path gets it: the user token when stored, which can
// read campaigns and ad sets, else the Page token, which cannot.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { META_PAGE_TOKEN_SELECT } from "@/lib/crypto/oauthSecrets";
import { adsTokenFor } from "@/lib/ads/metaToken";
import { readCampaignState } from "@/lib/ads/campaignStatus";
import { readCampaignBudget, describeBudget } from "@/lib/ads/campaignBudget";
import { describeDelivery } from "@/lib/ads/campaignDelivery";
import type { LiveDelivery } from "@/lib/ads/campaignDeliveryDisplay";
import { metaError } from "@/lib/ads/metaLog";

/** A history table is dozens of campaigns at most; this bounds a hostile request. */
const MAX_IDS = 50;
/** Three Graph reads per campaign — a few at a time keeps well clear of rate limits. */
const CONCURRENCY = 4;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business found" }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected { ids: [...] }" }, { status: 400 });
  }
  const ids: string[] = Array.isArray(body?.ids)
    ? [...new Set<string>(body.ids.filter((x: unknown): x is string => typeof x === "string"))].slice(0, MAX_IDS)
    : [];
  // For the On/Off switch's confirmation: activating must show the
  // amount Meta will spend, read from Meta, never a local column.
  const includeBudget = body?.includeBudget === true;
  if (ids.length === 0) return NextResponse.json({ statuses: {} });

  // Scoped to this business: an id from anyone else's account simply
  // isn't returned.
  const { data: rows, error } = await supabase
    .from("ad_creatives")
    .select("id, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status")
    .eq("dealership_id", dealershipId)
    .in("id", ids);
  if (error) return NextResponse.json({ error: "Couldn't load your campaigns." }, { status: 500 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select(`${META_PAGE_TOKEN_SELECT}, fb_currency`)
    .eq("id", dealershipId)
    .maybeSingle();
  const token = await adsTokenFor(supabase, dealershipId, dealership);

  const statuses: Record<string, LiveDelivery> = {};

  if (!token) {
    for (const r of rows ?? []) {
      statuses[r.id] = { state: "unknown", label: "Couldn't check", detail: "Facebook isn't connected", checkedAt: null, action: "reconnect_facebook" };
    }
    return NextResponse.json({ statuses });
  }

  const checkedAt = new Date().toISOString();
  const queue = [...(rows ?? [])];

  async function worker() {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const state = await readCampaignState(
        { campaignId: r.meta_campaign_id ?? null, adsetId: r.meta_adset_id ?? null, adId: r.meta_ad_id ?? null },
        token!,
        dealershipId
      );
      const delivery = describeDelivery(state);
      const live: LiveDelivery = { ...delivery, checkedAt: delivery.state === "unknown" ? null : checkedAt };
      if (includeBudget) {
        const budget = await readCampaignBudget({ adsetId: r.meta_adset_id ?? null, campaignId: r.meta_campaign_id ?? null }, token!);
        live.budget = budget ? describeBudget(budget, dealership?.fb_currency ?? null) : null;
      }
      statuses[r.id] = live;

      // Keep Hawlai's own record honest while we're here. meta_status is
      // what the rest of the product shows as "last recorded" (the chat
      // picker, dashboards). It went stale before — the old dashboard
      // button wrote ACTIVE for campaigns that were off — so a definite
      // answer from Meta corrects it. Only a definite on/off is written.
      const confirmed = delivery.state === "active" ? "ACTIVE" : delivery.state === "paused" ? "PAUSED" : null;
      if (confirmed && r.meta_status !== confirmed) {
        const { error: syncError } = await supabase
          .from("ad_creatives")
          .update({ meta_status: confirmed })
          .eq("id", r.id)
          .eq("dealership_id", dealershipId);
        if (syncError) metaError("status.sync_failed", { dealership: dealershipId, ad_creative: r.id, detail: syncError.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return NextResponse.json({ statuses });
}
