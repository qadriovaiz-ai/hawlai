// Telling the owner something is waiting — H3.
//
// Until now an approval appeared on the dashboard and nowhere else,
// which is the screen he is trying not to open. A card nobody knows
// about is a card nobody answers, and an unanswered card is work this
// product asked for and then abandoned.
//
// ─────────────────────────────────────────────────────────────────────
// BY EMAIL, AND WHY NOT BY WHATSAPP
// ─────────────────────────────────────────────────────────────────────
//
// The obvious channel is the one he asked for his approvals on, and it
// is the one this cannot use yet. `tests/channelRules.test.ts` holds
// that only the inbound webhook may send a WhatsApp message — a reply
// to somebody who has just messaged — and that is not a style rule: it
// encodes WhatsApp's 24-hour session window. Outside that window only
// a Meta-approved TEMPLATE may be sent, and an approval can be raised
// at any hour, so most of these would fall outside it. A free-form
// send there fails at the provider; the guard caught a design that
// would have broken against the live API whether or not a test
// existed.
//
// So this goes by email today, and the owner decided that: a Utility
// template is added when Meta approves one, and this file is where
// that second channel joins.
//
// THE REPLY IS STILL WHATSAPP. The message carries the same four
// characters H2 matches on, so he can read it anywhere and answer with
// "haan A3F2" from his phone. The notification and the decision do not
// have to travel the same way.
//
// ─────────────────────────────────────────────────────────────────────
// IT NEVER COSTS THE APPROVAL
// ─────────────────────────────────────────────────────────────────────
//
// This runs after the row exists. A missing address, a mail provider
// that is down, a plan change — none is a reason for the approval to
// fail, because the dashboard still has it. Nothing here throws.

import { approvalCode } from "@/lib/whatsapp/approvalReply";
import { businessDisplayName } from "@/lib/business/displayName";
// IMPORTED, NOT TYPED OUT. The parked version of this file wrote
// "Your business" as a literal and tests/signupPlaceholder caught it on
// the day it landed on main: "NOBODY HAS HARDCODED IT SOMEWHERE NEW".
// The words are right for a subject line addressed to the owner — and
// there is one definition of them, which is the rule. monthlyReview.ts
// imports it the same way.
import { PLACEHOLDER_BUSINESS_NAME } from "@/lib/onboarding/signup";

/**
 * What the owner reads.
 *
 * IT SAYS WHAT WILL HAPPEN, NOT THAT SOMETHING HAPPENED. `confirm` is
 * the composed sentence stored on the row — including the dispatcher's
 * "this cannot be taken back" where there is one — so the email and
 * the card say the same thing word for word. A paraphrase here would
 * be a second version of the same claim, and the two would drift.
 */
export function approvalEmail(
  businessName: string,
  approvalId: string,
  confirm: string,
  amount?: number | null
): { subject: string; body: string } {
  const code = approvalCode(approvalId);
  const money =
    amount !== null && amount !== undefined && Number.isFinite(Number(amount))
      ? `\n\nAmount: ₹${Number(amount)}`
      : "";
  return {
    // THE CODE IS IN THE SUBJECT, because that is the line he sees on a
    // phone without opening anything.
    subject: `${businessName}: something needs your OK (${code})`,
    body: [
      String(confirm ?? "").trim() || "An action is waiting for your approval.",
      money,
      "",
      // BOTH WAYS OUT, IN THE SAME BREATH. Saying no must never be the
      // harder reply to find.
      `Reply on WhatsApp with "haan ${code}" to go ahead, or "nahi ${code}" to drop it.`,
      "",
      "Nothing has happened yet, and nothing will until you answer.",
    ]
      .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
      .join("\n"),
  };
}

/**
 * Send it, if there is anywhere to send it.
 *
 * SILENT WHEN THERE IS NOT. A business with no owner address on record
 * is not an error, and logging one for every approval it raises would
 * bury the failures that matter.
 */
export async function notifyOwnerOfApproval(
  supabase: any,
  dealershipId: string,
  approvalId: string,
  confirm: string,
  amount?: number | null
): Promise<boolean> {
  try {
    const { ownerEmail, sendDealerEmail } = await import("@/lib/email/sendDealerEmail");

    const { data: dealership } = await supabase
      .from("dealerships")
      .select("dealership_name, owner_id, owner_whatsapp_number, owner_whatsapp_verified")
      .eq("id", dealershipId)
      .maybeSingle();

    // WHATSAPP FIRST, AND ITS FAILURE CANNOT STOP THE EMAIL. Caught
    // here rather than at the outer catch, which would take the email
    // down with it — and the email is the leg that has actually run.
    try {
      const { whatsappApprovalNotice } = await import("@/lib/approvals/whatsappNotice");
      await whatsappApprovalNotice(supabase, dealership ?? {}, approvalId, confirm);
    } catch (e: any) {
      console.error(`[approval-notice] WhatsApp leg failed for ${approvalId}: ${e?.message ?? e}`);
    }

    const to = await ownerEmail(dealership?.owner_id ?? null);
    if (!to) return false;

    const { subject, body } = approvalEmail(
      businessDisplayName(dealership?.dealership_name, PLACEHOLDER_BUSINESS_NAME),
      approvalId,
      confirm,
      amount
    );

    await sendDealerEmail(supabase, dealershipId, to, subject, body, {
      // ONE EMAIL PER APPROVAL, EVEN IF THIS RUNS TWICE. The row's own
      // id is the key, so a retried request cannot post a second copy
      // of a decision he has already been asked to make.
      idempotencyKey: `approval-notice:${approvalId}`,
    });
    return true;
  } catch (e: any) {
    // THE APPROVAL IS ALREADY WRITTEN AND THE DASHBOARD ALREADY HAS
    // IT. Losing the message is a worse day, not a lost decision.
    console.error(`[approval-notice] could not tell the owner about ${approvalId}: ${e?.message ?? e}`);
    return false;
  }
}
