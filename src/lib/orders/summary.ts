// The order summary on the Orders tab, by channel — the Stats piece of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// THE LAST 30 DAYS, SAID ON SCREEN. A total with no period is a number
// nobody can act on, and "all time" quietly mixes a test month into a
// real one.
//
// WHAT COUNTS, so the numbers mean one thing each:
//   orders           every order placed, cancelled ones included (they
//                    were placed); cancelled are also shown on their own
//   paid             money the seller has: payment_status "paid", not
//                    cancelled. A cash-on-delivery order is NOT paid until
//                    the seller marks it so — it is "awaiting payment"
//   awaiting payment placed, not cancelled, not yet paid

export const SUMMARY_DAYS = 30;

export type OrderRow = { channel: string | null; total: number | string | null; payment_status: string | null; status: string | null; created_at: string };

export type ChannelSummary = {
  channel: "website" | "instagram";
  orders: number;
  cancelled: number;
  paidCount: number;
  paidAmount: number;
  awaitingCount: number;
  awaitingAmount: number;
};

export function summariseOrders(rows: OrderRow[], now: Date = new Date()): ChannelSummary[] {
  const since = now.getTime() - SUMMARY_DAYS * 24 * 60 * 60 * 1000;
  const by: Record<"website" | "instagram", ChannelSummary> = {
    website: { channel: "website", orders: 0, cancelled: 0, paidCount: 0, paidAmount: 0, awaitingCount: 0, awaitingAmount: 0 },
    instagram: { channel: "instagram", orders: 0, cancelled: 0, paidCount: 0, paidAmount: 0, awaitingCount: 0, awaitingAmount: 0 },
  };
  for (const r of rows) {
    const at = new Date(r.created_at).getTime();
    if (!Number.isFinite(at) || at < since) continue;
    const s = by[r.channel === "instagram" ? "instagram" : "website"];
    const total = Number(r.total ?? 0);
    const amount = Number.isFinite(total) ? total : 0;
    s.orders++;
    if (r.status === "cancelled") {
      s.cancelled++;
      continue;
    }
    if (r.payment_status === "paid") {
      s.paidCount++;
      s.paidAmount += amount;
    } else {
      s.awaitingCount++;
      s.awaitingAmount += amount;
    }
  }
  // Rupees to the paisa, not floating-point dust.
  for (const s of Object.values(by)) {
    s.paidAmount = Math.round(s.paidAmount * 100) / 100;
    s.awaitingAmount = Math.round(s.awaitingAmount * 100) / 100;
  }
  return [by.website, by.instagram];
}
