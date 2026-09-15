import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runAndLog } from "@/lib/automation/runAndLog";
import { checkPlatformDailySpend } from "@/lib/agents/platformSpendAlertAgent";
import { ensureResendWebhook } from "@/lib/email/resendWebhook";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { runSubsystemsInOrder } from "@/lib/automation/dailyRun";
import { GROUPS, ALL, type SubsystemKey } from "@/lib/automation/cronGroups";

// Triggered by Vercel Cron once a day (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
// is set as an env var — we check for it here. If CRON_SECRET isn't
// set yet, the route still works (useful while testing) but logs a
// warning, since it'd otherwise be publicly triggerable.
// ------------------------------------------------------------------
// SUBSYSTEM GROUPS — audit item R7.
// ------------------------------------------------------------------
// All fifteen subsystems used to run in ONE invocation, sequentially,
// for every dealership. A timeout partway through silently skipped
// every later subsystem for every remaining tenant, and the run still
// reported success for whatever it had managed.
//
// Worse, and only found while fixing this: THIS ROUTE NEVER SET
// maxDuration. Other long routes in this codebase set 300 explicitly;
// this one ran on the platform default, which is far shorter than a
// loop containing several LLM calls per dealership needs. The
// "timeout partway through" in the audit finding was not hypothetical
// — it was the likely steady state.
//
// Split by COST rather than per-dealership fan-out. Fan-out needs a
// queue or self-invocation, which is a lot of machinery for eight
// tenants, and it would not help the case that actually hurts: one
// tenant with enough data to exhaust a single budget. Grouping gives
// the slow work its own budget so it cannot starve the fast work,
// which is what the finding is about.
// The groups and their ORDER live in cronGroups.ts — order is budget on
// a 60-second plan, and a killed invocation records nothing.


// 60, not the 300 used by other long routes here: Vercel Hobby caps
// function duration at 60 seconds. Setting 300 would be aspirational
// at best and a rejected deployment at worst.
//
// WORTH KNOWING, not fixed here: several existing routes in this
// codebase (master-brain, website-builder, 3d-scenes, the whatsapp
// webhook) declare maxDuration = 300 while on a plan that caps at 60.
// They are either being silently capped or would fail on a config
// change — recorded rather than changed, since altering them is
// outside this item.
//
// CONSEQUENCE FOR THE HEAVY GROUP, stated plainly: eight dealerships
// times three LLM-backed subsystems will not reliably finish inside 60
// seconds. The partial-run detection below is what makes that visible
// instead of silent, and per-dealership batching with a cursor is the
// real fix if it proves to be a problem.
export const maxDuration = 60;

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

  // Which slice of the work this invocation is responsible for.
  // Absent = everything, so a manual call still runs the full set.
  const groupParam = new URL(request.url).searchParams.get("group");
  const subsystems = groupParam ? GROUPS[groupParam] : ALL;
  if (!subsystems) {
    return NextResponse.json(
      { error: `Unknown group "${groupParam}". Expected one of: ${Object.keys(GROUPS).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data: dealerships, error } = await supabase.from("dealerships").select("id, business_category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Declared BEFORE any work starts, so a partial run is detectable by
  // comparison rather than by noticing nothing complained.
  const expected = (dealerships?.length ?? 0) * subsystems.length;
  let completed = 0;
  const failures: { dealershipId: string; subsystem: string; error: string }[] = [];

  // Each subsystem stays wrapped in runAndLog — one failing never
  // blocks the next, and each writes its own automation_run_log row.
  // What is new is that the outcome is COUNTED, not just logged.
  async function run<T>(dealershipId: string, subsystem: SubsystemKey, fn: () => Promise<T>) {
    const result = await runAndLog(supabase, dealershipId, subsystem, fn);
    if (result && typeof result === "object" && "error" in result) {
      failures.push({ dealershipId, subsystem, error: String((result as any).error) });
    } else {
      completed++;
    }
    return result;
  }

  // Platform-wide, so outside the per-business work, and FIRST in the
  // signals run: registering the Resend webhook has to happen before the
  // morning's emails go out, and neither may be skipped by a run that ends
  // early. Not counted in `expected` — one call for the whole platform.
  let platformSpend: any = null;
  let resendWebhook: any = null;
  if (!groupParam || groupParam === "signals") {
    // Keeps Resend sending delivery events (bounces, spam complaints) to
    // Hawlai — registered through the API, so no secret is copied by hand.
    resendWebhook = await ensureResendWebhook();
    if ("error" in resendWebhook) failures.push({ dealershipId: "-", subsystem: "resend_webhook", error: resendWebhook.error });
    try {
      platformSpend = await checkPlatformDailySpend(supabase);
    } catch (err: any) {
      console.error("[autopilot] platform spend check failed:", err.message);
      platformSpend = { error: err.message };
      failures.push({ dealershipId: "-", subsystem: "platform_spend", error: err.message });
    }
  }

  // Each subsystem across every business, then the next, in the group's
  // order (lib/automation/dailyRun.ts) — so a run that runs out of time
  // has already done the sends, for every business, before the AI work.
  const results = await runSubsystemsInOrder({
    dealerships: dealerships ?? [],
    subsystems,
    execute: (subsystem, d) => run(d.id, subsystem, () => DAILY_RUNNERS[subsystem](supabase, d.id, d.business_category ?? "business")),
  });

  const partial = completed < expected || failures.length > 0;
  const summary = {
    ranAt: new Date().toISOString(),
    group: groupParam ?? "all",
    dealerships: dealerships?.length ?? 0,
    expected,
    completed,
    failed: failures.length,
    failures: failures.slice(0, 20),
    results,
    platformSpend,
    resendWebhook,
  };

  if (partial) {
    // A NON-2XX is the point. Vercel records a failed cron invocation
    // and surfaces it in its own monitoring, so an incomplete run is
    // visible without building an alerting system for it. Returning
    // 200 with a failure count buried in the body is exactly the
    // silence the audit flagged.
    //
    // Deliberately strict: any subsystem failing for any dealership
    // marks the run failed. For a once-a-day job, a transient failure
    // that nobody hears about is worse than an alert that turns out to
    // be transient.
    console.error(`[autopilot] PARTIAL RUN group=${groupParam ?? "all"} completed=${completed}/${expected} failed=${failures.length}`);
    return NextResponse.json(summary, { status: 500 });
  }

  return NextResponse.json(summary);
}
