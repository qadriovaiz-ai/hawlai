import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: dealership }, { data: workflows }, activityResults, { data: runLogRows }] = await Promise.all([
    supabase.from("dealerships").select(`
      dm_auto_reply_enabled, comment_auto_reply_enabled,
      welcome_email_auto_enabled, follow_up_email_auto_enabled, follow_up_inactive_days,
      content_autopilot_enabled, content_autopilot_frequency_days,
      auto_call_new_leads,
      auto_pause_low_performers, auto_generate_variant_on_pause, seasonal_campaigns_enabled,
      auto_budget_reallocate_percent,
      gmail_email, fb_page_id
    `).eq("id", dealershipId).single(),
    supabase.from("workflows").select("id, name, enabled").eq("dealership_id", dealershipId),
    Promise.all([
      supabase.from("auto_reply_log").select("id, channel, success, created_at").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(5),
      supabase.from("email_automation_log").select("id, email_type, success, created_at").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(5),
      supabase.from("content_autopilot_log").select("id, success, created_at").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(5),
    ]),
    // P0 12d — last 7 days of automation_run_log (migration 126),
    // aggregated in JS below rather than a SQL GROUP BY: 13
    // subsystems x ~7 daily rows is small enough that fetching and
    // reducing here is simpler than adding a view/RPC for it.
    supabase.from("automation_run_log").select("subsystem, success, created_at").eq("dealership_id", dealershipId).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
  ]);

  const [{ data: replyLog }, { data: emailLog }, { data: contentLog }] = activityResults;
  const activity = [
    ...(replyLog ?? []).map((l: any) => ({ ...l, type: `Auto-reply (${l.channel})` })),
    ...(emailLog ?? []).map((l: any) => ({ ...l, type: `Auto-email (${l.email_type})` })),
    ...(contentLog ?? []).map((l: any) => ({ ...l, type: "Auto-post" })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  // rows arrive newest-first, so the first row seen per subsystem is
  // its most recent run.
  const bySubsystem: Record<string, { lastRunAt: string; lastSuccess: boolean; total: number; successCount: number }> = {};
  for (const row of runLogRows ?? []) {
    if (!bySubsystem[row.subsystem]) {
      bySubsystem[row.subsystem] = { lastRunAt: row.created_at, lastSuccess: row.success, total: 0, successCount: 0 };
    }
    bySubsystem[row.subsystem].total += 1;
    if (row.success) bySubsystem[row.subsystem].successCount += 1;
  }
  const automationHealth = Object.entries(bySubsystem).map(([subsystem, stats]) => ({
    subsystem,
    lastRunAt: stats.lastRunAt,
    lastSuccess: stats.lastSuccess,
    successRatePct: Math.round((stats.successCount / stats.total) * 100),
  }));

  return NextResponse.json({ dealership, workflows: workflows ?? [], activity, automationHealth });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  // auto_budget_reallocate_percent is deliberately NOT in this list —
  // read-only/display-only here too, matching the "Coming soon"
  // treatment on the settings page (P0 12a): dormant, no backend
  // logic reads it yet.
  const allowed = [
    "dm_auto_reply_enabled", "comment_auto_reply_enabled",
    "welcome_email_auto_enabled", "follow_up_email_auto_enabled", "follow_up_inactive_days",
    "content_autopilot_enabled", "content_autopilot_frequency_days",
    "auto_call_new_leads",
    "auto_pause_low_performers", "auto_generate_variant_on_pause", "seasonal_campaigns_enabled",
  ];
  const update: any = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { error } = await supabase.from("dealerships").update(update).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
