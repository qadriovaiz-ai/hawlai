// THE SECOND JUDGE — S7/P2.
//
// The claim guard decides what may go out. This reads what DID go out
// and asks again, from scratch, with no knowledge of what the guard
// thought. The reason is one sentence in the file this reuses:
//
//     "THE RUN CANNOT BE THE JUDGE OF THE RUN"
//       — scripts/eval/outputGate.eval.ts
//
// NOT A NEW INSTRUMENT. That gate already re-asks the extractor about a
// finished run's surviving sentences and flags any claim of a type
// nothing can license — benefit, capability, safety, comparison,
// customer_state. It was built for the eval bench, offline, over saved
// results, for about ₹3 a run. This is the same pass pointed at
// `claim_checks` rows (migration 217) on the daily cron. Writing a
// second, differently-worded judge would give one question two answers.
//
// WHAT IT IS NOT. It can only catch what the extractor sees. The gate's
// own header says it plainly: "a vague claim riding on a true fact still
// needs a person." A clean verdict here is not a certificate; it is one
// mechanical reader finding nothing it can name.
//
// AND "I COULD NOT CHECK" IS A REAL ANSWER, kept separate from "clean"
// in the column and in this file. An unreachable extractor is not a
// clean bill of health, and an autonomous product whose supervisor
// quietly died is the worst state S7 can produce — the state that looks
// exactly like everything being fine. `blindDays` is what S7/P3 reads to
// suspend a level, and silence is never evidence.

import { copySentences } from "@/lib/content/copySentences";
import { notCopySentences } from "@/lib/content/notCopy";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, extractClaims } from "@/lib/facts/extractClaims";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

/** Nothing on record can license these. One that went out is a failure. */
const REFUSED = new Set<string>([...UNLICENSABLE_TYPES, ...NEEDS_RECIPIENT_RECORD]);

/**
 * Days without a successful check before a level is treated as blind.
 *
 * TWO, AND THE NUMBER IS NOT ARBITRARY. The dispatcher sent a stale
 * secret for exactly two days at the start of November and nobody knew
 * until the owner noticed a missing email, so one quiet day is a
 * hiccup and two is the shape of something broken. Read by S7/P3,
 * which is what actually suspends anything — this file only measures.
 */
export const MONITOR_BLIND_DAYS = 2;

/**
 * The most rows one business's run will check.
 *
 * A CAP RATHER THAN A FLAG. A switch defaulting to off would recreate
 * the fault still open in production — `dm_auto_reply` reading "on"
 * over a path that does nothing — with the sides swapped: a monitor
 * that says it is running while it checks nothing. So it always runs,
 * and what bounds it is arithmetic.
 */
export const MONITOR_MAX_ROWS = 20;

/** And the most one business's run will spend, whatever the row count. */
export const MONITOR_BUDGET_INR = 2;

/**
 * How far back an unchecked row is still worth checking.
 *
 * A row older than this is left alone: the copy has been live for a
 * fortnight, so a demotion today would be about something the owner has
 * long since seen, and the spend would buy nothing. It stays unchecked,
 * which is visible in the table rather than tidied away.
 */
export const MONITOR_LOOKBACK_DAYS = 14;

export type MonitorVerdict = "clean" | "unsupported" | "could_not_check";

export type MonitorRun = {
  /** Rows this run looked at. */
  looked: number;
  clean: number;
  /** Rows where a claim nothing can license had gone out. */
  unsupported: number;
  couldNotCheck: number;
  costInr: number;
  /** Why it stopped early, when it did. */
  stoppedBecause: string | null;
  /**
   * Days since this business last had a row checked successfully, or
   * null when nothing is waiting to be checked at all.
   *
   * NULL IS NOT ZERO. A business that published nothing is not a
   * business whose monitor is working; it is a business with nothing to
   * monitor, and S7/P3 must not read the two the same way.
   */
  blindDays: number | null;
  /** Set when the run could not do its job. Never swallowed. */
  error: string | null;
  /**
   * The rows where something had gone out that nothing can license.
   *
   * REPORTED AS DATA, NOT ACTED ON. This file spends money and talks to
   * a model; the rule that takes a permission away must be testable
   * without either, so it lives in src/lib/autonomy/demotion.ts and the
   * daily runner joins the two. `ownerWords` rides along because a
   * claim the owner wrote himself must not demote anything — migration
   * 217's own column.
   */
  escapes: { id: string; surface: string; published: boolean; unsupported: number; ownerWords: boolean }[];
};

