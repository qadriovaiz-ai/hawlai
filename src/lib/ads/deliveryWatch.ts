// A campaign that says Active and has shown nobody anything.
//
// ─────────────────────────────────────────────────────────────────────
// THE SEVENTY DAYS
// ─────────────────────────────────────────────────────────────────────
//
// A campaign launched on 10 September 2026 read Active in Hawlai and in
// Ads Manager, at the campaign, the ad set and the ad, with zero
// impressions and zero spend, for about seventy days. Nobody was told.
//
// The sentence already existed. `notDeliveringNote`
// (campaignDeliveryDisplay.ts) says exactly this, and names that same
// campaign in its comment — but it is a DISPLAY function in a client
// component. It fires when somebody opens Analytics and looks at the
// row. Nobody opened it, so nobody was told.
//
// And nothing in the daily run could have caught it either:
// `budget_alerts` compares spend against the daily budget, so a
// campaign spending zero is comfortably under budget. The one state
// that means "broken" was indistinguishable from "thrifty".
//
// ─────────────────────────────────────────────────────────────────────
// SUCCESS IS THE FIRST IMPRESSION, NOT THE LAUNCH
// ─────────────────────────────────────────────────────────────────────
//
// That is the whole idea. "Launched" is a thing Hawlai did; an
// impression is a thing that happened to a customer. Until one is
// recorded, nothing has worked yet, however many green ticks there are.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT IT MUST NOT DO
// ─────────────────────────────────────────────────────────────────────
//
// ALARM EARLY. Meta routinely takes hours to start delivering a new ad
// set, and longer after a billing change. An alert at forty-five
// minutes is an alert nobody reads by the second week, which would cost
// more than the silence it replaced. Hence a 24-hour floor, measured
// from the first snapshot that recorded the campaign as active.
//
// TREAT AN UNREADABLE NUMBER AS ZERO. `snapshotCampaignPerformance`
// writes NULL impressions when Meta's insights could not be read, and
// "we could not count" is not "nobody saw it". A null is unknown, and
// unknown never raises an alarm.
//
// GUESS THE CAUSE. The diagnosis stops at the FIRST definite answer and
// says nothing beyond it. Where it cannot find one, it says so plainly
// and points at Ads Manager rather than inventing a likely-sounding
// reason — a wrong cause sends the owner to fix something that was
// never broken.

import type { CampaignState } from "@/lib/ads/campaignStatus";
import { explainEffective } from "@/lib/ads/campaignStatus";
import { formatMinorAmount } from "@/lib/ads/adAccountLimits";

/** How long a campaign may be active and silent before it is worth saying. */
export const SILENT_HOURS = 24;

/** A daily snapshot row, as analyticsAgent writes it. */
export type Snapshot = {
  snapshot_date: string;
  /** NULL when Meta's insights could not be read. NOT zero. */
  impressions: number | null;
  spend: number | null;
  delivery_status: string | null;
};

export type Silence =
  | { silent: true; hours: number; activeSince: string }
  | { silent: false; why: "never_active" | "delivering" | "too_soon" | "unknown" };

const HOUR = 3_600_000;

/**
 * Has this campaign been active and silent long enough to say so?
 *
 * PURE, and deliberately so: every rule below is a decision about when
 * to alarm a business owner, and those are worth being able to test
 * with a fixture rather than a live account.
 */
export function assessSilence(snapshots: Snapshot[], now: Date = new Date()): Silence {
  const active = snapshots
    .filter((s) => s.delivery_status === "active" && s.snapshot_date)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  // Never recorded as delivering by Meta. Paused, in review, not on
  // Meta at all — all of those are somebody else's alert, and most are
  // already visible on the Status column.
  if (active.length === 0) return { silent: false, why: "never_active" };

  // Meta's insights are LIFETIME totals per campaign, so the most
  // recent readable figure is the whole story — not a daily slice that
  // would have to be summed.
  const readable = snapshots.filter((s) => s.impressions !== null && s.impressions !== undefined);
  if (readable.length === 0) return { silent: false, why: "unknown" };

  const latest = readable.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))[readable.length - 1];
  if ((latest.impressions ?? 0) > 0) return { silent: false, why: "delivering" };

  const activeSince = active[0].snapshot_date;
  const started = Date.parse(`${activeSince}T00:00:00.000Z`);
  if (!Number.isFinite(started)) return { silent: false, why: "unknown" };

  const hours = Math.floor((now.getTime() - started) / HOUR);
  if (hours < SILENT_HOURS) return { silent: false, why: "too_soon" };

  return { silent: true, hours, activeSince };
}

export type Cause = {
  /** Stable, so a log line and a test name the same step. */
  key: string;
  /** What the owner reads. */
  message: string;
};

export type DiagnosisInput = {
  /** From accountHealthFor. Null when it could not be read. */
  account: { usable: boolean; reason: string; warning?: string | null } | null;
  connection: { pageId?: string | null; token?: string | null } | null;
  /** From readCampaignState. Null when Meta could not be read. */
  state: CampaignState | null;
  /** ad_creatives.scheduled_start, when the owner set one. */
  scheduledStart?: string | null;
  /** Meta's own budget, and the account's own floor. Both minor units. */
  budget?: { minor: number | null; minimumMinor: number | null; currency: string | null } | null;
  now?: Date;
};

