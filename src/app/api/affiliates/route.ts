import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureGate";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

async function generateCodeForAffiliate(supabase: any, dealershipId: string, name: string, rate: number, type: string) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "AFF";
  let code = `${base}${type === "percentage" ? rate : "FLAT"}`;
  let attempt = 0;
  while (attempt < 5) {
    const { data: existing } = await supabase.from("discount_codes").select("id").eq("dealership_id", dealershipId).eq("code", code).maybeSingle();
    if (!existing) break;
    attempt += 1;
    code = `${base}${type === "percentage" ? rate : "FLAT"}${attempt}`;
  }
  const { error } = await supabase.from("discount_codes").insert({
    dealership_id: dealershipId, code, discount_type: "percentage", value: 5, // customer-facing discount kept modest (5%); affiliate's own commission_rate is separate and tracked independently
  });
  if (error) throw new Error(error.message);
  return code;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("affiliates").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  const affiliates = data ?? [];

  const codes = affiliates.map((a) => a.discount_code).filter(Boolean);
  let ordersByCode: Record<string, { count: number; revenue: number }> = {};
  if (codes.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("discount_code, total, status")
      .eq("dealership_id", dealershipId)
      .in("discount_code", codes)
      .neq("status", "cancelled");
    for (const o of orders ?? []) {
      const key = o.discount_code as string;
      if (!ordersByCode[key]) ordersByCode[key] = { count: 0, revenue: 0 };
      ordersByCode[key].count += 1;
      ordersByCode[key].revenue += Number(o.total) || 0;
    }
  }

  const enriched = affiliates.map((a) => {
    const stats = a.discount_code ? ordersByCode[a.discount_code] : null;
    const revenue = stats?.revenue ?? 0;
    const orderCount = stats?.count ?? 0;
    const commissionEarned = a.commission_type === "percentage" ? (revenue * Number(a.commission_rate)) / 100 : orderCount * Number(a.commission_rate);
    return {
      ...a,
      real_orders_count: a.discount_code ? orderCount : null,
      real_revenue: a.discount_code ? revenue : null,
      commission_earned: a.discount_code ? Math.round(commissionEarned * 100) / 100 : 0,
      commission_owed: a.discount_code ? Math.round((commissionEarned - Number(a.total_paid)) * 100) / 100 : 0,
    };
  });

  return NextResponse.json({ affiliates: enriched });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const gate = await requireFeature(supabase, dealershipId, "affiliateMarketing");
  if (!gate.allowed) return gate.response;

  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const commissionType = body.commissionType === "fixed" ? "fixed" : "percentage";
  const commissionRate = Number(body.commissionRate) || 10;

  let code: string | null = null;
  try {
    code = await generateCodeForAffiliate(supabase, dealershipId, body.name, commissionRate, commissionType);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const { data, error } = await supabase.from("affiliates").insert({
    dealership_id: dealershipId,
    name: body.name.trim(),
    email: body.email ?? null,
    phone: body.phone ?? null,
    notes: body.notes ?? null,
    discount_code: code,
    commission_type: commissionType,
    commission_rate: commissionRate,
    status: body.status === "pending" ? "pending" : "active",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, affiliate: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, action, ...fields } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Approving a pending (self-applied) affiliate generates their code now,
  // since applicants don't get one until the dealer approves them.
  if (action === "approve") {
    const { data: affiliate } = await supabase.from("affiliates").select("name, commission_rate, commission_type, discount_code").eq("id", id).eq("dealership_id", dealershipId).single();
    if (!affiliate) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

    let code = affiliate.discount_code;
    if (!code) {
      try {
        code = await generateCodeForAffiliate(supabase, dealershipId, affiliate.name, affiliate.commission_rate, affiliate.commission_type);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }
    const { error } = await supabase.from("affiliates").update({ status: "active", discount_code: code }).eq("id", id).eq("dealership_id", dealershipId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, discountCode: code });
  }

  const update: any = {};
  if (fields.status !== undefined) update.status = fields.status;
  if (fields.commissionRate !== undefined) update.commission_rate = fields.commissionRate;
  if (fields.commissionType !== undefined) update.commission_type = fields.commissionType;
  if (fields.totalPaid !== undefined) update.total_paid = fields.totalPaid;
  if (fields.notes !== undefined) update.notes = fields.notes;

  const { error } = await supabase.from("affiliates").update(update).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  const { error } = await supabase.from("affiliates").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
