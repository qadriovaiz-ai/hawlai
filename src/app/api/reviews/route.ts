import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

// Dealer-side listing for moderation — includes hidden reviews (unlike
// the public GET /api/public/products/[id]/reviews, which never
// returns hidden ones).
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  let query = supabase.from("reviews").select("*, products(name)").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  if (productId) query = query.eq("product_id", productId);

  const { data: reviews, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: reviews ?? [] });
}
