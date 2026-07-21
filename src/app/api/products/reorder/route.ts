import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { productIds } = await request.json();
  if (!Array.isArray(productIds) || productIds.length === 0) return NextResponse.json({ error: "productIds required" }, { status: 400 });

  const { data: owned } = await supabase.from("products").select("id").eq("dealership_id", dealershipId);
  const ownedIds = new Set((owned ?? []).map((p) => p.id));
  if (!productIds.every((id: string) => ownedIds.has(id))) return NextResponse.json({ error: "Invalid product list" }, { status: 400 });

  await Promise.all(productIds.map((id: string, index: number) => supabase.from("products").update({ order_index: index }).eq("id", id)));
  return NextResponse.json({ success: true });
}
