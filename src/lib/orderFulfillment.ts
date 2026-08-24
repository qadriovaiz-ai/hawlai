import { sendEmail } from "@/lib/agents/gmailAgent";
import type { ResolvedOrderItem } from "@/lib/orderPricing";
import { sendAndLogConversion } from "@/lib/ads/metaConversionsApi";

// Runs once an order is actually committed — for COD that's immediately
// at order creation (as before); for Razorpay that's only after the
// payment signature has been verified (see /api/public/orders/verify-payment),
// so an abandoned or fake payment attempt never touches stock, discount
// usage counts, or sends the dealer a notification for an order that
// was never really placed.
// P3 8b — links a committed order to an existing lead by exact phone
// match, reusing the identity rule P2 27a-iii established (last 10
// digits, so +91/91/0 prefix variations still match). Best-effort and
// non-blocking: an unlinked order is still a perfectly valid order,
// it just doesn't roll up into that lead's lifetime value.
async function linkOrderToLead(supabase: any, orderId: string, dealershipId: string, customerPhone: string) {
  try {
    const suffix = customerPhone.replace(/\D/g, "").slice(-10);
    if (suffix.length < 10) return;
    const { data: matches } = await supabase
      .from("leads")
      .select("id")
      .eq("dealership_id", dealershipId)
      .ilike("phone", `%${suffix}`)
      .is("merged_into_lead_id", null)
      .limit(2);
    // Exactly one match only — two leads sharing a phone is the
    // ambiguous case P2 27a-iii deliberately never auto-resolves.
    if (matches?.length === 1) {
      await supabase.from("orders").update({ lead_id: matches[0].id }).eq("id", orderId);
    }
  } catch (err: any) {
    console.error("[orderFulfillment] linkOrderToLead failed:", err.message);
  }
}

// Reads the business's own pixel + Conversions API token and reports
// the sale. Entirely best-effort: a business that hasn't connected a
// pixel simply reports nothing, and a delivery failure is recorded in
// conversion_events rather than surfacing to the buyer — nothing here
// may ever affect an order that already succeeded.
async function reportPurchaseConversion(
  supabase: any,
  opts: {
    dealershipId: string;
    orderId: string;
    total: number;
    contentIds: string[];
    customerPhone: string;
    customerEmail: string | null;
    consented: boolean;
  }
) {
  try {
    const { data: dealership } = await supabase
      .from("dealerships")
      .select("meta_pixel_id, meta_conversions_api_token")
      .eq("id", opts.dealershipId)
      .single();

    if (!dealership?.meta_pixel_id || !dealership?.meta_conversions_api_token) return;

    await sendAndLogConversion(supabase, opts.dealershipId, {
      pixelId: dealership.meta_pixel_id,
      accessToken: dealership.meta_conversions_api_token,
      eventName: "Purchase",
      eventId: opts.orderId,
      value: opts.total,
      currency: "INR",
      contentIds: opts.contentIds,
      customer: {
        email: opts.customerEmail,
        phone: opts.customerPhone,
        consented: opts.consented,
      },
    });
  } catch (err: any) {
    console.error("[orderFulfillment] purchase conversion reporting failed:", err?.message);
  }
}

export async function applyOrderSideEffects(
  supabase: any,
  opts: {
    orderId: string;
    dealershipId: string;
    resolvedItems: ResolvedOrderItem[];
    productMap: Map<string, { inventory_count: number | null }>;
    appliedDiscountId: string | null;
    discountCode?: string | null;
    customerName: string;
    customerPhone: string;
    // Added for Conversions API customer matching (retargeting piece
    // 3) — optional, since a COD order may genuinely have no email.
    customerEmail?: string | null;
    shippingAddress: string;
    subtotal: number;
    discountAmount: number;
    shippingAmount: number;
    total: number;
    paymentMethod: "cod" | "razorpay";
    // Whether this buyer consented to tracking. Only the BROWSER
    // knows this, so it's passed in rather than inferred server-side.
    // Defaults to false: absent information must never be treated as
    // consent.
    trackingConsent?: boolean;
  }
) {
  const {
    orderId,
    dealershipId,
    resolvedItems,
    productMap,
    appliedDiscountId,
    discountCode,
    customerName,
    customerPhone,
    customerEmail,
    shippingAddress,
    subtotal,
    discountAmount,
    shippingAmount,
    total,
    paymentMethod,
    trackingConsent,
  } = opts;

  await linkOrderToLead(supabase, orderId, dealershipId, customerPhone);

  // Server-side Purchase reporting (retargeting piece 3). Fired from
  // here rather than the browser because this is the point a purchase
  // is genuinely COMMITTED — for COD immediately, for Razorpay only
  // after signature verification — so an abandoned or fake payment
  // attempt can never report a conversion. Also survives ad blockers,
  // which drop 20-40% of browser pixel events.
  //
  // eventId is the order id, matching what the browser pixel sends,
  // so Meta deduplicates the two into one conversion.
  await reportPurchaseConversion(supabase, {
    dealershipId,
    orderId,
    total,
    contentIds: resolvedItems.map((i: any) => String(i.productId ?? i.product_id ?? "")).filter(Boolean),
    customerPhone,
    customerEmail: customerEmail ?? null,
    consented: trackingConsent === true,
  });

  if (appliedDiscountId) {
    const { data: dc } = await supabase.from("discount_codes").select("used_count").eq("id", appliedDiscountId).single();
    await supabase.from("discount_codes").update({ used_count: (dc?.used_count ?? 0) + 1 }).eq("id", appliedDiscountId);
  }

  // Best-effort: decrement tracked inventory. Not wrapped in a strict
  // transaction (Supabase JS client doesn't expose one here) — under
  // rare concurrent orders this could slightly overcommit stock; the
  // dealer sees every order regardless and can adjust manually.
  for (const item of resolvedItems) {
    const product = productMap.get(item.product_id);
    if (product?.inventory_count != null) {
      await supabase.from("products").update({ inventory_count: Math.max(0, product.inventory_count - item.quantity) }).eq("id", item.product_id);
    }
  }

  // A real order just happened for this phone number — any abandoned
  // cart snapshot we'd captured for them is stale now, so drop it
  // rather than show the dealer a "follow up" prompt for an order
  // that's already placed.
  try {
    await supabase.from("abandoned_carts").delete().eq("dealership_id", dealershipId).eq("customer_phone", customerPhone);
  } catch {
    // Non-fatal.
  }

  try {
    const { data: dealership } = await supabase.from("dealerships").select("gmail_email, dealership_name").eq("id", dealershipId).single();
    if (dealership?.gmail_email) {
      const itemLines = resolvedItems.map((it) => `- ${it.name} x${it.quantity} — ₹${it.price}`).join("\n");
      const paymentLine = paymentMethod === "razorpay" ? "Payment: Paid online via Razorpay" : "Payment: Cash on Delivery (pending)";
      await sendEmail(
        supabase,
        dealershipId,
        dealership.gmail_email,
        `New order from ${customerName}`,
        `New order placed on your website.\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nAddress: ${shippingAddress}\n\nItems:\n${itemLines}\n\nSubtotal: ₹${subtotal}${discountAmount > 0 ? `\nDiscount (${discountCode}): -₹${discountAmount}` : ""}${shippingAmount > 0 ? `\nShipping: ₹${shippingAmount}` : ""}\nTotal: ₹${total}\n${paymentLine}\n\nView and confirm this order in your Hawlai dashboard.`
      );
    }
  } catch {
    // Non-fatal — order is already saved.
  }
}
