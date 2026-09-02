import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getValidSnapchatAccessToken, launchSnapchatCampaign } from "@/lib/ads/snapchatAds";
import { readToken, tokenWrite } from "@/lib/crypto/oauthSecrets";

// P3 piece 6 — Snapchat launch, Phase 2 of the same two-phase flow
// every platform here uses. Created PAUSED; activation is the
// separate, approval-gated action (/api/ads/[id]/status).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { draft_id, final_url } = await request.json();
  if (!draft_id) return NextResponse.json({ error: "draft_id is required" }, { status: 400 });

  const { data: draft } = await supabase
    .from("ad_creatives")
    .select("id, headline, body_copy, generated_image_url, plan_json, status")
    .eq("id", draft_id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status === "launched") return NextResponse.json({ error: "This draft is already launched" }, { status: 400 });

  // Snap Ads are a full-screen visual format — there's no text-only
  // equivalent to fall back to.
  if (!draft.generated_image_url) {
    return NextResponse.json({ error: "Snapchat ads need a creative image — this draft doesn't have one." }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, booking_slug, snapchat_access_token, snapchat_access_token_encrypted, snapchat_refresh_token, snapchat_refresh_token_encrypted, snapchat_token_expiry, snapchat_ad_account_id")
    .eq("id", dealershipId)
    .single();

  // Encrypted column first, plaintext fallback while the backfill
  // is pending. Null means "not connected" — never a decryption
  // error thrown at a caller that only wanted to launch an ad.
  const accessTokenValue = readToken(dealership, "snapchat", "access_token");
  const refreshTokenValue = readToken(dealership, "snapchat", "refresh_token");

  if (!accessTokenValue) {
    return NextResponse.json({ error: "Snapchat isn't connected yet — connect it in Integrations first." }, { status: 400 });
  }
  if (!dealership?.snapchat_ad_account_id) {
    return NextResponse.json({ error: "No Snapchat ad account found — create one in Snapchat Ads Manager, then reconnect." }, { status: 400 });
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
      tokenExpiry: dealership.snapchat_token_expiry,
      adAccountId: dealership.snapchat_ad_account_id,
    };
    const { accessToken, refreshed } = await getValidSnapchatAccessToken(creds);
    if (refreshed) {
      await service.from("dealerships").update({
        ...tokenWrite("snapchat", "access_token", refreshed.accessToken),
        snapchat_token_expiry: refreshed.expiry,
      }).eq("id", dealershipId);
    }

    const result = await launchSnapchatCampaign(creds, accessToken, {
      campaignName: draft.headline?.slice(0, 40) ?? "Hawlai campaign",
      dailyBudgetInr: dailyBudget,
      headline: draft.headline ?? "",
      imageUrl: draft.generated_image_url,
      destinationUrl: destination,
      brandName: dealership.dealership_name ?? "our business",
    });

    const { data: updated } = await service
      .from("ad_creatives")
      .update({
        platform: "snapchat",
        ad_format: "display", // Snap Ads are visual-only
        external_campaign_id: result.campaignId,
        external_adset_id: result.adSquadId,
        external_ad_id: result.adId,
        external_status: "PAUSED",
        daily_budget: dailyBudget,
        status: "launched",
      })
      .eq("id", draft.id)
      .select()
      .single();

    return NextResponse.json({ success: true, creative: updated, creativeId: result.creativeId });
  } catch (err: any) {
    await service.from("ad_creatives").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
