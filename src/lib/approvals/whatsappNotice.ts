// The WhatsApp half of the approval notice — H3-e.
//
// ──────────────────────────────────────────────────────────────────
// WHY THIS IS ITS OWN FILE, and it is not tidiness.
//
// `tests/approvalNotice.test.ts` has asserted since H3's branch that
// `notifyOwner.ts` contains no `sendWhatsApp` at all — written when
// that file only emailed, and right at the time: channelRules permits
// exactly one FREE-FORM sender, the inbound webhook, and the notice is
// not it.
//
// Putting the template send in that file would have made the
// assertion false, and relaxing it to "no free-form sender" would have
// been a test edited to fit a change. This codebase's own record says
// what to do instead — twice now, in this same feature: THE CODE
// MOVED RATHER THAN THE GUARD. So the send lives here, `notifyOwner`
// composes and emails, and that assertion stays exactly as it was.
//
// The split is honest on its own terms too. One file writes what the
// owner reads; this one knows how a message physically leaves and
// which shape is legal right now.
//
// ──────────────────────────────────────────────────────────────────
// A TEMPLATE, NOT FREE-FORM, AND NEVER THE OTHER WAY ROUND
//
// Outside WhatsApp's 24-hour session window Meta accepts only an
// approved template. An approval can be raised at any hour, so most
// notices fall outside it. channelRules now holds two lists for that
// reason: free-form from the webhook only, templates from this file
// only. The asymmetry IS the rule — the webhook may send free-form
// because it can know somebody just messaged; this file may send a
// template because it cannot.
//
// UNVERIFIED AGAINST A LIVE SEND. approval_waiting_v2 was submitted on
// 23 November 2026 and is PENDING. The live run is H3-f.
// ──────────────────────────────────────────────────────────────────

import { approvalCode } from "@/lib/whatsapp/approvalReply";
import { businessDisplayName } from "@/lib/business/displayName";
import { PLACEHOLDER_BUSINESS_NAME } from "@/lib/onboarding/signup";

/** WhatsApp's session window: free-form is legal only inside it. */
const SESSION_WINDOW_HOURS = 24;

export type NoticeBusiness = {
  dealership_name?: string | null;
  owner_whatsapp_number?: string | null;
  owner_whatsapp_verified?: boolean | null;
};

/**
 * Whether a free-form WhatsApp message is still legal to this number.
 *
 * THE CLOCK IS `whatsapp_chat_sessions.updated_at`, written after a
 * Master Chat turn — so a fresh value means a real exchange happened
 * then, and "fresh ⇒ inside the window" is sound.
 *
 * IT IS NOT A COMPLETE RECORD, AND DOES NOT NEED TO BE. The webhook's
 * CONNECT branch and its approval-reply branch do not touch that row,
 * so an owner who answered "haan A3F2" two minutes ago can still read
 * as stale. That is wrong in the SAFE direction: a template is
 * accepted inside the window as well as outside it, so a stale reading
 * picks the option that works and costs a little. A FRESH reading can
 * only come from an exchange that really happened.
 *
 * The alternative was a migration recording last-inbound exactly. Not
 * worth it for a clock whose only error is choosing the more expensive
 * of two working options.
 */
