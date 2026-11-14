// One approval decision, for every channel that can make one — H1.
//
// WHY IT LEFT THE ROUTE. The decision lived inside
// `PATCH /api/approvals/[id]`, which begins by reading a Supabase
// session — the one thing a WhatsApp message does not have. It has a
// verified phone number instead. Rather than write a second decision
// beside it (two copies of an approval rule being the worst possible
// thing to have two of), identity became a parameter and the body moved
// here whole.
//
// Next.js settled where "here" is: a route file may only export route
// handlers, and the type error that produced was the right push. The
// decision was never a route concern.
//
// NOTHING IN THE BODY WAS REWRITTEN. Every branch carries the dated
// incident that produced it; this is a move, and the route's existing
// tests across ten files are the specification.

import { createClient } from "@/lib/supabase/server";
import { recordDecisionQuietly } from "@/lib/growth/recordDecision";
import { measureForAction } from "@/lib/growth/measures";
import { createServiceClient } from "@/lib/supabase/service";
import { GRAPH_VERSION } from "@/lib/adEngine";
import { NextResponse } from "next/server";
import { applyTargetingChange } from "@/lib/agents/campaignEditAgent";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";
import { dispatcherFor } from "@/lib/dispatch/registry";
import { releaseApprovedAction } from "@/lib/publish/release";
import { rejectPublishAction } from "@/lib/publish/reject";
import { createPlatformRegistry } from "@/lib/publish/registry";
import { humanizeActionType } from "@/lib/approvalLabels";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { setCampaignStatus } from "@/lib/ads/campaignStatus";
import { adsTokenFor } from "@/lib/ads/metaToken";

/**
 * WHO IS DECIDING, established by the caller before this is reached.
 *
 * H1. The decision below used to read the acting identity off a
 * Supabase session, which is the one thing a WhatsApp message does not
 * have — it has a verified phone number instead. So identity becomes a
 * parameter and the caller proves it, each in the way its own channel
 * can.
 */
export type ApprovalActor = {
  /**
   * A real `auth.users` id, for the columns that reference it
   * (`reviewed_by`, `set_by`). The WhatsApp path passes the OWNER'S own
   * id, read from `dealerships.owner_id` — truthful, because the owner
   * really is the one deciding.
   */
  userId: string;
  role: ApprovalRole;
  /**
   * What the audit trail says. "user:<id>" from the dashboard,
   * "whatsapp:<id>" from a message.
   *
   * SEPARATE FROM userId ON PURPOSE. Both paths are the same person, so
   * a single field would record them identically and the trail would
   * claim a button was pressed in a browser that nobody opened. The
   * owner asked for the two to stay distinguishable.
   */
  label: string;
};

/**
 * Decide a pending approval, and carry it out.
 *
 * EVERYTHING BELOW IS THE ROUTE'S OWN BODY, MOVED VERBATIM. Each branch
 * carries the incident that produced it; none of them was rewritten,
 * reordered or re-reasoned, because this is a refactor and the route's
 * existing tests are the specification. The only edits are the four
 * identity reads above.
 *
 * WHY IT RETURNS A NextResponse rather than a plain result. The
 * alternative was rewriting roughly six hundred lines of branches, each
 * ending in `NextResponse.json(...)` and each carrying a dated comment,
 * to satisfy a type. A non-web caller reads the body with `.json()`;
 * that is a smaller price than touching every branch. There is no HTTP
 * here and no self-call — this is a function call (see CLAUDE.md on
 * why a route must never fetch its own app).
 *
 * THE CALLER IS RESPONSIBLE FOR TWO THINGS and this function cannot
 * check either: that the actor is who they say, and that the approval
 * belongs to the business that actor belongs to. The route does the
 * first with a session and the second by resolving the role against
 * `approval.dealership_id`; the webhook must do both explicitly.
 */
