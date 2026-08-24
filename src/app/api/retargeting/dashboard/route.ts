import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Retargeting dashboard — piece 6/7.
//
// Answers "how many people are actually retargetable right now, and
// where did they stall?" from FIRST-PARTY data (our own tables), not
// from Meta. That's deliberate: Meta's audience counts are estimates
// with a reporting delay and a minimum threshold, so a dealer with 4
// abandoned carts sees "audience too small" there while our own tables
// can say plainly "4 people". Both numbers appear in the UI, labelled
// as what they are.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const service = createServiceClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [cartsRes, viewersRes, buyersRes, audiencesRes] = await Promise.all([
    service
      .from("abandoned_carts")
      .select("id, customer_name, items, created_at, contacted")
      .eq("dealership_id", dealershipId)
      .eq("contacted", false)
      .gte("created_at", since30)
      .order("created_at", { ascending: false })
      .limit(50),
    // Product views come from our own page_events. Only consented
    // events carry a visitor_id, so this counts distinct identifiable
    // viewers rather than raw hits — an honest "people", not "views".
    service
      .from("page_events")
      .select("visitor_id")
      .eq("dealership_id", dealershipId)
      .eq("event_type", "view")
      .not("visitor_id", "is", null)
      .gte("created_at", since30)
      .limit(5000),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("dealership_id", dealershipId)
      .neq("status", "cancelled"),
    service
      .from("meta_custom_audiences")
      .select("audience_key, approximate_count, sync_status, last_synced_at")
      .eq("dealership_id", dealershipId),
  ]);

  const carts = cartsRes.data ?? [];
  const distinctViewers = new Set((viewersRes.data ?? []).map((e: any) => e.visitor_id)).size;

  // Cart value is the real money sitting unconverted — far more
  // actionable to a dealer than a headcount alone.
  const cartValue = carts.reduce((sum: number, c: any) => {
    const items = Array.isArray(c.items) ? c.items : [];
    return sum + items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  }, 0);

  return NextResponse.json({
    segments: [
      {
        key: "abandoned_cart",
        label: "Left something in their cart",
        count: carts.length,
        valueInr: Math.round(cartValue),
        detail: carts.length > 0 ? `₹${Math.round(cartValue).toLocaleString("en-IN")} of unconverted carts` : null,
      },
      {
        key: "viewed_no_purchase",
        label: "Looked but didn't buy",
        count: distinctViewers,
        valueInr: null,
        detail: distinctViewers > 0 ? "People who browsed in the last 30 days" : null,
      },
      {
        key: "buyers",
        label: "Existing customers",
        count: buyersRes.count ?? 0,
        valueInr: null,
        detail: (buyersRes.count ?? 0) > 0 ? "Worth targeting for repeat purchases" : null,
      },
    ],
    metaAudiences: audiencesRes.data ?? [],
  });
}