export function freeFormStillAllowed(lastExchangeAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastExchangeAt) return false;
  const at = new Date(lastExchangeAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at < SESSION_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * The approved template, by name, or nothing.
 *
 * AN ENV VAR HOLDING THE NAME RATHER THAN A BOOLEAN, because the name
 * is needed anyway and "unset" is then one fewer thing to get wrong:
 * no WhatsApp leg at all until somebody names a template.
 *
 * OFF BY DEFAULT, AND THAT MATTERS RIGHT NOW. approval_waiting_v2 is
 * PENDING. Sending against a template Meta has not approved fails
 * EVERY time, and that failure is invisible to the owner — the error
 * reply would travel the same broken sender. So until it is Active
 * this does nothing, rather than failing quietly on every approval.
 *
 * Read at send time, not at import, so turning it on is an env change
 * — and an env change needs a REDEPLOY to reach a running deployment,
 * which is the thing that cost two live attempts in M4.
 */
export function approvalTemplateName(): string | null {
  const name = (process.env.WHATSAPP_APPROVAL_TEMPLATE ?? "").trim();
  return name || null;
}

/**
 * Tell the owner on WhatsApp, if there is a way to.
 *
 * BEST-EFFORT, AND BESIDE THE EMAIL RATHER THAN INSTEAD OF IT. The
 * email is unconditional and this is not, deliberately and for now:
 * the email path has run, and the template has never been sent once.
 * If this leg fails — a pending template, a number not on a test
 * number's allow-list, a variable Meta refuses — the owner must still
 * find out, and the WhatsApp error cannot tell him.
 *
 * Once H3-f verifies a real send, dropping the email to a fallback is
 * a decision worth taking. It is not this commit's to take.
 *
 * ONLY A VERIFIED NUMBER. `owner_whatsapp_verified` is the same check
 * the inbound webhook makes before it will act as the owner. Messaging
 * an unverified number would be that hole from the other side.
 *
 * Returns whether a message was actually sent, so a caller can say
 * "WhatsApp too" without guessing.
 */
export async function whatsappApprovalNotice(
  supabase: any,
  business: NoticeBusiness,
  approvalId: string,
  /**
   * RECEIVED AND DELIBERATELY NOT SENT. See the comment on `variables`
   * below: putting this sentence in a template is what recategorised
   * the first one to Marketing. It travels in the free-form reply to a
   * tap instead. Kept in the signature so the three notice surfaces
   * share one shape, and asserted absent from the payload by
   * tests/whatsappTemplate.
   */
  confirm: string
): Promise<boolean> {
  const template = approvalTemplateName();
  const phone = String(business?.owner_whatsapp_number ?? "").trim();
  if (!template || !phone || business?.owner_whatsapp_verified !== true) return false;

  const { data: session } = await supabase
    .from("whatsapp_chat_sessions")
    .select("updated_at")
    .eq("phone_number", phone)
    .maybeSingle();

  // INSIDE THE WINDOW A TEMPLATE IS STILL WHAT GOES. Free-form would
  // also be legal there, and it is deliberately not used: channelRules
  // permits free-form from the inbound webhook ONLY, because that is
  // the file that can KNOW somebody just messaged. This one has a
  // proxy, and a proxy is not a basis for choosing the shape that is
  // illegal when it guesses wrong. The window is read so the COST is
  // visible, not to pick a different sender.
  const insideWindow = freeFormStillAllowed(session?.updated_at ?? null);

  const { sendWhatsAppTemplate } = await import("@/lib/whatsapp/client");
  await sendWhatsAppTemplate(phone, {
    name: template,
    // ───────────────────────────────────────────────────────────────
    // TWO VARIABLES, AND `confirm` IS NOT ONE OF THEM — 24 Nov 2026.
    // ───────────────────────────────────────────────────────────────
    //
    // This sent three, with `confirm` as {{2}}, and that is exactly
    // what got the first template recategorised. Meta read
    // approval_waiting_v2 as MARKETING — "did not meet our utility
    // guidelines" — and the cause is structural rather than a wording
    // slip: `confirm` is a sentence about marketing work ("Send the
    // Diwali email to 40 customers"), so ANY template filled with it
    // reads as marketing however carefully the rest is written. The
    // sample value is part of what gets classified.
    //
    // So the template is a doorbell: the business, and the code. The
    // approved one (approval_pending_notice) has exactly those two,
    // read off Graph rather than counted by eye — and a count that
    // disagrees with the approved body is Graph 132000, which reports
    // a parameter-count problem rather than the thing that is wrong.
    //
    // WHAT THE TEMPLATE MAY NEVER SAY TRAVELS AFTER THE TAP. A tap is
    // an inbound message, which opens the 24-hour window, inside which
    // a free-form reply is legal — sent from the webhook, already the
    // one permitted free-form sender. The detail arrives there.
    variables: [
      businessDisplayName(business?.dealership_name, PLACEHOLDER_BUSINESS_NAME),
      approvalCode(approvalId),
    ],
    // THE ROW'S OWN ID, so the tap is a lookup and not a guess. The
    // approved template stores no payload of its own.
    buttonPayload: approvalId,
  });

  if (!insideWindow) {
    // Not a failure — the fact worth being able to count later, since
    // a template outside the window is the billable case.
    console.log(`[approval-notice] template sent outside the session window for ${approvalId}`);
  }
  return true;
}
