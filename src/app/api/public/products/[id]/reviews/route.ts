import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, customer_name, rating, comment, created_at")
    .eq("product_id", id)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Couldn't load reviews" }, { status: 500 });

  const count = reviews?.length ?? 0;
  const average = count > 0 ? Math.round((reviews!.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0;

  return NextResponse.json({ average, count, reviews: reviews ?? [] });
}

// Verified-purchase reviews only — a review is always attached to a
// real order that actually contained this product and was marked
// "delivered" by the dealer. There's no customer login system here
// (checkout is guest-only), so eligibility is proven by matching the
// phone number the customer provides against a delivered order's
// customer_phone — never taken on trust, and never accepted from a
// client-supplied order id.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { phone, rating, comment } = body;

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
  }
  const normalizedPhone = String(phone ?? "").trim();
  if (normalizedPhone.length < 8) return NextResponse.json({ error: "Enter the phone number used on your order" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: product } = await supabase.from("products").select("id, dealership_id").eq("id", id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { data: candidateOrders } = await supabase
    .from("orders")
    .select("id, customer_name, customer_phone, items, created_at")
    .eq("dealership_id", product.dealership_id)
    .eq("customer_phone", normalizedPhone)
    .eq("status", "delivered")
    .order("created_at", { ascending: false });

  const ordersWithProduct = (candidateOrders ?? []).filter((o: any) => (o.items ?? []).some((it: any) => it.product_id === id));
  if (ordersWithProduct.length === 0) {
    return NextResponse.json({ error: "We couldn't find a delivered order for this product with that phone number" }, { status: 400 });
  }

  const orderIds = ordersWithProduct.map((o: any) => o.id);
  const { data: existingReviews } = await supabase.from("reviews").select("order_id").eq("product_id", id).in("order_id", orderIds);
  const reviewedOrderIds = new Set((existingReviews ?? []).map((r: any) => r.order_id));
  const eligibleOrder = ordersWithProduct.find((o: any) => !reviewedOrderIds.has(o.id));

  if (!eligibleOrder) {
    return NextResponse.json({ error: "You've already reviewed this product for your order" }, { status: 400 });
  }

  const { data: review, error } = await supabase.from("reviews").insert({
    dealership_id: product.dealership_id,
    product_id: id,
    order_id: eligibleOrder.id,
    customer_name: eligibleOrder.customer_name,
    rating: ratingNum,
    comment: comment ? String(comment).trim().slice(0, 1000) : null,
  }).select("*").single();

  if (error) return NextResponse.json({ error: "Couldn't save your review, please try again" }, { status: 500 });
  return NextResponse.json({ success: true, review });
}
