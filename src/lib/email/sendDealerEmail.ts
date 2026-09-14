import { sendEmail as sendViaGmail } from "@/lib/agents/gmailAgent";
import { sendViaResend } from "@/lib/email/resendClient";
import { createServiceClient } from "@/lib/supabase/service";

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
  options: { html?: string | null } = {}
): Promise<{ success: boolean; error?: string; via: "gmail" | "resend" }> {
  const { data: dealership } = await supabase.from("dealerships").select("gmail_email, dealership_name, owner_id").eq("id", dealershipId).single();

  if (dealership?.gmail_email) {
    const result = await sendViaGmail(supabase, dealershipId, to, subject, body, { html: options.html });
    if (result.success) {
      // Logged for real send-volume tracking, even though Gmail sends
      // can't be enriched with opens/clicks the way Resend sends can —
      // Gmail's API doesn't give Hawlai a webhook for that.
      await supabase.from("email_sends").insert({ dealership_id: dealershipId, to_email: to, subject, via: "gmail" });
    }
    return { ...result, via: "gmail" };
  }

  const result = await sendViaResend(to, subject, body, dealership?.dealership_name ?? "Hawlai", {
    replyTo: await ownerEmail(dealership?.owner_id),
    html: options.html,
  });
  if (result.success) {
    await supabase.from("email_sends").insert({ dealership_id: dealershipId, to_email: to, subject, via: "resend", resend_message_id: result.resendMessageId ?? null });
  }
  return { ...result, via: "resend" };
}
