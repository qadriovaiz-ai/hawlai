// The question the product asks because it needed the answer (I6).
//
// TIER 3 OF docs/PLAN-AUTO-INTERVIEW.md, and the part that answers the
// founder's actual request: *"jab real business sign up kare, kisi
// insaan ko beech mein manually interview lene ki zaroorat na pade."*
// Tiers 1 and 2 ask the owner at a moment chosen by the product. This
// tier asks at the moment the answer was MISSED — when a generator
// reached for a fact the business has never recorded, and the guard
// deleted the sentence instead.
//
// WHY THAT IS THE BEST MOMENT TO ASK. §2.3 of the plan: "What is your
// delivery time, really?" is a question an owner answers well when
// something is about to use the answer and badly when a form demands
// it. By the time this fires, something already tried to use it.
//
// WHAT IT IS ALLOWED TO CONCLUDE, which is the whole of the design:
//
//   price         → the owner has never put a price range on record
//   substantiation→ a claim only the owner can stand behind, and
//                   nothing of his says it
//   claim + a unit of time → something about how long things take
//   anything else → NOTHING. No question is asked.
//
// THAT LAST LINE IS THE DECISION. A removed claim can be about almost
// anything, and a mapper that guessed would ask the owner for a
// "material" because a sentence happened to mention one — which is the
// invented-keyword mistake the Growth Loop audit found three times in
// this product, arriving in the interview. So the mapping is refused
// wherever it cannot be read off the guard's own classification.
//
// ASKED ONCE, EVER. The founder's decision of 7 November. The record is
// `interview_answers` (migration 222), whose `asked` status exists for
// exactly this, so a question raised here is never raised again —
// whatever the owner does about it. A product that asks the same thing
// every week is a product the owner stops reading.
//
// Pure: no I/O, no model, no React. `askForMissingFact` below does the
// reading, and every rule about what a gap MEANS is testable without a
// database.

import { questionByKey } from "./interview";
import type { Counted } from "@/lib/growth/audit";
import { readProgress, type ProgressRow } from "./interviewProgress";

/** One `claim_checks` row, as far as this file cares. */
export type GapRow = { removed_kinds?: unknown; claims_removed?: number | null };

/**
 * One `answer_gaps` row — a REAL CUSTOMER asked and the records were
 * silent (V4c, migration 230).
 *
 * Its `question_key` is already an interview key: the chat agent picks
 * from the registry and `questionKeyFrom` validates it at the point of
 * storage, so unlike a claim_checks removal there is nothing to map
 * here. A key with no registered question — "other", or one retired
 * since — is skipped rather than counted, because a gap that cannot be
 * turned into a question is a gap nobody can be asked about.
 */
export type CustomerGapRow = { question_key?: unknown };

/** A unit of time, in any trade. The same list G4 and I3 reason from. */
const TIME_WORDS = /\b(day|days|hour|hours|week|weeks|month|months|minute|minutes|same[- ]day|overnight)\b/i;

/**
 * The interview question a removal points at, or null.
 *
 * NULL IS THE COMMON ANSWER and that is intended. See the header: a
 * mapper that guessed would ask the owner for the wrong thing, and a
 * question about something he was never asked about is worse than
 * silence — it reads as the product not knowing its own business.
 */
export function questionForKind(kind: unknown, reason = ""): string | null {
  const k = String(kind ?? "").trim();
  if (k === "price") return "price_range";
  if (k === "substantiation") return "why_not_cheaper";
  // A claim mentioning a span of time is a claim about timing, and the
  // interview has one place that answer belongs.
  if (k === "claim" && TIME_WORDS.test(String(reason ?? ""))) return "delivery_time";
  return null;
}

export type FactGap = {
  key: string;
  /**
   * How many times a GENERATOR reached for this and the guard cut it.
   *
   * UNCHANGED IN MEANING, deliberately: it is the number `gapAskLine`
   * prints in "I had to cut a line N times", and its source is
   * claim_checks. Customer asks are counted separately and never added
   * into it — a sentence about lines being cut must not be inflated by
   * questions nobody cut anything for.
   */
  times: number;
  /** How many real customers asked about this and got nothing (answer_gaps). */
  fromCustomers: number;
};

