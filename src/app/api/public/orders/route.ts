import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { resolveOrderPricing } from "@/lib/orderPricing";
import { applyOrderSideEffects } from "@/lib/orderFulfillment";
import { isRazorpayConfigured, createRazorpayOrder } from "@/lib/payments/razorpay";

// Public, unauthenticated endpoint — the storefront checkout page posts
// here. Prices are ALWAYS re-read from the products table server-side
// (never trusted from the client) so a tampered request can't checkout
// at a fake price.
//
// Two payment methods:
// - "cod" (default): the order is committed immediately, exactly as
//   before Razorpay existed.
// - "razorpay": this endpoint only creates a Razorpay order and returns
//   its id — nothing is written to the `orders` table yet. The order is
//   only committed by /api/public/orders/verify-payment, and only after
//   that route has verified the payment signature server-side. This
//   keeps an abandoned/failed online payment from ever creating a
//   pending order, decrementing stock, or notifying the dealer.
export async function POST(request: Request) {
  const body = await request.json();
  const { slug, customerName, customerPhone, customerEmail, shippingAddress, items, discountCode, honeypot, paymentMethod } = body;

  if (honeypot) return NextResponse.json({ success: true, orderId: "ok" });

  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!customerName || String(customerName).trim().length < 2) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!customerPhone || String(customerPhone).trim().length < 8) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
  if (!shippingAddress || String(shippingAddress).trim().length < 5) return NextResponse.json({ error: "Shipping address is required" }, { status: 400 });

  const supabase = createServiceClient();
  const pricing = await resolveOrderPricing(supabase, slug, items, discountCode);
  if (!pricing.ok) return NextResponse.json({ error: pricing.error }, { status: pricing.status });
  const { website, resolvedItems, productMap, subtotal, discountAmount, appliedDiscountId, shippingAmount, total } = pricing;

  if (paymentMethod === "razorpay") {
    if (!isRazorpayConfigured()) {
      return NextResponse.json({ error: "Online payment isn't available right now — please choose Cash on Delivery" }, { status: 400 });
    }
    try {
      const razorpayOrder = await createRazorpayOrder(Math.round(total * 100), `site_${slug}_${Date.now()}`);
      return NextResponse.json({
        success: true,
        razorpay: { orderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: process.env.RAZORPAY_KEY_ID },
        subtotal,
        discountAmount,
        shippingAmount,
        total,
      });
    } catch (err) {
      console.error("[razorpay] order creation failed", err);
      return NextResponse.json({ error: "Couldn't start online payment — please try Cash on Delivery" }, { status: 502 });
    }
  }

  const { data: order, error } = await supabase.from("orders").insert({
    dealership_id: website.dealership_id,
    website_id: website.id,
    customer_name: String(customerName).trim(),
    customer_phone: String(customerPhone).trim(),
    customer_email: customerEmail ? String(customerEmail).trim() : null,
    shipping_address: String(shippingAddress).trim(),
    items: resolvedItems,
    subtotal,
    discount_code: appliedDiscountId ? String(discountCode).trim().toUpperCase() : null,
    discount_amount: discountAmount,
    shipping_amount: shippingAmount,
    total,
    payment_method: "cod",
    payment_status: "pending",
    status: "new",
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Something went wrong placing your order, please try again" }, { status: 500 });

  await applyOrderSideEffects(supabase, {
    dealershipId: website.dealership_id,
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
    paymentMethod: "cod",
  });

  return NextResponse.json({ success: true, orderId: order.id, subtotal, discountAmount, shippingAmount, total });
}
