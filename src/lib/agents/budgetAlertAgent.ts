// ------------------------------------------------------------------
// Campaign budget-overrun alerts — master audit Part B, Phase 2.
// ------------------------------------------------------------------
// Per-campaign, not agency-level: checks each launched campaign's own
// daily_budget (ad_creatives.daily_budget) against today's actual
// spend (campaign_performance_history.spend for snapshot_date =
// today). No new schema beyond the notification kind — both fields
// already exist.
//
// Periodic, not real-time: runs as a cron step immediately after
// snapshotCampaignPerformance() (called inside runDailyAutopilot,
// which always runs earlier in the same daily-run loop), reading the
// same row that step just wrote. This means a business finds out
// about an overrun up to ~24 hours after it happened, not the moment
// it happens — an accepted limitation of a daily-cron-based check,
// not real-time spend monitoring.
//
// Two distinct kinds, not one: a warning at 80% is useful specifically
// because it can still arrive before the overrun happens, giving a
// same-day window to act; collapsing this into a single 100%-only
// alert would mean the business only ever hears about it after the
// money's already spent.
//
// Unlike the churn/cold-lead dedupe keys, these DO include today's
// date and so re-fire daily — a campaign still over budget tomorrow
// is a new, still-relevant fact each day, not a one-time crossing.
// ------------------------------------------------------------------

import { emitNotification } from "@/lib/notifications/emit";
import { formatCurrency } from "@/lib/utils";

const WARNING_THRESHOLD = 0.8;

export async function checkCampaignBudgets(supabase: any, dealershipId: string): Promise<{ warnings: number; overruns: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: campaigns } = await supabase
    .from("ad_creatives")
    .select("id, headline, daily_budget")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched")
    .not("daily_budget", "is", null)
    .gt("daily_budget", 0);
  if (!campaigns || campaigns.length === 0) return { warnings: 0, overruns: 0 };

  const campaignIds = campaigns.map((c: any) => c.id);
  const { data: snapshots } = await supabase
    .from("campaign_performance_history")
    .select("ad_creative_id, spend")
    .in("ad_creative_id", campaignIds)
    .eq("snapshot_date", today);
  const spendById = new Map<string, number>((snapshots ?? []).map((s: any) => [s.ad_creative_id, Number(s.spend ?? 0)]));

  let warnings = 0;
  let overruns = 0;
  for (const campaign of campaigns) {
    const spend = spendById.get(campaign.id) ?? 0;
    const budget = Number(campaign.daily_budget);
    const ratio = spend / budget;
    if (ratio < WARNING_THRESHOLD) continue;

    // Overrun takes precedence — never emit both for the same campaign
    // on the same day, since crossing 100% already implies 80%.
    if (ratio >= 1) {
      await emitNotification(supabase, {
        dealershipId,
        kind: "campaign_budget_overrun",
        title: `"${campaign.headline}" is over its daily budget`,
        body: `Spent ${formatCurrency(spend)} of a ${formatCurrency(budget)} daily budget today.`,
        href: "/dashboard/ads/campaigns",
        dedupeKey: `budget_overrun:${campaign.id}:${today}`,
      });
      overruns++;
    } else {
      await emitNotification(supabase, {
        dealershipId,
        kind: "campaign_budget_warning",
        title: `"${campaign.headline}" is close to its daily budget`,
        body: `Spent ${formatCurrency(spend)} of a ${formatCurrency(budget)} daily budget today (${Math.round(ratio * 100)}%).`,
        href: "/dashboard/ads/campaigns",
        dedupeKey: `budget_warning:${campaign.id}:${today}`,
      });
      warnings++;
    }
  }
  return { warnings, overruns };
}
