// What the owner reads when something needs his attention — P-b.
//
// ──────────────────────────────────────────────────────────────────
// REACH ONLY. The owner's decision, 23 November 2026: Hawlai says
// where the opportunity is and what to do or not do, and the decision
// is always his. Nothing here acts, and nothing here asks for
// permission to act either — an approval card is a different thing
// with its own notice (H3).
//
// So every message ends by saying nothing has been done. That is not
// reassurance padding: a mail that reads "your campaign is reaching
// nobody" with no such line invites the reasonable assumption that
// Hawlai is already fixing it, and then nobody fixes it.
//
// NO MODEL CALL. The bell already holds a title and a body somebody
// wrote deliberately; running them through Claude would spend money to
// paraphrase a sentence that is already right, and a paraphrase is a
// second version of the same claim. Same reasoning as the approval
// notice quoting the card's stored sentence.
//
// THE "WHAT TO DO" LINE IS PER KIND AND WRITTEN HERE, not generated,
// because it is advice and advice that varies run to run is not
// advice. Each one says the next step and, where it matters, what NOT
// to do — `campaign_budget_overrun`'s is the example: the instinct is
// to raise the budget, and the money is already spent.
// ──────────────────────────────────────────────────────────────────

import type { NotificationKind } from "./emit";

/**
 * The next step, in the owner's hands.
 *
 * A kind with no entry here still sends — with no advice line rather
 * than a generic one. "Take a look" is worse than silence: it uses a
 * line the eye has learned to skip.
 */
const WHAT_TO_DO: Partial<Record<NotificationKind, string>> = {
  campaign_not_delivering:
    "Open the campaign in Ads Manager and check it there too — an ad can read Active with its ad set paused, its audience too narrow, or its creative rejected. Until one of those changes, more budget changes nothing.",
  hot_lead:
    "Reply to this one today. The lead came in through an ad you are paying for, and a same-day reply is the whole return on it.",
  campaign_budget_overrun:
    "This money is already spent, so raising the budget is not the fix — check the daily cap and whether the result was worth it before the next one runs.",
};

export function opportunityEmail(
  businessName: string,
  notice: { kind: NotificationKind | string; title: string; body?: string | null; href?: string | null }
): { subject: string; body: string } {
  const advice = WHAT_TO_DO[notice.kind as NotificationKind];
  const title = String(notice.title ?? "").trim() || "Something needs your attention";

  return {
    // THE FACT IS IN THE SUBJECT, because that is the line he sees on a
    // phone without opening anything — the same reason the approval
    // notice puts the code there.
    subject: `${businessName}: ${title}`,
    body: [
      title,
      String(notice.body ?? "").trim(),
      advice ? `\nWhat to do: ${advice}` : "",
      notice.href ? `\n${notice.href}` : "",
      // NOTHING HAS BEEN DONE, SAID EVERY TIME. See the header.
      "\nHawlai hasn't changed anything — this is yours to decide.",
    ]
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),
  };
}
