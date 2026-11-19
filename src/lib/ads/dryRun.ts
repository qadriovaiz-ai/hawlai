// Ask Meta whether it would accept this, without creating it.
//
// WHY THIS IS THE BEST THING AVAILABLE HERE. Everything else in
// preflight.ts is a rule this codebase decided for itself, and every
// such rule is a guess about what Meta will do. Meta will simply say.
// `execution_options: ["validate_only"]` runs the full validation and
// performs no mutation — nothing is created, nothing is spent, and the
// answer is Meta's own rather than ours.
//
// AND `synchronous_ad_review` IS THE REAL PRIZE. Meta's documentation
// says it must only ever be used TOGETHER WITH validate_only, and when
// it is, the call runs the Ads Integrity checks: message language, the
// image text rule, and the rest of the policy logic that otherwise only
// surfaces as a DISAPPROVED ad hours after launch. That is a policy
// review for free, before anything exists.
//
// ─────────────────────────────────────────────────────────────────────
// A FAILED VALIDATION CALL IS NOT A FAILED AD
// ─────────────────────────────────────────────────────────────────────
//
// The one way to get this wrong is to treat "I could not ask" as "the
// answer was no". Meta being briefly unreachable must not stop a launch
// that would have worked — the same rule getAdAccountLimits already
// states: being unable to reach Meta for a VALIDATION call is not a
// reason to refuse. So the outcome has three states, not two, and
// `inconclusive` is never reported as a pass.
//
// WHAT IT CANNOT DO. The ad set and the ad are validated with their
// real parent ids, which means the campaign already exists by then. A
// refusal at the ad set still leaves an empty paused campaign in Ads
// Manager — it just leaves it with an error the owner can act on
// instead of a Graph code. Only the campaign-level dry run prevents
// anything being created at all.

import { classifyGraphError, describeGraphFailure } from "@/lib/ads/metaRead";
import { metaLog, metaError } from "@/lib/ads/metaLog";

const GRAPH_VERSION = "v23.0";

/**
 * Meta's execution options.
 *
 * `validate_only` is NEVER optional on this path — it is the entire
 * difference between asking and doing, and dryRun.test.ts fails if any
 * call can be built without it.
 */
export const VALIDATE_ONLY = "validate_only";

/**
 * Runs Ads Integrity (language, the image text rule, policy) as part of
 * the validation. Meta's docs: it must always be specified WITH
 * validate_only, never by itself — alone it would mean a real creation
 * that is also reviewed.
 */
export const SYNCHRONOUS_AD_REVIEW = "synchronous_ad_review";

export type DryRunOutcome = {
  /** True only when Meta validated the spec. */
  ok: boolean;
  /**
   * Meta could not be asked. NOT a pass and NOT a refusal — the caller
   * proceeds, because a validation call that failed is not an invalid
   * ad, but nothing may report this as approved.
   */
  inconclusive: boolean;
  /** Meta's own words, in a form the owner can act on. Null when ok. */
  reason: string | null;
};

const PASSED: DryRunOutcome = { ok: true, inconclusive: false, reason: null };

/**
 * Build the execution options for a dry run.
 *
 * Separate and exported so the invariant is testable on its own: there
 * is no way to produce an options array from this function that does
 * not contain validate_only, and no way to get synchronous_ad_review
 * without it.
 */
export function executionOptions(opts: { review?: boolean } = {}): string[] {
  return opts.review ? [VALIDATE_ONLY, SYNCHRONOUS_AD_REVIEW] : [VALIDATE_ONLY];
}

/**
 * Ask Meta to validate one object without creating it.
 *
 * `path` is the same endpoint the real creation would POST to, and
 * `params` the same body — anything else would be validating a
 * different ad from the one about to be made.
 */
export async function dryRun(
  path: string,
  params: Record<string, any>,
  token: string,
  opts: { review?: boolean; stage: string; dealershipId?: string } = { stage: "dryrun" }
): Promise<DryRunOutcome> {
  const execution_options = executionOptions(opts);

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Spread FIRST so execution_options cannot be overwritten by a
      // caller's params. Without this ordering a stray key in a spec
      // would silently turn a validation into a real creation.
      body: JSON.stringify({ ...params, execution_options, access_token: token }),
    });
    const data: any = await res.json();

    if (res.ok && !data?.error) {
      metaLog("dryrun.passed", { stage: opts.stage, dealership: opts.dealershipId, review: Boolean(opts.review) });
      return PASSED;
    }

    const failure = classifyGraphError(res.status, data);

    // TRANSIENT MEANS WE COULD NOT ASK. A 500 or a rate limit says
    // nothing about the ad, and treating it as a refusal would block
    // launches every time Meta hiccuped.
    if (failure.transient) {
      metaLog("dryrun.inconclusive", { stage: opts.stage, dealership: opts.dealershipId, http: res.status, code: failure.code ?? null });
      return { ok: false, inconclusive: true, reason: describeGraphFailure(failure) };
    }

    metaError("dryrun.refused", {
      stage: opts.stage,
      dealership: opts.dealershipId,
      http: res.status,
      code: failure.code ?? null,
      subcode: failure.subcode ?? null,
      detail: failure.message,
    });
    return { ok: false, inconclusive: false, reason: describeGraphFailure(failure) };
  } catch (err: any) {
    // Never throws. A validation call that could not be made is the
    // inconclusive case, not a crash in the middle of a launch.
    metaLog("dryrun.inconclusive", { stage: opts.stage, dealership: opts.dealershipId, why: "network" });
    return { ok: false, inconclusive: true, reason: err?.message ?? "Could not reach Meta." };
  }
}

/**
 * What to tell the owner when Meta refused the spec.
 *
 * Meta's validation errors name the field and often the policy, which
 * is more than this codebase can work out for itself — so its words are
 * carried rather than replaced, with one sentence of context in front.
 */
export function dryRunMessage(outcome: DryRunOutcome, what: string): string | null {
  if (outcome.ok || outcome.inconclusive) return null;
  return `Meta won't accept this ${what}: ${outcome.reason ?? "it did not say why."} Nothing was created.`;
}
