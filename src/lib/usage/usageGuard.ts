// ------------------------------------------------------------------
// UsageGuard — Usage/Pricing/Cost-Control spec, Section 19.
// ------------------------------------------------------------------
// VERIFIED before building: the spec's exact flow ("identify plan ->
// estimate usage -> check remaining -> if allowed execute -> record
// actual -> update balance") was ALREADY implemented in this codebase,
// three separate times under three different names:
//   - checkAndRecordGenerationUsage (generationLimits.ts) — images,
//     video, voiceover chars, brand kits, website builds; monthly AND
//     daily layers; hard-blocks; 9 call sites.
//   - checkAndRecordMessageUsage (messageLimits.ts) — Master Chat
//     messages per day; hard-blocks.
//   - recordCallingMinutes (callingMinutes.ts) — deliberately soft:
//     calling intentionally does NOT block, it bills overage instead
//     (actual_cost + margin/min, Section 12). That's a product
//     decision, not a gap.
//   - checkResearchCredits (researchCredits.ts) — added in this same
//     piece, now hard-blocking to match the others.
//
// So this file is DELIBERATELY a thin facade, not a reimplementation.
// It exists for the one thing that was genuinely missing: a caller
// previously had to know which of four differently-named functions to
// call, with four different result shapes. Section 23 explicitly asks
// for centralized services rather than billing logic scattered around
// — this is that single entry point, delegating to the mechanisms
// that already work rather than replacing proven code.
//
// Calling is intentionally absent from GuardedResource: it never
// blocks by design. Including it here would imply a gate that
// shouldn't exist.

import { checkAndRecordGenerationUsage, generationLimitMessage, type GenerationResource } from "./generationLimits";
import { checkAndRecordMessageUsage } from "./messageLimits";
import { checkResearchCredits, researchCreditsLimitMessage } from "./researchCredits";

export type GuardedResource = GenerationResource | "message" | "research";

export interface UsageGuardResult {
  allowed: boolean;
  resource: GuardedResource;
  limit: number | null; // null = unlimited
  used: number;
  /** Customer-safe explanation, already worded for direct display. Only meaningful when allowed=false. */
  message: string;
  /** Which window was actually hit — only set for resources that have a daily layer. */
  period?: "daily" | "monthly";
}

/**
 * One entry point for every hard usage gate. Callers MUST run this
 * BEFORE the expensive provider call, never after.
 *
 * Note the difference in when usage is recorded, which is inherent to
 * each resource rather than an inconsistency:
 *   - generation + message: checked AND recorded here in one step
 *     (the unit is known upfront — 1 image, 1 message, N characters).
 *   - research: only CHECKED here. Credits derive from the call's real
 *     provider cost, which doesn't exist until the call returns, so
 *     the research agents call recordResearchCredits() afterwards.
 *     See checkResearchCredits()'s own comment for why this is the
 *     honest design rather than pre-charging a guess.
 */
export async function checkUsage(
  dealershipId: string,
  resource: GuardedResource,
  units: number = 1
): Promise<UsageGuardResult> {
  if (resource === "message") {
    const r = await checkAndRecordMessageUsage(dealershipId);
    return {
      allowed: r.allowed,
      resource,
      limit: r.messagesPerDay,
      used: r.usedToday,
      message: r.allowed ? "" : `You've hit today's message limit (${r.messagesPerDay}) for your plan. Upgrade for more, or try again tomorrow.`,
    };
  }

  if (resource === "research") {
    const r = await checkResearchCredits(dealershipId);
    return {
      allowed: r.allowed,
      resource,
      limit: r.limit,
      used: r.used,
      message: r.allowed ? "" : researchCreditsLimitMessage(r),
    };
  }

  const r = await checkAndRecordGenerationUsage(dealershipId, resource, units);
  return {
    allowed: r.allowed,
    resource,
    limit: r.limit,
    used: r.used,
    message: r.allowed ? "" : generationLimitMessage(r),
    period: r.period,
  };
}
