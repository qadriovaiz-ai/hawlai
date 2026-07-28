import { sendEmail as sendViaGmail } from "@/lib/agents/gmailAgent";
import { sendViaResend } from "@/lib/email/resendClient";

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
  body: string
): Promise<{ success: boolean; error?: string; via: "gmail" | "resend" }> {
  const { data: dealership } = await supabase.from("dealerships").select("gmail_email, dealership_name").eq("id", dealershipId).single();

  if (dealership?.gmail_email) {
    const result = await sendViaGmail(supabase, dealershipId, to, subject, body);
    return { ...result, via: "gmail" };
  }

  const result = await sendViaResend(to, subject, body, dealership?.dealership_name ?? "Hawlai");
  return { ...result, via: "resend" };
}
