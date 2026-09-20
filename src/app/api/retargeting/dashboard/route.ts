import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { effectiveBusinessModels } from "@/lib/business/businessModel";
import { buildSuppressionList, isSuppressed } from "@/lib/ads/audienceHashing";
import { variantsFor, listMembers } from "@/lib/retargeting/audiences";
import { stepFor, NO_FREQUENCY_CAP_NOTE } from "@/lib/retargeting/messages";

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
// synced — opted-out people and anyone who already bought or booked
// excluded. An audience only the pixel sees (booking-page visitors) has no
// count of ours, and says so. Recent-interest audiences are one card per
// tier (R3): 1-3, 4-14, 15-30 days.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const service = createServiceClient();

  const [{ data: dealership }, { data: catalogue }, audiencesRes, suppression] = await Promise.all([
    service.from("dealerships").select("business_models").eq("id", dealershipId).maybeSingle(),
    service.from("products").select("kind").eq("dealership_id", dealershipId).eq("is_active", true),
    service.from("meta_custom_audiences").select("audience_key, approximate_count, sync_status, last_synced_at").eq("dealership_id", dealershipId),
    buildSuppressionList(service, dealershipId),
  ]);
  const productCount = (catalogue ?? []).filter((p: any) => p.kind !== "service").length;
  const models = effectiveBusinessModels(dealership?.business_models, { productCount, serviceCount: (catalogue ?? []).length - productCount });
  // The lookalike is new people, and the converters list is who to EXCLUDE
  // — neither is an audience to advertise to.
  const audiences = variantsFor(models.models).filter((v) => v.def.type !== "lookalike" && !v.def.converters);

  const segments = await Promise.all(
    audiences.map(async (v) => {
      // Which of the three messages this group's ad is (R4).
      const step = stepFor(v.tier);
      const a = { key: v.id, label: v.label, description: v.description, type: v.def.type, step: step ? { number: step.step, kind: step.kind, label: step.label, allowsOffer: step.allowsOffer } : null };
      if (v.def.key === "abandoned_cart") {
        // This tier's window, not the whole 30 days.
        const { data: carts } = await service
          .from("abandoned_carts")
          .select("id, items, created_at")
          .eq("dealership_id", dealershipId)
          .eq("contacted", false)
          .gte("created_at", new Date(Date.now() - v.tier!.toDays * 86_400_000).toISOString())
          .lt("created_at", new Date(Date.now() - v.tier!.fromDays * 86_400_000).toISOString())
          .limit(50);
        // Cart value is the real money sitting unconverted — far more
        // actionable to a dealer than a headcount alone.
        const valueInr = (carts ?? []).reduce((sum: number, c: any) => {
          const items = Array.isArray(c.items) ? c.items : [];
          return sum + items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
        }, 0);
        const count = (carts ?? []).length;
        return { ...a, count, valueInr: Math.round(valueInr), detail: count > 0 ? `₹${Math.round(valueInr).toLocaleString("en-IN")} of unconverted carts` : null };
      }
      if (v.def.key === "viewed_no_purchase") {
        // Only consented events carry a visitor_id, so this counts distinct
        // identifiable viewers rather than raw hits — "people", not "views".
        const { data: views } = await service
          .from("page_events")
          .select("visitor_id")
          .eq("dealership_id", dealershipId)
          .eq("event_type", "view")
          .not("visitor_id", "is", null)
          .gte("created_at", new Date(Date.now() - v.tier!.toDays * 86_400_000).toISOString())
          .lt("created_at", new Date(Date.now() - v.tier!.fromDays * 86_400_000).toISOString())
          .limit(5000);
        const count = new Set((views ?? []).map((e: any) => e.visitor_id)).size;
        return { ...a, count, valueInr: null, detail: count > 0 ? "People who browsed in the last 30 days" : null };
      }
      if (v.def.type === "customer_list") {
        const members = await listMembers(service, dealershipId, v.id, Date.now(), models.models);
        const count = members.filter((m) => (m.phone || m.email) && !isSuppressed(suppression, m.phone, m.email)).length;
        return { ...a, count, valueInr: null, detail: count > 0 ? a.description : null };
      }
      // Pixel-only: Meta's count is the only one there is.
      return { ...a, count: null, valueInr: null, detail: "Counted by Meta from your pixel — see Meta's estimate once synced" };
    })
  );

  return NextResponse.json({ segments, metaAudiences: audiencesRes.data ?? [], frequencyCapNote: NO_FREQUENCY_CAP_NOTE });
}
