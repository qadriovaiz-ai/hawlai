import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { runWorkflows } from "@/lib/automation/workflowEngine";

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
  const { data: dealerships, error } = await supabase.from("dealerships").select("id");
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
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), dealerships: dealerships?.length ?? 0, results });
}
