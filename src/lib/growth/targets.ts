// THE 90-DAY STRATEGY'S READY BRANCH — S5/P4.
//
// S4 built the thin branch only: when there is not enough of this
// business's own history, the owner gets setup steps instead of
// targets. `maturityOf` has said "ready" past 14 days and 20 events
// since then, and nothing has ever acted on it. This is that.
//
// THE THING I HAD TO GET RIGHT, AND THE PLAN'S OWN WORDS WERE LOOSE
// ABOUT IT. §3 said "targets from the business's own baseline". A
// baseline is TODAY'S number; a target is TOMORROW'S. "Take this step
// from 12% to 30%" — the 30 comes from nowhere. It is a forecast, and
// forecasts are the one thing this product must not invent.
//
// SO A TARGET GOAL CARRIES NO TARGET NUMBER. It names the step, states
// the rate that step is running at now (counted), and leaves
// `targetValue` null.
//
// AND IT IS STILL MEASURABLE, which is the part worth being clear
// about: measuring needs a MEASURE and a BASELINE, not a target. The
// number would only be needed to say "hit" or "missed" — and that is
// `expected_effect`, which the founder made nullable on 3 November for
// exactly this reason.
//
// WHEN THERE IS NOT ENOUGH TRAFFIC TO NAME A WEAKEST STEP, diagnosis.ts
// already says so in `funnel.thin`, and this returns that sentence
// rather than a goal. The honest "no target yet" was already written;
// it did not need inventing either.

import { MIN_STEP_ENTRY, type Diagnosis, type Funnel } from "@/lib/strategy/diagnosis";
import type { DraftGoal, Maturity } from "@/lib/growth/strategy";
import type { Counted } from "@/lib/growth/audit";

/** Marks a goal as being about a funnel step rather than a finding. */
export const TARGET_KEY_PREFIX = "target:";

/** At most this many target goals at once, whatever the funnels say. */
export const MAX_TARGET_GOALS = 3;

/**
 * How long before the same step is looked at again — the founder's
 * answer, 4 November 2026: *"30 din baad naya target offer karo — chahe
 * purana poora hua ho ya nahi, system dobara dekhe aur naya target
 * suggest kare (funnel badal chuka ho sakta hai)."*
 *
 * WHATEVER HAPPENED TO THE LAST ONE. Not "if it was completed", not "if
 * it was discarded" — the funnel is re-read and the step is offered
 * again. A target he approved and finished is the clearest case for
 * looking again; a target he ignored is a target whose numbers are now
 * a month stale.
 *
 * A DIFFERENT STEP IS NOT ON THIS CLOCK. If the weakest step changes
 * tomorrow, that is a different key and it is offered tomorrow. This
 * number only governs how often the SAME step comes back.
 */
export const TARGET_CYCLE_DAYS = 30;

