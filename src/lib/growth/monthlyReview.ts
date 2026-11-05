// THE MONTHLY REVIEW — S5/P5.
//
// What the daily report cannot say. The daily email is about today: what
// the audit found this morning and what is worth doing about it. This
// one is about what was DECIDED and what CAME OF IT, which is the whole
// subject of S5 and only legible over weeks.
//
// IT SENDS ALONGSIDE THE DAILY REPORT, on the 1st — the founder's call,
// 3 November 2026. Replacing a day's report to make room for this would
// hide that day's findings.
//
// WHAT IT REFUSES TO DO, and this is most of the design:
//
// 1. NO CAUSATION. An outcome row records a measured change and how much
//    of it can be attributed. Where attribution is `partial` the email
//    says so in words, because "the rate went up after you did this" is
//    not "this worked", and a monthly review is exactly where that
//    slide happens.
//
// 2. NO FUNNEL COMPARISON. The obvious monthly line — "your weakest
//    step was 12% a month ago and is 18% now" — cannot be written
//    honestly: NOTHING RECORDS WHAT THE FUNNEL WAS A MONTH AGO.
//    `fileDiagnosisSignals` files the weakest step into
//    `business_signals`, and `recordSignal` upserts on its fingerprint,
//    so there is one row per topic and no history. The only month-ago
//    numbers this product has are `decisions.baseline` and
//    `outcomes.measured_before` — the steps the owner actually acted on
//    — and those are what this email reports. A comparison nobody
//    recorded would have to be reconstructed, and S5/P2b is the whole
//    story of why that cannot be done.
//
// 3. NO MODEL, anywhere. Every sentence is a template with counted
//    values substituted in, as the daily report's are.
//
// IT RIDES THE DAILY REPORT'S RAILS rather than growing its own: the
// same `ReportBlock` shapes, the same digit walk (`everyNumberIsCounted`
// — every figure traces to something counted), the same pruning
// (`withoutUncountedBlocks` — a block with an untraceable figure is
// dropped, never the email), the same renderer, the same idempotency
// discipline on the send.

import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import { PLACEHOLDER_BUSINESS_NAME } from "@/lib/onboarding/signup";
import { STANDARD_CHECK_DAYS } from "@/lib/growth/outcomes";
import {
  everyNumberIsCounted,
  renderText,
  stripDigits,
  withoutUncountedBlocks,
  type DailyReport,
  type ReportBlock,
} from "@/lib/growth/report";
import type { Counted } from "@/lib/growth/audit";
import { recordBlocksLeftOut, type LeftOutBlock } from "@/lib/growth/leftOut";

/** Month names, written out because a date library is not needed for twelve words. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * How far back decisions are read.
 *
 * NOT "ALL OF THEM". An outcome measured last month belongs to a
 * decision taken at most `STANDARD_CHECK_DAYS` before its check date,
 * plus however long the job took to get to it. Three months is generous
 * cover for that and keeps the read bounded as the table grows — a
 * review that reads a year of rows to report on one month would get
 * slower every month it ran.
 */
export const LOOKBACK_DAYS = Math.max(90, STANDARD_CHECK_DAYS * 3);

export type MonthWindow = {
  /** First day of the month being reviewed, YYYY-MM-DD. */
  from: string;
  /** First day of the month AFTER it — the exclusive end. */
  until: string;
  /** Days in the month being reviewed. */
  days: number;
  /** The month's name, with no year in it. */
  label: string;
};

/**
 * The month that just ended, from the day the job runs.
 *
 * NO YEAR IN `label`, deliberately. The label is printed in the email
 * body, and every digit there has to be a declared counted value — a
 * year is neither counted nor about the business. The email is dated,
 * and the subject carries the month's name.
 */
