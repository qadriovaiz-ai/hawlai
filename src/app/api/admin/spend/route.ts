import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Restricted to is_platform_admin. Blends two genuinely different
// kinds of numbers, kept clearly separate rather than silently
// combined into one misleading total:
//   1. EXACT — from api_usage_logs, computed at call time from the
//      real token/duration counts the provider returned (currently
//      covers Master Chat's Claude usage and every Vapi call).
//   2. ESTIMATED — round-number-per-unit guesses for everything not
//      yet instrumented (content/image/video generation outside
//      Master Chat, and any Claude calls made by department pages
//      directly rather than through Master Chat).
const ESTIMATE_RATES_INR = { perContentPiece: 2, perImage: 3, perVideo: 40 };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const service = createServiceClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  const [{ data: usageLogs }, { data: content }, { data: images }, { data: videos }, { data: dealerships }] = await Promise.all([
    service.from("api_usage_logs").select("dealership_id, service, operation, input_tokens, output_tokens, duration_seconds, cost_inr").gte("created_at", since),
    service.from("content_pieces").select("dealership_id").gte("created_at", since),
    service.from("graphic_designs").select("dealership_id").gte("created_at", since),
    service.from("video_generations").select("dealership_id").gte("created_at", since),
    service.from("dealerships").select("id, dealership_name, plan"),
  ]);

  const logs = usageLogs ?? [];
  const claudeLogs = logs.filter((l) => l.service === "anthropic");
  const vapiLogs = logs.filter((l) => l.service === "vapi");

  const exactClaudeCostInr = claudeLogs.reduce((sum, l) => sum + Number(l.cost_inr), 0);
  const exactVapiCostInr = vapiLogs.reduce((sum, l) => sum + Number(l.cost_inr), 0);
  const totalCallMinutes = vapiLogs.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0) / 60;
  const totalMasterChatMessages = claudeLogs.length;

  const totalContent = (content ?? []).length;
  const totalImages = (images ?? []).length;
  const totalVideos = (videos ?? []).length;
  const estimatedContentCostInr = totalContent * ESTIMATE_RATES_INR.perContentPiece + totalImages * ESTIMATE_RATES_INR.perImage + totalVideos * ESTIMATE_RATES_INR.perVideo;

  const perDealership = (dealerships ?? []).map((d) => {
    const dClaudeCost = claudeLogs.filter((l) => l.dealership_id === d.id).reduce((sum, l) => sum + Number(l.cost_inr), 0);
    const dVapiLogs = vapiLogs.filter((l) => l.dealership_id === d.id);
    const dVapiCost = dVapiLogs.reduce((sum, l) => sum + Number(l.cost_inr), 0);
    const dContent = (content ?? []).filter((c) => c.dealership_id === d.id).length;
    const dImages = (images ?? []).filter((c) => c.dealership_id === d.id).length;
    const dVideos = (videos ?? []).filter((c) => c.dealership_id === d.id).length;
    const dEstimated = dContent * ESTIMATE_RATES_INR.perContentPiece + dImages * ESTIMATE_RATES_INR.perImage + dVideos * ESTIMATE_RATES_INR.perVideo;
    return {
      id: d.id, name: d.dealership_name, plan: d.plan ?? "free",
      exactCostInr: Math.round((dClaudeCost + dVapiCost) * 100) / 100,
      estimatedCostInr: Math.round(dEstimated),
      calls: dVapiLogs.length, content: dContent, images: dImages, videos: dVideos,
    };
  }).filter((d) => d.exactCostInr > 0 || d.estimatedCostInr > 0)
    .sort((a, b) => (b.exactCostInr + b.estimatedCostInr) - (a.exactCostInr + a.estimatedCostInr));

  return NextResponse.json({
    since,
    exact: {
      claudeCostInr: Math.round(exactClaudeCostInr * 100) / 100,
      vapiCostInr: Math.round(exactVapiCostInr * 100) / 100,
      totalCostInr: Math.round((exactClaudeCostInr + exactVapiCostInr) * 100) / 100,
      masterChatMessages: totalMasterChatMessages,
      callCount: vapiLogs.length,
      callMinutes: Math.round(totalCallMinutes),
    },
    estimated: {
      costInr: Math.round(estimatedContentCostInr),
      content: totalContent,
      images: totalImages,
      videos: totalVideos,
    },
    perDealership,
    totalDealerships: (dealerships ?? []).length,
  });
}
