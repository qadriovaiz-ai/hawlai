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
import { setCampaignStatus } from "@/lib/ads/campaignStatus";
import { adsTokenFor } from "@/lib/ads/metaToken";

const GRAPH_VERSION = "v23.0";

/**
 * What was already decided about this approval.
 *
 * WHY IT EXISTS: an approval card in the chat kept its verdict in React
 * state, so the moment the message list re-rendered — a new turn, a
 * reload — the buttons came back on a card that had already been
 * approved. Pressing Approve again was safe (the executor refuses a
 * spent action) but it answered in red, as an error, on a change that
 * had gone through perfectly.
 *
 * Returns the stored verification too, so a card rebuilt an hour later
 * still says what the live page read back rather than a weaker guess.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: approval } = await service.from("pending_approvals").select("id, dealership_id, status").eq("id", id).maybeSingle();
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  // Same authorization shape as PATCH below: the owner, or a genuinely
  // active member of THIS dealership, confirmed through the caller's own
  // RLS-protected session. Anyone else is told nothing.
  const { data: dealership } = await service.from("dealerships").select("owner_id").eq("id", approval.dealership_id).maybeSingle();
  if (dealership?.owner_id !== user.id) {
    const { data: teamMember } = await supabase
      .from("team_members").select("id").eq("user_id", user.id).eq("dealership_id", approval.dealership_id).eq("status", "active").maybeSingle();
    if (!teamMember) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  const { data: action } = await service
    .from("publish_actions")
    .select("status, platform_response")
    .eq("approval_id", id)
    .maybeSingle();

  const verification = (action?.platform_response as any)?.verification ?? null;
  return NextResponse.json({
    status: approval.status,
    publish: action
      ? { status: action.status, ...(verification ? { verified: Boolean(verification.verified), message: String(verification.message) } : {}) }
      : null,
  });
}

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
      const token = (await adsTokenFor(service, approval.dealership_id, dealership)) ?? process.env.META_PAGE_ACCESS_TOKEN;

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
      const token = (await adsTokenFor(service, approval.dealership_id, dealership)) ?? process.env.META_PAGE_ACCESS_TOKEN;

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

    // ---- One-shot outbound actions raised from chat (Phase 2B) ------
    //
    // Five actions used to run the moment a chat sentence asked for
    // them: a real email, a real phone call, a public video, a live
    // discount code, and the toggles that switch on unattended posting
    // and emailing. They create a pending_approvals row now and the
    // work happens HERE, after the authz and authority checks above —
    // so pressing a button in a browser is not what performs them.
    //
    // Each branch returns an error WITHOUT marking the approval
    // approved, which is the behaviour the three branches above already
    // have: a failed action must not leave a row claiming it succeeded.
    // NOT RAISED BY ANY TOOL TODAY, and kept deliberately. Internal
    // team mail sends directly by an approved 2026-09-14 decision, and
    // the customer path's preview card still posts to /api/email/send
    // without an approval record (audit finding G-3). This is where that
    // path lands when G-3 is closed; the policy entry already says the
    // action needs approval.
    if (approval?.action_type === "send_email") {
      const d = approval.action_details as any;
      const { sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
      const sent = await sendDealerEmail(service, approval.dealership_id, d.to, d.subject, d.body);
      if (!sent.success) {
        return NextResponse.json({ error: sent.error ?? "The email didn't go out, so nothing was approved." }, { status: 500 });
      }
    }

    if (approval?.action_type === "place_outbound_call") {
      const d = approval.action_details as any;
      // Re-read the lead rather than trusting the row: a number may have
      // changed, or they may have opted out since the card was made.
      const { data: lead } = await service
        .from("leads")
        .select("id, name, phone, dealership_id, dnd_opt_out")
        .eq("id", d.lead_id)
        .eq("dealership_id", approval.dealership_id)
        .maybeSingle();
      if (!lead) return NextResponse.json({ error: "That lead is no longer on file, so no call was placed." }, { status: 400 });
      if (!lead.phone) return NextResponse.json({ error: `${lead.name} has no phone number on file, so no call was placed.` }, { status: 400 });
      if (lead.dnd_opt_out) return NextResponse.json({ error: `${lead.name} has opted out of contact, so no call was placed.` }, { status: 400 });
      const { triggerVapiCall } = await import("@/lib/agents/vapiCallAgent");
      const called = await triggerVapiCall(service, lead);
      if (!called.success) {
        return NextResponse.json({ error: called.error ?? "The call didn't go through, so nothing was approved." }, { status: 500 });
      }
    }

    if (approval?.action_type === "publish_video") {
      const d = approval.action_details as any;
      const { data: dealership } = await service
        .from("dealerships")
        .select("youtube_access_token, youtube_refresh_token, youtube_access_token_encrypted, youtube_refresh_token_encrypted, youtube_token_expiry")
        .eq("id", approval.dealership_id)
        .maybeSingle();
      const { readToken, tokenWrite } = await import("@/lib/crypto/oauthSecrets");
      const refresh = readToken(dealership, "youtube", "refresh_token");
      if (!refresh) return NextResponse.json({ error: "YouTube isn't connected any more, so nothing was published." }, { status: 400 });
      const { data: video } = await service
        .from("video_generations")
        .select("id, video_url, prompt")
        .eq("id", d.video_id)
        .eq("dealership_id", approval.dealership_id)
        .maybeSingle();
      if (!video?.video_url) return NextResponse.json({ error: "That video is no longer available, so nothing was published." }, { status: 400 });
      const { getValidYoutubeAccessToken, uploadVideoToYouTube } = await import("@/lib/agents/youtubeAgent");
      const { accessToken, refreshed } = await getValidYoutubeAccessToken({
        accessToken: readToken(dealership, "youtube", "access_token") ?? "",
        refreshToken: refresh,
        tokenExpiry: dealership?.youtube_token_expiry,
      });
      if (refreshed) {
        await service
          .from("dealerships")
          .update({ ...tokenWrite("youtube", "access_token", refreshed.accessToken), youtube_token_expiry: refreshed.expiry })
          .eq("id", approval.dealership_id);
      }
      try {
        const uploaded = await uploadVideoToYouTube(accessToken, video.video_url, d.title, d.description ?? video.prompt);
        await service.from("video_generations").update({ youtube_video_id: uploaded.videoId, youtube_url: uploaded.url }).eq("id", video.id);
      } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? "YouTube refused the upload, so nothing was published." }, { status: 500 });
      }
    }

    if (approval?.action_type === "publish_site") {
      // G-3 step 2b. The flag is flipped by
      // src/lib/website/setSitePublished.ts, so the placeholder check
      // runs HERE too - a page that fell back to placeholder content
      // between the card being made and this press still stops the
      // publish. That re-read at the press is the point of the record.
      const { setSitePublished } = await import("@/lib/website/setSitePublished");
      const done = await setSitePublished(service, approval.dealership_id, true);
      if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
    }

    if (approval?.action_type === "generate_graphic") {
      // G-3 step 1b. The work is in src/lib/graphicDesign/generateDesign.ts
      // so it runs HERE rather than by fetching this app over HTTP - a
      // route calling its own app gets a Vercel 508 after about four hops.
      //
      // Every guard travels with it: the feature hold, the plan cap and
      // the claims strip all live in that function, so this path cannot
      // spend money the Graphic Design page could not.
      //
      // RE-READ AT THE PRESS, like every other branch here. The plan cap
      // is checked inside generateDesign at the moment of approval, not
      // when the card was made - an owner who used up the allowance in
      // between is refused now.
      const d = approval.action_details as any;
      const { generateDesign } = await import("@/lib/graphicDesign/generateDesign");
      const made = await generateDesign(service, approval.dealership_id, {
        designType: d.design_type,
        prompt: d.prompt ?? null,
      });
      // The approval is NOT marked approved when the work fails: the row
      // stays pending so the owner can press again once the reason is
      // gone, rather than being told it succeeded.
      if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
    }

    if (approval?.action_type === "create_discount_code") {
      const d = approval.action_details as any;
      // Checked again here: a code with the same name may have been
      // created between the card being made and this press.
      const { data: existing } = await service
        .from("discount_codes")
        .select("id")
        .eq("dealership_id", approval.dealership_id)
        .eq("code", d.code)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: `A code "${d.code}" already exists, so none was created.` }, { status: 400 });
      }
      const { error: codeError } = await service.from("discount_codes").insert({
        dealership_id: approval.dealership_id,
        code: d.code,
        discount_type: d.discount_type,
        value: d.value,
        min_order_value: d.min_order_value ?? null,
      });
      if (codeError) return NextResponse.json({ error: codeError.message }, { status: 500 });
    }

    if (approval?.action_type === "set_automation_toggle") {
      const d = approval.action_details as any;
      // The FIELD NAME comes from the registry, never from the row. A
      // stored action_details is still a value the server should not
      // interpolate into an update blindly.
      const { AUTOMATION_TOGGLES } = await import("@/lib/executionPolicy");
      const TOGGLE_FIELDS: Record<string, string> = {
        dm_auto_reply: "dm_auto_reply_enabled",
        comment_auto_reply: "comment_auto_reply_enabled",
        welcome_email: "welcome_email_auto_enabled",
        follow_up_email: "follow_up_email_auto_enabled",
        content_autopilot: "content_autopilot_enabled",
        auto_call_new_leads: "auto_call_new_leads",
      };
      const field = AUTOMATION_TOGGLES[d.toggle] ? TOGGLE_FIELDS[d.toggle] : undefined;
      if (!field) return NextResponse.json({ error: "That automation isn't one Hawlai knows, so nothing was changed." }, { status: 400 });
      const { error: toggleError } = await service
        .from("dealerships")
        .update({ [field]: true })
        .eq("id", approval.dealership_id);
      if (toggleError) return NextResponse.json({ error: toggleError.message }, { status: 500 });
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

      // A write can succeed and still not be live — an unpublished site,
      // a page serving something else. hawlai_site fetches the real page
      // after writing and reports what it read; that verdict is the only
      // thing entitled to use the word "live", so it is carried through
      // to the card rather than being flattened into "Applied."
      const verification = (outcome.platformResponse as any)?.verification;
      return NextResponse.json({
        ...data,
        publish: {
          status: "executed",
          ...(verification ? { verified: Boolean(verification.verified), message: String(verification.message), url: verification.url ?? null } : {}),
        },
      });
    }
  }

  return NextResponse.json(data);
}
