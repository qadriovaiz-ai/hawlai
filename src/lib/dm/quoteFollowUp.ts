// A follow-up the SELLER may send to a customer who was quoted and has
// been quiet for over a day — FU2 of docs/PLAN-INSTAGRAM-SELLER-MODE.md,
// 28 November 2026: "24 hours to 7 days: seller-sent only — a drafted
// message on an approval card, sent with the HUMAN_AGENT tag when the
// seller taps. After 7 days, nothing."
//
// THIS SENDS NOTHING. Scheduled with the read-back (orderNudge.ts) for a
// day and an hour later, it RAISES A CARD — `dm_human_message`, drafted
// by code, in the owner's language — and only when, at that moment: Seller
// Mode is on, the same quote is still unanswered, the customer has not
// written since, Meta's window has moved past 24 hours but not past 7
// days, and no such card is already waiting for this customer. The seller
// approves it (dashboard or "haan CODE") and decide.ts sends it through
// lib/dm/sellerMessage.ts — the only place the HUMAN_AGENT tag is set.

import { readDmThread } from "@/lib/dm/thread";
import { quoteFollowUpDraft, reachFor } from "@/lib/dm/sellerMessage";
import { requestApproval } from "@/lib/chat/requestApproval";
import { formatRupees } from "@/lib/payments/upiRequest";
import { normaliseLanguage } from "@/lib/content/language";

export const FOLLOW_UP_ACTION = "dm_quote_followup";
/** A day and an hour after the read-back: past Meta's 24, where only a person may write. */
export const FOLLOW_UP_AFTER_MS = 25 * 60 * 60 * 1000;

export type FollowUpOutcome = { raised: boolean; why: string };

export async function runQuoteFollowUp(
  supabase: any,
  task: { id: string; dealership_id: string; action_details: Record<string, any> },
  now: Date = new Date()
): Promise<FollowUpOutcome> {
  const senderId = String(task.action_details?.sender_id ?? "");
  const quotedAt = String(task.action_details?.readback_sent_at ?? "");
  if (!senderId || !quotedAt) return { raised: false, why: "the task names no customer or quote" };

  // CLAIMED FIRST, as the nudge is: overlapping runs raise one card at most.
  const { data: claimed, error: claimError } = await supabase
    .from("agent_tasks")
    .update({ status: "processing" })
    .eq("id", task.id)
    .eq("status", "pending")
    .select("id");
  if (claimError) throw new Error(`couldn't claim the follow-up: ${claimError.message}`);
  if (!Array.isArray(claimed) || claimed.length !== 1) return { raised: false, why: "another run has it" };

  const [{ data: business, error: businessError }, { data: draft, error: draftError }] = await Promise.all([
    supabase.from("dealerships").select("instagram_selling_enabled, seller_upi_vpa").eq("id", task.dealership_id).maybeSingle(),
    supabase
      .from("dm_order_drafts")
      .select("status, readback, readback_sent_at")
      .eq("dealership_id", task.dealership_id)
      .eq("channel", "instagram")
      .eq("sender_id", senderId)
      .maybeSingle(),
  ]);
  if (businessError || draftError) throw new Error(`couldn't read the order: ${(businessError ?? draftError).message}`);

  if (!business?.instagram_selling_enabled || !business?.seller_upi_vpa) return { raised: false, why: "Seller Mode is off" };
  if (!draft || draft.status !== "open" || !draft.readback || !draft.readback_sent_at) return { raised: false, why: "nothing is waiting for an answer" };
  if (new Date(draft.readback_sent_at).getTime() !== new Date(quotedAt).getTime()) return { raised: false, why: "the quote has changed since" };

  const thread = await readDmThread(supabase, task.dealership_id, "instagram", senderId);
  if (thread.lastCustomerAt && new Date(thread.lastCustomerAt).getTime() > new Date(quotedAt).getTime()) {
    return { raised: false, why: "the customer has written since" };
  }
  const reach = reachFor(thread.lastCustomerAt, now);
  // ONLY THE PERSON-ONLY SPAN. Inside 24 hours the automated nudge is the
  // tool; after 7 days Instagram allows nothing.
  if (reach.mode !== "human_agent") return { raised: false, why: reach.mode === "closed" ? reach.why : "still inside 24 hours" };

  const { data: waiting, error: waitingError } = await supabase
    .from("pending_approvals")
    .select("id")
    .eq("dealership_id", task.dealership_id)
    .eq("action_type", "dm_human_message")
    .eq("status", "pending")
    .eq("action_details->>sender_id", senderId)
    .limit(1);
  if (waitingError) throw new Error(`couldn't check waiting cards: ${waitingError.message}`);
  if (Array.isArray(waiting) && waiting.length) return { raised: false, why: "a card for this customer is already waiting" };

  const { data: brand } = await supabase.from("brand_profiles").select("preferred_language").eq("dealership_id", task.dealership_id).maybeSingle();
  const total = formatRupees(Number(draft.readback.total));
  const text = quoteFollowUpDraft(total, normaliseLanguage(brand?.preferred_language));

  const card = await requestApproval(supabase, task.dealership_id, {
    actionType: "dm_human_message",
    details: { sender_id: senderId, text, reason: "quote_followup", quoted_at: quotedAt },
    confirm: `A customer was quoted ₹${total} on Instagram and hasn't replied for over a day. Send them: "${text}" — Instagram allows this only as a message from you, up to 7 days after they last wrote.`,
    amount: null,
    requestedBy: "seller_mode",
  });
  if ("error" in card) throw new Error(card.error);
  return { raised: true, why: "card raised" };
}
