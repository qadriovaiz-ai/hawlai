import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { applyTargetingChange } from "@/lib/agents/campaignEditAgent";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";
import { releaseApprovedAction } from "@/lib/publish/release";
import { rejectPublishAction } from "@/lib/publish/reject";
import { createPlatformRegistry } from "@/lib/publish/registry";
import { humanizeActionType } from "@/lib/approvalLabels";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";
import { setCampaignStatus } from "@/lib/ads/campaignStatus";

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
  const { status, rejection_reason, modified_details } = body;

  if (!status || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  // P0 11c — approve-with-modification, change_campaign_budget only.
  // Only trusted when it's actually a positive number; anything else
  // is ignored rather than erroring, same as approving unmodified.
  const hasValidModification = modified_details && typeof modified_details.new_budget === "number" && modified_details.new_budget > 0;

  // pending_approvals RLS is owner-only by design — reading it here
  // with the service client, but only after real authorization is
  // established below (owner check, or the RLS-protected
  // team_members_self_read policy confirming genuine active
  // membership) before any dealership-scoped data is touched.
  const service = createServiceClient();
  const { data: approval } = await service.from("pending_approvals").select("*").eq("id", id).single();
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  const { data: dealership } = await service.from("dealerships").select("owner_id, approval_threshold").eq("id", approval.dealership_id).single();
  const isOwner = dealership?.owner_id === user.id;
  let role: ApprovalRole = "owner";
  if (!isOwner) {
    // Confirms real membership via the user's own RLS-protected
    // session (team_members_self_read: user_id = auth.uid()) — not
    // bypassed, genuinely checked against their own identity. Scoped
    // directly to this approval's dealership, not "any" active
    // membership, since an agency team member can be on multiple
    // teams at once.
    const { data: teamMember } = await supabase.from("team_members").select("role").eq("user_id", user.id).eq("dealership_id", approval.dealership_id).eq("status", "active").maybeSingle();
    role = (teamMember?.role as ApprovalRole) ?? "viewer"; // not a member of THIS dealership at all = no authority, same as viewer
  }

  // Rejecting never needs elevated authority — anyone who can see the
  // queue can say no. Only APPROVING (releasing money/publishing)
  // needs the calibrated check. A modification is checked against ITS
  // OWN amount, not the original request's — approving a higher
  // modified budget must still respect the approver's own ceiling,
  // even if the original (lower or unrelated) amount would've passed.
  if (status === "approved") {
    const checkAmount = hasValidModification && approval.action_type === "change_campaign_budget" ? modified_details.new_budget : (approval.amount ?? null);
    // action_type is passed so the critical-no-amount rule can apply.
    // WITHOUT IT this call silently reverts to "null amount = routine",
    // and a marketing manager can approve a live price change — the
    // exact bypass approvalGating.test.ts warns about: every policy
    // test stays green while the call site skips the policy.
    const authority = checkApprovalAuthority(role, dealership?.approval_threshold ?? 50000, checkAmount, approval.action_type);
    if (!authority.canApprove) {
      return NextResponse.json({ error: authority.reason ?? "You don't have authority to approve this." }, { status: 403 });
    }
  }

  // If this is approving a budget change, actually apply it on Meta —
  // approving a request should mean it happens, not just change a label.
  if (status === "approved") {
    if (approval?.action_type === "change_campaign_budget") {
      const details = hasValidModification ? { ...approval.action_details, new_budget: modified_details.new_budget } : (approval.action_details as any);
      const { data: dealership } = await service
        .from("dealerships").select("fb_page_access_token, fb_page_access_token_encrypted").eq("id", approval.dealership_id).single();
      const token = readMetaPageToken(dealership) ?? process.env.META_PAGE_ACCESS_TOKEN;

      const { data: campaign } = await service
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

      await service.from("ad_creatives").update({ daily_budget: details.new_budget }).eq("id", details.campaign_id);
    }

    if (approval?.action_type === "change_campaign_targeting") {
      const details = approval.action_details as any;
      const outcome = await applyTargetingChange(service, approval.dealership_id, details.campaign_id, {
        age_min: details.age_min,
        age_max: details.age_max,
        genders: details.genders ?? [],
      });
      if (!outcome.success) {
        return NextResponse.json({ error: outcome.error ?? "Couldn't apply the targeting change" }, { status: 500 });
      }
    }

    // P0 11b — same real-spend-activation Meta call as /api/ads/[id]/status,
    // reused here for the case that route deferred to this queue because
    // the requester lacked authority.
    // Only the LEGACY activation approvals (raised by the dashboard
    // button when the requester lacked authority) are applied here.
    // A chat-raised activation is backed by a publish_action and runs
    // through releaseApprovedAction below. Without this guard both
    // would fire: this branch would look up action_details.campaign_id,
    // which a publish-action approval does not carry, and fail the
    // approval with "the campaign or Facebook connection is missing".
    if (approval?.action_type === "activate_ad_campaign" && !(approval.action_details as any)?.publish_action_id) {
      const details = approval.action_details as any;
      const { data: campaign } = await service
        .from("ad_creatives").select("meta_ad_id, meta_adset_id, meta_campaign_id").eq("id", details.campaign_id).single();
      const { data: dealership } = await service
        .from("dealerships").select("fb_page_access_token, fb_page_access_token_encrypted").eq("id", approval.dealership_id).single();
      const token = readMetaPageToken(dealership) ?? process.env.META_PAGE_ACCESS_TOKEN;

      if (!token || !campaign?.meta_ad_id) {
        return NextResponse.json({ error: "Can't apply this — the campaign or Facebook connection is missing" }, { status: 400 });
      }

      // SAME THREE-LEVEL FIX as /api/ads/[id]/status. This branch had
      // the identical bug: it POSTed ACTIVE to the ad alone, so an
      // approval could be granted, Meta could accept it, and the ad
      // still would not deliver because its campaign was paused.
      const activation = await setCampaignStatus({
        objects: {
          campaignId: campaign.meta_campaign_id ?? null,
          adsetId: campaign.meta_adset_id ?? null,
          adId: campaign.meta_ad_id ?? null,
        },
        token,
        status: "ACTIVE",
        dealershipId: approval.dealership_id,
      });
      if (!activation.ok) {
        return NextResponse.json({ error: activation.reason }, { status: 500 });
      }

      await service.from("ad_creatives").update({ meta_status: "ACTIVE" }).eq("id", details.campaign_id);
    }
  }

  const { data, error } = await service
    .from("pending_approvals")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: status === "rejected" ? (rejection_reason ?? null) : null,
      modified_details: status === "approved" && hasValidModification && approval.action_type === "change_campaign_budget" ? { new_budget: modified_details.new_budget } : null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent(service, {
    dealershipId: approval.dealership_id,
    actor: `user:${user.id}`,
    eventType: status === "approved" ? "approval_approved" : "approval_rejected",
    resourceType: "pending_approval",
    resourceId: id,
    summary: `${humanizeActionType(approval.action_type)} — ${status}${hasValidModification ? " (modified)" : ""}`,
    details: { action_type: approval.action_type, amount: approval.amount, modified_details: hasValidModification ? modified_details : null, rejection_reason: status === "rejected" ? (rejection_reason ?? null) : null },
  });

  // A rejection ends the publish action too. Without this the action
  // stayed 'awaiting_approval', and the next identical request re-served
  // its stored preview as though nobody had decided. That is how a
  // rejected "₹0.00/day" activation card came back (see reject.ts). A
  // failure here is logged inside; the rejection itself is already
  // recorded, and create.ts independently refuses to re-serve a card
  // whose approval was rejected.
  if (status === "rejected") {
    await rejectPublishAction(service, id);
  }

  // ---- Publish actions execute HERE, after the approval is recorded --
  //
  // Ordering is load-bearing and differs from the Meta branches above,
  // which apply their effect BEFORE this update. It has to: the
  // executor re-verifies pending_approvals.status === 'approved'
  // rather than trusting the action's own column, so running it any
  // earlier would refuse its own approval.
  //
  // Inline rather than on a cron (the agreed trigger): the owner sees
  // the outcome on the click that caused it, and Hobby's two-cron
  // ceiling is already spent on the autopilot groups.
  //
  // A failure here does NOT unwind the approval. The human decision
  // was real and is recorded; what failed is the attempt to carry it
  // out, and that distinction is exactly what publish_actions.status
  // exists to keep.
  if (status === "approved") {
    // releaseApprovedAction performs the awaiting_approval → approved
    // transition this block used to skip entirely, then runs the
    // executor. Both halves live together because the bug was in the
    // gap between them, not in either one.
    const released = await releaseApprovedAction(
      { supabase: service, platforms: createPlatformRegistry(service) },
      id
    );

    if (released.kind === "ran") {
      const { outcome } = released;

      if (outcome.status !== "executed") {
        return NextResponse.json({
          ...data,
          publish: {
            status: outcome.status,
            message:
              outcome.status === "stale"
                ? "Approved, but the item changed after you reviewed it — nothing was applied. Ask again to see the current values."
                : outcome.status === "skipped"
                  // NOT "approved, but". A skip means this card was
                  // already spent — the action finished, failed or was
                  // rejected in an earlier attempt — so nothing was
                  // approved just now and saying so would be wrong.
                  // The reason already explains itself and says what to
                  // do next.
                  ? outcome.reason
                  // Only "failed" can reach here — stale and skipped are
                  // handled above and executed never enters this block —
                  // so the error field is the one that exists.
                  : `Approved, but the change couldn't be applied: ${outcome.error}`,
          },
        });
      }

      return NextResponse.json({ ...data, publish: { status: "executed" } });
    }
  }

  return NextResponse.json(data);
}
