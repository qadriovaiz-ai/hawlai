// WHAT A DECISION WILL BE MEASURED BY — S5/P1.
//
// `decisions.measure` is NOT NULL, so every decision has to name what
// the results job will read at its check date. This file is where that
// name comes from, and it is pure so every answer is checked without a
// database.
//
// THE UNCOMFORTABLE FACT THIS FILE RECORDS. There are 33 action types
// in executionPolicy.ts, and for a good share of them THIS PRODUCT
// COLLECTS NO COUNTED CONSEQUENCE. Nothing records how many people
// watched a published video or looked at a generated graphic. The
// honest answer for those is not to invent a metric — it is to name
// what a person would look at, and let the outcome come back
// `not_measurable` with the reason.
//
// That is what migration 215's fourth verdict is for, and it means
// something the founder should expect rather than discover: a good part
// of the first month's outcomes will say "could not tell". That is the
// system working.
//
// THE LIST IS EXPLICIT IN BOTH DIRECTIONS. An action whose consequence
// IS counted says which table the number comes from. An action whose
// consequence is NOT counted is named too, rather than falling through
// a default that makes the map look complete when it is not. A test
// fails if any action type is in neither list.

import { ACTION_POLICIES } from "@/lib/executionPolicy";

export type Measure = {
  /** What the results job reads. Named so it never has to guess. */
  metric: string;
  /** Which table the number comes from, or null when nothing holds it. */
  source: string | null;
  /** Lower is better, for the measures where direction is obvious. */
  direction: "up" | "down";
};

/**
 * A measure this product can actually read.
 *
 * Every `source` here is a table confirmed to exist: email_sends (088),
 * calls (001), orders (054), leads (001), page_events (041).
 */
const COUNTED: Record<string, Measure> = {
  send_email: { metric: "emails delivered to this customer", source: "email_sends", direction: "up" },
  welcome_email: { metric: "emails delivered to this customer", source: "email_sends", direction: "up" },
  follow_up_email: { metric: "emails delivered to this customer", source: "email_sends", direction: "up" },
  place_outbound_call: { metric: "calls completed", source: "calls", direction: "up" },
  auto_call_new_lead: { metric: "calls completed", source: "calls", direction: "up" },
  auto_call_new_leads: { metric: "calls completed", source: "calls", direction: "up" },
  lead_update: { metric: "leads still waiting with no follow-up", source: "leads", direction: "down" },
  update_product_price: { metric: "paid orders", source: "orders", direction: "up" },
  create_discount_code: { metric: "paid orders", source: "orders", direction: "up" },
  update_page_text: { metric: "visits to this page", source: "page_events", direction: "up" },
  update_page_meta: { metric: "visits to this page", source: "page_events", direction: "up" },
  publish_site: { metric: "visits to the site", source: "page_events", direction: "up" },
};

/**
 * An action whose consequence this product does not collect.
 *
 * NAMED, NOT DEFAULTED. The metric is still what a person would look
 * at, so the outcome can say exactly what was missing rather than
 * "unknown". Each of these produces a `not_measurable` outcome until
 * the product collects the thing named.
 */
