import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { effectiveBusinessModels } from "@/lib/business/businessModel";
import { buildSuppressionList, isSuppressed } from "@/lib/ads/audienceHashing";
import { audiencesFor, listMembers } from "@/lib/retargeting/audiences";

// Retargeting dashboard — piece 6/7.
//
// Answers "how many people are actually retargetable right now, and
// where did they stall?" from FIRST-PARTY data (our own tables), not
// from Meta. That's deliberate: Meta's audience counts are estimates
// with a reporting delay and a minimum threshold, so a dealer with 4
// abandoned carts sees "audience too small" there while our own tables
// can say plainly "4 people". Both numbers appear in the UI, labelled
// as what they are.
//
// BY BUSINESS MODEL (R2, 2026-09-20): the cards are this business's
// audiences (lib/retargeting/audiences.ts). A list is counted the way it's
// synced — opted-out people excluded. An audience only the pixel sees
// (booking-page visitors) has no count of ours, and says so.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const service = createServiceClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: dealership }, { data: catalogue }, audiencesRes, suppression] = await Promise.all([
    service.from("dealerships").select("business_models").eq("id", dealershipId).maybeSingle(),
    service.from("products").select("kind").eq("dealership_id", dealershipId).eq("is_active", true),
    service.from("meta_custom_audiences").select("audience_key, approximate_count, sync_status, last_synced_at").eq("dealership_id", dealershipId),
    buildSuppressionList(service, dealershipId),
  ]);
  const productCount = (catalogue ?? []).filter((p: any) => p.kind !== "service").length;
  const models = effectiveBusinessModels(dealership?.business_models, { productCount, serviceCount: (catalogue ?? []).length - productCount });
  // The lookalike is new people — nobody of ours to count.
  const audiences = audiencesFor(models.models).filter((a) => a.type !== "lookalike");

  const segments = await Promise.all(
    audiences.map(async (a) => {
      if (a.key === "abandoned_cart") {
        const { data: carts } = await service
          .from("abandoned_carts")
          .select("id, items")
          .eq("dealership_id", dealershipId)
          .eq("contacted", false)
          .gte("created_at", since30)
          .limit(50);
        // Cart value is the real money sitting unconverted — far more
        // actionable to a dealer than a headcount alone.
        const valueInr = (carts ?? []).reduce((sum: number, c: any) => {
          const items = Array.isArray(c.items) ? c.items : [];
          return sum + items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
        }, 0);
        const count = (carts ?? []).length;
        return { key: a.key, label: a.label, count, valueInr: Math.round(valueInr), detail: count > 0 ? `₹${Math.round(valueInr).toLocaleString("en-IN")} of unconverted carts` : null };
      }
      if (a.key === "viewed_no_purchase") {
        // Only consented events carry a visitor_id, so this counts distinct
        // identifiable viewers rather than raw hits — "people", not "views".
        const { data: views } = await service
          .from("page_events")
          .select("visitor_id")
          .eq("dealership_id", dealershipId)
          .eq("event_type", "view")
          .not("visitor_id", "is", null)
          .gte("created_at", since30)
          .limit(5000);
        const count = new Set((views ?? []).map((e: any) => e.visitor_id)).size;
        return { key: a.key, label: a.label, count, valueInr: null, detail: count > 0 ? "People who browsed in the last 30 days" : null };
      }
      if (a.type === "customer_list") {
        const members = await listMembers(service, dealershipId, a.key);
        const count = members.filter((m) => (m.phone || m.email) && !isSuppressed(suppression, m.phone, m.email)).length;
        return { key: a.key, label: a.label, count, valueInr: null, detail: count > 0 ? a.description : null };
      }
      // Pixel-only: Meta's count is the only one there is.
      return { key: a.key, label: a.label, count: null, valueInr: null, detail: "Counted by Meta from your pixel — see Meta's estimate once synced" };
    })
  );

  return NextResponse.json({ segments, metaAudiences: audiencesRes.data ?? [] });
}
