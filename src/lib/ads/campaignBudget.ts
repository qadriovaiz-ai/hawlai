// What a Meta campaign will actually spend, read from Meta.
//
// WHY: the activation card showed "Daily budget: ₹0.00/day" for a
// campaign set to ₹100/day. It read ad_creatives.daily_budget, which is
// NULL on every row in production: the only write to it is the launch's
// local-save update, and production rejected that whole update because
// it also wrote columns production did not have (migration 140 had not
// been applied). NULL became 0, 0 became "₹0.00", and a card asking
// someone to approve spend showed a plausible, wrong amount.
//
// Meta holds the budget that will actually be spent. For campaigns
// Hawlai launches it is on the ad set (launchCampaign.ts sets
// daily_budget there), but it moves to the campaign if someone turns on
// campaign budget optimisation in Ads Manager, so both are checked.
//
// Reads go through metaRead, so a single transient Graph error is
// retried rather than turned into "couldn't confirm the budget".

import { formatMinorAmount } from "@/lib/ads/adAccountLimits";
import { metaRead } from "@/lib/ads/metaRead";

export type CampaignBudget = {
  kind: "daily" | "lifetime";
  /** Minor units (paise for INR), exactly as Meta returns them. */
  minor: number;
  level: "adset" | "campaign";
};

async function readNode(id: string, token: string): Promise<{ daily: number; lifetime: number } | null> {
  const r = await metaRead(id, "daily_budget,lifetime_budget", token, { stage: "budget.read" });
  if (!r.ok) return null;
  // Meta returns budgets as strings of minor units, and "0" or nothing
  // when the budget lives on the other level.
  return { daily: Number(r.data.daily_budget ?? 0) || 0, lifetime: Number(r.data.lifetime_budget ?? 0) || 0 };
}

/**
 * The budget Meta will spend against, or null when it can't be
 * established. Null is NEVER zero: callers must refuse to show an amount
 * rather than show one they don't have.
 */
export async function readCampaignBudget(
  ids: { adsetId: string | null; campaignId: string | null },
  token: string
): Promise<CampaignBudget | null> {
  for (const [level, id] of [["adset", ids.adsetId], ["campaign", ids.campaignId]] as const) {
    if (!id) continue;
    const node = await readNode(id, token);
    // A failed read of the ad set is not "no budget on the ad set", so it
    // does not fall through to the campaign and report that one instead.
    if (!node) return null;
    if (node.daily > 0) return { kind: "daily", minor: Math.round(node.daily), level };
    if (node.lifetime > 0) return { kind: "lifetime", minor: Math.round(node.lifetime), level };
  }
  return null;
}

/** "₹100.00/day", or "₹3,000.00 total" for a lifetime budget. */
export function describeBudget(budget: CampaignBudget, currency: string | null | undefined): string {
  const amount = formatMinorAmount(budget.minor, currency) ?? String(budget.minor / 100);
  return budget.kind === "daily" ? `${amount}/day` : `${amount} total`;
}
