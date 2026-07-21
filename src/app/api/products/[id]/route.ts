import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const update: Record<string, any> = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.price !== undefined) update.price = Number(body.price);
  if (body.compareAtPrice !== undefined) update.compare_at_price = body.compareAtPrice === "" || body.compareAtPrice == null ? null : Number(body.compareAtPrice);
  if (body.images !== undefined) update.images = Array.isArray(body.images) ? body.images : [];
  if (body.sku !== undefined) update.sku = body.sku;
  if (body.category !== undefined) update.category = body.category;
  if (body.inventoryCount !== undefined) update.inventory_count = body.inventoryCount === "" || body.inventoryCount == null ? null : Number(body.inventoryCount);
  if (body.isActive !== undefined) update.is_active = !!body.isActive;
  if (body.orderIndex !== undefined) update.order_index = Number(body.orderIndex);

  const { data: product, error } = await supabase
    .from("products")
    .update(update)
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { error } = await supabase.from("products").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
