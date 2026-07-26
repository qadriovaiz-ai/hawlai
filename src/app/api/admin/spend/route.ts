import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Restricted to is_platform_admin — this shows totals ACROSS every
// business on the platform, which is Hawlai's own operating-cost
// visibility, not something any individual dealership should see
// about others. Uses the service client for the actual aggregation
// (cross-dealership queries would otherwise be blocked by each
// table's own dealership-scoped RLS policy) but only after confirming
// the caller is a platform admin via the normal user-scoped client.
//
// Cost figures here are ROUGH ESTIMATES from round-number per-unit
// rates, not a reconciliation against actual provider invoices —
// flagged clearly in the response and the UI. Real per-call token/
// duration-based cost logging would be needed for exact numbers.
const COST_ESTIMATES = {
  perCallPerMinuteINR: 7, // ~$0.09/min seen on the Vapi dashboard, converted
  perContentPieceINR: 2,
  perImageINR: 3,
  perVideoINR: 40,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_platform_admin, dealership_id").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const service = createServiceClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  const [{ data: calls }, { data: content }, { data: images }, { data: videos }, { data: dealerships }] = await Promise.all([
    service.from("calls").select("dealership_id, duration").gte("created_at", since),
    service.from("content_pieces").select("dealership_id").gte("created_at", since),
    service.from("graphic_designs").select("dealership_id").gte("created_at", since),
    service.from("video_generations").select("dealership_id").gte("created_at", since),
    service.from("dealerships").select("id, dealership_name, plan"),
  ]);

  const totalCallMinutes = (calls ?? []).reduce((sum, c) => sum + (c.duration ?? 0), 0) / 60;
  const totalCalls = (calls ?? []).length;
  const totalContent = (content ?? []).length;
  const totalImages = (images ?? []).length;
  const totalVideos = (videos ?? []).length;

  const estimatedCostINR =
    totalCallMinutes * COST_ESTIMATES.perCallPerMinuteINR +
    totalContent * COST_ESTIMATES.perContentPieceINR +
    totalImages * COST_ESTIMATES.perImageINR +
    totalVideos * COST_ESTIMATES.perVideoINR;

  // Per-dealership breakdown so an admin can see who's driving usage.
  const perDealership = (dealerships ?? []).map((d) => {
    const dCalls = (calls ?? []).filter((c) => c.dealership_id === d.id);
    const dMinutes = dCalls.reduce((sum, c) => sum + (c.duration ?? 0), 0) / 60;
    const dContent = (content ?? []).filter((c) => c.dealership_id === d.id).length;
    const dImages = (images ?? []).filter((c) => c.dealership_id === d.id).length;
    const dVideos = (videos ?? []).filter((c) => c.dealership_id === d.id).length;
    const cost = dMinutes * COST_ESTIMATES.perCallPerMinuteINR + dContent * COST_ESTIMATES.perContentPieceINR + dImages * COST_ESTIMATES.perImageINR + dVideos * COST_ESTIMATES.perVideoINR;
    return { id: d.id, name: d.dealership_name, plan: d.plan ?? "free", calls: dCalls.length, content: dContent, images: dImages, videos: dVideos, estimatedCostINR: Math.round(cost) };
  }).filter((d) => d.calls || d.content || d.images || d.videos)
    .sort((a, b) => b.estimatedCostINR - a.estimatedCostINR);

  return NextResponse.json({
    since,
    totals: { calls: totalCalls, callMinutes: Math.round(totalCallMinutes), content: totalContent, images: totalImages, videos: totalVideos },
    estimatedCostINR: Math.round(estimatedCostINR),
    isEstimate: true,
    perDealership,
    totalDealerships: (dealerships ?? []).length,
  });
}