const NOT_COLLECTED: Record<string, Measure> = {
  publish_video: { metric: "views of this video", source: null, direction: "up" },
  generate_graphic: { metric: "uses of this graphic", source: null, direction: "up" },
  generate_draft: { metric: "drafts the owner kept", source: null, direction: "up" },
  publish_post: { metric: "visits attributed to this post", source: null, direction: "up" },
  publish_social_post: { metric: "visits attributed to this post", source: null, direction: "up" },
  update_post: { metric: "visits attributed to this post", source: null, direction: "up" },
  content_autopilot_publish: { metric: "visits attributed to this post", source: null, direction: "up" },
  content_autopilot: { metric: "visits attributed to published posts", source: null, direction: "up" },
  ad_campaign_launch: { metric: "leads from this campaign", source: null, direction: "up" },
  launch_ad_campaign: { metric: "leads from this campaign", source: null, direction: "up" },
  activate_ad_campaign: { metric: "leads from this campaign", source: null, direction: "up" },
  change_campaign_budget: { metric: "leads from this campaign", source: null, direction: "up" },
  change_campaign_targeting: { metric: "leads from this campaign", source: null, direction: "up" },
  auto_paused_campaign: { metric: "spend on this campaign", source: null, direction: "down" },
  update_product_name: { metric: "paid orders of this product", source: null, direction: "up" },
  update_product_description: { metric: "paid orders of this product", source: null, direction: "up" },
  refund_approve: { metric: "refunds issued", source: null, direction: "down" },
  set_automation_toggle: { metric: "what this automation did while it was on", source: null, direction: "up" },
  // S7/P5. NOT COLLECTED, and the honest reason is worth stating: what
  // a granted permission did for the business is not one number. The
  // product does record what the action published while running alone
  // (claim_checks, migration 217) and whether any of it failed a check
  // — but the results job cannot read that table, so naming it as a
  // source here would claim a measurability that does not exist. S7/P6
  // puts those counts on the owner's screen instead, where they are
  // read rather than scored.
  grant_autonomy: { metric: "what this did while it was running on its own", source: null, direction: "up" },
  // G3, 7 November 2026. NOT COLLECTED, and the honest reason is that
  // this action cannot move a number at all: the page is created EMPTY
  // and UNPUBLISHED (migration 223), so until the owner writes it and
  // presses Publish there is nothing for a search to find. Naming
  // search_console as the source here would record a failure for a page
  // that was never put up — the product scoring the owner's inbox
  // rather than its own work.
  //
  // THE THING WORTH MEASURING IS THE PAGE GOING LIVE, which is a
  // different action and one this product does not record yet. When it
  // does, that is what gets `{ metric: "impressions for this search",
  // source: "search_console" }` — and the baseline is the day it was
  // published, not the day it was proposed.
  create_page_draft: { metric: "impressions for the search this page answers", source: null, direction: "up" },
  auto_reply_dm: { metric: "replies this automation sent", source: null, direction: "up" },
  dm_auto_reply: { metric: "replies this automation sent", source: null, direction: "up" },
  comment_auto_reply: { metric: "replies this automation sent", source: null, direction: "up" },
};

/**
 * ATTRIBUTION IS WHY SO MANY OF THESE ARE NOT COLLECTED. Migration 196
 * added `content_piece_id` to page_events and lead_touchpoints, which
 * is the only thing that can tie a visit or a lead to a piece of work —
 * and nothing writes it yet for posts or campaigns. "Visits attributed
 * to this post" is therefore a real metric with no data behind it, and
 * saying that is more useful than pretending the post had no effect.
 */
export function measureForAction(actionType: string): Measure {
  const known = COUNTED[actionType] ?? NOT_COLLECTED[actionType];
  if (known) return known;
  // UNLISTED IS NOT ASSUMED MEASURABLE. A new action type reaches here
  // until somebody decides what it is measured by, and its outcomes say
  // so rather than quietly claiming an effect.
  return { metric: `what "${actionType}" changed`, source: null, direction: "up" };
}

/**
 * What a confirmed goal, or a suggestion acted on, is measured by.
 *
 * THE ONE MEASURE THAT IS ALWAYS AVAILABLE AND ALWAYS RELEVANT: did
 * the thing the goal is about go away? The audit counts open findings
 * of each type every morning, so this needs no new collection and no
 * attribution.
 */
export function measureForFindingType(findingType: string): Measure {
  return {
    metric: `open findings of type ${findingType}`,
    source: "opportunities",
    direction: "down",
  };
}

/**
 * What a goal about a funnel step is measured by — S5/P4.
 *
 * THE RATE, NOT A TARGET. The goal carries no target number because any
 * number would be a forecast (targets.ts's header has the whole of
 * it), and measuring needs a measure and a baseline, not a target.
 *
 * `source` is the diagnosis rather than a table, because the rate is a
 * ratio of two counts from two tables — page_events and leads — and
 * diagnosis.ts is the one place that puts them together. Naming either
 * table would be naming half of it.
 */
export function measureForTarget(stepLabel: string): Measure {
  return { metric: `the rate from ${stepLabel}`, source: "diagnosis", direction: "up" };
}

/** Can the results job read this, or will the outcome be not_measurable? */
export function isMeasurable(measure: Measure): boolean {
  return measure.source !== null;
}

/** Every action type the policy registry knows. */
export function allActionTypes(): string[] {
  return Object.keys(ACTION_POLICIES);
}

/** The action types whose consequence this product does not collect. */
export function notCollectedActionTypes(): string[] {
  return Object.keys(NOT_COLLECTED);
}

/** The action types whose consequence it does. */
export function countedActionTypes(): string[] {
  return Object.keys(COUNTED);
}
