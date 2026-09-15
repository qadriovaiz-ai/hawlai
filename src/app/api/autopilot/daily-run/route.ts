import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkPlatformDailySpend } from "@/lib/agents/platformSpendAlertAgent";
import { ensureResendWebhook } from "@/lib/email/resendWebhook";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { runDailyInvocation, type DailyGroup } from "@/lib/automation/dailyJobs";
import { GROUPS } from "@/lib/automation/cronGroups";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

// The daily automation run. Vercel Cron calls it twice a day (vercel.json:
// signals at 8:30 AM IST, heavy at 9:00) with `Authorization: Bearer
// $CRON_SECRET`; it also calls ITSELF, with the same secret from the
// server's own environment, to carry a run on.
//
// HOW IT WORKS (lib/automation/dailyJobs.ts): the cron's invocation writes
// today's job list — one job per business per automation — and every
// invocation works through it one job at a time, hands over to a fresh
// invocation, and stops taking jobs well inside Vercel Hobby's 60 seconds.
// It answers 202 at once and does the work in after(), so a hand-over
// request returns immediately.
//
// WHY: everything used to run inside one 60-second invocation. With five
// businesses, candle_by_qaaf's welcome emails ran on 10 Sep and not once on
// 11–15 Sep: the invocation was killed before reaching it, and a killed
// invocation writes nothing. A partial run now shows as unfinished or
// failed jobs on the Automation Health card, not as a 500 only Vercel's
// cron log showed.
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

  const url = new URL(request.url);
  // Which list this invocation works on. Absent = both, so a manual call
  // still runs everything.
  const groupParam = url.searchParams.get("group");
  if (groupParam && !(groupParam in GROUPS)) {
    return NextResponse.json({ error: `Unknown group "${groupParam}". Expected one of: ${Object.keys(GROUPS).join(", ")}` }, { status: 400 });
  }
  const groups = (groupParam ? [groupParam] : ["signals", "heavy"]) as DailyGroup[];
  const isContinuation = url.searchParams.get("continue") === "1";
  const runDate = indiaToday();

  const handOver = async (group: DailyGroup) => {
    const next = new URL("/api/autopilot/daily-run", url.origin);
    next.searchParams.set("group", group);
    next.searchParams.set("continue", "1");
    const res = await fetch(next, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status !== 202) throw new Error(`the next invocation answered ${res.status}`);
  };

  after(async () => {
    const service = createServiceClient();
    const summary = await runDailyInvocation(service, {
      groups,
      isContinuation,
      runDate,
      runners: DAILY_RUNNERS,
      handOver,
      // Platform-wide, once a day, first: the Resend webhook has to be
      // registered before the morning's emails go out.
      platformTasks: async () => {
        const resendWebhook = await ensureResendWebhook();
        if ("error" in resendWebhook) console.error("[autopilot] resend webhook:", resendWebhook.error);
        let platformSpend: unknown;
        try {
          platformSpend = await checkPlatformDailySpend(service);
        } catch (err: any) {
          console.error("[autopilot] platform spend check failed:", err.message);
          platformSpend = { error: err.message };
        }
        return { resendWebhook, platformSpend };
      },
    });
    console.log(`[autopilot] ${groups.join("+")} ${isContinuation ? "continuation" : "run"} ${JSON.stringify(summary).slice(0, 1000)}`);
  });

  return NextResponse.json({ accepted: true, groups, runDate, continuation: isContinuation }, { status: 202 });
}
