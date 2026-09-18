import { Resend } from "resend";
import { businessDisplayName } from "@/lib/business/displayName";

// Platform-wide email sending via Resend — the fallback/default path
// for any business that hasn't connected their own Gmail (gmailAgent.ts).
// Same operating-cost model as Vapi calling: Hawlai pays for this
// centrally rather than requiring every business to bring their own
// email service account, priced into subscription plans rather than
// per-business credentials (unlike Razorpay, where the money genuinely
// has to land in each business's own account — sending a marketing
// email carries no equivalent requirement).
//
// Sends from Hawlai's own verified domain (mail.hawlai.online, verified
// in Resend 2026-09-14). Until then it sent from Resend's shared
// onboarding@resend.dev: a promo to candle_by_qaaf's customer was
// "Delivered" by Resend and still never reached the inbox — Gmail
// filtered it — and replies had nowhere to go. The business's name is
// the display name; replies go to the business owner.
export const SENDER_ADDRESS = "hello@mail.hawlai.online";

/**
 * The name customers see in their inbox. A business saved as a handle
 * ("candle_by_qaaf") reads as "Candle by Qaaf"; a name the owner typed
 * with its own spacing or capitals is kept exactly. Characters that would
 * break the From header are removed.
 */
export function senderDisplayName(name: string | null | undefined): string {
  // Header-breaking characters out first; then the same handle-to-words
  // rule every other surface uses (lib/business/displayName.ts).
  return businessDisplayName(String(name ?? "").replace(/["<>\\\r\n]/g, ""), "Hawlai");
}

/** The full From header — quoted only when the name holds characters an address header treats specially. */
export function fromHeader(name: string | null | undefined): string {
  const display = senderDisplayName(name);
  return `${/[,;:()@.[\]]/.test(display) ? `"${display}"` : display} <${SENDER_ADDRESS}>`;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export async function sendViaResend(
  to: string,
  subject: string,
  body: string,
  dealershipName: string,
  options: { replyTo?: string | null; html?: string | null; headers?: Record<string, string> } = {}
): Promise<{ success: boolean; error?: string; resendMessageId?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: "Email sending isn't configured yet (RESEND_API_KEY missing)." };

  try {
    const resend = new Resend(apiKey);
    const html = options.html || body
      .split("\n\n")
      .map((para) => `<p style="margin:0 0 16px;line-height:1.6;">${para.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const replyTo = options.replyTo?.trim();
    const { data, error } = await resend.emails.send({
      from: fromHeader(dealershipName),
      to,
      subject,
      html,
      text: body,
      // Without it a customer's reply goes to an address nobody reads.
      ...(replyTo && EMAIL.test(replyTo) ? { replyTo } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
    });

    if (error) return { success: false, error: error.message };
    return { success: true, resendMessageId: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
