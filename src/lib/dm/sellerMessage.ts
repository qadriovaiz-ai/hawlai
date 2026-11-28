// A message the SELLER sends an Instagram customer — O5 and FU2 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// META'S RULE DECIDES WHAT IS ALLOWED, counted from the customer's OWN
// last message (thread.ts):
//
//   within 24 hours    an ordinary message.
//   24 hours – 7 days  only a message a PERSON sends, tagged HUMAN_AGENT.
//   after 7 days       nothing at all.
//
// THIS FILE IS THE ONLY PLACE THE HUMAN_AGENT TAG IS SET, and it is only
// reached when the seller has sent a message themselves: pressing Send on
// the Orders tab (O5), or approving the drafted follow-up card (FU2). The
// draft is written by code; the seller reads it, may change it, and sends
// it. Nothing automated reaches this function.
//
// THE PLAN LISTS AS UNVERIFIED whether Meta treats a seller's one tap on a
// drafted message as a "human agent". The seller sees and sends the exact
// text, which is the closest honest reading; Meta's review is the answer.

import { readDmThread } from "@/lib/dm/thread";
import { sendInstagramDmReply } from "@/lib/instagram/dm";
import { INSTAGRAM_TOKEN_SELECT, readInstagramToken } from "@/lib/crypto/oauthSecrets";
import type { CopyLanguage } from "@/lib/content/language";

export const NORMAL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SELLER_MESSAGE = 1000;

export type Reach = { mode: "normal" | "human_agent" } | { mode: "closed"; why: string };

/** What Meta allows now, from the customer's own last message. */
export function reachFor(lastCustomerAt: string | null | undefined, now: Date): Reach {
  if (!lastCustomerAt) return { mode: "closed", why: "This customer has never written to you on Instagram, so Instagram doesn't allow a message." };
  const age = now.getTime() - new Date(lastCustomerAt).getTime();
  if (!Number.isFinite(age)) return { mode: "closed", why: "When this customer last wrote couldn't be read." };
  if (age < NORMAL_WINDOW_MS) return { mode: "normal" };
  if (age < HUMAN_AGENT_WINDOW_MS) return { mode: "human_agent" };
  return { mode: "closed", why: "This customer last wrote more than 7 days ago, and Instagram allows no message after that. Reach them on their phone number instead." };
}

export type SellerSendResult =
  | { ok: true; mode: "normal" | "human_agent" }
  | { ok: false; error: string; status: number };

export async function sendSellerMessage(
  service: any,
  dealershipId: string,
  senderId: string,
  rawText: unknown,
  now: Date = new Date()
): Promise<SellerSendResult> {
  const text = String(rawText ?? "").trim();
  if (!text) return { ok: false, error: "Write the message first.", status: 400 };
  if (text.length > MAX_SELLER_MESSAGE) return { ok: false, error: `Keep it under ${MAX_SELLER_MESSAGE} characters.`, status: 400 };
  if (!senderId) return { ok: false, error: "This order doesn't record which Instagram customer placed it.", status: 400 };

  const thread = await readDmThread(service, dealershipId, "instagram", senderId);
  const reach = reachFor(thread.lastCustomerAt, now);
  if (reach.mode === "closed") return { ok: false, error: reach.why, status: 409 };

  const { data: business, error } = await service
    .from("dealerships")
    .select(`instagram_business_id, ${INSTAGRAM_TOKEN_SELECT}`)
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { ok: false, error: `Couldn't read your Instagram connection: ${error.message}`, status: 500 };
  const token = business ? readInstagramToken(business) : null;
  if (!token || !business?.instagram_business_id) return { ok: false, error: "Instagram isn't connected right now.", status: 409 };

  try {
    await sendInstagramDmReply(token, business.instagram_business_id, senderId, text, { humanAgent: reach.mode === "human_agent" });
  } catch (err: any) {
    return { ok: false, error: `Instagram refused the message: ${err?.message ?? err}`, status: 502 };
  }

  // In the conversation's memory, with no incoming text: the business
  // started it, so it never reopens Meta's window (thread.ts).
  const { error: logError } = await service.from("auto_reply_log").insert({
    dealership_id: dealershipId,
    channel: "dm_instagram",
    source_id: senderId,
    incoming_text: null,
    reply_text: text,
    success: true,
    error: reach.mode === "human_agent" ? "sent by the seller (HUMAN_AGENT)" : "sent by the seller",
  });
  if (logError) console.error(`[seller-message] sent but not logged: ${logError.message}`);
  return { ok: true, mode: reach.mode };
}

// ---- the drafts: written by code, read and sent by the seller ------------

const DRAFTS: Record<CopyLanguage, { shipped: (ref: string, shop: string) => string; delivered: (ref: string, shop: string) => string; quote: (total: string) => string }> = {
  english: {
    shipped: (r, s) => `Your order ${r} has been shipped. Thank you for ordering from ${s}!`,
    delivered: (r, s) => `Your order ${r} has been delivered. We hope you love it — thank you for ordering from ${s}!`,
    quote: (t) => `Hi! Your order (₹${t}) is still waiting for you. Would you like us to place it? Just reply YES.`,
  },
  hinglish: {
    shipped: (r, s) => `Aapka order ${r} ship ho gaya hai. ${s} se order karne ke liye shukriya!`,
    delivered: (r, s) => `Aapka order ${r} deliver ho gaya hai. Ummeed hai aapko pasand aayega — ${s} se order karne ke liye shukriya!`,
    quote: (t) => `Hi! Aapka order (₹${t}) abhi bhi aapka intezaar kar raha hai. Place kar dein? Bas YES likh dijiye.`,
  },
  hindi: {
    shipped: (r, s) => `आपका ऑर्डर ${r} भेज दिया गया है। ${s} से ऑर्डर करने के लिए धन्यवाद!`,
    delivered: (r, s) => `आपका ऑर्डर ${r} पहुँच गया है। उम्मीद है आपको पसंद आएगा — ${s} से ऑर्डर करने के लिए धन्यवाद!`,
    quote: (t) => `नमस्ते! आपका ऑर्डर (₹${t}) अभी भी आपका इंतज़ार कर रहा है। क्या हम इसे कर दें? बस YES लिखिए।`,
  },
};

/** The status update the seller may send, for the order's current status — or null. */
export function orderUpdateDraft(status: string, ref: string, shop: string, language: CopyLanguage): string | null {
  if (status === "shipped") return DRAFTS[language].shipped(ref, shop);
  if (status === "delivered") return DRAFTS[language].delivered(ref, shop);
  return null;
}

/** FU2's drafted follow-up to a quote that went unanswered. */
export function quoteFollowUpDraft(total: string, language: CopyLanguage): string {
  return DRAFTS[language].quote(total);
}
