// One nudge to a customer who was quoted and went quiet — FU1 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// When the order is read back, a task is scheduled (agent_tasks,
// migration 130) for NUDGE_AFTER_MS later. When it runs, it sends ONE
// message — "shall I place it?" — and only if, at that moment, all of
// this is still true:
//
//   • the business still has Seller Mode on,
//   • the conversation still shows THAT read-back, unanswered,
//   • the customer has not written since it was sent, and
//   • Meta's 24-hour window, counted from the customer's own last
//     message, is still open.
//
// Anything else and it does nothing. META'S RULE is why it is one
// message inside 24 hours and never a "follow-up in 2–3 days": an
// automated message after the window is not allowed at all.
//
// NEVER MORE THAN ONE PER CONVERSATION A DAY: a nudge is not scheduled
// while another for the same customer was scheduled in the last 24 hours,
// and the task is claimed (pending → processing) before anything is sent,
// so two overlapping dispatcher runs cannot both send it.

import { readDmThread, insideMessagingWindow } from "@/lib/dm/thread";
import { sendInstagramDmReply } from "@/lib/instagram/dm";
import { INSTAGRAM_TOKEN_SELECT, readInstagramToken } from "@/lib/crypto/oauthSecrets";
import { formatRupees } from "@/lib/payments/upiRequest";
import { normaliseLanguage, type CopyLanguage } from "@/lib/content/language";

export const NUDGE_ACTION = "dm_order_nudge";
/** Four hours after the read-back: long enough to be a nudge, well inside Meta's 24. */
export const NUDGE_AFTER_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const NUDGE: Record<CopyLanguage, (total: string) => string> = {
  english: (t) => `Just checking in — your order (₹${t}) is ready to place. Reply YES to place it, or tell me what to change.`,
  hinglish: (t) => `Bas check kar rahe the — aapka order (₹${t}) place karne ke liye tayyar hai. Place karne ke liye YES likhiye, ya bataiye kya badalna hai.`,
  hindi: (t) => `बस पूछ रहे थे — आपका ऑर्डर (₹${t}) तैयार है। ऑर्डर करने के लिए YES लिखिए, या बताइए क्या बदलना है।`,
};

export function nudgeText(total: number, language: CopyLanguage): string {
  return NUDGE[language](formatRupees(total));
}

/**
 * Schedule the one nudge for a read-back just sent. Never throws: a nudge
 * that could not be scheduled must not stop the read-back.
 */
export async function scheduleOrderNudge(
  supabase: any,
  a: { dealershipId: string; senderId: string; readbackSentAt: string; now: Date }
): Promise<"scheduled" | "skipped"> {
  try {
    const { data: recent, error: readError } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("dealership_id", a.dealershipId)
      .eq("action_type", NUDGE_ACTION)
      .eq("action_details->>sender_id", a.senderId)
      .gte("created_at", new Date(a.now.getTime() - DAY_MS).toISOString())
      .limit(1);
    // UNREADABLE IS NOT "NONE": when it can't be told whether this customer
    // was already nudged today, no second nudge is risked.
    if (readError) {
      console.error(`[order-nudge] couldn't check earlier nudges: ${readError.message}`);
      return "skipped";
    }
    if (Array.isArray(recent) && recent.length) return "skipped";
    const { error } = await supabase.from("agent_tasks").insert({
      dealership_id: a.dealershipId,
      action_type: NUDGE_ACTION,
      action_details: { sender_id: a.senderId, readback_sent_at: a.readbackSentAt },
      title: "Remind an Instagram customer about the order they were quoted",
      scheduled_for: new Date(a.now.getTime() + NUDGE_AFTER_MS).toISOString(),
    });
    if (error) {
      console.error(`[order-nudge] couldn't schedule: ${error.message}`);
      return "skipped";
    }
    return "scheduled";
  } catch (err: any) {
    console.error(`[order-nudge] couldn't schedule: ${err?.message ?? err}`);
    return "skipped";
  }
}

export type NudgeOutcome = { sent: boolean; why: string };

/** The task executor. Re-checks everything; sends at most once. */
export async function runOrderNudge(
  supabase: any,
  task: { id: string; dealership_id: string; action_details: Record<string, any> },
  now: Date = new Date()
): Promise<NudgeOutcome> {
  const senderId = String(task.action_details?.sender_id ?? "");
  const quotedAt = String(task.action_details?.readback_sent_at ?? "");
  if (!senderId || !quotedAt) return { sent: false, why: "the task names no customer or quote" };

  // CLAIMED FIRST: only the run that moves it from pending sends anything.
  const { data: claimed, error: claimError } = await supabase
    .from("agent_tasks")
    .update({ status: "processing" })
    .eq("id", task.id)
    .eq("status", "pending")
    .select("id");
  if (claimError) throw new Error(`couldn't claim the nudge: ${claimError.message}`);
  if (!Array.isArray(claimed) || claimed.length !== 1) return { sent: false, why: "another run has it" };

  const [{ data: business, error: businessError }, { data: draft, error: draftError }] = await Promise.all([
    supabase
      .from("dealerships")
      .select(`instagram_selling_enabled, seller_upi_vpa, instagram_business_id, ${INSTAGRAM_TOKEN_SELECT}`)
      .eq("id", task.dealership_id)
      .maybeSingle(),
    supabase
      .from("dm_order_drafts")
      .select("status, readback, readback_sent_at")
      .eq("dealership_id", task.dealership_id)
      .eq("channel", "instagram")
      .eq("sender_id", senderId)
      .maybeSingle(),
  ]);
  if (businessError || draftError) throw new Error(`couldn't read the order: ${(businessError ?? draftError).message}`);

  if (!business?.instagram_selling_enabled || !business?.seller_upi_vpa) return { sent: false, why: "Seller Mode is off" };
  if (!draft || draft.status !== "open" || !draft.readback || !draft.readback_sent_at) return { sent: false, why: "nothing is waiting for an answer" };
  // THE SAME QUOTE, STILL UNANSWERED. A new read-back has its own task.
  if (new Date(draft.readback_sent_at).getTime() !== new Date(quotedAt).getTime()) return { sent: false, why: "the quote has changed since" };

  const thread = await readDmThread(supabase, task.dealership_id, "instagram", senderId);
  if (thread.lastCustomerAt && new Date(thread.lastCustomerAt).getTime() > new Date(quotedAt).getTime()) {
    return { sent: false, why: "the customer has written since" };
  }
  if (!insideMessagingWindow(thread.lastCustomerAt, now)) return { sent: false, why: "Meta's 24-hour window has closed" };

  const token = readInstagramToken(business);
  if (!token || !business.instagram_business_id) return { sent: false, why: "Instagram isn't connected" };

  const { data: brand } = await supabase.from("brand_profiles").select("preferred_language").eq("dealership_id", task.dealership_id).maybeSingle();
  const text = nudgeText(Number(draft.readback.total), normaliseLanguage(brand?.preferred_language));
  await sendInstagramDmReply(token, business.instagram_business_id, senderId, text);

  // Logged like any message to this customer, with no incoming text — the
  // business started it, so it never reopens the window (thread.ts).
  const { error: logError } = await supabase.from("auto_reply_log").insert({
    dealership_id: task.dealership_id,
    channel: "dm_instagram",
    source_id: senderId,
    incoming_text: null,
    reply_text: text,
    success: true,
    error: null,
  });
  if (logError) console.error(`[order-nudge] sent but not logged: ${logError.message}`);
  return { sent: true, why: "sent" };
}
