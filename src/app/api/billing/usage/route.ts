import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getDealershipPlanLimits } from "@/lib/plans";
import { todayDateString } from "@/lib/usage/messageLimits";
import { currentBillingMonth } from "@/lib/usage/callingMinutes";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const planLimits = await getDealershipPlanLimits(supabase, dealershipId);

  // daily_message_usage and calling_minutes_usage have no RLS policy
  // yet (see migration 079) — read them through the service-role
  // client, scoped to the dealershipId already verified above, same as
  // every other place this app touches those two tables.
  const service = createServiceClient();
  const [{ data: messageRow }, { data: callingRow }, { count: activeAdCampaigns }] = await Promise.all([
    service.from("daily_message_usage").select("message_count").eq("dealership_id", dealershipId).eq("usage_date", todayDateString()).maybeSingle(),
    service.from("calling_minutes_usage").select("minutes_used, extra_minutes_charged, extra_charge_inr").eq("dealership_id", dealershipId).eq("billing_month", currentBillingMonth()).maybeSingle(),
    supabase.from("ad_creatives").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).eq("status", "launched").eq("meta_status", "ACTIVE"),
  ]);

  return NextResponse.json({
    planLimits,
    messagesUsedToday: messageRow?.message_count ?? 0,
    calling: {
      minutesUsed: callingRow?.minutes_used ?? 0,
      extraMinutesCharged: callingRow?.extra_minutes_charged ?? 0,
      extraChargeInr: callingRow?.extra_charge_inr ?? 0,
    },
    activeAdCampaigns: activeAdCampaigns ?? 0,
  });
}
