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

export type FactGap = { key: string; times: number };

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
export function gapsFrom(rows: GapRow[] | null | undefined): FactGap[] {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const kinds = Array.isArray(row?.removed_kinds) ? row.removed_kinds : [];
    for (const kind of kinds) {
      const key = questionForKind(kind);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, times]) => ({ key, times }))
    .sort((a, b) => b.times - a.times || a.key.localeCompare(b.key));
}

/** How often a gap must have cost something before it is worth asking about. */
export const ASK_AFTER = 2;

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
  progress: ProgressRow[] | null | undefined
): FactGap | null {
  const p = readProgress(progress);
  const dealtWith = new Set([...p.answered, ...p.skipped, ...p.asked]);
  for (const gap of gapsFrom(rows)) {
    if (gap.times < ASK_AFTER) continue;
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
  return {
    text: `I had to cut a line ${gap.times} times recently because I don't have your ${what}. ${question.prompt}`,
    // THE DIGIT IS DECLARED, because the report's digit walk refuses a
    // number it cannot trace and would otherwise drop this whole block
    // — the fault recorded in growth/audit.ts for the "5" in "5 pages
    // have no search title". The source names the table the count came
    // from, so the owner (and the next reader) can go and check it.
    counted: [{ label: `lines cut for a missing ${what}`, value: gap.times, source: "claim_checks" }],
  };
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
export async function askForMissingFact(
  supabase: any,
  dealershipId: string,
  opts: { sinceDays?: number } = {}
): Promise<AskResult> {
  const since = new Date(Date.now() - (opts.sinceDays ?? 30) * 86400000).toISOString();

  const [{ data: checks, error: checkError }, { data: progress, error: progressError }] = await Promise.all([
    supabase
      .from("claim_checks")
      .select("removed_kinds, claims_removed")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since),
    supabase.from("interview_answers").select("question_key, status, attempts, weak").eq("dealership_id", dealershipId),
  ]);

  // A FAILED READ ASKS NOTHING. Asking without being able to check what
  // has already been asked is how "once, ever" becomes "every morning".
  if (checkError || progressError) {
    const why = `could not read the history: ${checkError?.message ?? progressError?.message}`;
    console.error(`[fact-gaps] ${dealershipId}: ${why}`);
    return { asked: null, line: null, why };
  }

  const gap = nextGapToAsk(checks, progress);
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
