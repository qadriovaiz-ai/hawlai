import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getEffectiveLimits } from "@/lib/usage/effectiveLimits";
import { todayDateString } from "@/lib/usage/messageLimits";
import { currentBillingMonth } from "@/lib/usage/callingMinutes";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Effective, not plan — if an agency capped this client below their
  // tier, they see the real ceiling they're operating under. Showing
  // the plan number would be showing them something they can't reach
  // (confirmed transparency decision).
  const planLimits = await getEffectiveLimits(supabase, dealershipId);

  // daily_message_usage, calling_minutes_usage and
  // monthly_generation_usage have no RLS policy (see migrations 079,
  // 100) — read them through the service-role client, scoped to the
  // dealershipId already verified above, same as every other place
  // this app touches these tables.
  const service = createServiceClient();
  const [{ data: messageRow }, { data: callingRow }, { count: activeAdCampaigns }, { data: generationRows }, { data: creditsRow }] = await Promise.all([
    service.from("daily_message_usage").select("message_count").eq("dealership_id", dealershipId).eq("usage_date", todayDateString()).maybeSingle(),
    service.from("calling_minutes_usage").select("minutes_used, extra_minutes_charged, extra_charge_inr").eq("dealership_id", dealershipId).eq("billing_month", currentBillingMonth()).maybeSingle(),
    supabase.from("ad_creatives").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).eq("status", "launched").eq("meta_status", "ACTIVE"),
    service.from("monthly_generation_usage").select("resource, count").eq("dealership_id", dealershipId).eq("billing_month", currentBillingMonth()),
    service.from("research_credits_usage").select("credits_used").eq("dealership_id", dealershipId).eq("billing_month", currentBillingMonth()).maybeSingle(),
  ]);

  const generationUsage: Record<string, number> = {};
  for (const row of generationRows ?? []) generationUsage[row.resource] = row.count;

  return NextResponse.json({
    planLimits,
    messagesUsedToday: messageRow?.message_count ?? 0,
    calling: {
      minutesUsed: callingRow?.minutes_used ?? 0,
      extraMinutesCharged: callingRow?.extra_minutes_charged ?? 0,
      extraChargeInr: callingRow?.extra_charge_inr ?? 0,
    },
    activeAdCampaigns: activeAdCampaigns ?? 0,
    // Section 16 — Web Intelligence: research credits remaining.
    // Credit counts only, never the underlying real cost.
    researchCreditsUsed: creditsRow?.credits_used ?? 0,
    generation: {
      image: generationUsage.image ?? 0,
      video: generationUsage.video ?? 0,
      voiceoverChars: generationUsage.voiceover_chars ?? 0,
      brandKit: generationUsage.brand_kit ?? 0,
      websiteBuild: generationUsage.website_build ?? 0,
    },
  });
}