/**
 * Why is it not delivering — the first definite answer, and no further.
 *
 * THE ORDER IS THE FOUNDER'S, and it is the order of blame: the ad
 * account, then the connection, then the three levels, then the
 * schedule, then the money. Each step is only asked once the one above
 * it has been ruled out, so the owner is handed ONE thing to fix rather
 * than a checklist of nine.
 *
 * Returns null when nothing here explains it. That is an honest answer
 * and the caller says so — see `couldNotDiagnose`.
 */
export function diagnose(input: DiagnosisInput): Cause | null {
  const now = input.now ?? new Date();

  // 1. CAN THE ACCOUNT PAY? The seventy-day campaign's own answer: a
  //    funded account with no payment method on it.
  if (input.account && !input.account.usable) {
    return { key: "account", message: input.account.reason };
  }

  // 2. CAN HAWLAI STILL REACH THE PAGE? A revoked connection stops
  //    delivery as surely as a dead account, and looks like nothing.
  if (input.connection) {
    if (!input.connection.token) {
      return {
        key: "connection",
        message: "Hawlai's Facebook connection has stopped working, so this campaign can't be managed or checked. Reconnect Facebook in Settings → Integrations.",
      };
    }
    if (!input.connection.pageId) {
      return {
        key: "page",
        message: "No Facebook Page is connected to this business any more, and an ad can't run without one. Reconnect your Page in Settings.",
      };
    }
  }

  // 3. WHAT DOES META SAY ABOUT THE THREE LEVELS? `explainEffective`
  //    already turns PENDING_REVIEW, DISAPPROVED and PENDING_BILLING_INFO
  //    into a sentence, so this reuses it rather than writing a second
  //    vocabulary for the same codes.
  if (input.state?.ok) {
    const stuck = input.state.levels.find((l) => l.effective !== "ACTIVE");
    if (stuck) {
      const where = stuck.level === "adset" ? "ad set" : stuck.level;
      return {
        key: `level_${stuck.level}`,
        message: `Meta isn't running this because ${explainEffective(stuck.effective ?? "UNKNOWN")} — on the ${where}. Open it in Ads Manager to clear that.`,
      };
    }
  }

  // 4. IS IT SIMPLY NOT DUE TO START? A future start time is a campaign
  //    working exactly as asked, and telling someone their ad is broken
  //    when they scheduled it for next week is its own failure.
  if (input.scheduledStart) {
    const starts = Date.parse(input.scheduledStart);
    if (Number.isFinite(starts) && starts > now.getTime()) {
      return {
        key: "scheduled",
        message: `This campaign isn't due to start until ${new Date(starts).toLocaleDateString("en-IN")}, so Meta hasn't shown it to anyone yet. Nothing is wrong.`,
      };
    }
  }

  // 5. IS THE BUDGET BELOW WHAT META WILL DELIVER ON? Meta accepts an
  //    ad set and then quietly fails to deliver it when the budget sits
  //    under the account's own floor.
  const b = input.budget;
  if (b && b.minor !== null && b.minimumMinor !== null && b.minimumMinor > 0 && b.minor < b.minimumMinor) {
    const have = formatMinorAmount(b.minor, b.currency);
    const need = formatMinorAmount(b.minimumMinor, b.currency);
    return {
      key: "budget_below_minimum",
      message: `The daily budget on this campaign is ${have ?? "below the minimum"}, and this ad account's own minimum on Meta is ${need ?? "higher"}. Meta won't deliver under its floor. Raise the budget and it should start.`,
    };
  }

  return null;
}

/**
 * What to say when none of the steps above explains it.
 *
 * NOT A GUESS AND NOT SILENCE. Steps 6 to 8 of the founder's order —
 * audience size, learning stage, and the creative and landing page
 * checks that only make sense once delivery exists — are not built, and
 * saying "it is probably your audience" would send the owner to fix
 * something that may be fine.
 *
 * So it reports the fact, which is the part that was missing for
 * seventy days, and points at the one screen that knows more.
 */
export function couldNotDiagnose(hours: number): Cause {
  return {
    key: "unknown",
    message:
      `Meta says this campaign is Active and it has shown nobody anything for ${describeHours(hours)} — no impressions, nothing spent. ` +
      `"Active" on Meta means you haven't paused it, not that it's running. ` +
      `I checked the ad account, the Facebook connection, all three levels on Meta, the schedule and the budget, and none of them explains it. ` +
      `Open this ad set in Meta Ads Manager and read the delivery message on it — that will say which.`,
  };
}

/** "3 days" reads better than "72 hours" once it is past a day. */
export function describeHours(hours: number): string {
  if (hours < 48) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * The alert, as the owner sees it.
 *
 * THE CAUSE LEADS. A title that says "not delivering" and a body that
 * buries the reason is the Status column again — this exists because
 * nobody went looking.
 */
export function silenceAlert(headline: string, silence: Extract<Silence, { silent: true }>, cause: Cause) {
  return {
    kind: "campaign_not_delivering" as const,
    title: `"${headline}" is Active but reaching nobody`,
    body: cause.key === "unknown" ? cause.message : `${cause.message} It has shown nobody anything for ${describeHours(silence.hours)}.`,
    href: "/dashboard/ads/campaigns",
    // NO DATE IN THE KEY, so this fires ONCE per campaign per cause
    // rather than every morning. A product that re-asks is one the
    // owner stops reading — the same rule the rejection cooldown
    // states. A different cause is a different alert, because it is
    // genuinely new information.
    dedupeKey: `delivery_silent:${cause.key}`,
  };
}
