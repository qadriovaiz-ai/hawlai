// The real database behind an Instagram order conversation — O1, 28
// November 2026. `orderConversation.ts` decides; this connects it to the
// draft table (migration 244), pricing, order creation, the UPI request
// and the seller's notice. Kept apart so the decisions can be tested
// without a database, and this file stays plumbing.

import { resolveBusinessOrderPricing } from "@/lib/orderPricing";
import { createDmOrder } from "@/lib/orders/createDmOrder";
import { upiQrPath, upiRequestText } from "@/lib/payments/upiRequest";
import { notifySellerOfOrder } from "@/lib/dm/sellerOrderNotice";
import { businessDisplayName } from "@/lib/business/displayName";
import { siteUrl } from "@/lib/email/consent";
import type { CopyLanguage } from "@/lib/content/language";
import type { CatalogProduct } from "@/lib/claims/businessFacts";
import type { DmTurn } from "@/lib/dm/thread";
import { EMPTY_DRAFT, extractOrderDetails, type DraftRow, type OrderTurnDeps } from "./orderConversation";

export const DRAFT_COLUMNS = "id, draft, readback, readback_sent_at, status, order_id, updated_at";

export function buildOrderTurnDeps(
  supabase: any,
  ctx: {
    dealershipId: string;
    dealershipName: string | null;
    /** The seller's saved UPI ID, from the row the webhook already read. */
    upiVpa: string;
    senderId: string;
    language: CopyLanguage;
    catalog: CatalogProduct[];
    turns: DmTurn[];
    now?: Date;
  }
): OrderTurnDeps {
  const now = ctx.now ?? new Date();
  const key = { dealership_id: ctx.dealershipId, channel: "instagram", sender_id: ctx.senderId };
  // Products that can be ORDERED: active, a product not a service, with an id.
  const catalog = ctx.catalog
    .filter((p) => p.active !== false && p.kind !== "service" && p.id)
    .map((p) => ({ id: p.id as string, name: p.name }));
  const payee = businessDisplayName(ctx.dealershipName);

  return {
    now,
    language: ctx.language,
    catalog,

    async loadDraft() {
      const { data, error } = await supabase
        .from("dm_order_drafts")
        .select(DRAFT_COLUMNS)
        .eq("dealership_id", ctx.dealershipId)
        .eq("channel", "instagram")
        .eq("sender_id", ctx.senderId)
        .maybeSingle();
      // A draft that cannot be read must not look like "no order in
      // progress" — that would restart a customer half-way through.
      if (error) throw new Error(`Couldn't read the order in progress: ${error.message}`);
      return data ? ({ ...data, draft: { ...EMPTY_DRAFT, ...(data.draft ?? {}) } } as DraftRow) : null;
    },

    async saveDraft(patch) {
      const { error } = await supabase
        .from("dm_order_drafts")
        .upsert({ ...key, ...patch, updated_at: now.toISOString() }, { onConflict: "dealership_id,channel,sender_id" });
      if (error) throw new Error(`Couldn't save the order in progress: ${error.message}`);
    },

    async claimReadback(sentAt) {
      // CONDITIONAL: only the row still showing THIS read-back is cleared.
      // A second delivery of the same yes matches nothing.
      const { data, error } = await supabase
        .from("dm_order_drafts")
        .update({ readback_sent_at: null, updated_at: now.toISOString() })
        .eq("dealership_id", ctx.dealershipId)
        .eq("channel", "instagram")
        .eq("sender_id", ctx.senderId)
        .eq("readback_sent_at", sentAt)
        .select("id");
      if (error) throw new Error(`Couldn't confirm the order: ${error.message}`);
      return Array.isArray(data) && data.length === 1;
    },

    extract: (text, draft) =>
      extractOrderDetails(
        { text, draft, catalogNames: catalog.map((p) => p.name), turns: ctx.turns },
        { supabase, dealershipId: ctx.dealershipId }
      ),

    async price(lines) {
      const { data, error } = await supabase.from("dealerships").select("seller_shipping_fee").eq("id", ctx.dealershipId).maybeSingle();
      if (error) return { ok: false, status: 500, error: "Couldn't read the delivery fee." };
      return resolveBusinessOrderPricing(supabase, ctx.dealershipId, lines, null, Number(data?.seller_shipping_fee ?? 0));
    },

    placeOrder: (readback) =>
      createDmOrder(supabase, {
        dealershipId: ctx.dealershipId,
        customerName: readback.name,
        customerPhone: readback.phone,
        shippingAddress: readback.address,
        items: readback.lines,
        expectedTotal: readback.total,
      }),

    paymentRequest(order) {
      return {
        text: upiRequestText({ vpa: ctx.upiVpa, payeeName: payee, amount: order.total, orderId: order.orderId, language: ctx.language, withQr: true }),
        qrUrl: `${siteUrl()}${upiQrPath(order.orderId)}`,
      };
    },

    async notifySeller(order) {
      await notifySellerOfOrder(supabase, ctx.dealershipId, {
        orderId: order.orderId,
        orderRef: order.reference,
        amount: order.total,
        customerName: order.customerName,
      });
    },
  };
}
