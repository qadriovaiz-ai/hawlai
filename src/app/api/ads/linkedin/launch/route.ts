import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getValidLinkedInAccessToken, launchLinkedInCampaign } from "@/lib/ads/linkedinAds";

// P3 piece 6 — LinkedIn launch, Phase 2 of the same two-phase flow
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

  if (!draft.generated_image_url) {
    return NextResponse.json({ error: "LinkedIn ads need a creative image — this draft doesn't have one." }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("booking_slug, linkedin_access_token, linkedin_refresh_token, linkedin_token_expiry, linkedin_ad_account_id, linkedin_organization_id")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.linkedin_access_token) {
    return NextResponse.json({ error: "LinkedIn isn't connected yet — connect it in Integrations first." }, { status: 400 });
  }
  if (!dealership?.linkedin_ad_account_id) {
    return NextResponse.json({ error: "No LinkedIn ad account found — create one in LinkedIn Campaign Manager, then reconnect." }, { status: 400 });
  }
  // The organization requirement is LinkedIn-specific: an ad's post is
  // authored by a company page, not a person. Called out explicitly
  // because it's the most common reason this platform can't launch.
  if (!dealership?.linkedin_organization_id) {
    return NextResponse.json({ error: "No LinkedIn company page found — LinkedIn ads are posted by a company page, so you need one (and admin access to it) before launching." }, { status: 400 });
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
      accessToken: dealership.linkedin_access_token,
      refreshToken: dealership.linkedin_refresh_token ?? "",
      tokenExpiry: dealership.linkedin_token_expiry,
      adAccountId: dealership.linkedin_ad_account_id,
      organizationId: dealership.linkedin_organization_id,
    };
    const { accessToken, refreshed } = await getValidLinkedInAccessToken(creds);
    if (refreshed) {
      await service.from("dealerships").update({
        linkedin_access_token: refreshed.accessToken,
        linkedin_token_expiry: refreshed.expiry,
      }).eq("id", dealershipId);
    }

    const result = await launchLinkedInCampaign(creds, accessToken, {
      campaignName: draft.headline?.slice(0, 40) ?? "Hawlai campaign",
      dailyBudgetInr: dailyBudget,
      headline: draft.headline ?? "",
      bodyCopy: draft.body_copy ?? "",
      imageUrl: draft.generated_image_url,
      destinationUrl: destination,
    });

    const { data: updated } = await service
      .from("ad_creatives")
      .update({
        platform: "linkedin",
        ad_format: "display",
        external_campaign_id: result.campaignId,
        // LinkedIn's campaign GROUP is the closest equivalent to the
        // ad-set layer the other platforms have.
        external_adset_id: result.campaignGroupId,
        external_ad_id: result.creativeId,
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