export function monthWindowFor(day: string): MonthWindow | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(day ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12, the month the job runs IN
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${prevYear}-${two(prevMonth)}-01`,
    until: `${year}-${two(month)}-01`,
    // Day 0 of the next month is the last day of this one.
    days: new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate(),
    label: MONTH_NAMES[prevMonth - 1],
  };
}

/** Is this the first of the month, in the only timezone this product uses? */
export function isFirstOfMonth(day: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(String(day ?? ""));
}

export type ReviewDecision = {
  id: string;
  what: string;
  measure: string;
  check_date: string;
  created_at: string;
};

export type ReviewOutcome = {
  decision_id: string;
  measured_at: string;
  measured_before: number | null;
  measured_after: number | null;
  verdict: "improved" | "unchanged" | "worsened" | "not_measurable";
  attribution: "direct" | "partial" | "none";
  why_not_measurable: string | null;
};

export type MonthlyReviewInput = {
  dealershipId: string;
  /** The day the review is sent — the 1st. */
  day: string;
  businessName: string;
  window: MonthWindow;
  decisions: ReviewDecision[];
  outcomes: ReviewOutcome[];
};

/** At most this many results are written out one by one. */
export const RESULTS_SHOWN = 5;
/** And at most this many of the ones that could not be measured. */
export const UNMEASURED_SHOWN = 3;

/** The label a measured result's block declares, and nothing else does. */
export const RESULT_BEFORE_LABEL = "what it read before";

/** Is this block one measured result, written out? */
export function isResultBlock(block: ReportBlock): boolean {
  return block.kind === "line" && block.numbers.some((n) => n.label === RESULT_BEFORE_LABEL);
}

const VERDICT_WORDS: Record<string, string> = {
  improved: "Better than before",
  unchanged: "No change",
  worsened: "Worse than before",
};

/**
 * Build the review. Pure: no reads, no writes, no model.
 *
 * The caller has already bounded the rows to this business; what is in
 * the month and what is still waiting is decided here, in one place,
 * where it can be tested without a database.
 */
export function buildMonthlyReview(input: MonthlyReviewInput): DailyReport {
  const { window: w } = input;

  // THE MONTH IS AN IST MONTH, and the timestamps are UTC.
  //
  // The first version compared the ISO string against the window's
  // date strings, which works by accident for most of the month and is
  // wrong for five and a half hours at each end: a decision taken at
  // 02:00 IST on the 1st is stored as 20:30 UTC on the LAST DAY of the
  // previous month, and a string comparison would file it under the
  // month before the one the owner made it in. Everything else in this
  // product is in IST (`indiaToday`), so the boundary is too.
  const fromAt = Date.parse(`${w.from}T00:00:00+05:30`);
  const untilAt = Date.parse(`${w.until}T00:00:00+05:30`);
  const inMonth = (iso: string | null) => {
    const at = Date.parse(String(iso ?? ""));
    // A TIMESTAMP NOBODY CAN READ IS NOT IN THE MONTH. Counting it
    // would put a row in a review at a date nobody knows.
    if (!Number.isFinite(at)) return false;
    return at >= fromAt && at < untilAt;
  };

  const decided = input.decisions.filter((d) => inMonth(d.created_at));
  const byId = new Map(input.decisions.map((d) => [String(d.id), d]));
  const measured = input.outcomes.filter((o) => inMonth(o.measured_at) && byId.has(String(o.decision_id)));

  const settled = new Set(input.outcomes.map((o) => String(o.decision_id)));
  // STILL WAITING MEANS NO OUTCOME YET, whatever its check date says. A
  // decision whose date has passed and has no outcome row is waiting on
  // the results job, not on time, and both are honestly "not answered
  // yet" from the owner's side.
  const waiting = input.decisions.filter((d) => !settled.has(String(d.id)));

  const count = (verdict: string) => measured.filter((o) => o.verdict === verdict).length;
  const improved = count("improved");
  const unchanged = count("unchanged");
  const worsened = count("worsened");
  const unmeasured = count("not_measurable");

  const counted: Counted[] = [
    { label: `days in ${w.label}`, value: w.days, source: "the calendar" },
    { label: "decisions recorded", value: decided.length, source: "decisions" },
    { label: "results measured", value: measured.length, source: "outcomes" },
    { label: "that came out better", value: improved, source: "outcomes.verdict" },
    { label: "that did not change", value: unchanged, source: "outcomes.verdict" },
    { label: "that came out worse", value: worsened, source: "outcomes.verdict" },
    { label: "that could not be measured", value: unmeasured, source: "outcomes.verdict" },
    { label: "still waiting for an answer", value: waiting.length, source: "decisions without an outcome" },
  ];

  const blocks: ReportBlock[] = [];

  blocks.push({
    kind: "line",
    text: `This is your review of ${w.label} — what was decided, and what came of it. It covers ${w.days} days.`,
    numbers: counted,
  });

  // NOTHING HAPPENED IS A RESULT, and it is said rather than dressed
  // up. A month in which this product decided nothing and measured
  // nothing is a month the owner should hear about plainly.
  if (!decided.length && !measured.length) {
    blocks.push({
      kind: "line",
      text: waiting.length
        ? `Nothing was decided in ${w.label} and nothing came due to be measured. There are decisions still waiting for their check date.`
        : `Nothing was decided in ${w.label} and nothing was measured. Either nothing was approved, or nothing that was approved had a measure this product can read.`,
      numbers: counted,
    });
    return { dealershipId: input.dealershipId, day: input.day, subject: reviewSubject(input.businessName, w, 0), blocks, counted };
  }

  blocks.push({ kind: "stat", number: counted[1] });
  blocks.push({ kind: "stat", number: counted[2] });
  for (const stat of [counted[3], counted[4], counted[5], counted[6], counted[7]]) {
    if (stat.value > 0) blocks.push({ kind: "stat", number: stat });
  }

  // ---- The results, one at a time ----------------------------------
  //
  // THE OWNER'S OWN WORDS, WITHOUT THEIR FIGURES. `what` and `measure`
  // were written by whichever route recorded the decision, and some
  // carry a number from that moment — "Acted on: 5 pages have no search
  // title". This email did not count that 5, so printing it would be a
  // figure the digit walk cannot trace, and the whole block would be
  // pruned. stripDigits is the same answer the AI-failure alert
  // already uses, for the same reason: keep the sentence, drop the
  // figure nobody here can vouch for. The numbers that matter are the
  // before and after, and those ARE declared.
  const readable = (text: string) => stripDigits(text).replace(/\s+([,.:])/g, "$1");

  const scored = measured.filter((o) => o.verdict !== "not_measurable").slice(0, RESULTS_SHOWN);
  for (const outcome of scored) {
    const decision = byId.get(String(outcome.decision_id))!;
    const before = Number(outcome.measured_before);
    const after = Number(outcome.measured_after);
    const numbers: Counted[] = [
      { label: RESULT_BEFORE_LABEL, value: before, source: decision.measure },
      { label: "what it reads now", value: after, source: decision.measure },
    ];
    const caveat =
      outcome.attribution === "direct"
        ? ""
        : " This measure moves for other reasons too, so this is not proof that the work caused it.";
    blocks.push({
      kind: "line",
      text: `${readable(decision.what)} — ${readable(decision.measure)} went from ${before} to ${after}. ${VERDICT_WORDS[outcome.verdict] ?? "Measured"}.${caveat}`,
      numbers,
    });
  }

  // ---- And the ones nobody could measure ---------------------------
  //
  // THE POINT OF THE WHOLE STAGE. "We could not tell" is a different
  // outcome from "it had no effect", and a review that quietly left
  // these out would be the product learning the wrong lesson and then
  // acting on it confidently.
  const unknown = measured.filter((o) => o.verdict === "not_measurable").slice(0, UNMEASURED_SHOWN);
  for (const outcome of unknown) {
    const decision = byId.get(String(outcome.decision_id))!;
    blocks.push({
      kind: "line",
      text: `${readable(decision.what)} — this could not be measured: ${readable(String(outcome.why_not_measurable ?? "no reason was recorded"))}`,
      numbers: [],
    });
  }

  return {
    dealershipId: input.dealershipId,
    day: input.day,
    subject: reviewSubject(input.businessName, w, measured.length),
    blocks,
    counted,
  };
}

/**
 * The subject, which counts what is actually in the email.
 *
 * RECOMPUTED AFTER PRUNING, like the daily report's — a subject
 * promising three results over two is the same fault in a smaller
 * place.
 */
export function reviewSubject(businessName: string, window: MonthWindow, results: number): string {
  if (results > 0) {
    return `${businessName} — your ${window.label} review: ${results} ${results === 1 ? "result" : "results"}`;
  }
  return `${businessName} — your ${window.label} review`;
}

/**
 * Prune the review, and rewrite its subject for what is left.
 *
 * ITS OWN FUNCTION so it can be tested directly. Nothing this product
 * can produce today puts an untraceable figure in this email — every
 * block declares what it prints, and the two strings the owner's own
 * routes wrote go through `readable` first. So the pruning path is
 * DEFENSIVE, and a defensive path reached only through `runMonthlyReview`
 * is a path no test can reach: the mutation that removed the subject
 * hook would have survived, and the first pruned review would have gone
 * out titled "your daily check, nothing to flag".
 */
export function prunedReview(review: DailyReport, businessName: string, window: MonthWindow) {
  return withoutUncountedBlocks(review, {
    // COUNTED BY WHAT THE BLOCK DECLARES, not by matching its wording.
    // A subject built by grepping its own email's prose would go wrong
    // the first time the sentence was reworded.
    resubject: (kept) => reviewSubject(businessName, window, kept.filter(isResultBlock).length),
  });
}

export type MonthlyReviewRun = {
  day: string;
  /** The month reviewed, by name, or null when it did not run. */
  month: string | null;
  decisions: number;
  results: number;
  notMeasurable: number;
  waiting: number;
  blocksLeftOut: number;
  /** Which blocks, and the figure that took each one out. */
  leftOut: LeftOutBlock[];
  reviewSound: boolean;
  sent: boolean;
  /** Why it did not run or did not send. Never a silent nothing. */
  skipped: string | null;
  /**
   * Set ONLY when something went wrong, because dailyJobs.ts marks a
   * job failed on a truthy `error` and nothing else. S5/P2 shipped
   * without this key and every failed run was recorded as "done".
   */
  error?: string;
  review?: DailyReport;
};

/**
 * Send the monthly review, on the first of the month.
 *
 * MODEL-FREE AND READ-ONLY apart from the send, which is why it sits in
 * the `signals` group with the other database-only work, after
 * `decision_results` — so the outcomes measured this morning are in the
 * review that goes out this morning.
 */
export async function runMonthlyReview(
  supabase: any,
  dealershipId: string,
  opts: { now?: Date; dryRun?: boolean } = {}
): Promise<MonthlyReviewRun> {
  const day = indiaToday(opts.now ?? new Date());
  const empty: MonthlyReviewRun = {
    day,
    month: null,
    decisions: 0,
    results: 0,
    notMeasurable: 0,
    waiting: 0,
    blocksLeftOut: 0,
    leftOut: [],
    reviewSound: true,
    sent: false,
    skipped: null,
  };

  if (!isFirstOfMonth(day)) return { ...empty, skipped: "not the first of the month" };
  const window = monthWindowFor(day);
  if (!window) return { ...empty, error: `could not read the date "${day}"` };

  // THE QUERY BOUNDS, THE CODE DECIDES. The read takes a wide slice by
  // date so it does not grow without limit; which rows are in the month
  // is settled in buildMonthlyReview, in one place, testable without a
  // database.
  const since = new Date(Date.parse(`${window.from}T00:00:00+05:30`) - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: decisions, error } = await supabase
    .from("decisions")
    .select("id, what, measure, check_date, created_at")
    .eq("dealership_id", dealershipId)
    .gte("created_at", since);
  if (error || !Array.isArray(decisions)) {
    const why = `could not read decisions: ${error?.message ?? "no rows"}`;
    console.error(`[review] ${why} for ${dealershipId}`);
    return { ...empty, month: window.label, error: why };
  }

  let outcomes: ReviewOutcome[] = [];
  if (decisions.length) {
    // `outcomes` HAS NO dealership_id: it reaches the business through
    // its decision, which is also how migration 215's RLS policy is
    // written. So the ids come first and the outcomes are read by them.
    const { data, error: outcomeError } = await supabase
      .from("outcomes")
      .select("decision_id, measured_at, measured_before, measured_after, verdict, attribution, why_not_measurable")
      .in("decision_id", decisions.map((d: any) => String(d.id)));
    if (outcomeError || !Array.isArray(data)) {
      // A FAILED READ IS NOT "NOTHING WAS MEASURED". Sending a review
      // that says nothing came of a month's work, when the rows exist
      // and could not be read, is the worst of the three outcomes here.
      const why = `could not read outcomes: ${outcomeError?.message ?? "no rows"}`;
      console.error(`[review] ${why} for ${dealershipId}`);
      return { ...empty, month: window.label, decisions: decisions.length, error: why };
    }
    outcomes = data as ReviewOutcome[];
  }

  const businessName = await nameOf(supabase, dealershipId);
  const review = buildMonthlyReview({
    dealershipId,
    day,
    businessName,
    window,
    decisions: decisions as ReviewDecision[],
    outcomes,
  });

  const check = everyNumberIsCounted(review);
  // THE BLOCK IS REFUSED, NOT THE EMAIL — 3 November 2026, when one
  // untraceable "5" meant the owner got silence and the reason went to
  // a Vercel log he has never read.
  const { report: sendable, removed } = prunedReview(review, businessName, window);
  // THE SAME RECORD AS THE DAILY REPORT'S, through the same writer.
  // This email prunes by the same rule, so it goes quiet in the same
  // way — and once a month there is no next morning to notice it.
  if (removed.length) {
    await recordBlocksLeftOut(supabase, { dealershipId, surface: "monthly_review", day, removed });
  }

  const result: MonthlyReviewRun = {
    ...empty,
    month: window.label,
    decisions: (review.counted.find((c) => c.label === "decisions recorded")?.value ?? 0) as number,
    results: (review.counted.find((c) => c.label === "results measured")?.value ?? 0) as number,
    notMeasurable: (review.counted.find((c) => c.label === "that could not be measured")?.value ?? 0) as number,
    waiting: (review.counted.find((c) => c.label === "still waiting for an answer")?.value ?? 0) as number,
    blocksLeftOut: removed.length,
    leftOut: removed,
    reviewSound: check.ok,
    review: sendable,
  };

  if (opts.dryRun) return { ...result, skipped: "dry run" };

  const { ownerEmail, sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
  const { data: dealership } = await supabase.from("dealerships").select("owner_id").eq("id", dealershipId).maybeSingle();
  const to = await ownerEmail(dealership?.owner_id ?? null);
  if (!to) return { ...result, skipped: "no owner email on record" };

  const sent = await sendDealerEmail(supabase, dealershipId, to, sendable.subject, renderText(sendable), {
    // ONE REVIEW PER BUSINESS PER MONTH. The dispatcher re-enters a run
    // whose invocation ran out of time, and the daily report's key is
    // the precedent for this.
    idempotencyKey: `monthly-review-${dealershipId}-${window.from.slice(0, 7)}`,
  });
  return { ...result, sent: Boolean((sent as any)?.ok ?? sent) };
}

/**
 * The business's name, or the signup placeholder when it has none.
 *
 * THE CONSTANT, NOT THE WORDS. `signupPlaceholder.test.ts` keeps an
 * allowlist of the files allowed to type "Your business" out, and it
 * caught this file the moment it was written — correctly: a second copy
 * of that string is a second thing to change when the placeholder
 * changes. Importing the one constant is the fix, not an allowlist
 * entry.
 */
async function nameOf(supabase: any, dealershipId: string): Promise<string> {
  const { data } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).maybeSingle();
  return String(data?.dealership_name ?? PLACEHOLDER_BUSINESS_NAME).trim() || PLACEHOLDER_BUSINESS_NAME;
}