/**
 * Which answers the product has gone looking for and not found.
 *
 * COUNTED, strongest first. Two prices the guard could not support is
 * twice the evidence that no price is on record — which is why
 * `removedKinds` is deliberately not de-duplicated upstream.
 *
 * A ROW WITH AN EMPTY `removed_kinds` CONTRIBUTES NOTHING, and that is
 * not the same as a clean output: every row written before migration
 * 224 has an empty array. Reading it as "nothing was removed" would
 * make the product confident about a history it cannot see.
 */
export function gapsFrom(
  rows: GapRow[] | null | undefined,
  customerRows?: CustomerGapRow[] | null
): FactGap[] {
  const cut = new Map<string, number>();
  for (const row of rows ?? []) {
    const kinds = Array.isArray(row?.removed_kinds) ? row.removed_kinds : [];
    for (const kind of kinds) {
      const key = questionForKind(kind);
      if (!key) continue;
      cut.set(key, (cut.get(key) ?? 0) + 1);
    }
  }

  // A CUSTOMER ASKING IS DIFFERENT EVIDENCE AND IS COUNTED SEPARATELY.
  // Adding the two together would make "I had to cut a line 4 times"
  // true of a week in which two lines were cut and two people asked —
  // a number that reads as one thing and means another, which is the
  // fault the whole digit walk exists to catch.
  const asked = new Map<string, number>();
  for (const row of customerRows ?? []) {
    const key = String(row?.question_key ?? "").trim();
    if (!key) continue;
    // Only a key the interview can actually ask about. "other" and
    // anything retired land here and are dropped.
    if (!questionByKey(key)) continue;
    asked.set(key, (asked.get(key) ?? 0) + 1);
  }

  const keys = new Set([...cut.keys(), ...asked.keys()]);
  return [...keys]
    .map((key) => ({ key, times: cut.get(key) ?? 0, fromCustomers: asked.get(key) ?? 0 }))
    // ORDERED BY ALL THE EVIDENCE, which is a judgement about which to
    // ask first and not a figure anything prints.
    .sort(
      (a, b) =>
        b.times + b.fromCustomers - (a.times + a.fromCustomers) ||
        b.fromCustomers - a.fromCustomers ||
        a.key.localeCompare(b.key)
    );
}

/** How often a gap must have cost something before it is worth asking about. */
export const ASK_AFTER = 2;

/**
 * How many customers must have asked before it is worth asking the owner.
 *
 * ONE, AND THE REASONING FOR TWO DOES NOT APPLY HERE. `ASK_AFTER` is 2
 * because "a single removal can be a generator reaching for something
 * the business genuinely does not do" — a false positive is possible,
 * so a pattern is wanted. A REAL CUSTOMER asking is relevant by
 * definition: nobody types a question about a business they are not
 * interested in. One is already the strongest evidence this product
 * can get, and making it wait for a second means the first customer
 * leaves unanswered to prove a point.
 *
 * This cannot become nagging: `nextGapToAsk` still returns at most ONE
 * gap, and still skips anything answered, skipped or already asked.
 */
export const ASK_AFTER_CUSTOMER = 1;

/** Whether this gap has enough behind it to be worth one question. */
export function worthAsking(gap: FactGap): boolean {
  return gap.fromCustomers >= ASK_AFTER_CUSTOMER || gap.times >= ASK_AFTER;
}

/**
 * The one gap worth asking about, or null.
 *
 * ONE, AND ONLY ABOVE A THRESHOLD. A single removal can be a generator
 * reaching for something the business genuinely does not do; twice is a
 * pattern. And one question at a time, for the reason G3 gives about
 * page proposals: three is a backlog, and a backlog is what gets closed
 * unread.
 *
 * ALREADY ANSWERED, SKIPPED OR ASKED ARE ALL "LEAVE IT ALONE". Answered
 * and skipped are the owner having dealt with it; asked is this tier
 * having had its one go.
 */
