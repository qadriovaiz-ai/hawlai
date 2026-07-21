import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: products ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { name, description, price, compareAtPrice, images, sku, category, inventoryCount } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return NextResponse.json({ error: "A valid price is required" }, { status: 400 });
  }

  const { data: product, error } = await supabase.from("products").insert({
    dealership_id: dealershipId,
    name: name.trim(),
    description: description ?? null,
    price: priceNum,
    compare_at_price: compareAtPrice != null && compareAtPrice !== "" ? Number(compareAtPrice) : null,
    images: Array.isArray(images) ? images : [],
    sku: sku ?? null,
    category: category ?? null,
    inventory_count: inventoryCount != null && inventoryCount !== "" ? Number(inventoryCount) : null,
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product });
}
