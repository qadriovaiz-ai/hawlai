import { sendEmail } from "@/lib/agents/gmailAgent";
import type { ResolvedOrderItem } from "@/lib/orderPricing";

// Runs once an order is actually committed — for COD that's immediately
// at order creation (as before); for Razorpay that's only after the
// payment signature has been verified (see /api/public/orders/verify-payment),
// so an abandoned or fake payment attempt never touches stock, discount
// usage counts, or sends the dealer a notification for an order that
// was never really placed.
export async function applyOrderSideEffects(
  supabase: any,
  opts: {
    dealershipId: string;
    resolvedItems: ResolvedOrderItem[];
    productMap: Map<string, { inventory_count: number | null }>;
    appliedDiscountId: string | null;
    discountCode?: string | null;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    subtotal: number;
    discountAmount: number;
    shippingAmount: number;
    total: number;
    paymentMethod: "cod" | "razorpay";
  }
) {
  const {
    dealershipId,
    resolvedItems,
    productMap,
    appliedDiscountId,
    discountCode,
    customerName,
    customerPhone,
    shippingAddress,
    subtotal,
    discountAmount,
    shippingAmount,
    total,
    paymentMethod,
  } = opts;

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
