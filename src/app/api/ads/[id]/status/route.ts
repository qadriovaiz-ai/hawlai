import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";
import { getValidGoogleAdsAccessToken, setGoogleCampaignStatus } from "@/lib/ads/googleAds";
import { getValidPinterestAccessToken, setPinterestCampaignStatus } from "@/lib/ads/pinterestAds";
import { getValidSnapchatAccessToken, setSnapchatCampaignStatus } from "@/lib/ads/snapchatAds";
import { getValidLinkedInAccessToken, setLinkedInCampaignStatus } from "@/lib/ads/linkedinAds";

const GRAPH_VERSION = "v23.0";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { status } = body;
  if (!status || !["ACTIVE", "PAUSED"].includes(status)) {
    return NextResponse.json({ error: "status must be 'ACTIVE' or 'PAUSED'" }, { status: 400 });
  }

  // RLS makes sure this creative actually belongs to this dealer's dealership.
  const { data: creative, error: fetchError } = await supabase
    .from("ad_creatives")
    .select("id, meta_ad_id, dealership_id, daily_budget, headline, platform, external_campaign_id, external_ad_id")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (fetchError || !creative) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // P3 piece 6 — multi-platform. The approval gating below is platform-
  // agnostic on purpose: it's about money and authority, not about
  // which ad network. Only the actual API call at the end branches.
  const platform = creative.platform ?? "meta";
  const externalId = platform === "meta" ? creative.meta_ad_id : creative.external_campaign_id;
  if (!externalId) {
    return NextResponse.json({ error: `This ad hasn't been launched on ${platform === "meta" ? "Meta" : platform} yet` }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token, owner_id, approval_threshold, google_ads_access_token, google_ads_refresh_token, google_ads_token_expiry, google_ads_customer_id, pinterest_access_token, pinterest_refresh_token, pinterest_token_expiry, pinterest_ad_account_id, snapchat_access_token, snapchat_refresh_token, snapchat_token_expiry, snapchat_ad_account_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expiry, linkedin_ad_account_id, linkedin_organization_id")
    .eq("id", dealershipId)
    .single();

  // P0 10b — this PATCH is the actual real-money-spend trigger (Meta
  // only starts spending once an ad is ACTIVE; launch itself always
  // creates it PAUSED, see executionPolicy.ts's ad_campaign_launch/
  // ad_campaign_activate split). Turning PAUSED back off never needs
  // gating — same "reversible action needs no check" rule the
  // approvals route (/api/approvals/[id]) already applies to "rejected".
  if (status === "ACTIVE") {
    const isOwner = dealership?.owner_id === user.id;
    let role: ApprovalRole = "owner";
    if (!isOwner) {
      const { data: teamMember } = await supabase.from("team_members").select("role").eq("user_id", user.id).eq("dealership_id", dealershipId).eq("status", "active").maybeSingle();
      role = (teamMember?.role as ApprovalRole) ?? "viewer";
    }
    const authority = checkApprovalAuthority(role, dealership?.approval_threshold ?? 50000, creative.daily_budget ?? null);
    if (!authority.canApprove) {
      // P0 11b — a blocked activation doesn't just dead-end: it becomes
      // a real request in the Approvals queue (same pending_approvals
      // producer pattern as 11a) so whoever holds authority can act on
      // it, instead of the requester having to go find someone and ask
      // in person. One pending request per campaign at a time — a
      // second click while one's outstanding just re-confirms it's queued.
      const service = createServiceClient();
      const { data: existing } = await service
        .from("pending_approvals")
        .select("id")
        .eq("dealership_id", dealershipId)
        .eq("action_type", "activate_ad_campaign")
        .eq("status", "pending")
        .contains("action_details", { campaign_id: id })
        .maybeSingle();
      if (!existing) {
        await service.from("pending_approvals").insert({
          dealership_id: dealershipId,
          requested_by_agent: "ads_status_route",
          action_type: "activate_ad_campaign",
          action_details: { campaign_id: id, campaign_name: creative.headline },
          amount: creative.daily_budget,
        });
      }
      return NextResponse.json(
        { pendingApproval: true, message: authority.reason ? `${authority.reason} Sent to Approvals for review.` : "Sent to Approvals for review — you don't have authority to activate this yourself." },
        { status: 202 }
      );
    }
  }

  if (platform === "google") {
    if (!dealership?.google_ads_refresh_token || !dealership?.google_ads_customer_id) {
      return NextResponse.json({ error: "Google Ads isn't connected" }, { status: 400 });
    }
    try {
      const creds = {
        accessToken: dealership.google_ads_access_token ?? "",
        refreshToken: dealership.google_ads_refresh_token,
        tokenExpiry: dealership.google_ads_token_expiry,
        customerId: String(dealership.google_ads_customer_id).replace(/-/g, ""),
      };
      const { accessToken, refreshed } = await getValidGoogleAdsAccessToken(creds);
      if (refreshed) {
        await createServiceClient().from("dealerships").update({
          google_ads_access_token: refreshed.accessToken,
          google_ads_token_expiry: refreshed.expiry,
        }).eq("id", dealershipId);
      }
      // Google's own vocabulary is ENABLED/PAUSED, not ACTIVE/PAUSED.
      await setGoogleCampaignStatus(creds, accessToken, creative.external_campaign_id!, status === "ACTIVE" ? "ENABLED" : "PAUSED");
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const { data: updated } = await supabase
      .from("ad_creatives")
      .update({ external_status: status })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json(updated);
  }

  if (platform === "pinterest") {
    if (!dealership?.pinterest_access_token || !dealership?.pinterest_ad_account_id) {
      return NextResponse.json({ error: "Pinterest isn't connected" }, { status: 400 });
    }
    try {
      const creds = {
        accessToken: dealership.pinterest_access_token,
        refreshToken: dealership.pinterest_refresh_token ?? "",
        tokenExpiry: dealership.pinterest_token_expiry,
        adAccountId: dealership.pinterest_ad_account_id,
      };
      const { accessToken, refreshed } = await getValidPinterestAccessToken(creds);
      if (refreshed) {
        await createServiceClient().from("dealerships").update({
          pinterest_access_token: refreshed.accessToken,
          pinterest_token_expiry: refreshed.expiry,
        }).eq("id", dealershipId);
      }
      await setPinterestCampaignStatus(creds, accessToken, creative.external_campaign_id!, status);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const { data: updated } = await supabase
      .from("ad_creatives")
      .update({ external_status: status })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json(updated);
  }

  if (platform === "snapchat") {
    if (!dealership?.snapchat_access_token || !dealership?.snapchat_ad_account_id) {
      return NextResponse.json({ error: "Snapchat isn't connected" }, { status: 400 });
    }
    try {
      const creds = {
        accessToken: dealership.snapchat_access_token,
        refreshToken: dealership.snapchat_refresh_token ?? "",
        tokenExpiry: dealership.snapchat_token_expiry,
        adAccountId: dealership.snapchat_ad_account_id,
      };
      const { accessToken, refreshed } = await getValidSnapchatAccessToken(creds);
      if (refreshed) {
        await createServiceClient().from("dealerships").update({
          snapchat_access_token: refreshed.accessToken,
          snapchat_token_expiry: refreshed.expiry,
        }).eq("id", dealershipId);
      }
      await setSnapchatCampaignStatus(accessToken, creative.external_campaign_id!, creds.adAccountId, status);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const { data: updated } = await supabase
      .from("ad_creatives")
      .update({ external_status: status })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json(updated);
  }

  if (platform === "linkedin") {
    if (!dealership?.linkedin_access_token || !dealership?.linkedin_ad_account_id) {
      return NextResponse.json({ error: "LinkedIn isn't connected" }, { status: 400 });
    }
    try {
      const creds = {
        accessToken: dealership.linkedin_access_token,
        refreshToken: dealership.linkedin_refresh_token ?? "",
        tokenExpiry: dealership.linkedin_token_expiry,
        adAccountId: dealership.linkedin_ad_account_id,
        organizationId: dealership.linkedin_organization_id ?? "",
      };
      const { accessToken, refreshed } = await getValidLinkedInAccessToken(creds);
      if (refreshed) {
        await createServiceClient().from("dealerships").update({
          linkedin_access_token: refreshed.accessToken,
          linkedin_token_expiry: refreshed.expiry,
        }).eq("id", dealershipId);
      }
      await setLinkedInCampaignStatus(accessToken, creative.external_campaign_id!, status);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const { data: updated } = await supabase
      .from("ad_creatives")
      .update({ external_status: status })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json(updated);
  }

  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Facebook Page isn't connected" }, { status: 400 });
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creative.meta_ad_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    const e = data.error ?? {};
    return NextResponse.json(
      { error: `${e.message ?? "Meta API error"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}` },
      { status: 500 }
    );
  }

  // Dual-write during the multi-platform transition (migration 140):
  // meta_status stays authoritative for existing Meta code paths,
  // external_status is what new/generic code reads.
  const { data: updated } = await supabase
    .from("ad_creatives")
    .update({ meta_status: status, external_status: status })
    .eq("id", id)
    .select()
    .single();

  return NextResponse.json(updated);
}
