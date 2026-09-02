import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getValidPinterestAccessToken, launchPinterestCampaign } from "@/lib/ads/pinterestAds";
import { readToken, tokenWrite } from "@/lib/crypto/oauthSecrets";

// P3 piece 6 — Pinterest launch, Phase 2 of the same two-phase flow
// every platform here uses: /api/ads/preview already generated the
// copy + creative image as a draft; this only does the Pinterest API
// calls.
//
// Everything is created PAUSED. Activation is the separate,
// approval-gated action (/api/ads/[id]/status), so P0 10b's gating
// covers Pinterest identically without being reimplemented.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { draft_id, final_url, board_id } = await request.json();
  if (!draft_id) return NextResponse.json({ error: "draft_id is required" }, { status: 400 });

  const { data: draft } = await supabase
    .from("ad_creatives")
    .select("id, headline, body_copy, generated_image_url, plan_json, status")
    .eq("id", draft_id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status === "launched") return NextResponse.json({ error: "This draft is already launched" }, { status: 400 });

  // Pinterest is inherently visual — an ad references a Pin, and a Pin
  // needs an image. There's no text-only equivalent to fall back to.
  if (!draft.generated_image_url) {
    return NextResponse.json({ error: "Pinterest ads need a creative image — this draft doesn't have one." }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, booking_slug, pinterest_access_token, pinterest_access_token_encrypted, pinterest_refresh_token, pinterest_refresh_token_encrypted, pinterest_token_expiry, pinterest_ad_account_id")
    .eq("id", dealershipId)
    .single();

  // Encrypted column first, plaintext fallback while the backfill
  // is pending. Null means "not connected" — never a decryption
  // error thrown at a caller that only wanted to launch an ad.
  const accessTokenValue = readToken(dealership, "pinterest", "access_token");
  const refreshTokenValue = readToken(dealership, "pinterest", "refresh_token");

  if (!accessTokenValue) {
    return NextResponse.json({ error: "Pinterest isn't connected yet — connect it in Integrations first." }, { status: 400 });
  }
  if (!dealership?.pinterest_ad_account_id) {
    return NextResponse.json({ error: "No Pinterest ad account found — create one in Pinterest Ads Manager, then reconnect." }, { status: 400 });
  }

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
      accessToken: accessTokenValue,
      refreshToken: refreshTokenValue ?? "",
      tokenExpiry: dealership.pinterest_token_expiry,
      adAccountId: dealership.pinterest_ad_account_id,
    };
    const { accessToken, refreshed } = await getValidPinterestAccessToken(creds);
    if (refreshed) {
      await service.from("dealerships").update({
        ...tokenWrite("pinterest", "access_token", refreshed.accessToken),
        pinterest_token_expiry: refreshed.expiry,
      }).eq("id", dealershipId);
    }

    const result = await launchPinterestCampaign(creds, accessToken, {
      campaignName: draft.headline?.slice(0, 40) ?? "Hawlai campaign",
      dailyBudgetInr: dailyBudget,
      headline: draft.headline ?? "",
      bodyCopy: draft.body_copy ?? "",
      imageUrl: draft.generated_image_url,
      destinationUrl: destination,
      boardId: board_id ?? null,
    });

    const { data: updated } = await service
      .from("ad_creatives")
      .update({
        platform: "pinterest",
        ad_format: "display", // Pinterest is image-only; no text-ad equivalent
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

    return NextResponse.json({ success: true, creative: updated, pinId: result.pinId });
  } catch (err: any) {
    await service.from("ad_creatives").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
