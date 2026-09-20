// What a retargeting ad SAYS, decided by how long ago the person showed
// interest (Retargeting R4, approved 2026-09-20).
//
// The approved shape is a three-message sequence: a reminder, then the
// likely objection answered with one of the owner's own Business Story
// facts, then an offer — and only if a real one exists.
//
// WHY THE TIER DECIDES IT, not an ad schedule: Meta has no reliable ad
// sequencing for the campaign types Hawlai launches (Traffic and Leads).
// The recency tiers (R3) already split the same people by how fresh their
// interest is, so tier 1-3 days gets the reminder, 4-14 the objection, and
// 15-30 the offer. The same person moves through the three as time passes,
// which is the sequence — without pretending Meta will order ads for us.
//
// FREQUENCY CAPS: Meta only accepts frequency_control_specs on Reach
// campaigns. A Traffic or Leads ad set cannot be capped, so nothing is
// sent and the page says so rather than implying a cap that isn't there.

import { STORY_CATEGORY } from "@/lib/business/businessStory";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { TIERS, type Tier } from "./audiences";

export type MessageKind = "reminder" | "objection" | "offer";

export type MessageStep = {
  step: 1 | 2 | 3;
  kind: MessageKind;
  /** What the owner sees on the card. */
  label: string;
  /** Whether an offer may be featured at all in this message. */
  allowsOffer: boolean;
};

export const STEPS: Record<Tier["key"], MessageStep> = {
  "1_3": { step: 1, kind: "reminder", label: "Reminder", allowsOffer: false },
  "4_14": { step: 2, kind: "objection", label: "Answers the likely doubt", allowsOffer: false },
  "15_30": { step: 3, kind: "offer", label: "Offer, if you have one", allowsOffer: true },
};

/** The message for a tier; null for an audience that isn't split by recency (one message, as before). */
export function stepFor(tier: Tier | null | undefined): MessageStep | null {
  return tier ? STEPS[tier.key] : null;
}

/** The owner's own story facts — what the second message answers a doubt with. */
export function storyFacts(facts: BusinessFacts | null): { title: string; content: string }[] {
  return (facts?.ownerFacts ?? []).filter((k) => k.category === STORY_CATEGORY).map((k) => ({ title: k.title, content: k.content }));
}

/**
 * The instruction for this message, on top of the audience's own angle.
 * `offer` is the owner's authorised offer text (campaign route) — used
 * only in the third message, and only when they actually entered one.
 */
export function messageBrief(step: MessageStep | null, facts: BusinessFacts | null, offer: { text: string | null }): string {
  if (!step) return offer.text ?? NO_OFFER;
  if (step.kind === "reminder") {
    return `This is the FIRST message, for people who were here in the last three days. Remind them what they were looking at and make coming back easy. No discount, no offer, no urgency — they haven't gone cold. ${NO_OFFER}`;
  }
  if (step.kind === "objection") {
    const story = storyFacts(facts);
    const usable = story.length
      ? `Answer it with ONE of the owner's own facts, quoted from these and nothing else:\n${story.map((s) => `- ${s.title}: ${s.content}`).join("\n")}`
      : "The owner hasn't recorded their story yet, so answer the doubt only with what's in the verified facts above — never invent a reason to trust them.";
    return `This is the SECOND message, for people who were here one to two weeks ago. They didn't come back, so something is holding them back: price, trust, whether it's right for them. Name that doubt plainly and answer it. ${usable} Still no discount or offer. ${NO_OFFER}`;
  }
  return offer.text
    ? `This is the THIRD and last message, for people who were here two to four weeks ago. ${offer.text}`
    : `This is the THIRD and last message, for people who were here two to four weeks ago. There is no offer to make — the owner hasn't authorised one — so make the strongest case on value and let this be the last time they hear about it. ${NO_OFFER}`;
}

const NO_OFFER = "Do NOT promise any discount, free shipping, or offer — none has been authorised. Persuade on value alone.";

/**
 * Meta accepts a frequency cap only on Reach campaigns. Returns the ad set
 * fields, or null with the reason — never a silent no-op.
 */
export function frequencyCapFor(objective: string): { specs: Record<string, unknown>[] } | null {
  if (objective === "OUTCOME_AWARENESS") {
    return { specs: [{ event: "IMPRESSIONS", interval_days: 7, max_frequency: 3 }] };
  }
  return null;
}

export const NO_FREQUENCY_CAP_NOTE =
  "Meta doesn't allow a frequency cap on this kind of campaign (it only offers them on reach campaigns). The three recency groups are what limits how often the same person sees the same message: each group gets one message, and people move to the next as time passes.";
