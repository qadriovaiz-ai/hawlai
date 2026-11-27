// When a DM cannot be answered: the customer is told the truth, and the
// seller is told at once — F2 of docs/PLAN-INSTAGRAM-SELLER-MODE.md,
// 28 November 2026.
//
// BEFORE THIS, A WITHHELD REPLY WAS SILENT ON BOTH SIDES. The customer
// got nothing; the seller got a row in a log on a page they may never
// open. That is the same failure H1/H2 closed for integrations — a state
// that only exists if somebody goes looking — and the same rule applies:
// recorded, and said out loud.

import type { DmTurn } from "@/lib/dm/thread";
import { isHoldingLine } from "@/lib/dm/holdingLine";

/**
 * Send the holding line only if the customer has not ALREADY had one
 * since the last real answer. Three questions in a row that all need a
 * person get one "the team will reply", not three.
 */
export function shouldSendHoldingLine(turns: DmTurn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].from === "business") return !isHoldingLine(turns[i].text);
  }
  return true;
}

/**
 * Tell the seller a customer is waiting — once per customer per day.
 *
 * The dedupe key carries the date because notifications are deduplicated
 * permanently (migration 106): without it, a customer who needed a person
 * once would never raise this again.
 */
export async function tellSellerCustomerIsWaiting(
  supabase: any,
  input: {
    dealershipId: string;
    channel: "instagram" | "facebook";
    senderId: string;
    customerSaid: string;
    why: string | null | undefined;
    now?: Date;
  }
): Promise<void> {
  try {
    const { emitNotification } = await import("@/lib/notifications/emit");
    const day = (input.now ?? new Date()).toISOString().slice(0, 10);
    const said = input.customerSaid.trim();
    const shown = said.length > 140 ? `${said.slice(0, 140)}…` : said;
    const where = input.channel === "instagram" ? "Instagram" : "Facebook";
    await emitNotification(supabase, {
      dealershipId: input.dealershipId,
      kind: "dm_needs_reply",
      title: `A customer is waiting for your reply on ${where}`,
      body: `They wrote: "${shown}". Hawlai didn't answer it${input.why ? ` — ${input.why}` : ""}. They've been told the team will reply.`,
      href: "/dashboard/social",
      dedupeKey: `dm_needs_reply:${input.channel}:${input.senderId}:${day}`,
    });
  } catch (err: any) {
    console.error(`[dm-escalation] couldn't tell ${input.dealershipId} a customer is waiting: ${err?.message ?? err}`);
  }
}
