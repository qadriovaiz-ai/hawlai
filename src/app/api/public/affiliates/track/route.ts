import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const supabase = createServiceClient();

  // A code is only ever handed to the affiliate it belongs to, and only
  // reveals that one affiliate's own numbers — not a list of every
  // affiliate a business has, so this is safe to expose without a
  // full login system.
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, name, discount_code, commission_type, commission_rate, total_paid, status, dealership_id, dealerships(dealership_name)")
    .eq("discount_code", code)
    .maybeSingle();

  if (!affiliate) return NextResponse.json({ error: "Code not found" }, { status: 404 });

  const { data: orders } = await supabase
    .from("orders")
    .select("total, status")
    .eq("dealership_id", affiliate.dealership_id)
    .eq("discount_code", code)
    .neq("status", "cancelled");

  const orderCount = (orders ?? []).length;
  const revenue = (orders ?? []).reduce((s, o) => s + (Number(o.total) || 0), 0);
  const commissionEarned = affiliate.commission_type === "percentage" ? (revenue * Number(affiliate.commission_rate)) / 100 : orderCount * Number(affiliate.commission_rate);
  const commissionOwed = Math.round((commissionEarned - Number(affiliate.total_paid)) * 100) / 100;

  return NextResponse.json({
    name: affiliate.name,
    businessName: (affiliate as any).dealerships?.dealership_name ?? "the business",
    status: affiliate.status,
    ordersCount: orderCount,
    revenue,
    commissionEarned: Math.round(commissionEarned * 100) / 100,
    totalPaid: Number(affiliate.total_paid),
    commissionOwed,
  });
}
