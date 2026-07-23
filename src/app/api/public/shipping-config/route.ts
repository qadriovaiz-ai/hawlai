import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Lets the checkout page preview the shipping cost as the cart
// changes, before placing the order. The actual amount charged is
// always recomputed again, authoritatively, inside resolveOrderPricing
// when the order is placed — this is a preview only.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: website } = await supabase
    .from("websites")
    .select("shipping_mode, shipping_rate, shipping_free_threshold")
    .eq("slug", slug)
    .maybeSingle();

  if (!website) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  return NextResponse.json({
    mode: website.shipping_mode ?? "free",
    rate: Number(website.shipping_rate ?? 0),
    freeThreshold: website.shipping_free_threshold != null ? Number(website.shipping_free_threshold) : null,
  });
}