/**
 * A fresh zeroed run.
 *
 * A FUNCTION, NOT A CONSTANT, AND THAT WAS A REAL BUG. It used to be a
 * module-level constant, and spreading it copies the ARRAY REFERENCE —
 * so every run pushed its escapes into the same array the constant
 * held. Found by a test asserting the owner's-words flag on a second
 * run, which read the FIRST run's escape.
 *
 * The consequence was not cosmetic. The daily cron runs every
 * subsystem for every business inside one invocation
 * (lib/automation/dailyRun.ts), so one business's run would have
 * carried another's escapes — and S7/P3 would have taken a permission
 * away from the second for something the first published. A
 * cross-tenant decision, out of one shared literal.
 */
function emptyRun(): MonitorRun {
  return {
    looked: 0,
    clean: 0,
    unsupported: 0,
    couldNotCheck: 0,
    costInr: 0,
    stoppedBecause: null,
    blindDays: null,
    error: null,
    escapes: [],
  };
}

/** Whole days from one YYYY-MM-DD to another, or null if unreadable. */
function daysBetween(fromDay: string, toDay: string): number | null {
  const a = Date.parse(`${String(fromDay).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toDay).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function lookbackFrom(today: string, days = MONITOR_LOOKBACK_DAYS): string {
  const at = Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return today;
  return new Date(at - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * How long this business has been going unchecked.
 *
 * MEASURED FROM THE OLDEST THING STILL WAITING, not from the last time
 * the monitor ran. A monitor that runs every morning and fails every
 * morning has run recently and seen nothing, and measuring its own
 * activity would report that as healthy. The question S7/P3 needs
 * answered is "how long has something published been sitting
 * unexamined", and that is this.
 */
export function blindnessOf(
  waiting: { created_at?: string | null }[],
  today: string
): number | null {
  let oldest: number | null = null;
  for (const row of waiting) {
    const day = String(row.created_at ?? "").slice(0, 10);
    const age = daysBetween(day, today);
    if (age === null) continue;
    if (oldest === null || age > oldest) oldest = age;
  }
  return oldest;
}

/** The verdict for one row's sentences, and what to keep of it. */
export function verdictFor(input: {
  ok: boolean;
  claims: { claimType: string; canonical: string }[];
  notCopy: { sentenceIndex: number; reason: string }[];
  sentences: string[];
}): { verdict: MonitorVerdict; findings: { claimType: string; canonical: string }[] } {
  // THE EXTRACTOR FAILING IS NOT A RESULT. Reading an unreachable
  // reader as "nothing found" is F-01's shape exactly: `facts ? guard()
  // : skip` turned a guard off on a transient read error.
  if (!input.ok) return { verdict: "could_not_check", findings: [] };

  const findings = input.claims.filter((c) => REFUSED.has(c.claimType)).map((c) => ({ claimType: c.claimType, canonical: c.canonical }));

  // A PLACEHOLDER OR A META SENTENCE THAT WENT OUT IS ALSO A FAILURE,
  // and it is found in code for nothing. The gate learned this on run
  // 6: "[LICENSE NUMBER NEEDED]" reached a customer with no removal,
  // because a placeholder is not a claim and nothing was looking.
  for (const n of input.notCopy) {
    findings.push({
      claimType: n.reason === "slot" ? "placeholder" : "meta",
      canonical: String(input.sentences[n.sentenceIndex] ?? "").slice(0, 300),
    });
  }

  return { verdict: findings.length ? "unsupported" : "clean", findings };
}

/**
 * Check what this business published, and record what a second reader
 * thinks of it.
 *
 * NOTHING HERE DEMOTES ANYTHING. That is S7/P3, and keeping them apart
 * is deliberate: this spends money and talks to a model, and the rule
 * that takes a permission away must be testable without either.
 */
export async function runOutputMonitor(
  supabase: any,
  dealershipId: string,
  opts: { today?: string; maxRows?: number; budgetInr?: number } = {}
): Promise<MonitorRun> {
  const today = opts.today ?? indiaToday();
  const maxRows = Math.max(1, Math.floor(opts.maxRows ?? MONITOR_MAX_ROWS));
  const budget = opts.budgetInr ?? MONITOR_BUDGET_INR;

  const { data, error } = await supabase
    .from("claim_checks")
    // `surface` and `owner_words` are read for the demotion rule, which
    // needs to know how wide an escape reaches and whose words it was.
    .select("id, text, created_at, monitor_verdict, surface, owner_words")
    .eq("dealership_id", dealershipId)
    .eq("published", true)
    // A ROW THAT COULD NOT BE CHECKED IS TRIED AGAIN, which is why
    // 'could_not_check' is here beside null. Writing it as a final
    // verdict would retire a row nobody has actually read.
    .or("monitor_verdict.is.null,monitor_verdict.eq.could_not_check")
    .gte("created_at", lookbackFrom(today))
    .order("created_at", { ascending: true })
    .limit(maxRows);

  if (error || !Array.isArray(data)) {
    // SAID, NOT SWALLOWED. A monitor that cannot read its own table has
    // not found a clean month; it has found nothing, and the difference
    // is what S7/P3 acts on.
    const why = `${error?.message ?? "no rows returned"}. If migration 217 has not been run, claim_checks does not exist yet.`;
    console.error(`[monitor] could not read what went out for ${dealershipId}: ${why}`);
    return { ...emptyRun(), error: why };
  }

  const waiting = data as { id: string; text: string; created_at: string; surface: string; owner_words: boolean }[];
  const run: MonitorRun = { ...emptyRun(), blindDays: blindnessOf(waiting, today) };

  for (const row of waiting) {
    if (run.costInr >= budget) {
      // THE CAP IS NOT A PASS EITHER. The rows left over stay unchecked
      // and keep ageing, so `blindDays` grows and S7/P3 sees it.
      run.stoppedBecause = `the ${budget} rupee cap for one run was reached, so ${waiting.length - run.looked} rows are still unchecked`;
      break;
    }

    // THE SAME SPLIT AND THE SAME OPENED-OUT FORM THE DOOR USES.
    // Asking the extractor about "#SoyWaxOnly" is asking a different
    // question from the one the pipeline asked, and it cleared a run
    // whose tags carried claims on 2026-10-20.
    const sentences = copySentences({ text: row.text }).map((s) => s.analysed);
    if (!sentences.length) {
      // Nothing to read. P1 refuses to write a row with no text, so
      // this is a row whose copy was already cleared by an earlier
      // verdict — not something to spend a model call on.
      continue;
    }

    const notCopy = notCopySentences(sentences);
    // FREE CHECKS FIRST. A placeholder is not something to ask a model
    // about, and the answer is the same either way.
    const extracted = notCopy.length
      ? { ok: true as const, claims: [] as { claimType: string; canonical: string }[], costInr: 0 }
      : await extractClaims(sentences, { logContext: { supabase, dealershipId } });

    run.costInr = Math.round((run.costInr + (extracted.costInr ?? 0)) * 100) / 100;
    // NARROWED BY THE DISCRIMINANT, not by `?? []`. ExtractResult's
    // failure arm has no `claims` at all, and reaching for it through a
    // default would have read a refusal as "no claims found" — which is
    // the one confusion this whole file exists to prevent.
    const { verdict, findings } = verdictFor({
      ok: extracted.ok,
      claims: extracted.ok ? extracted.claims : [],
      notCopy,
      sentences,
    });

    // WHAT IS KEPT, AND THE PLAN SAID SOMETHING ELSE. It said to keep
    // only the refused sentences. On reading it again: the copy of a
    // row that was WRONG is the evidence behind a demotion the owner
    // will be told about, and a row that could not be checked has to be
    // readable to be checked later. So the only copy dropped is the
    // copy nothing was wrong with.
    const update: Record<string, unknown> = {
      monitor_verdict: verdict,
      monitor_unsupported: findings.length,
      monitor_findings: findings,
      checked_at: new Date().toISOString(),
    };
    if (verdict === "clean") update.text = "";

    const { error: writeError } = await supabase.from("claim_checks").update(update).eq("id", row.id);
    if (writeError) {
      console.error(`[monitor] checked ${row.id} and could not write the verdict: ${writeError.message}`);
      run.error = writeError.message;
      // A VERDICT THAT WAS NOT WRITTEN DID NOT HAPPEN. The row is still
      // waiting, the money is still spent, and saying otherwise would
      // report a check that nothing can read.
      continue;
    }

    run.looked += 1;
    if (verdict === "clean") run.clean += 1;
    else if (verdict === "unsupported") {
      run.unsupported += 1;
      run.escapes.push({
        id: row.id,
        surface: String(row.surface ?? ""),
        published: true,
        unsupported: findings.length,
        ownerWords: Boolean(row.owner_words),
      });
    } else run.couldNotCheck += 1;
  }

  if (run.unsupported > 0) {
    // LOUD, because this is the event the whole stage is built around.
    // S7/P3 is what acts on it; until that exists this line is the only
    // thing that says it happened.
    console.error(
      `[monitor] ${run.unsupported} published output(s) for ${dealershipId} carried a claim nothing can license — see claim_checks.monitor_findings`
    );
  }
  return run;
}
