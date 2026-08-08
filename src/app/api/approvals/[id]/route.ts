import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyTargetingChange } from "@/lib/agents/campaignEditAgent";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";

const GRAPH_VERSION = "v23.0";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { status, rejection_reason } = body;

  if (!status || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const { data: approval } = await supabase.from("pending_approvals").select("*").eq("id", id).single();
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  // Rejecting never needs elevated authority — anyone who can see the
  // queue can say no. Only APPROVING (releasing money/publishing)
  // needs the calibrated check.
  if (status === "approved") {
    const { data: dealership } = await supabase.from("dealerships").select("owner_id, approval_threshold").eq("id", approval.dealership_id).single();
    const isOwner = dealership?.owner_id === user.id;
    let role: ApprovalRole = "owner";
    if (!isOwner) {
      const { data: teamMember } = await supabase.from("team_members").select("role").eq("dealership_id", approval.dealership_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
      role = (teamMember?.role as ApprovalRole) ?? "viewer"; // not found on the team at all = no authority, same as viewer
    }

    const authority = checkApprovalAuthority(role, dealership?.approval_threshold ?? 50000, approval.amount ?? null);
    if (!authority.canApprove) {
      return NextResponse.json({ error: authority.reason ?? "You don't have authority to approve this." }, { status: 403 });
    }
  }

  // If this is approving a budget change, actually apply it on Meta —
  // approving a request should mean it happens, not just change a label.
  if (status === "approved") {
    if (approval?.action_type === "change_campaign_budget") {
      const details = approval.action_details as any;
      const { data: dealership } = await supabase
        .from("dealerships").select("fb_page_access_token").eq("id", approval.dealership_id).single();
      const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;

      const { data: campaign } = await supabase
        .from("ad_creatives").select("meta_adset_id").eq("id", details.campaign_id).single();

      if (!token || !campaign?.meta_adset_id) {
        return NextResponse.json({ error: "Can't apply this — the campaign or Facebook connection is missing" }, { status: 400 });
      }

      const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${campaign.meta_adset_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_budget: Math.round(details.new_budget * 100), access_token: token }),
      });
      const metaData = await metaRes.json();
      if (!metaRes.ok || metaData.error) {
        return NextResponse.json({ error: metaData.error?.message ?? "Meta API error while updating budget" }, { status: 500 });
      }

      await supabase.from("ad_creatives").update({ daily_budget: details.new_budget }).eq("id", details.campaign_id);
    }

    if (approval?.action_type === "change_campaign_targeting") {
      const details = approval.action_details as any;
      const outcome = await applyTargetingChange(supabase, approval.dealership_id, details.campaign_id, {
        age_min: details.age_min,
        age_max: details.age_max,
        genders: details.genders ?? [],
      });
      if (!outcome.success) {
        return NextResponse.json({ error: outcome.error ?? "Couldn't apply the targeting change" }, { status: 500 });
      }
    }
  }

  const { data, error } = await supabase
    .from("pending_approvals")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: status === "rejected" ? (rejection_reason ?? null) : null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
