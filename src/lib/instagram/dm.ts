// Sending an Instagram DM — the transport, shared.
//
// MOVED HERE 28 November 2026 (Seller Mode O4′) from
// webhooks/autoReplyHandler.ts, unchanged, because there are now two
// callers: the webhook, answering a customer who just wrote, and the
// payment confirmation, sending the customer their invoice.
//
// Instagram Business Login uses a genuinely different API surface from a
// Facebook Page — graph.instagram.com (not graph.facebook.com), a Bearer
// header (not an access_token query parameter), and the Instagram-scoped
// ids from that login. Confirmed against Meta's Instagram Platform docs
// rather than assumed, since getting it wrong fails as a 401 that is only
// logged.
//
// META'S RULE IS THE CALLER'S: an automated message only inside 24 hours
// of the customer's own last message. Neither function here checks it —
// the webhook is answering a message that just arrived, and the invoice
// path checks the window itself before calling.

/**
 * `humanAgent` (O5/FU2, 28 Nov 2026): a message the SELLER sends, between
 * 24 hours and 7 days after the customer's last message — the only thing
 * Meta allows in that span, tagged HUMAN_AGENT. The Human Agent feature
 * comes with instagram_business_manage_messages (per Meta's docs, recorded
 * in docs/RESEARCH-INSTAGRAM-DM-SELLING.md). UNVERIFIED against the live
 * API. Never set by anything automated: only lib/dm/sellerMessage.ts sets
 * it, and only for a message a person sent.
 */
export async function sendInstagramDmReply(
  accessToken: string,
  igBusinessId: string,
  recipientId: string,
  text: string,
  opts: { humanAgent?: boolean } = {}
) {
  const res = await fetch(`https://graph.instagram.com/v26.0/${igBusinessId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      ...(opts.humanAgent ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send Instagram DM reply");
}

/**
 * An image attachment, fetched by Instagram from its URL — the UPI QR
 * code (O1). UNVERIFIED against the live API: written from Meta's
 * documented attachment shape.
 */
export async function sendInstagramDmImage(accessToken: string, igBusinessId: string, recipientId: string, imageUrl: string) {
  const res = await fetch(`https://graph.instagram.com/v26.0/${igBusinessId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { attachment: { type: "image", payload: { url: imageUrl } } } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send Instagram image");
}