export function nextGapToAsk(
  rows: GapRow[] | null | undefined,
  progress: ProgressRow[] | null | undefined,
  customerRows?: CustomerGapRow[] | null
): FactGap | null {
  const p = readProgress(progress);
  const dealtWith = new Set([...p.answered, ...p.skipped, ...p.asked]);
  for (const gap of gapsFrom(rows, customerRows)) {
    if (!worthAsking(gap)) continue;
    if (dealtWith.has(gap.key)) continue;
    // NO "is it registered" CHECK HERE, deliberately. gapsFrom only ever
    // produces the three keys questionForKind returns, so a check here
    // could not be reached from any input — an untestable guard, which in
    // this codebase has always meant a guard nobody can tell is broken.
    // The registry lookup that CAN fail lives in gapAskLine, which returns
    // null and makes askForMissingFact say why. The invariant that the
    // three keys exist is pinned by a test instead. Mutation M22,
    // 2026-11-07.
    return gap;
  }
  return null;
}

/**
 * What the owner reads, in the daily email.
 *
 * IT SAYS WHY IT IS ASKING. "What is your price range?" out of nowhere
 * is a form. "I had to delete a line twice this week because I don't
 * know your prices" is a reason, and it is true — the count is from
 * `claim_checks`, which records what actually went out and what did
 * not.
 *
 * THE QUESTION ITSELF COMES FROM THE REGISTRY, never written here, so
 * the rule-3 test that holds the interview's prompts category-neutral
 * holds this too.
 */
export function gapAskLine(gap: FactGap): { text: string; counted: Counted[] } | null {
  const question = questionByKey(gap.key);
  if (!question) return null;
  const what = question.writesTo.table === "business_knowledge" ? question.writesTo.title : gap.key;

  const reasons: string[] = [];
  // THE DIGITS ARE DECLARED, because the report's digit walk refuses a
  // number it cannot trace and would otherwise drop this whole block —
  // the fault recorded in growth/audit.ts for the "5" in "5 pages have
  // no search title". Each source names the table its own count came
  // from, so the owner (and the next reader) can go and check it.
  const counted: Counted[] = [];

  // THE CUSTOMER COMES FIRST WHEN THERE IS ONE. "Somebody asked you
  // this and I had nothing to tell them" is a better reason than
  // anything this product can say about its own generators — and it is
  // the one the owner can picture.
  if (gap.fromCustomers > 0) {
    reasons.push(
      gap.fromCustomers === 1
        ? `A customer asked about your ${what} and I had nothing on record to tell them.`
        : `${gap.fromCustomers} customers asked about your ${what} and I had nothing on record to tell them.`
    );
    counted.push({
      label: `customers who asked about ${what}`,
      value: gap.fromCustomers,
      source: "answer_gaps",
    });
  }

  // AND THE CUT LINES ARE ONLY MENTIONED WHEN LINES WERE ACTUALLY CUT.
  // Printing "I had to cut a line 0 times" — or counting a customer's
  // question as a cut line — would be this file telling the owner
  // something that did not happen.
  if (gap.times > 0) {
    reasons.push(`I had to cut a line ${gap.times} times recently because I don't have your ${what}.`);
    counted.push({ label: `lines cut for a missing ${what}`, value: gap.times, source: "claim_checks" });
  }

  if (!reasons.length) return null;
  return { text: `${reasons.join(" ")} ${question.prompt}`, counted };
}

export type AskResult = {
  /** The gap asked about, or null when there was nothing to ask. */
  asked: FactGap | null;
  /** What to put in the email, with the figure it prints declared. */
  line: { text: string; counted: Counted[] } | null;
  /** Why nothing was asked, for the log rather than the owner. */
  why: string | null;
};

/**
 * Find the gap, record that it was asked, and hand back the sentence.
 *
 * THE RECORD IS WRITTEN BEFORE THE EMAIL IS BUILT, deliberately. If the
 * email then fails to send, the question has still been marked asked —
 * which loses one question. The other order loses the "once, ever"
 * guarantee and asks forever, and of the two failures the forgettable
 * one is better than the nagging one.
 */
/**
 * The gap worth asking about, and the sentence for it — READING ONLY.
 *
 * WHY THIS EXISTS SEPARATELY FROM askForMissingFact — R2c, 12 November
 * 2026. That one RECORDS the ask before handing back the line, because
 * an email is pushed at the owner whether he reads it or not: if the
 * send then fails, one question is lost rather than the "once, ever"
 * promise.
 *
 * A CARD IS NOT PUSHED, so that trade does not apply to it. The
 * question sits on the Business Knowledge page until he answers it or
 * skips it, and `nextGapToAsk` already treats both as dealt with. So
 * the card must NOT record an ask: doing so would burn the one question
 * on a page view, which is the same fault as marking a finding
 * "surfaced" because something considered showing it (R2a).
 */
