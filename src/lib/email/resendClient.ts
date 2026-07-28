import { Resend } from "resend";

// Platform-wide email sending via Resend — the fallback/default path
// for any business that hasn't connected their own Gmail (gmailAgent.ts).
// Same operating-cost model as Vapi calling: Hawlai pays for this
// centrally rather than requiring every business to bring their own
// email service account, priced into subscription plans rather than
// per-business credentials (unlike Razorpay, where the money genuinely
// has to land in each business's own account — sending a marketing
// email carries no equivalent requirement).
//
// Sends from Resend's shared test address until a business's own
// domain is verified in Resend (a real follow-up item — verified
// domains get real deliverability and a branded "from" address;
// onboarding@resend.dev works today but looks generic and has a
// lower daily cap).
const FROM_ADDRESS = "onboarding@resend.dev";

export async function sendViaResend(
  to: string,
  subject: string,
  body: string,
  dealershipName: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: "Email sending isn't configured yet (RESEND_API_KEY missing)." };

  try {
    const resend = new Resend(apiKey);
    const html = body
      .split("\n\n")
      .map((para) => `<p style="margin:0 0 16px;line-height:1.6;">${para.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const { error } = await resend.emails.send({
      from: `${dealershipName} via Hawlai <${FROM_ADDRESS}>`,
      to,
      subject,
      html,
      text: body,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
