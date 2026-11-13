// What changed since last time — R4.
//
// THE FOUNDER'S DECISION, 12 November 2026: whenever a report is sent it
// must carry a comparison — "pehle din kya tha, kitna grow hua, kitna
// nahi hua" — a before/after and week-over-week, not a status.
//
// EVERY FIGURE HERE IS COUNTED, and that is not a style choice: the
// report's digit walk refuses a number it cannot trace and prunes the
// block it was in (growth/audit.ts, the "5 pages have no search title"
// fault). A comparison block whose numbers were derived would be
// deleted before the owner saw it, so the arithmetic is done on rows
// and declared.
//
// WHAT IT COMPARES, AND WHERE EACH SIDE COMES FROM:
//
//   report_snapshots   the full BusinessNumbers, written on Mondays and
//                      on the 1st (lib/automation/reportSnapshot.ts).
//                      This is the only real "before" the product has.
//   page_events        visitors, this seven days against the seven
//                      before, the owner's own visits excluded.
//   opportunities      what was found and what was FIXED, by created_at
//                      and resolved_at.
//
// THREE RULES THAT MATTER MORE THAN THE NUMBERS:
//
// 1. NO BASELINE IS NOT A BASELINE OF ZERO. A business in its first
//    week has no earlier snapshot, and "leads went from 0 to 4" reads
//    as growth when the truth is "there is nothing to compare with
//    yet". That sentence is said instead.
//
// 2. A FIGURE THAT COULD NOT BE READ IS NEVER COMPARED. BusinessNumbers
//    carries `adDataState` precisely because spend is null when Meta is
//    disconnected, and `totalSpend: null` compared against a real
//    number would print a fall from something to nothing.
//
// 3. NO PERCENTAGES FROM A ZERO BASE. "Up 400%" from one lead to five
//    is arithmetically true and useless; a percentage is only given
//    when the earlier figure is greater than zero, and the two counts
//    are always given whether or not it is.
//
// Pure: no I/O in the arithmetic. `readComparison` below does the
// reading, and every rule above is testable without a database.

import type { Counted } from "@/lib/growth/audit";

/** The cumulative figures a snapshot holds that are worth comparing. */
export const COMPARED_FIELDS = [
  { key: "totalLeads", label: "leads" },
  { key: "convertedLeads", label: "leads won" },
  { key: "paidOrders", label: "paid orders" },
  { key: "totalRevenue", label: "revenue" },
] as const;

export type Movement = {
  /** What moved, in the owner's words. */
  label: string;
  before: number;
  after: number;
  /** after - before. Negative is a fall, and is said as one. */
  change: number;
  /** Null unless `before` was greater than zero. */
  percent: number | null;
};

export type Comparison = {
  /** Null when there is nothing earlier to compare with. */
  since: string | null;
  /** Why there is no comparison, when there is none. */
  noBaselineBecause: string | null;
  movements: Movement[];
  /** Every figure above, declared so the digit walk can trace it. */
  counted: Counted[];
};

