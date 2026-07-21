import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/agents/gmailAgent";
import { validateDiscountCode } from "@/lib/discounts";

// Public, unauthenticated endpoint — the storefront checkout page posts
// here. Prices are ALWAYS re-read from the products table server-side
// (never trusted from the client) so a tampered request can't checkout
// at a fake price. Payment is COD / pay-on-confirmation for now — no
// gateway is wired up yet, so we never claim a payment "succeeded".
export async function POST(request: Request) {
  const body = await request.json();
  const { slug, customerName, customerPhone, customerEmail, shippingAddress, items, discountCode, honeypot } = body;

  if (honeypot) return NextResponse.json({ success: true, orderId: "ok" });

  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!customerName || String(customerName).trim().length < 2) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!customerPhone || String(customerPhone).trim().length < 8) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
  if (!shippingAddress || String(shippingAddress).trim().length < 5) return NextResponse.json({ error: "Shipping address is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: website } = await supabase.from("websites").select("id, dealership_id, published").eq("slug", slug).maybeSingle();
  if (!website || !website.published) return NextResponse.json({ error: "This store isn't accepting orders right now" }, { status: 404 });

  const productIds = items.map((it: any) => it.productId).filter(Boolean);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, is_active, inventory_count")
    .in("id", productIds)
    .eq("dealership_id", website.dealership_id);
  if (productsError) return NextResponse.json({ error: "Couldn't verify products" }, { status: 500 });

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const resolvedItems: { product_id: string; name: string; price: number; quantity: number }[] = [];
  let subtotal = 0;

  for (const raw of items) {
    const product = productMap.get(raw.productId);
    if (!product || !product.is_active) {
      return NextResponse.json({ error: `An item in your cart is no longer available` }, { status: 400 });
    }
    const qty = Math.max(1, Math.min(99, Number(raw.quantity) || 1));
    if (product.inventory_count != null && product.inventory_count < qty) {
      return NextResponse.json({ error: `Only ${product.inventory_count} of "${product.name}" left in stock` }, { status: 400 });
    }
    resolvedItems.push({ product_id: product.id, name: product.name, price: Number(product.price), quantity: qty });
    subtotal += Number(product.price) * qty;
  }

  let discountAmount = 0;
  let appliedDiscountId: string | null = null;
  if (discountCode) {
    const result = await validateDiscountCode(supabase, website.dealership_id, discountCode, subtotal);
    if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
    discountAmount = result.discountAmount ?? 0;
    appliedDiscountId = result.discountId ?? null;
  }
  const total = Math.max(0, subtotal - discountAmount);

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
    payment_method: "cod",
    payment_status: "pending",
    status: "new",
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Something went wrong placing your order, please try again" }, { status: 500 });

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

  // Best-effort order notification to the dealer's own connected Gmail.
  // Never blocks order creation if Gmail isn't connected.
  try {
    const { data: dealership } = await supabase.from("dealerships").select("gmail_email, dealership_name").eq("id", website.dealership_id).single();
    if (dealership?.gmail_email) {
      const itemLines = resolvedItems.map((it) => `- ${it.name} x${it.quantity} — ₹${it.price}`).join("\n");
      await sendEmail(
        supabase,
        website.dealership_id,
        dealership.gmail_email,
        `New order from ${customerName}`,
        `New order placed on your website.\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nAddress: ${shippingAddress}\n\nItems:\n${itemLines}\n\nSubtotal: ₹${subtotal}${discountAmount > 0 ? `\nDiscount (${discountCode}): -₹${discountAmount}` : ""}\nTotal: ₹${total}\nPayment: Cash on Delivery (pending)\n\nView and confirm this order in your Hawlai dashboard.`
      );
    }
  } catch {
    // Non-fatal — order is already saved.
  }

  return NextResponse.json({ success: true, orderId: order.id, subtotal, discountAmount, total });
}
