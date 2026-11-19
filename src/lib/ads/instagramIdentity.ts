// The Instagram account an ad runs under, when there is one.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THE FIELD NAME MATTERS MORE THAN USUAL
// ─────────────────────────────────────────────────────────────────────
//
// `instagram_actor_id` was DEPRECATED in Marketing API v22.0 and
// replaced by `instagram_user_id`. This codebase is on v23.0, so the
// old field is not merely discouraged, it is gone. Meta's error
// reference also says sending BOTH is an error — so this is a single
// correct name, never a belt-and-braces pair.
//
// Neither name appears anywhere else in this repository. There is no
// migration to do and no legacy caller to keep working: ads have simply
// been running without an Instagram identity, which is why they have
// been Facebook-only.
//
// ─────────────────────────────────────────────────────────────────────
// AN ABSENT INSTAGRAM IS NOT A BROKEN ONE
// ─────────────────────────────────────────────────────────────────────
//
// Most small businesses have a Facebook Page and no connected
// Instagram professional account, and that has to stay a perfectly good
// way to advertise. So every failure in this file degrades to the same
// place: no field, Facebook-only placement, and a sentence saying so.
//
// The ad never stops because of Instagram. An optional identity that
// can fail a launch is worse than no identity at all — it would turn a
// working product into a broken one for the businesses least able to
// diagnose it.

import { metaRead } from "@/lib/ads/metaRead";

export type InstagramIdentity = {
  /** Meta's id for the connected professional account. */
  id: string;
  /** For the owner's own message — "@candle_by_qaaf", not a number. */
  username: string | null;
};

/**
 * The Instagram professional account connected to this Page, if any.
 *
 * NULL IS THE ORDINARY ANSWER and means "run this on Facebook only".
 * Every failure path returns it: no account linked, a token without the
 * scope to see it, Meta unreachable. None of those is worth stopping a
 * launch for, and none of them is distinguishable from the others in a
 * way the owner could act on anyway.
 */
export async function readInstagramIdentity(
  pageId: string,
  token: string,
  dealershipId?: string
): Promise<InstagramIdentity | null> {
  const r = await metaRead(pageId, "instagram_business_account{id,username}", token, {
    stage: "identity.instagram",
    dealershipId,
  });
  if (!r.ok) return null;

  const account = r.data?.instagram_business_account;
  if (!account?.id) return null;

  return { id: String(account.id), username: account.username ? String(account.username) : null };
}

/**
 * What to tell the owner about where this ad will appear.
 *
 * SAID EVERY TIME, in both directions. "Also on Instagram" is worth
 * knowing, and "Facebook only, here is why" is worth knowing more —
 * because an owner who expected Instagram and got silence has no way to
 * tell a missing feature from a broken one.
 *
 * NEVER PHRASED AS AN ERROR. No Instagram is a normal state for a
 * normal business, and an ad that ran perfectly well is not a problem
 * report.
 */
export function placementNote(identity: InstagramIdentity | null, reason?: "refused"): string {
  if (identity) {
    const handle = identity.username ? `@${identity.username}` : "your Instagram account";
    return `This ad will run on Facebook and on Instagram, as ${handle}.`;
  }
  if (reason === "refused") {
    return "This ad will run on Facebook only. Meta wouldn't accept your Instagram account for it, so it was left off rather than holding the ad back — the ad itself is unaffected.";
  }
  return "This ad will run on Facebook only. To have it appear on Instagram as well, connect an Instagram professional account to your Facebook Page in Meta Business Suite.";
}

/**
 * Add the identity to a creative spec — or hand back the spec untouched.
 *
 * A FUNCTION RATHER THAN A SPREAD AT THE CALL SITE, so there is exactly
 * one place that knows the field's name. The day Meta renames it again
 * — it has once already — this is the only line to change, and the
 * test that forbids `instagram_actor_id` has one place to look.
 */
export function withInstagramIdentity<T extends { object_story_spec: Record<string, any> }>(
  spec: T,
  identity: InstagramIdentity | null
): T {
  if (!identity) return spec;
  return {
    ...spec,
    object_story_spec: { ...spec.object_story_spec, instagram_user_id: identity.id },
  };
}
