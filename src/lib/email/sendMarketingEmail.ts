// The one way a marketing email leaves Hawlai.
//
// Every rule the owner approved is checked here, in order, before
// anything is sent:
//  1. the business has an address — it goes in every footer;
//  2. the address isn't on the business's unsubscribe/suppression list;
//  3. a working unsubscribe link exists for this email.
// Then the email is sent with that address and link in its footer, and
// the one-click unsubscribe headers Gmail and Yahoo expect.
//
// Transactional mail (team invites, order updates) doesn't come through
// here; neither does a note to a team member.

import { createServiceClient } from "@/lib/supabase/service";
import { sendDealerEmail } from "@/lib/email/sendDealerEmail";
import { composeMarketingEmail, type EmailDraft } from "@/lib/email/composeEmail";
import { senderDisplayName } from "@/lib/email/resendClient";
import { createUnsubscribeToken, isSuppressed, unsubscribeLinks } from "@/lib/email/consent";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

export type MarketingContent =
  /** A generated draft, sent as the visual email. */
  | { draft: EmailDraft; facts: BusinessFacts }
  /** Words someone wrote themselves, sent as written with the footer added. */
  | { subject: string; text: string; businessName: string };

export type MarketingSendResult =
  | { success: true; via: "gmail" | "resend"; resendMessageId?: string }
  | { success: false; refused: "no_address" | "suppressed" | "unsubscribe_unavailable"; error: string }
  | { success: false; refused?: undefined; error: string };

export const NO_ADDRESS_ERROR =
  "Marketing email needs your business address — it goes in every email's footer. Add it in Settings → Brand Voice, then send again.";

export async function sendMarketingEmail(supabase: any, dealershipId: string, to: string, content: MarketingContent): Promise<MarketingSendResult> {
  const service = createServiceClient();

  const { data: dealership, error: dealershipError } = await service.from("dealerships").select("business_address").eq("id", dealershipId).maybeSingle();
  if (dealershipError) return { success: false, error: `Couldn't read the business address: ${dealershipError.message}` };
  const address = String(dealership?.business_address ?? "").trim();
  if (!address) return { success: false, refused: "no_address", error: NO_ADDRESS_ERROR };

  let suppressed: boolean;
  try {
    suppressed = await isSuppressed(service, dealershipId, to);
  } catch (err: any) {
    return { success: false, error: `Not sent — ${err.message}.` };
  }
  if (suppressed) return { success: false, refused: "suppressed", error: `Not sent: ${to} has unsubscribed from this business's emails.` };

  let links: { page: string; oneClick: string };
  try {
    links = unsubscribeLinks(await createUnsubscribeToken(service, dealershipId, to));
  } catch (err: any) {
    return { success: false, refused: "unsubscribe_unavailable", error: `Not sent — ${err.message}.` };
  }

  const headers = { "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };

  if ("draft" in content) {
    const email = composeMarketingEmail(content.draft, content.facts, { address, unsubscribeUrl: links.page });
    const result = await sendDealerEmail(supabase, dealershipId, to, email.subject, email.text, { html: email.html, headers });
    return result.success ? { success: true, via: result.via, resendMessageId: result.resendMessageId } : { success: false, error: result.error ?? "Email couldn't be sent." };
  }

  const name = senderDisplayName(content.businessName);
  const text = `${content.text.trimEnd()}\n\n—\n${name} · ${address}\nUnsubscribe: ${links.page}`;
  const result = await sendDealerEmail(supabase, dealershipId, to, content.subject, text, { headers });
  return result.success ? { success: true, via: result.via, resendMessageId: result.resendMessageId } : { success: false, error: result.error ?? "Email couldn't be sent." };
}
