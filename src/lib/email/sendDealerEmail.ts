import { sendEmail as sendViaGmail } from "@/lib/agents/gmailAgent";
import { sendViaResend } from "@/lib/email/resendClient";
import { createServiceClient } from "@/lib/supabase/service";
import { claimSend, resolveClaim } from "@/lib/email/sendClaim";

/**
 * The business owner's login email — where customer replies to a
 * Resend-sent email should land. Read with the service client because
 * auth users aren't a table the request's own client can query. Null
 * when it can't be read: the email still goes, just without a reply-to.
 */
export async function ownerEmail(ownerId: string | null | undefined): Promise<string | null> {
  if (!ownerId) return null;
  try {
    const { data, error } = await createServiceClient().auth.admin.getUserById(ownerId);
    if (error) {
      console.error("[email] couldn't read the owner's email for reply-to:", error.message);
      return null;
    }
    return data?.user?.email ?? null;
  } catch (err: any) {
    console.error("[email] couldn't read the owner's email for reply-to:", err?.message);
    return null;
  }
}

// Single entry point every email-sending feature should call. Tries
// the dealer's own connected Gmail first (real deliverability, their
// own address, no shared-sender cap) — falls back to the platform
// Resend account when Gmail isn't connected, so email automation
// works out of the box for every business, not just the ones who've
// done the extra OAuth step.
export async function sendDealerEmail(
  supabase: any,
  dealershipId: string,
  to: string,
  subject: string,
  body: string,
  /** The visual version (lib/email/template.ts); `body` is then its plain-text part. */
  options: {
    html?: string | null;
    headers?: Record<string, string>;
    /**
     * One id per composed email, from the client. A RETRY reuses it and
     * is refused; a deliberate second send is a new press with a new id
     * and goes through (src/lib/email/sendClaim.ts, migration 208).
     *
     * Optional, so the callers that have no concept of a press - the
     * approvals executor, chat's own send - keep the old
     * insert-after-success path unchanged. Those are not the paths a
     * double-click reaches.
     */
    idempotencyKey?: string | null;
  } = {}
): Promise<{ success: boolean; error?: string; duplicate?: boolean; via: "gmail" | "resend"; resendMessageId?: string }> {
  const { data: dealership } = await supabase.from("dealerships").select("gmail_email, dealership_name, owner_id").eq("id", dealershipId).single();

  // WHICH SENDER, decided before the send rather than after it. This is
  // what makes the claim possible at all: email_sends.via is NOT NULL
  // with a CHECK, so a row written before the send has to already know
  // whether this is going out through the dealer's Gmail or through
  // Resend. It does - gmail_email has just been read.
  const via: "gmail" | "resend" = dealership?.gmail_email ? "gmail" : "resend";

  const key = options.idempotencyKey?.trim() || null;
  let claimId: string | null = null;
  if (key) {
    const claim = await claimSend(supabase, { dealershipId, to, subject, via, idempotencyKey: key });
    if (!claim.claimed) return { success: false, error: claim.error, duplicate: claim.duplicate, via };
    claimId = claim.id;
  }

  if (via === "gmail") {
    const result = await sendViaGmail(supabase, dealershipId, to, subject, body, { html: options.html, headers: options.headers });
    if (claimId) {
      await resolveClaim(supabase, claimId, { sent: result.success });
    } else if (result.success) {
      // Logged for real send-volume tracking, even though Gmail sends
      // can't be enriched with opens/clicks the way Resend sends can -
      // Gmail's API doesn't give Hawlai a webhook for that.
      //
      // handoff_state is left null on purpose here. Null means sent, by
      // the rule in sendClaim.countsAsSent: this branch, like the code
      // that predates migration 208, only writes the row once the send
      // has already succeeded.
      await supabase.from("email_sends").insert({ dealership_id: dealershipId, to_email: to, subject, via: "gmail" });
    }
    return { ...result, via: "gmail" };
  }

  const result = await sendViaResend(to, subject, body, dealership?.dealership_name ?? "Hawlai", {
    replyTo: await ownerEmail(dealership?.owner_id),
    html: options.html,
    headers: options.headers,
  });
  if (claimId) {
    // The resend message id lands on the row the claim already created,
    // so resendWebhook can still find it by resend_message_id and write
    // delivery_status against it. The two columns do not meet.
    await resolveClaim(supabase, claimId, { sent: result.success, resendMessageId: result.resendMessageId ?? null });
  } else if (result.success) {
    await supabase.from("email_sends").insert({ dealership_id: dealershipId, to_email: to, subject, via: "resend", resend_message_id: result.resendMessageId ?? null });
  }
  return { ...result, via: "resend" };
}