/**
 * Everything the two askers below read, in one place.
 *
 * WHY IT IS SHARED. findMissingFact and askForMissingFact already held
 * the same query twice and now need a third table between them. Two
 * copies of a read is how one of them quietly stops asking for a
 * column — which happened to `business_knowledge` on 13 November and
 * was caught only because an older test pinned BOTH of its reads.
 *
 * A FAILED READ OF THE GAPS IS NOT "NO CUSTOMER ASKED". `customer` is
 * null on failure and the callers treat that as a failed read, for the
 * same reason the visits reader does: reporting silence we did not
 * measure is worse than saying nothing.
 */
async function readGapEvidence(
  supabase: any,
  dealershipId: string,
  sinceDays: number
): Promise<{ checks: GapRow[] | null; customer: CustomerGapRow[] | null; progress: ProgressRow[] | null; why: string | null }> {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();

  const [
    { data: checks, error: checkError },
    { data: customer, error: customerError },
    { data: progress, error: progressError },
  ] = await Promise.all([
    supabase
      .from("claim_checks")
      .select("removed_kinds, claims_removed")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since),
    supabase
      .from("answer_gaps")
      .select("question_key")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since),
    supabase.from("interview_answers").select("question_key, status, attempts, weak").eq("dealership_id", dealershipId),
  ]);

  const error = checkError ?? customerError ?? progressError;
  if (error) {
    const why = `could not read the history: ${error.message}`;
    console.error(`[fact-gaps] ${dealershipId}: ${why}`);
    return { checks: null, customer: null, progress: null, why };
  }
  return { checks, customer, progress, why: null };
}

export async function findMissingFact(
  supabase: any,
  dealershipId: string,
  opts: { sinceDays?: number } = {}
): Promise<AskResult> {
  const { checks, customer, progress, why: readWhy } = await readGapEvidence(
    supabase,
    dealershipId,
    opts.sinceDays ?? 30
  );

  // A FAILED READ ASKS NOTHING, the same rule the pushing version
  // follows: offering a question without being able to check what has
  // already been dealt with is how one question becomes every morning.
  if (readWhy) return { asked: null, line: null, why: readWhy };

  const gap = nextGapToAsk(checks, progress, customer);
  if (!gap) return { asked: null, line: null, why: "nothing has been missed often enough to ask about" };

  const line = gapAskLine(gap);
  if (!line) return { asked: null, line: null, why: `no question is registered for "${gap.key}"` };

  return { asked: gap, line, why: null };
}

export async function askForMissingFact(
  supabase: any,
  dealershipId: string,
  opts: { sinceDays?: number } = {}
): Promise<AskResult> {
  const { checks, customer, progress, why: readWhy } = await readGapEvidence(
    supabase,
    dealershipId,
    opts.sinceDays ?? 30
  );

  // A FAILED READ ASKS NOTHING. Asking without being able to check what
  // has already been asked is how "once, ever" becomes "every morning".
  if (readWhy) return { asked: null, line: null, why: readWhy };

  const gap = nextGapToAsk(checks, progress, customer);
  if (!gap) return { asked: null, line: null, why: "nothing has been missed often enough to ask about" };

  const line = gapAskLine(gap);
  if (!line) return { asked: null, line: null, why: `no question is registered for "${gap.key}"` };

  const { error: writeError } = await supabase.from("interview_answers").upsert(
    {
      dealership_id: dealershipId,
      question_key: gap.key,
      status: "asked",
      asked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dealership_id,question_key" }
  );
  if (writeError) {
    // NOT ASKED, because it could not be recorded as asked. The whole
    // promise of this tier is one question per fact, ever.
    console.error(`[fact-gaps] ${dealershipId}: could not record the ask: ${writeError.message}`);
    return { asked: null, line: null, why: `could not record the ask: ${writeError.message}` };
  }

  return { asked: gap, line, why: null };
}
