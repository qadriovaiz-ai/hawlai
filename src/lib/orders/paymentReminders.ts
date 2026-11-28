// One reminder to check a UPI payment — O4′ of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
// 2026: "One reminder after 15 minutes if there is no answer."
//
// RUN BY THE EVENT DISPATCHER, every two minutes (pg_cron, migration
// 129) — a function it calls, never a URL it fetches (no self-calls).
//
// ONCE PER ORDER, AND NEVER AFTER AN ANSWER. `payment_reminder_sent_at`
// (migration 245) is claimed with a conditional update before anything
// is sent, so two overlapping runs cannot both remind. "Not yet" sets it
// too: that is an answer. A confirmed or cancelled order is not unpaid
// and new, so it is never picked up.
//
// ONLY THE LAST DAY'S ORDERS. A reminder about something a week old is
// not a reminder, it is noise; the order is still on the Orders tab.
//
// NEVER THROWS: the dispatcher has events and tasks to run besides this.

import { notifySellerOfOrder } from "@/lib/dm/sellerOrderNotice";
import { orderReference } from "@/lib/payments/upiRequest";

export const REMINDER_AFTER_MS = 15 * 60 * 1000;
const OLDEST_MS = 24 * 60 * 60 * 1000;
const PER_RUN = 20;

export async function remindUnconfirmedPayments(service: any, now: Date = new Date()): Promise<{ reminded: number; failed: number }> {
  let reminded = 0;
  let failed = 0;
  try {
    const { data: waiting, error } = await service
      .from("orders")
      .select("id, dealership_id, total, customer_name, upi_reference")
      .eq("channel", "instagram")
      .eq("payment_status", "pending")
      .eq("status", "new")
      .is("payment_reminder_sent_at", null)
      .lte("created_at", new Date(now.getTime() - REMINDER_AFTER_MS).toISOString())
      .gte("created_at", new Date(now.getTime() - OLDEST_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(PER_RUN);
    if (error) {
      console.error(`[payment-reminders] couldn't read unpaid orders: ${error.message}`);
      return { reminded, failed: failed + 1 };
    }

    for (const order of waiting ?? []) {
      // CLAIMED FIRST: the row is marked before the seller is messaged.
      const { data: claimed, error: claimError } = await service
        .from("orders")
        .update({ payment_reminder_sent_at: now.toISOString() })
        .eq("id", order.id)
        .is("payment_reminder_sent_at", null)
        .select("id");
      if (claimError) {
        console.error(`[payment-reminders] couldn't claim ${order.id}: ${claimError.message}`);
        failed++;
        continue;
      }
      if (!Array.isArray(claimed) || claimed.length !== 1) continue; // another run has it

      const result = await notifySellerOfOrder(service, order.dealership_id, {
        orderId: order.id,
        orderRef: order.upi_reference || orderReference(order.id),
        amount: Number(order.total),
        customerName: order.customer_name,
      });
      if (result.whatsapp === "failed") failed++;
      else reminded++;
    }
  } catch (err: any) {
    console.error(`[payment-reminders] stopped: ${err?.message ?? err}`);
    failed++;
  }
  return { reminded, failed };
}
