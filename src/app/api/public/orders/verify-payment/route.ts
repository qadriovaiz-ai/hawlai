import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { resolveOrderPricing } from "@/lib/orderPricing";
import { applyOrderSideEffects } from "@/lib/orderFulfillment";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";

// Confirms a Razorpay payment and only then commits the order. The
// order is deliberately NOT written by /api/public/orders for the
// "razorpay" method — Razorpay Checkout.js's client-side success
// handler firing proves nothing on its own (it can be invoked with
// fabricated arguments from devtools), so payment_status is only ever
// set to "paid" here, after recomputing the HMAC signature from
// order_id + payment_id with our own key secret and confirming it
// matches what Razorpay sent back.
export async function POST(request: Request) {
  const body = await request.json();
  const {
    slug,
    customerName,
    customerPhone,
    customerEmail,
    shippingAddress,
    items,
    discountCode,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json({ error: "Missing payment confirmation details" }, { status: 400 });
  }
  if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  }

  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!customerName || String(customerName).trim().length < 2) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!customerPhone || String(customerPhone).trim().length < 8) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
  if (!shippingAddress || String(shippingAddress).trim().length < 5) return NextResponse.json({ error: "Shipping address is required" }, { status: 400 });

  const supabase = createServiceClient();
  const pricing = await resolveOrderPricing(supabase, slug, items, discountCode);
  if (!pricing.ok) return NextResponse.json({ error: pricing.error }, { status: pricing.status });
  const { website, resolvedItems, productMap, subtotal, discountAmount, appliedDiscountId, total } = pricing;

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
    total,
    payment_method: "razorpay",
    payment_status: "paid",
    status: "new",
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Payment verified but the order couldn't be saved — please contact the business" }, { status: 500 });

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
    total,
    paymentMethod: "razorpay",
  });

  return NextResponse.json({ success: true, orderId: order.id, subtotal, discountAmount, total });
}
