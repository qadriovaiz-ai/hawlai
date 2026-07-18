import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { runWorkflows } from "@/lib/automation/workflowEngine";
import { checkCompetitorAlerts } from "@/lib/automation/competitorMonitor";
import { checkTopicAlerts } from "@/lib/automation/topicMonitor";
import { runReportSnapshots } from "@/lib/automation/reportSnapshot";

// Triggered by Vercel Cron once a day (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
// is set as an env var — we check for it here. If CRON_SECRET isn't
// set yet, the route still works (useful while testing) but logs a
// warning, since it'd otherwise be publicly triggerable.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get("secret");
    const isAuthorized = authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[autopilot] CRON_SECRET is not set — this endpoint is currently unprotected.");
  }

  const supabase = createServiceClient();
  const { data: dealerships, error } = await supabase.from("dealerships").select("id, business_category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Record<string, any> = {};
  for (const dealership of dealerships ?? []) {
    try {
      results[dealership.id] = await runDailyAutopilot(supabase, dealership.id);
    } catch (err: any) {
      results[dealership.id] = { error: err.message };
    }
    try {
      results[dealership.id].emailAutomation = await runEmailAutomation(supabase, dealership.id);
    } catch (err: any) {
      results[dealership.id].emailAutomation = { error: err.message };
    }
    try {
      results[dealership.id].workflows = await runWorkflows(supabase, dealership.id);
    } catch (err: any) {
      results[dealership.id].workflows = { error: err.message };
    }
    try {
      results[dealership.id].competitorAlerts = await checkCompetitorAlerts(supabase, dealership.id);
    } catch (err: any) {
      results[dealership.id].competitorAlerts = { error: err.message };
    }
    try {
      results[dealership.id].topicAlerts = await checkTopicAlerts(supabase, dealership.id);
    } catch (err: any) {
      results[dealership.id].topicAlerts = { error: err.message };
    }
    try {
      results[dealership.id].reportSnapshots = await runReportSnapshots(supabase, dealership.id, dealership.business_category ?? "business");
    } catch (err: any) {
      results[dealership.id].reportSnapshots = { error: err.message };
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), dealerships: dealerships?.length ?? 0, results });
}
