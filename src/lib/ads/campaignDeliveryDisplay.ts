// What the Status column says, and how sure it is allowed to sound.
//
// Pure and client-safe: no Meta calls, no server imports. The live
// check happens in /api/ads/campaign-status; this only decides the words.
//
// THE RULE: a plain "Active" appears ONLY when Meta has just confirmed
// every level is delivering. The Campaign Performance History table
// explicitly outlives campaigns — it "survives even if paused, deleted
// on Meta" — so it will routinely show campaigns Meta no longer has, or
// can't be reached for. Anything not confirmed live is shown as what it
// is: the last recorded status, with its date, marked as not confirmed.
// Tonight's "already live" report, while Ads Manager showed Off, is the
// failure this refuses to repeat.

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

export type Delivery = { state: DeliveryState; label: string; detail: string | null };

/** A live result from the status route. checkedAt is null when Meta could not be read. */
export type LiveDelivery = Delivery & { checkedAt: string | null };

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

  if (live === "loading") {
    return { text: "Checking…", sub: rec ? `Last recorded: ${DELIVERY_LABELS[rec.state]} · ${shortDate(rec.date)}` : null, tone: "muted", stale: false };
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
