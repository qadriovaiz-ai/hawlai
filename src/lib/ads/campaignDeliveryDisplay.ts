// What the Status column says, how sure it is allowed to sound, and
// whether the On/Off toggle may be used.
//
// Pure and client-safe: no Meta calls, no server imports. The live
// check happens in /api/ads/campaign-status; this only decides the words
// and what is clickable.
//
// THE RULE: a plain "Active" appears ONLY when Meta has just confirmed
// every level is delivering. The Campaign Performance History table
// explicitly outlives campaigns — it "survives even if paused, deleted
// on Meta" — so it will routinely show campaigns Meta no longer has, or
// can't be reached for. Anything not confirmed live is shown as what it
// is: the last recorded status, with its date, marked as not confirmed.
// And the toggle only works on a status Meta has just confirmed.

export type DeliveryState =
  | "active"
  | "paused"
  | "not_delivering"
  | "deleted"
  | "archived"
  | "not_found"
  | "mismatch"
  | "not_on_meta"
  | "unknown";

export type Delivery = {
  state: DeliveryState;
  label: string;
  detail: string | null;
  /** Something the person must do before this can be read at all. */
  action?: "reconnect_facebook";
};

/** A live result from the status route. checkedAt is null when Meta could not be read. */
export type LiveDelivery = Delivery & {
  checkedAt: string | null;
  /** Meta's budget in words ("₹100.00/day"), when asked for; null if it couldn't be read. */
  budget?: string | null;
};

export const DELIVERY_LABELS: Record<DeliveryState, string> = {
  active: "Active",
  paused: "Paused",
  not_delivering: "Not delivering",
  deleted: "Deleted on Meta",
  archived: "Archived on Meta",
  not_found: "Not found on Meta",
  mismatch: "Doesn't match Meta",
  not_on_meta: "Not on Meta",
  unknown: "Couldn't check",
};

export type StatusTone = "good" | "neutral" | "warn" | "bad" | "muted";

export type StatusCell = {
  text: string;
  sub: string | null;
  tone: StatusTone;
  /** True when this is NOT Meta's answer right now. */
  stale: boolean;
};

const TONE: Record<DeliveryState, StatusTone> = {
  active: "good",
  paused: "neutral",
  not_delivering: "warn",
  mismatch: "bad",
  deleted: "muted",
  archived: "muted",
  not_found: "muted",
  not_on_meta: "muted",
  unknown: "muted",
};

const GONE = new Set<DeliveryState>(["deleted", "archived", "not_found"]);

function isState(s: string): s is DeliveryState {
  return s in DELIVERY_LABELS;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "9 Sep", for a YYYY-MM-DD snapshot date. UTC, so the day never shifts
 * by timezone.
 *
 * A fixed month list, NOT toLocaleDateString: Node's ICU writes
 * September as "Sept" for en-IN while many browsers write "Sep". This
 * cell is rendered on the server and again in the browser, and two
 * different strings there are a hydration mismatch. A test caught it.
 */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDate : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const RECONNECT_WHERE = "Settings → Integrations → Facebook";

/**
 * @param live      "loading" while the check runs; null or state "unknown" when Meta could not be read
 * @param recorded  the latest definitive status on a daily snapshot, and that snapshot's date
 * @param localStatus ad_creatives.meta_status — Hawlai's own last write, never verified with Meta
 */
export function statusCell(
  live: LiveDelivery | "loading" | null,
  recorded: { state: string; date: string } | null,
  localStatus: string | null
): StatusCell {
  const rec = recorded && isState(recorded.state) && recorded.state !== "unknown" ? { state: recorded.state, date: recorded.date } : null;
  const recText = rec ? `Last recorded: ${DELIVERY_LABELS[rec.state]} · ${shortDate(rec.date)}` : null;

  if (live === "loading") {
    return { text: "Checking…", sub: recText, tone: "muted", stale: false };
  }

  // Meta answered. This is the only branch that may say "Active".
  if (live && live.state !== "unknown") {
    let sub = live.detail;
    // Gone from Meta: say what it was the last time we saw it.
    if (GONE.has(live.state) && rec && !GONE.has(rec.state)) {
      sub = `Last seen ${DELIVERY_LABELS[rec.state].toLowerCase()} on ${shortDate(rec.date)}`;
    }
    return { text: live.label, sub: sub ?? "Checked with Meta just now", tone: TONE[live.state], stale: false };
  }

  // The connection itself can't read status. Say what fixes it, rather
  // than "couldn't confirm now", which invites waiting for nothing.
  if (live?.action === "reconnect_facebook") {
    return {
      text: "Reconnect Facebook",
      sub: `Hawlai can't read campaign status with the current connection — reconnect in ${RECONNECT_WHERE}.${recText ? ` ${recText}.` : ""}`,
      tone: "warn",
      stale: true,
    };
  }

  // Meta could not be read. Fall back — visibly.
  const why = live?.detail ? `couldn't confirm with Meta now (${live.detail})` : "couldn't confirm with Meta now";
  if (rec) {
    return { text: `Last recorded: ${DELIVERY_LABELS[rec.state]}`, sub: `${shortDate(rec.date)} · ${why}`, tone: "muted", stale: true };
  }
  const local = (localStatus ?? "").toUpperCase();
  if (local === "ACTIVE" || local === "PAUSED") {
    return {
      text: `Hawlai's record: ${local === "ACTIVE" ? "Active" : "Paused"}`,
      sub: `Not confirmed with Meta — ${why}`,
      tone: "muted",
      stale: true,
    };
  }
  return { text: "Unknown", sub: why, tone: "muted", stale: true };
}

export type ToggleState = {
  /** Which way the switch points: on means switched on in Meta. */
  on: boolean;
  enabled: boolean;
  /** Why it is locked, when it is. */
  reason: string | null;
};

/**
 * The On/Off switch for one row.
 *
 * ONLY A STATUS META HAS JUST CONFIRMED CAN BE ACTED ON. Flipping a
 * switch drawn from a stale record is how a person "starts" a campaign
 * that was already running, or thinks they paused one that is gone.
 */
export function toggleState(live: LiveDelivery | "loading" | null, busy: boolean): ToggleState {
  if (live === "loading") return { on: false, enabled: false, reason: "Checking status with Meta…" };
  if (!live || live.state === "unknown") {
    return {
      on: false,
      enabled: false,
      reason:
        live?.action === "reconnect_facebook"
          ? `Reconnect Facebook (${RECONNECT_WHERE}) to switch this on or off here.`
          : "Status couldn't be confirmed with Meta, so this is locked. Try again in a moment.",
    };
  }
  switch (live.state) {
    case "active":
    case "not_delivering": // switched on; Meta just isn't delivering it yet
      return { on: true, enabled: !busy, reason: null };
    case "paused":
      return { on: false, enabled: !busy, reason: null };
    case "deleted":
    case "archived":
    case "not_found":
      return { on: false, enabled: false, reason: "This campaign is no longer on Meta." };
    case "mismatch":
      return { on: false, enabled: false, reason: "This record doesn't match Meta — it needs fixing before it can be switched." };
    case "not_on_meta":
      return { on: false, enabled: false, reason: "Not launched on Meta." };
  }
}