export async function applyApprovalDecision(
  id: string,
  body: { status: string; rejection_reason?: string | null; modified_details?: any },
  actor: ApprovalActor
): Promise<NextResponse> {
  const { status, rejection_reason, modified_details } = body;
  const role = actor.role;

  if (!status || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  // P0 11c — approve-with-modification, change_campaign_budget only.
  // Only trusted when it's actually a positive number; anything else
  // is ignored rather than erroring, same as approving unmodified.
  const hasValidModification = modified_details && typeof modified_details.new_budget === "number" && modified_details.new_budget > 0;

  const service = createServiceClient();
  const { data: approval } = await service.from("pending_approvals").select("*").eq("id", id).single();
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  const { data: dealership } = await service.from("dealerships").select("owner_id, approval_threshold").eq("id", approval.dealership_id).single();

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

  // ONE DECISION PER CARD, AND IT IS CARRIED OUT ONCE.
  //
  // REPRODUCED 4 NOVEMBER 2026, S6/P1: approving the same call card
  // twice placed TWO REAL PHONE CALLS, and both requests answered 200.
  // A video card uploaded to YouTube twice. Internal mail sent twice.
  // The branches below each protect themselves or do not: the discount
  // code re-checks whether the code now exists, a customer email takes
  // migration 208's idempotency claim — and a call, an upload and a
  // team email had nothing at all.
  //
  // THE CODE ALREADY KNEW. src/lib/publish/release.ts says it in its own
  // comment — "The route has no already-approved guard, and the inline
  // card's state is local to the component, so a page reload genuinely
  // does offer the button again" — and defends itself with a
  // compare-and-set on `publish_actions`. That defence protects the
  // publish family only. This is the same idea one level up, where it
  // covers every branch at once.
  //
  // WHY IT DOES NOT BLOCK A LEGITIMATE RETRY. Every branch that fails
  // returns an error WITHOUT marking the row, and the marking happens
  // after all of them. So a card whose send genuinely failed is still
  // `pending` and can be approved again; only a card that was already
  // decided is refused.
  if (approval.status !== "pending") {
    return NextResponse.json(
      {
        error:
          approval.status === "approved"
            ? "You already approved this one and it was carried out then, so nothing was done again."
            : `This card was already ${approval.status}, so nothing was done.`,
        already: approval.status,
      },
      { status: 409 }
    );
  }

  // THE DISPATCH ENVELOPE — S6/P1.
  //
  // A registered send is carried out by its dispatcher and by nothing
  // else. Before this, each one was an `if (action_type === …)` branch
  // in this file: ten contracts nobody could compare, and the one that
  // mattered most — re-read the subject before acting — was true in
  // some and absent in others.
  //
  // The branches below are the ones that have NOT moved yet, each for a
  // reason written down in lib/dispatch/registry.ts. They move one at a
  // time, because this route carries out everything the owner approves.
  if (status === "approved") {
    const dispatcher = dispatcherFor(approval.action_type);
    if (dispatcher) {
      const done = await dispatcher.execute(
        { service, dealershipId: approval.dealership_id },
        approval.action_details,
        // THE CLAIM THIS SEND IS MADE UNDER: the approval's own id. See
        // Dispatcher.execute — the route's refusal of a decided card is
        // what holds for the platforms that offer no idempotency key.
        String(id)
      );
      if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
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
      // G-3 STEP 3b, AND A CORRECTION TO PHASE 2B.
      //
      // This branch used to call sendDealerEmail directly. That was
      // right for the shape it was written for - a note to a colleague -
      // and WRONG for a marketing email to a customer, because
      // sendDealerEmail skips every rule in
      // src/lib/email/sendApprovedEmail.ts: the recipient-on-record
      // check, the suppression list, the business address and
      // unsubscribe footer, the misleading-subject rule, the unsupported
      // link check, the duplicate window and the idempotency claim.
      //
      // Routing the customer card through the old branch would have made
      // the approval path LESS safe than the browser path it replaces.
      // A NOTE TO A COLLEAGUE IS NOT A MARKETING EMAIL, and routing it
      // through the marketing path would put an unsubscribe footer and a
      // consent check on internal mail. Internal mail sending directly
      // is a dated, approved decision (2026-09-14, Part 1 step 3) with
      // two tests encoding it. Caught by
      // tests/approvalExecution.test.ts when this branch first sent
      // everything through sendApprovedEmail.
      if (d.recipient_kind === "team") {
        const { sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
        const sent = await sendDealerEmail(service, approval.dealership_id, d.to, d.subject, d.body);
        if (!sent.success) {
          return NextResponse.json({ error: sent.error ?? "The email didn't go out, so nothing was approved." }, { status: 500 });
        }
      } else {
        const { sendApprovedEmail } = await import("@/lib/email/sendApprovedEmail");
        const sent = await sendApprovedEmail(service, approval.dealership_id, {
          to: d.to,
          subject: d.subject,
          body: d.body,
          draft: d.draft ?? null,
          piece_id: d.piece_id ?? null,
          // The id the card was created with, so pressing Approve twice
          // cannot send twice (migration 208). A fresh id here would
          // defeat the claim it exists to take.
          request_id: d.request_id ?? null,
        });
        if (!sent.ok) {
          return NextResponse.json(
            { error: sent.error, ...(sent.duplicate ? { duplicate: true } : {}) },
            { status: sent.status }
          );
        }
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

    // GRANTING THE PRODUCT PERMISSION TO ACT ALONE — S7/P5.
    //
    // THIS IS THE ONLY PLACE A LEVEL IS RAISED. src/lib/autonomy/
    // promotion.ts gathers the evidence and writes the card, and a test
    // asserts it never writes `action_levels` — so the only path from
    // "earned" to "granted" is the owner pressing this button.
    //
    // THE ACTION KEY IS RE-CHECKED AGAINST THE ALLOWLIST, never trusted
    // from the row. The toggle branch above records the same lesson: a
    // stored action_details is still a value the server should not act
    // on blindly. The database refuses it too (migration 220), so this
    // is the second of three gates rather than the only one.
    // CREATING THE PROPOSED PAGE — G3.
    //
    // THE PAGE IS CREATED UNPUBLISHED, and that is not a detail: before
    // migration 223 there was no draft state, and approving this card
    // would have put an empty page on the live site and into
    // /sitemap.xml. The flag is written here as a literal, never read
    // from the card.
    //
    // THE SLUG IS RE-DERIVED FROM THE TITLE, never taken from the row.
    // The same lesson the toggle and autonomy branches both record: a
    // stored action_details is a value the server should not act on
    // blindly. A slug from the card could point at an existing page and
    // the insert would collide with the (website_id, slug) unique
    // constraint — or worse, not collide and sit somewhere nobody meant.
    if (approval?.action_type === "create_page_draft") {
      const { slugFromQuery, titleFromQuery } = await import("@/lib/opportunities/pageProposal");
      const { legacyToBlocks } = await import("@/lib/blocks/convertLegacy");

      const query = String((approval.action_details as any)?.query ?? "").trim();
      const title = titleFromQuery(query);
      const slug = slugFromQuery(query);
      if (!title || !slug) {
        return NextResponse.json({ error: "That proposal has no page title in it, so nothing was created." }, { status: 400 });
      }

      const { data: website } = await service
        .from("websites")
        .select("id")
        .eq("dealership_id", approval.dealership_id)
        .maybeSingle();
      if (!website) {
        return NextResponse.json({ error: "There's no website to add a page to yet, so nothing was created." }, { status: 400 });
      }

      const { data: existing } = await service.from("website_pages").select("slug, order_index").eq("website_id", website.id);
      // A PAGE AT THAT ADDRESS ALREADY EXISTS. Said rather than
      // worked around with a numbered slug: the owner approved a page
      // for a search, and a second page at `-2` is not that.
      if ((existing ?? []).some((p: any) => p.slug === slug)) {
        return NextResponse.json(
          { error: `You already have a page at /${slug}, so nothing was created. Open that one instead.` },
          { status: 400 }
        );
      }
      const maxOrder = Math.max(-1, ...(existing ?? []).map((p: any) => p.order_index ?? 0));

      const { error: pageError } = await service.from("website_pages").insert({
        website_id: website.id,
        slug,
        title,
        page_type: "custom",
        meta_description: null,
        // EMPTY, AND EMPTY ON PURPOSE. Not one word of copy is written
        // by this: the owner writes it, or a generator that goes
        // through the claims guard does. A heading and a blank
        // paragraph is the same shape Add Page creates.
        sections: legacyToBlocks([{ type: "hero", headline: title, subheadline: "", ctaText: "" }, { type: "text", heading: "", body: "" }]),
        order_index: maxOrder + 1,
        published: false,
      });
      if (pageError) {
        console.error(`[approvals] could not create the proposed page for ${approval.dealership_id}: ${pageError.message}`);
        return NextResponse.json({ error: "Could not create that page just now." }, { status: 500 });
      }
    }

    if (approval?.action_type === "grant_autonomy") {
      const wanted = String((approval.action_details as any)?.action_key ?? "");
      const { isAllowlistedForL2 } = await import("@/lib/autonomy/policy");
      const { canHoldL2 } = await import("@/lib/autonomyLevels");
      const { undoExistsFor } = await import("@/lib/autonomy/promotion");
      if (!isAllowlistedForL2(wanted)) {
        return NextResponse.json(
          { error: "That isn't something Hawlai may do on its own, so nothing was changed." },
          { status: 400 }
        );
      }
      // AND THE PLATFORM MUST STILL BE ABLE TO PUT IT BACK. Checked at
      // the moment of granting, not at the moment of asking: the card
      // may have been sitting there for a week.
      const eligible = canHoldL2(wanted, { hasUndo: await undoExistsFor(service, wanted) });
      if (!eligible.ok) {
        return NextResponse.json({ error: `Nothing was changed: ${eligible.why}` }, { status: 400 });
      }
      const { error: levelError } = await service.from("action_levels").upsert(
        {
          dealership_id: approval.dealership_id,
          action_key: wanted,
          level: "L2",
          set_by: actor.userId,
          note: "Approved from the card that showed the evidence for it.",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "dealership_id,action_key" }
      );
      if (levelError) return NextResponse.json({ error: levelError.message }, { status: 500 });
    }
  }

  const { data, error } = await service
    .from("pending_approvals")
    .update({
      status,
      reviewed_by: actor.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: status === "rejected" ? (rejection_reason ?? null) : null,
      modified_details: status === "approved" && hasValidModification && approval.action_type === "change_campaign_budget" ? { new_budget: modified_details.new_budget } : null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // S5/P1 — AN APPROVAL GRANTED IS A DECISION, so it goes on record
  // with a date to look at it. Only "approved": a rejection is the
  // owner declining to act, and there is no effect to measure in 28
  // days.
  //
  // AFTER the status write and beside logAuditEvent, deliberately. This
  // is bookkeeping about something that has already happened, and
  // recordDecisionQuietly never lets its own failure reach the owner —
  // his approval stands either way, and the log says loudly when a
  // decision row is missing, because a missing decision row is a
  // missing outcome row.
  //
  // THE MEASURE COMES FROM measures.ts, WHICH IS HONEST ABOUT WHAT
  // THIS PRODUCT DOES NOT COLLECT. For a good share of the 33 action
  // types nothing records the consequence, so the measure names what a
  // person would look at and the outcome will come back
  // not_measurable with the reason. A share of the first month's
  // outcomes saying "could not tell" is the system working.
  if (status === "approved") {
    await recordDecisionQuietly(service, {
      dealershipId: approval.dealership_id,
      kind: "approval_granted",
      what: `Approved: ${humanizeActionType(approval.action_type)}`,
      why: [{ kind: "pending_approval", id: String(id) }],
      measure: measureForAction(String(approval.action_type)),
      // NO BASELINE, AND SAYING SO RATHER THAN SENDING A NUMBER. An
      // approval's measure is about a page, a customer or a campaign
      // that the decision row does not identify, so there is nothing to
      // count here. Its outcome says that, which is the honest answer
      // and points at the next piece of work.
      baseline: null,
      decidedBy: actor.label,
    });
  }

  await logAuditEvent(service, {
    dealershipId: approval.dealership_id,
    actor: actor.label,
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

    // AN APPROVAL THAT SHOULD HAVE HAD AN ACTION AND HAS NONE.
    //
    // THE FOUNDER'S P5 FAILURE, 22 October 2026: he approved a
    // paragraph edit and an undo of a page title, both cards confirmed,
    // and neither reached the live page — with no error anywhere. This
    // is the shape that produces exactly that. `not_a_publish_action`
    // is a legitimate answer for an ad budget change, so the route
    // falls through to a plain 200 — and the chat card, seeing no
    // `publish` key, says "Applied." in green.
    //
    // The two cases are distinguishable and were never distinguished:
    // an approval RAISED BY createPublishAction carries
    // action_details.publish_action_id. If that is present and no
    // publish action links back, the link between the decision and the
    // work is broken, nothing will ever run, and the owner must be told
    // rather than congratulated.
    if (released.kind === "not_a_publish_action" && (approval?.action_details as any)?.publish_action_id) {
      return NextResponse.json({
        ...data,
        publish: {
          status: "failed",
          message:
            "Your approval was recorded, but I couldn't find the change it belongs to, so nothing was applied. Nothing is half-done — ask me for it again and I'll raise a fresh card.",
        },
      });
    }

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

