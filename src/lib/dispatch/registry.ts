// WHICH SENDS GO THROUGH THE ENVELOPE — S6/P1.
//
// ONE TABLE, so the approvals route stops being the place where "how do
// we carry this out?" is answered ten different ways. A registered
// action type is executed by its dispatcher and by nothing else, which
// `tests/dispatchEnvelope.test.ts` asserts by reading the route: two
// paths for one action is how one of them comes to disagree with the
// other.
//
// IT GROWS ONE DISPATCHER AT A TIME, on purpose. This route is what
// carries out everything the owner approves; a sweep that moved all ten
// branches at once would be unverifiable by one person, which is the
// same argument the S6 plan makes about retiring agents.
//
// NOT HERE YET, and each for a reason:
//   send_email      two paths (team and customer) and migration 208's
//                   idempotency claim. Its own commit.
//   publish_post,
//   reply_public    they go through publishActions/socialPost today,
//                   which already has a shape. Moving them means
//                   deciding whether that shape IS this one.
//   create_discount_code, publish_site, generate_graphic,
//   change_campaign_budget, change_campaign_targeting,
//   activate_ad_campaign
//                   RESOURCE EDITS, not sends — they belong to
//                   publish/, and some already are. A Dispatch envelope
//                   around an edit would be the one-type-for-everything
//                   mistake the architecture doc's §4.2 rejected.

import type { DispatchKey, Dispatcher } from "@/lib/dispatch/types";
import { callDispatcher } from "@/lib/dispatch/call";
import { videoDispatcher } from "@/lib/dispatch/video";

export const DISPATCHERS: Record<DispatchKey, Dispatcher> = {
  place_outbound_call: callDispatcher,
  publish_video: videoDispatcher,
};

/**
 * The dispatcher for an action type, or null when it has none yet.
 *
 * `hasOwnProperty`, NOT a bare index — found by its own test on the day
 * this was written. `DISPATCHERS["toString"]` walks the prototype chain
 * and hands back `Object.prototype.toString`: the route would then call
 * `.execute()` on it. `action_type` is a free-text column, and
 * requestApproval is not the only thing that inserts a row into
 * `pending_approvals`, so "nothing would ever put that string there" is
 * not a guarantee this function gets to rely on.
 */
export function dispatcherFor(actionType: string | null | undefined): Dispatcher | null {
  const key = String(actionType ?? "");
  if (!Object.prototype.hasOwnProperty.call(DISPATCHERS, key)) return null;
  return DISPATCHERS[key as DispatchKey];
}

/** Every action type the envelope carries out. */
export function dispatchedActionTypes(): DispatchKey[] {
  return Object.keys(DISPATCHERS) as DispatchKey[];
}
