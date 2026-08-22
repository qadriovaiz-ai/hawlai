// ------------------------------------------------------------------
// Platform-wide daily spend alert — Usage/Pricing/Cost-Control spec,
// Phase 3b (replacing the spec's literal CostGuard, by confirmed
// decision).
// ------------------------------------------------------------------
// Every genuinely expensive operation here is ALREADY hard-capped
// before it runs (video: monthly + daily caps from P0 migration 125;
// images/voiceover/brand kits/websites: monthly caps; research
// credits and Master Chat messages: hard-block via UsageGuard). A
// per-request cost-estimate-and-confirm layer would have duplicated
// protection that already exists.
//
// What per-request caps structurally CANNOT catch is aggregate
// runaway spend across ALL businesses at once — 50 businesses each
// staying politely within their own caps still adds up. That's the
// gap this fills, and it's the one an operator actually loses money to.
//
// KNOWN LIMITATION, accepted deliberately: this rides the existing
// once-daily Vercel cron, so it reports the PREVIOUS COMPLETE DAY and
// catches a problem within ~24h, not within minutes. That's an
// acceptable v1 precisely because the per-request caps above already
// bound how bad any single day can get. Faster detection would need
// its own cron schedule or a check inside the 2-minute event-dispatch
// route (which would add a DB query to every dispatch).
// ------------------------------------------------------------------

import { emitNotification } from "@/lib/notifications/emit";

const DEFAULT_THRESHOLD_INR = 2000;

export interface PlatformSpendCheckResult {
  checkedDate: string;
  totalSpendInr: number;
  thresholdInr: number;
  exceeded: boolean;
  /** Distinct admin dealerships notified — not admin headcount, since one bell is shared per business. */
  adminsNotified: number;
}

/** Yesterday in UTC, as YYYY-MM-DD — the last COMPLETE day at the time the daily cron fires. */
function previousDayUtc(): { date: string; start: string; end: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { date: start.toISOString().slice(0, 10), start: start.toISOString(), end: end.toISOString() };
}

/**
 * Sums real logged API cost across EVERY business for the previous
 * complete day and, if it crosses the configured threshold, notifies
 * each platform admin. Service-role client required — this reads
 * across all dealerships, which no per-business client can do.
 */
export async function checkPlatformDailySpend(supabase: any): Promise<PlatformSpendCheckResult> {
  const { date, start, end } = previousDayUtc();

  const [{ data: settingRow }, { data: logs }, { data: admins }] = await Promise.all([
    supabase.from("platform_settings").select("value").eq("key", "daily_spend_alert_inr").maybeSingle(),
    supabase.from("api_usage_logs").select("dealership_id, cost_inr").gte("created_at", start).lt("created_at", end),
    supabase.from("profiles").select("id, dealership_id").eq("is_platform_admin", true),
  ]);

  // Falls back to the default rather than skipping the check — a
  // missing or malformed setting row should never silently disable
  // cost alerting.
  const parsed = Number(settingRow?.value);
  const thresholdInr = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD_INR;

  const rows = logs ?? [];
  const totalSpendInr = Math.round(rows.reduce((sum: number, l: any) => sum + (Number(l.cost_inr) || 0), 0) * 100) / 100;

  if (totalSpendInr <= thresholdInr) {
    return { checkedDate: date, totalSpendInr, thresholdInr, exceeded: false, adminsNotified: 0 };
  }

  // Name the biggest spenders in the alert body — knowing the total
  // crossed without knowing where it came from isn't actionable.
  const byDealership = new Map<string, number>();
  for (const l of rows) byDealership.set(l.dealership_id, (byDealership.get(l.dealership_id) ?? 0) + (Number(l.cost_inr) || 0));
  const topIds = Array.from(byDealership.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const { data: topDealerships } = topIds.length > 0
    ? await supabase.from("dealerships").select("id, dealership_name").in("id", topIds.map(([id]) => id))
    : { data: [] };
  const nameById = new Map((topDealerships ?? []).map((d: any) => [d.id, d.dealership_name]));
  const topLine = topIds
    .map(([id, cost]) => `${nameById.get(id) ?? "Unknown"} ₹${Math.round(cost)}`)
    .join(" · ");

  // notifications.dealership_id is NOT NULL — the table is inherently
  // per-business, and a platform-wide alert has no dealership. Each
  // admin gets it on their OWN dealership so it lands in the
  // notification bell they already use, rather than needing a
  // separate platform-alert surface.
  //
  // Emitted per DISTINCT DEALERSHIP, not per admin: notifications are
  // read per-dealership (notifications_dealership_all), so two admins
  // sharing a business share one bell — emitting per-admin would put
  // two identical rows in it. The dedupe key matches that grain
  // (dealership + date), colliding with the unique index on
  // (dealership_id, dedupe_key) so a retried or re-run cron no-ops.
  const adminDealershipIds = Array.from(new Set((admins ?? []).map((a: any) => a.dealership_id).filter(Boolean)));
  for (const dealershipId of adminDealershipIds) {
    await emitNotification(supabase, {
      dealershipId: dealershipId as string,
      kind: "platform_spend_alert",
      title: `Platform AI spend hit ₹${Math.round(totalSpendInr).toLocaleString("en-IN")} on ${date}`,
      body: `That's above the ₹${thresholdInr.toLocaleString("en-IN")}/day alert threshold.${topLine ? ` Biggest: ${topLine}.` : ""}`,
      href: "/dashboard/admin/spend",
      dedupeKey: `platform_spend:${date}`,
    });
  }

  return { checkedDate: date, totalSpendInr, thresholdInr, exceeded: true, adminsNotified: adminDealershipIds.length };
}
