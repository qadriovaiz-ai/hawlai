import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { buildSendHealth } from "@/lib/automation/sendHealth";
import { buildExportHealth, EXPORT_FREQUENCIES } from "@/lib/leads/scheduledExport";
import { exportRole, NOT_ALLOWED } from "@/lib/leads/exportLeads";

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

  const [{ data: dealership }, { data: workflows }, activityResults, { data: runLogRows }, { data: postLog7d }] = await Promise.all([
    supabase.from("dealerships").select(`
      dm_auto_reply_enabled, comment_auto_reply_enabled,
      welcome_email_auto_enabled, follow_up_email_auto_enabled, follow_up_inactive_days,
      content_autopilot_enabled, content_autopilot_frequency_days,
      auto_call_new_leads,
      auto_pause_low_performers, auto_generate_variant_on_pause, seasonal_campaigns_enabled,
      auto_budget_reallocate_percent,
      gmail_email, fb_page_id,
      lead_export_frequency
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
    supabase.from("automation_run_log").select("subsystem, success, detail, created_at").eq("dealership_id", dealershipId).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
    // What auto-posting actually PUBLISHED in the last 7 days. The run log
    // above says whether the cron job ran; this says whether a post reached
    // the Page — the only thing "success" should mean for this row.
    supabase.from("content_autopilot_log").select("success, error, post_id, created_at").eq("dealership_id", dealershipId).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
  ]);

  // P1 18b — event_queue/agent_tasks track their own status directly
  // on each row (no separate log table needed the way cron subsystems
  // needed automation_run_log), so their health is computed straight
  // from those tables and merged into the same automationHealth shape
  // below rather than building a second, parallel health surface.
  // WELCOME/FOLLOW-UP EMAILS AND WORKFLOWS ARE JUDGED BY WHAT WAS SENT —
  // the same reason as auto-posting below. Their run-log rows read
  // "100% success" while every run had skipped with automation off.
  const workflowIds = (workflows ?? []).map((w: any) => w.id);
  const [{ data: emailSends7d }, { data: stepRuns7d }] = await Promise.all([
    supabase.from("email_automation_log").select("success, error, resend_message_id, created_at").eq("dealership_id", dealershipId).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
    workflowIds.length
      ? supabase.from("workflow_step_runs").select("success, error, resend_message_id, sent_at").in("workflow_id", workflowIds).gte("sent_at", sevenDaysAgo).order("sent_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const messageIds = [...(emailSends7d ?? []), ...(stepRuns7d ?? [])].map((r: any) => r.resend_message_id).filter(Boolean);
  const { data: deliveries } = messageIds.length
    ? await supabase.from("email_sends").select("resend_message_id, delivery_status").in("resend_message_id", messageIds)
    : { data: [] as any[] };
  const deliveryStatus = Object.fromEntries((deliveries ?? []).map((d: any) => [d.resend_message_id, d.delivery_status]));

  const [{ data: eventRows }, { data: taskRows }] = await Promise.all([
    supabase.from("event_queue").select("status, processed_at, created_at").eq("dealership_id", dealershipId).gte("created_at", sevenDaysAgo).in("status", ["done", "failed"]).order("processed_at", { ascending: false }),
    supabase.from("agent_tasks").select("status, completed_at, created_at").eq("dealership_id", dealershipId).gte("created_at", sevenDaysAgo).in("status", ["done", "failed"]).order("completed_at", { ascending: false }),
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
  const automationHealth: any[] = Object.entries(bySubsystem).map(([subsystem, stats]) => ({
    subsystem,
    lastRunAt: stats.lastRunAt,
    lastSuccess: stats.lastSuccess,
    successRatePct: Math.round((stats.successCount / stats.total) * 100),
  }));

  const lastRunOf = (subsystem: string) => (runLogRows ?? []).find((r: any) => r.subsystem === subsystem) ?? null;

  // The scheduled export's last result, whenever it was — a monthly export
  // is still worth showing three weeks later.
  const { data: latestExport } = await supabase
    .from("lead_export_log")
    .select("created_at, success, error, row_count, new_count")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // REPLACES the run-log row, never adds beside it: the card shows the
  // first row per subsystem, and the daily run logs every skipped export
  // ("off", "not due") as a successful run — which is how this row read
  // "100% success (7d)" after the schedule was switched on.
  const exportHealth = buildExportHealth({ frequency: (dealership?.lead_export_frequency ?? "off") as any, latest: latestExport ?? null, lastRun: lastRunOf("lead_export") });
  const exportIdx = automationHealth.findIndex((h) => h.subsystem === "lead_export");
  if (exportIdx >= 0) automationHealth[exportIdx] = exportHealth;
  else automationHealth.push(exportHealth);
  for (const row of [
    buildSendHealth({
      subsystem: "email_automation",
      unit: "emails",
      attempts: (emailSends7d ?? []).map((r: any) => ({ success: r.success, error: r.error, at: r.created_at, messageId: r.resend_message_id })),
      deliveryStatus,
      lastRun: lastRunOf("email_automation"),
    }),
    buildSendHealth({
      subsystem: "workflows",
      unit: "steps",
      attempts: (stepRuns7d ?? []).map((r: any) => ({ success: r.success, error: r.error, at: r.sent_at, messageId: r.resend_message_id })),
      deliveryStatus,
      lastRun: lastRunOf("workflows"),
    }),
  ]) {
    // Shown only once the subsystem has run or sent something — same as every other row.
    if (!row.lastCronRunAt && row.attempted === 0) continue;
    const idx = automationHealth.findIndex((h) => h.subsystem === row.subsystem);
    if (idx >= 0) automationHealth[idx] = row;
    else automationHealth.push(row);
  }

  // SOCIAL AUTO-POSTING IS JUDGED BY WHAT WAS POSTED. The row above, from
  // automation_run_log, only says the cron job ran without throwing —
  // including every run that skipped, failed to generate, or posted an
  // image with no caption. That is how this line read "100% success" while
  // one captionless post reached Facebook in 28 days.
  const postRows = (postLog7d ?? []) as { success: boolean; error: string | null; post_id: string | null; created_at: string }[];
  const cronRow = automationHealth.find((h) => h.subsystem === "content_autopilot");
  if (cronRow || postRows.length > 0 || dealership?.content_autopilot_enabled) {
    const succeeded = postRows.filter((r) => r.success).length;
    const lastFailure = postRows.find((r) => !r.success);
    const postHealth = {
      subsystem: "content_autopilot",
      lastRunAt: postRows[0]?.created_at ?? cronRow?.lastRunAt ?? null,
      lastSuccess: postRows.length ? postRows[0].success : false,
      // null, not 100, when nothing was attempted: "no posts" is not a
      // success rate.
      successRatePct: postRows.length ? Math.round((succeeded / postRows.length) * 100) : null,
      postsAttempted: postRows.length,
      postsPublished: succeeded,
      lastError: lastFailure?.error ?? null,
      lastCronRunAt: cronRow?.lastRunAt ?? null,
    };
    const idx = automationHealth.findIndex((h) => h.subsystem === "content_autopilot");
    if (idx >= 0) automationHealth[idx] = postHealth;
    else automationHealth.push(postHealth);
  }

  // Same {subsystem, lastRunAt, lastSuccess, successRatePct} shape as
  // above, computed directly rather than via bySubsystem — rows arrive
  // newest-first here too, so [0] is the most recent.
  for (const [subsystem, rows, resolvedAtField] of [
    ["event_bus", eventRows ?? [], "processed_at"],
    ["task_queue", taskRows ?? [], "completed_at"],
  ] as const) {
    if (rows.length === 0) continue;
    const successCount = rows.filter((r: any) => r.status === "done").length;
    automationHealth.push({
      subsystem,
      lastRunAt: (rows[0] as any)[resolvedAtField] ?? rows[0].created_at,
      lastSuccess: rows[0].status === "done",
      successRatePct: Math.round((successCount / rows.length) * 100),
    });
  }

  const canExport = Boolean(await exportRole(dealershipId, user.id).catch(() => null));
  return NextResponse.json({ dealership, workflows: workflows ?? [], activity, automationHealth, canExport });
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
  // The scheduled leads export mails the whole lead list's download link —
  // only the owner or an admin may switch it on, off or change it.
  if (body.lead_export_frequency !== undefined) {
    if (!EXPORT_FREQUENCIES.includes(body.lead_export_frequency)) return NextResponse.json({ error: "Choose off, weekly or monthly" }, { status: 400 });
    if (!(await exportRole(dealershipId, user.id).catch(() => null))) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });
    update.lead_export_frequency = body.lead_export_frequency;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { error } = await supabase.from("dealerships").update(update).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
