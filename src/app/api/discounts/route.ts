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

  const { data: codes, error } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: codes ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const value = Number(body.value);

  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return NextResponse.json({ error: "Code must be 3-20 letters/numbers, e.g. WELCOME10" }, { status: 400 });
  if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "A valid discount value is required" }, { status: 400 });
  if (discountType === "percentage" && value > 100) return NextResponse.json({ error: "Percentage discount can't exceed 100" }, { status: 400 });

  const { data: existing } = await supabase.from("discount_codes").select("id").eq("dealership_id", dealershipId).eq("code", code).maybeSingle();
  if (existing) return NextResponse.json({ error: "This code already exists" }, { status: 400 });

  const { data: discount, error } = await supabase.from("discount_codes").insert({
    dealership_id: dealershipId,
    code,
    discount_type: discountType,
    value,
    min_order_value: body.minOrderValue ? Number(body.minOrderValue) : null,
    max_uses: body.maxUses ? Number(body.maxUses) : null,
    expires_at: body.expiresAt || null,
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ discount });
}