function num(value: unknown): number | null {
  // null AND "" ARE REJECTED BEFORE Number() EVER SEES THEM, because
  // Number(null) is 0 and Number("") is 0 — not NaN. The first version
  // of this used Number() alone, so "could not be read" became "was
  // zero" silently, which is the exact fault this whole file exists to
  // prevent. Its own test caught it on the way in.
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * One field's movement, or null when it cannot honestly be compared.
 *
 * NULL ON EITHER SIDE MEANS NO MOVEMENT IS REPORTED. "Could not be
 * read" and "was zero" are different facts, and this is the only place
 * that distinction can be kept.
 */
export function movementOf(label: string, before: unknown, after: unknown): Movement | null {
  const b = num(before);
  const a = num(after);
  if (b === null || a === null) return null;
  return {
    label,
    before: b,
    after: a,
    change: a - b,
    // A PERCENTAGE NEEDS SOMETHING TO BE A PERCENTAGE OF. From zero it
    // is either infinity or a made-up number, and both are worse than
    // the two counts the owner already has.
    percent: b > 0 ? Math.round(((a - b) / b) * 100) : null,
  };
}

/**
 * The comparison, from an earlier snapshot's stats and today's.
 *
 * `before` is null when nothing earlier exists — which is the first
 * week of every business, and the case this function exists to be
 * honest about.
 */
export function comparisonOf(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  opts: { since?: string | null } = {}
): Comparison {
  if (!before) {
    return {
      since: null,
      // SAID, NOT IMPLIED BY AN EMPTY LIST. An empty comparison block
      // reads as "nothing changed", which is a claim.
      noBaselineBecause:
        "This is the first report I have anything to compare with, so there is no before-and-after yet. The next one will have one.",
      movements: [],
      counted: [],
    };
  }
  if (!after) {
    return {
      since: opts.since ?? null,
      noBaselineBecause: "Today's figures could not be read, so nothing is compared.",
      movements: [],
      counted: [],
    };
  }

  const movements: Movement[] = [];
  const counted: Counted[] = [];
  for (const field of COMPARED_FIELDS) {
    const m = movementOf(field.label, before[field.key], after[field.key]);
    if (!m) continue;
    movements.push(m);
    // BOTH SIDES DECLARED. The sentence names two numbers, so the digit
    // walk needs both — declaring only the change would prune the block
    // the moment the words mention where it came from.
    counted.push({ label: `${field.label} before`, value: m.before, source: "report_snapshots" });
    counted.push({ label: `${field.label} now`, value: m.after, source: "report_snapshots" });
  }

  return {
    since: opts.since ?? null,
    noBaselineBecause: movements.length
      ? null
      : "Nothing in the earlier figures could be compared with today's.",
    movements,
    counted,
  };
}

/** One movement, as a sentence. */
export function movementLine(m: Movement): string {
  if (m.change === 0) return `${m.label}: ${m.after}, the same as before`;
  const direction = m.change > 0 ? "up" : "down";
  const size = Math.abs(m.change);
  const percent = m.percent === null ? "" : ` (${m.percent > 0 ? "+" : ""}${m.percent}%)`;
  return `${m.label}: ${m.before} → ${m.after}, ${direction} ${size}${percent}`;
}

/**
 * The whole block, as the owner reads it.
 *
 * WHAT DID NOT MOVE IS SAID TOO, which is the half of the founder's
 * request that a growth report usually drops: "kitna grow hua, kitna
 * nahi hua". A report that lists only what improved is a report that
 * has started selling.
 */
export function comparisonText(c: Comparison): string {
  if (c.noBaselineBecause) return c.noBaselineBecause;
  const moved = c.movements.filter((m) => m.change !== 0);
  const still = c.movements.filter((m) => m.change === 0);
  const parts: string[] = [];
  if (c.since) parts.push(`Compared with ${c.since}:`);
  for (const m of moved) parts.push(`  ${movementLine(m)}`);
  if (still.length) {
    parts.push(`  No change: ${still.map((m) => `${m.label} (${m.after})`).join(", ")}`);
  }
  if (!moved.length) parts.push("  Nothing moved either way.");
  return parts.join("\n");
}

export type WeekOverWeek = {
  thisWeek: number;
  lastWeek: number;
  change: number;
  counted: Counted[];
};

/**
 * PAGE VIEWS, this seven days against the seven before.
 *
 * IT SAID "VISITS" UNTIL V2, AND IT WAS NOT COUNTING VISITS — a
 * correction I owe, because I wrote it in R4 four days ago. It counts
 * `page_events` ROWS, so one visitor clicking eight times read as eight
 * "visits" in the owner's report. Now it counts `view` events and calls
 * them page views, which is what they are. Visits — a person's pages in
 * one sitting — are `lib/growth/visits.ts`, and the report states both
 * because they answer different questions.
 *
 * THE OWNER'S OWN VISITS ARE EXCLUDED, in the query, not in a comment —
 * migration 207 exists because visits went 28 to 31 while he tested his
 * own shop, and at that volume his clicks are most of the signal.
 */
export async function visitorsWeekOverWeek(
  supabase: any,
  dealershipId: string,
  now: Date = new Date()
): Promise<WeekOverWeek | null> {
  const dayMs = 86_400_000;
  const startOfThis = new Date(now.getTime() - 7 * dayMs).toISOString();
  const startOfLast = new Date(now.getTime() - 14 * dayMs).toISOString();

  const count = async (from: string, to: string | null) => {
    let q = supabase
      .from("page_events")
      .select("created_at")
      .eq("dealership_id", dealershipId)
      .eq("is_internal", false)
      // A PAGE VIEW, NOT EVERY EVENT. A click, a chat opening and a
      // form being started are all rows here, and counting them as
      // views inflated the figure by however busy the visitor was.
      .eq("event_type", "view")
      .gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return null;
    return data.length;
  };

  const thisWeek = await count(startOfThis, null);
  const lastWeek = await count(startOfLast, startOfThis);
  // A FAILED READ IS NOT A WEEK OF ZERO VISITS. Returning null means the
  // report says nothing about visitors rather than reporting a collapse.
  if (thisWeek === null || lastWeek === null) return null;

  return {
    thisWeek,
    lastWeek,
    change: thisWeek - lastWeek,
    counted: [
      { label: "page views in the last 7 days", value: thisWeek, source: "page_events" },
      { label: "page views in the 7 days before that", value: lastWeek, source: "page_events" },
    ],
  };
}

export type FixedSince = {
  found: number;
  fixed: number;
  stillOpen: number;
  counted: Counted[];
};

/**
 * What was found and what was actually FIXED in the last seven days.
 *
 * THIS IS THE "kitna nahi hua" HALF. `resolved_at` has been on
 * `opportunities` since it was created and nothing has ever read it for
 * a report, so the owner has never been told how many of the things the
 * agent found have since been dealt with.
 */
export async function fixedThisWeek(
  supabase: any,
  dealershipId: string,
  now: Date = new Date()
): Promise<FixedSince | null> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("opportunities")
    .select("created_at, resolved_at, status")
    .eq("dealership_id", dealershipId);
  if (error || !Array.isArray(data)) return null;

  const rows = data as { created_at?: string | null; resolved_at?: string | null; status?: string | null }[];
  const found = rows.filter((r) => String(r.created_at ?? "") >= since).length;
  const fixed = rows.filter((r) => String(r.resolved_at ?? "") >= since).length;
  const stillOpen = rows.filter((r) => r.status === "open").length;

  return {
    found,
    fixed,
    stillOpen,
    counted: [
      { label: "things found in the last 7 days", value: found, source: "opportunities" },
      { label: "things fixed in the last 7 days", value: fixed, source: "opportunities" },
      { label: "things still open", value: stillOpen, source: "opportunities" },
    ],
  };
}

/**
 * Read the earlier snapshot and build the comparison.
 *
 * THE MOST RECENT WEEKLY SNAPSHOT IS THE "BEFORE", not the oldest: the
 * founder asked for week-over-week as well as since-the-start, and the
 * two need different rows. This is the weekly one; the first-ever row is
 * what `sinceTheStart` reads.
 */
export async function readComparison(
  supabase: any,
  dealershipId: string,
  todaysStats: Record<string, unknown> | null,
  opts: { oldest?: boolean } = {}
): Promise<Comparison> {
  const { data, error } = await supabase
    .from("report_snapshots")
    .select("stats, created_at")
    .eq("dealership_id", dealershipId)
    .eq("period_type", "weekly")
    .order("created_at", { ascending: Boolean(opts.oldest) })
    .limit(1);

  if (error) {
    return {
      since: null,
      noBaselineBecause: "The earlier figures could not be read, so nothing is compared.",
      movements: [],
      counted: [],
    };
  }

  const row = (Array.isArray(data) ? data : [])[0] as { stats?: Record<string, unknown>; created_at?: string } | undefined;
  const since = row?.created_at ? String(row.created_at).slice(0, 10) : null;
  return comparisonOf(row?.stats ?? null, todaysStats, { since });
}
