import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getValidGoogleAdsAccessToken, launchGoogleCampaign, type GoogleAdFormat } from "@/lib/ads/googleAds";

// P3 piece 6 — Google Ads launch, Phase 2 of the same two-phase flow
// Meta uses: /api/ads/preview already generated the copy (and, for
// display, the creative image) as a draft; this only does the Google
// API calls.
//
// Everything is created PAUSED — no money moves here. Activation is a
// separate, approval-gated action (/api/ads/[id]/status), exactly like
// Meta, so P0 10b's gating covers Google identically without being
// reimplemented.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { draft_id, format, keywords, final_url } = await request.json();
  if (!draft_id) return NextResponse.json({ error: "draft_id is required" }, { status: 400 });
  if (format !== "search" && format !== "display") {
    return NextResponse.json({ error: "format must be 'search' or 'display'" }, { status: 400 });
  }
  const adFormat = format as GoogleAdFormat;

  // RLS scopes this to the caller's own dealership.
  const { data: draft } = await supabase
    .from("ad_creatives")
    .select("id, headline, body_copy, generated_image_url, plan_json, status")
    .eq("id", draft_id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status === "launched") return NextResponse.json({ error: "This draft is already launched" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, booking_slug, google_ads_access_token, google_ads_refresh_token, google_ads_token_expiry, google_ads_customer_id")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.google_ads_refresh_token || !dealership?.google_ads_customer_id) {
    return NextResponse.json({ error: "Google Ads isn't connected yet — connect it in Integrations first." }, { status: 400 });
  }

  // Search ads are keyword-targeted and pointless without them.
  const finalKeywords: string[] = Array.isArray(keywords) ? keywords.map((k: any) => String(k).trim()).filter(Boolean) : [];
  if (adFormat === "search" && finalKeywords.length === 0) {
    return NextResponse.json({ error: "Search ads need at least one keyword — generate suggestions or add your own." }, { status: 400 });
  }
  if (adFormat === "display" && !draft.generated_image_url) {
    return NextResponse.json({ error: "Display ads need a creative image — this draft doesn't have one." }, { status: 400 });
  }

  // Where the ad sends people. The public booking page is the one
  // real, always-valid destination this app controls; without it
  // there's nowhere honest to send paid traffic.
  const origin = new URL(request.url).origin;
  const destination = final_url?.trim()
    || (dealership.booking_slug ? `${origin}/book/${dealership.booking_slug}` : null);
  if (!destination) {
    return NextResponse.json({ error: "No landing page to send clicks to — set up your booking page first, or provide a final_url." }, { status: 400 });
  }

  const service = createServiceClient();
  const plan = (draft.plan_json ?? {}) as any;
  const dailyBudget = Number(plan.daily_budget) || 500;

  try {
    const creds = {
      accessToken: dealership.google_ads_access_token ?? "",
      refreshToken: dealership.google_ads_refresh_token,
      tokenExpiry: dealership.google_ads_token_expiry,
      customerId: String(dealership.google_ads_customer_id).replace(/-/g, ""),
    };
    const { accessToken, refreshed } = await getValidGoogleAdsAccessToken(creds);
    if (refreshed) {
      await service.from("dealerships").update({
        google_ads_access_token: refreshed.accessToken,
        google_ads_token_expiry: refreshed.expiry,
      }).eq("id", dealershipId);
    }

    const result = await launchGoogleCampaign(creds, accessToken, {
      format: adFormat,
      campaignName: draft.headline?.slice(0, 40) ?? "Hawlai campaign",
      dailyBudgetInr: dailyBudget,
      headline: draft.headline ?? "",
      bodyCopy: draft.body_copy ?? "",
      finalUrl: destination,
      keywords: finalKeywords,
      imageUrl: draft.generated_image_url,
      businessName: dealership.dealership_name ?? "our business",
    });

    const { data: updated } = await service
      .from("ad_creatives")
      .update({
        platform: "google",
        ad_format: adFormat,
        keywords: adFormat === "search" ? finalKeywords : null,
        external_campaign_id: result.campaignId,
        external_adset_id: result.adGroupId,
        external_ad_id: result.adId,
        external_status: "PAUSED",
        daily_budget: dailyBudget,
        status: "launched",
      })
      .eq("id", draft.id)
      .select()
      .single();

    return NextResponse.json({ success: true, creative: updated });
  } catch (err: any) {
    await service.from("ad_creatives").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