/** A slug that survives a label change: the machine's name for the step. */
function slug(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * The step a key names, without the day it was offered on.
 *
 * TWO OFFERS OF ONE STEP ARE TWO KEYS, because migration 211's unique
 * index on `goals.source_key` has no status predicate — deliberately,
 * so a discarded step does not come back tomorrow. That same index is
 * what makes a second offer of the same step impossible unless the key
 * differs, so the day goes IN the key and the step id is what the
 * 30-day rule is counted against.
 */
export function targetStepId(funnelName: string, fromKey: string, toKey: string): string {
  return `${slug(funnelName)}:${slug(fromKey)}_to_${slug(toKey)}`;
}

export function targetKeyFor(funnelName: string, fromKey: string, toKey: string, day?: string | null): string {
  const step = `${TARGET_KEY_PREFIX}${targetStepId(funnelName, fromKey, toKey)}`;
  return day ? `${step}:${String(day).slice(0, 10)}` : step;
}

export function isTargetKey(key: string | null | undefined): boolean {
  return String(key ?? "").startsWith(TARGET_KEY_PREFIX);
}

/**
 * The funnel, the step and the day a target key names, or null when it
 * is not a target key.
 *
 * `offeredOn` IS OPTIONAL ON PURPOSE. The first version of this key had
 * three segments and no day; a goal written under it must keep
 * resolving to its step, or its decisions would stop being measurable
 * the moment this shipped. A key with no day parses with
 * `offeredOn: null`.
 */
export function parseTargetKey(
  key: string | null | undefined
): { funnel: string; fromKey: string; toKey: string; offeredOn: string | null } | null {
  const raw = String(key ?? "");
  if (!isTargetKey(raw)) return null;
  const parts = raw.slice(TARGET_KEY_PREFIX.length).split(":");
  const funnel = parts[0];
  const match = /^(.+)_to_(.+)$/.exec(String(parts[1] ?? ""));
  if (!funnel || !match) return null;
  return { funnel, fromKey: match[1], toKey: match[2], offeredOn: parts[2] ? String(parts[2]) : null };
}

/** The step part of a key, so two offers of one step compare equal. */
export function stepIdOf(key: string | null | undefined): string | null {
  const parsed = parseTargetKey(key);
  return parsed ? `${parsed.funnel}:${parsed.fromKey}_to_${parsed.toKey}` : null;
}

/** A target goal already on record, whatever became of it. */
export type TargetOffer = { sourceKey: string; createdAt: string | null };

/** Whole days from one YYYY-MM-DD to another, or null if unreadable. */
function daysBetween(fromDay: string, toDay: string): number | null {
  const a = Date.parse(`${String(fromDay).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toDay).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * The day this step was last offered, or null if it never was.
 *
 * `created_at` FIRST, the key's own day second. The column is what
 * actually happened; the key's day is what the run intended, and it is
 * the only thing a legacy three-segment key has.
 *
 * AN OFFER WITH NO READABLE DATE COUNTS AS TODAY, which means "do not
 * offer it again". Postgres always sets created_at, so this is close to
 * impossible — and if it ever happens, a step missed for a month is a
 * smaller fault than the same step on the Tasks page every morning.
 */
export function lastOfferedOn(offers: TargetOffer[], stepId: string, today: string): string | null {
  let latest: string | null = null;
  for (const offer of offers) {
    if (stepIdOf(offer.sourceKey) !== stepId) continue;
    const day =
      (offer.createdAt ? String(offer.createdAt).slice(0, 10) : null) ??
      parseTargetKey(offer.sourceKey)?.offeredOn ??
      today;
    if (!latest || day > latest) latest = day;
  }
  return latest;
}

/** The step this key names, inside a diagnosis, or null. */
export function weakestStepFor(diagnosis: Diagnosis, key: string): Funnel["weakest"] {
  const parsed = parseTargetKey(key);
  if (!parsed) return null;
  for (const funnel of diagnosis.funnels) {
    if (slug(funnel.name) !== parsed.funnel) continue;
    const steps = funnel.steps;
    for (let i = 1; i < steps.length; i += 1) {
      if (slug(steps[i - 1].key) !== parsed.fromKey || slug(steps[i].key) !== parsed.toKey) continue;
      const rate = steps[i].fromPrevious;
      if (rate === null) return null;
      return {
        from: steps[i - 1].label,
        to: steps[i].label,
        fromKey: steps[i - 1].key,
        toKey: steps[i].key,
        rate,
        entered: steps[i - 1].count,
      };
    }
  }
  return null;
}

export type TargetDraft = {
  goals: DraftGoal[];
  /**
   * Every figure the goals' own words print, declared — S4's digit walk
   * reaches these descriptions the moment they go in an email, and a
   * figure it cannot trace gets the block pruned. The audit learned
   * this on 3 November by having a whole email dropped over a "5".
   */
  declared: Counted[];
  /**
   * Why there are none, when there are none. Never null AND empty at
   * the same time: a caller showing nothing has a sentence to show.
   */
  why: string | null;
  /**
   * The figures `why` itself prints — 6 November 2026.
   *
   * THIS SENTENCE IS NOW EMAIL COPY. Until today it reached the run
   * result and the Vercel log and stopped there, so it could state a
   * number nothing declared and no harm came of it. The owner's email
   * of 5 November said nothing at all about targets — neither the two
   * that were drafted nor a reason — and the fix puts this sentence in
   * front of him. The moment it goes in an email the digit walk reads
   * it, and an undeclared figure costs him the whole line.
   */
  whyCounted: Counted[];
};

/**
 * The goals the ready branch offers: one per funnel's weakest step.
 *
 * ONE PER FUNNEL, NOT ONE PER STEP. Every step below the weakest is
 * also "improvable", and offering five of them would be the suggestion
 * cap's problem all over again — the owner gets a list, not a plan.
 */
export function targetGoalsFrom(
  diagnosis: Diagnosis,
  maturity: Maturity,
  offers: TargetOffer[] = [],
  today: string = diagnosis.window.to
): TargetDraft {
  // THE THIN BRANCH STILL OWNS ITS OWN CASE. Setup steps, not targets,
  // and S4's own sentence for it.
  // `maturity.why` states its own counts — days of data, events — and
  // maturityCounted declares them in the report's plan line. This
  // branch is not reached by the email's reason line (dailyGrowth only
  // asks for a reason once maturity is ready), so it declares nothing
  // and says so rather than looking as if it had been forgotten.
  if (maturity.kind !== "ready") return { goals: [], declared: [], why: maturity.why, whyCounted: [] };

  const goals: DraftGoal[] = [];
  const declared: Counted[] = [];
  const thinReasons: string[] = [];
  const waiting: { text: string; counted: Counted[] }[] = [];

  for (const funnel of diagnosis.funnels) {
    if (goals.length >= MAX_TARGET_GOALS) break;
    if (!funnel.weakest) {
      if (funnel.thin) thinReasons.push(funnel.thin);
      continue;
    }
    const w = funnel.weakest;

    // THIRTY DAYS SINCE THE LAST TIME THIS STEP WAS OFFERED, whatever
    // became of that offer. See TARGET_CYCLE_DAYS.
    const stepId = targetStepId(funnel.name, w.fromKey, w.toKey);
    const last = lastOfferedOn(offers, stepId, today);
    if (last) {
      const age = daysBetween(last, today);
      if (age === null || age < TARGET_CYCLE_DAYS) {
        // EMAIL COPY SINCE 6 NOVEMBER, so every figure in it is
        // declared beside it. An unreadable date prints no number and
        // therefore declares none — a `null` age declared as a figure
        // would be the invented number this whole file exists to avoid.
        waiting.push({
          text:
            age === null
              ? `The weakest step in "${funnel.name}" was offered before, on a date I cannot read, and the same step is offered again after ${TARGET_CYCLE_DAYS} days.`
              : `The weakest step in "${funnel.name}" was offered ${age} ${age === 1 ? "day" : "days"} ago, and the same step is offered again after ${TARGET_CYCLE_DAYS} days.`,
          counted: [
            { label: "days before the same step is offered again", value: TARGET_CYCLE_DAYS, source: "TARGET_CYCLE_DAYS" },
            ...(age === null ? [] : [{ label: `days since the last offer in "${funnel.name}"`, value: age, source: "goals.created_at" }]),
          ],
        });
        continue;
      }
    }

    goals.push({
      key: targetKeyFor(funnel.name, w.fromKey, w.toKey, today),
      title: `Improve ${w.from} to ${w.to}`,
      description: `Of the ${w.entered} who reached ${w.from.toLowerCase()} in the last ${diagnosis.window.days} days, ${w.rate}% went on to ${w.to.toLowerCase()}. That is the narrowest step in "${funnel.name}".`,
      // THE STEP IS THE METRIC; THERE IS NO TARGET NUMBER. See the
      // header: any number here would be a forecast.
      targetMetric: `${w.from} to ${w.to}`,
      targetValue: null,
      // The counted numbers this rests on. `window` is the diagnosis's
      // own 90 days, which is where every figure above came from.
      basis: [{ kind: "counted", id: "page_events + leads (90-day window)" }],
    });
    declared.push(
      { label: `people who reached ${w.from.toLowerCase()}`, value: w.entered, source: "funnel diagnosis (page_events + leads)" },
      { label: `${w.from} to ${w.to}, as a percentage`, value: w.rate, source: "funnel diagnosis (page_events + leads)" },
      { label: "days in the funnel window", value: diagnosis.window.days, source: "WINDOW_DAYS" }
    );
  }

  if (goals.length) return { goals, declared, why: null, whyCounted: [] };

  // THE THIN REASON FIRST. "No step has enough traffic" is a fact
  // about the business; "offered recently" is a fact about this
  // product's own schedule, and the first is the more useful one to
  // read when both are true.
  //
  // THE SENTENCE AND ITS FIGURES ARE RETURNED TOGETHER, which is the
  // only safe shape: picking the sentence in one place and its
  // declarations in another is how a line ends up declaring the figures
  // of a sentence it is not.
  if (thinReasons.length) {
    return {
      goals: [],
      declared: [],
      why: thinReasons[0],
      // diagnosis.ts writes that sentence and MIN_STEP_ENTRY is the one
      // figure in it. If it ever states a second one, this line is
      // pruned from the email and the owner is told one thing was left
      // out — the safe direction, and `whyLineIsDeclared` in
      // tests/growthTargets.test.ts fails on the real sentence first.
      whyCounted: [{ label: "people a step needs before it can be judged", value: MIN_STEP_ENTRY, source: "MIN_STEP_ENTRY (funnel diagnosis)" }],
    };
  }
  if (waiting.length) return { goals: [], declared: [], why: waiting[0].text, whyCounted: waiting[0].counted };
  return {
    goals: [],
    declared: [],
    why: "There is enough history to set targets, but no funnel has a step with enough traffic to name yet.",
    whyCounted: [],
  };
}
