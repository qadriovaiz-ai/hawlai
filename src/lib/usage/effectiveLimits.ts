// ------------------------------------------------------------------
// Effective limits — Usage/Pricing/Cost-Control spec, Phase 4 / 2a.
// ------------------------------------------------------------------
// Applies an agency's per-client override on top of the plan's own
// limits (client_limit_overrides, migration 148).
//
// THE CORE RULE: an override can only ever TIGHTEN. If it's higher
// than the plan grants, or the plan is unlimited and the override
// isn't, the tighter of the two wins — never the looser. Otherwise an
// override becomes a back door to grant more than the plan sells,
// which would quietly undercut pricing.
//
// Deliberately a thin transform over getDealershipPlanLimits() rather
// than a parallel limits system: every existing caller
// (checkAndRecordGenerationUsage, checkAndRecordMessageUsage,
// checkResearchCredits, recordCallingMinutes, the usage dashboard)
// keeps reading the same PlanLimits shape, so overrides apply
// everywhere at once without touching enforcement logic.
// ------------------------------------------------------------------

import { getDealershipPlanLimits, type PlanLimits } from "@/lib/plans";

export interface ClientLimitOverrideRow {
  images_per_month: number | null;
  videos_per_month: number | null;
  voiceover_chars_per_month: number | null;
  research_credits_per_month: number | null;
  calling_minutes: number | null;
  messages_per_day: number | null;
}

/**
 * The tighter of a plan limit and an override.
 * - override null  -> plan value unchanged (no override set)
 * - plan null (unlimited) + override set -> override wins (tightening
 *   unlimited to a real number is still tightening)
 * - both set -> the smaller
 */
function tighter(planValue: number | null, override: number | null | undefined): number | null {
  if (override == null) return planValue;
  if (planValue == null) return override;
  return Math.min(planValue, override);
}

export function applyOverrides(limits: PlanLimits, override: ClientLimitOverrideRow | null): PlanLimits {
  if (!override) return limits;
  return {
    ...limits,
    imagesPerMonth: tighter(limits.imagesPerMonth, override.images_per_month),
    videosPerMonth: tighter(limits.videosPerMonth, override.videos_per_month),
    voiceoverCharsPerMonth: tighter(limits.voiceoverCharsPerMonth, override.voiceover_chars_per_month),
    researchCreditsPerMonth: tighter(limits.researchCreditsPerMonth, override.research_credits_per_month),
    messagesPerDay: tighter(limits.messagesPerDay, override.messages_per_day),
    // callingFreeMinutes is a plain number, never null — it's an
    // included allowance, not a cap, so "unlimited" isn't a state it
    // can be in. Math.min directly rather than through tighter().
    callingFreeMinutes: override.calling_minutes == null
      ? limits.callingFreeMinutes
      : Math.min(limits.callingFreeMinutes, override.calling_minutes),
  };
}

/**
 * Drop-in replacement for getDealershipPlanLimits() that also applies
 * any agency override. Best-effort on the override read: if that
 * query fails, the plan's own limits still apply rather than the whole
 * usage check erroring out — failing open to the PLAN limit (not to
 * unlimited) keeps the real ceiling intact.
 */
export async function getEffectiveLimits(supabase: any, dealershipId: string): Promise<PlanLimits> {
  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  try {
    const { data: override } = await supabase
      .from("client_limit_overrides")
      .select("images_per_month, videos_per_month, voiceover_chars_per_month, research_credits_per_month, calling_minutes, messages_per_day")
      .eq("dealership_id", dealershipId)
      .maybeSingle();
    return applyOverrides(limits, override as ClientLimitOverrideRow | null);
  } catch (err: any) {
    console.error("[effectiveLimits] override lookup failed, using plan limits:", err.message);
    return limits;
  }
}
