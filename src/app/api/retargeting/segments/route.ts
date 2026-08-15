import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { COLD_LEAD_DAYS, getColdLeads } from "@/lib/agents/coldLeadAgent";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

const LAPSED_BUYER_DAYS = 60;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const lapsedCutoff = new Date(Date.now() - LAPSED_BUYER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [cartsRes, coldLeads, ordersRes] = await Promise.all([
    supabase.from("abandoned_carts").select("id, customer_name, items, contacted").eq("dealership_id", dealershipId).eq("contacted", false),
    getColdLeads(supabase, dealershipId),
    supabase.from("orders").select("customer_phone, customer_email, customer_name, created_at").eq("dealership_id", dealershipId).neq("status", "cancelled").order("created_at", { ascending: false }),
  ]);

  // Lapsed buyers: customers with exactly one order, and that order is
  // older than the cutoff — real repeat-purchase candidates, not a guess.
  const byCustomer: Record<string, { name: string; count: number; lastOrder: string }> = {};
  for (const o of ordersRes.data ?? []) {
    const key = o.customer_phone || o.customer_email || o.customer_name;
    if (!key) continue;
    if (!byCustomer[key]) byCustomer[key] = { name: o.customer_name, count: 0, lastOrder: o.created_at };
    byCustomer[key].count += 1;
  }
  const lapsedBuyers = Object.values(byCustomer).filter((c) => c.count === 1 && c.lastOrder < lapsedCutoff);

  const carts = cartsRes.data ?? [];
  const cartItemsSample = carts.slice(0, 5).flatMap((c: any) => (c.items ?? []).map((i: any) => i.name)).slice(0, 8);

  return NextResponse.json({
    segments: {
      abandoned_cart: { count: carts.length, sample: cartItemsSample },
      cold_lead: { count: coldLeads.length, cutoffDays: COLD_LEAD_DAYS },
      lapsed_buyer: { count: lapsedBuyers.length, cutoffDays: LAPSED_BUYER_DAYS },
    },
  });
}
