import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { summariseOrders, SUMMARY_DAYS } from "@/lib/orders/summary";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // THE SUMMARY BY CHANNEL (Seller Mode Stats, 28 Nov 2026) — its own
  // query over the last 30 days, so it is not quietly limited to the 200
  // orders listed above. A summary that can't be read is null and the
  // card says so; the list still shows.
  const since = new Date(Date.now() - SUMMARY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: summaryError } = await supabase
    .from("orders")
    .select("channel, total, payment_status, status, created_at")
    .eq("dealership_id", dealershipId)
    .gte("created_at", since);
  if (summaryError) console.error(`[orders] couldn't build the summary for ${dealershipId}: ${summaryError.message}`);

  return NextResponse.json({ orders: orders ?? [], summary: summaryError ? null : summariseOrders(recent ?? []), summaryDays: SUMMARY_DAYS });
}
