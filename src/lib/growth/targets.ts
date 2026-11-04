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

import type { Diagnosis, Funnel } from "@/lib/strategy/diagnosis";
import type { DraftGoal, Maturity } from "@/lib/growth/strategy";
import type { Counted } from "@/lib/growth/audit";

/** Marks a goal as being about a funnel step rather than a finding. */
export const TARGET_KEY_PREFIX = "target:";

/** At most this many target goals at once, whatever the funnels say. */
export const MAX_TARGET_GOALS = 3;

/** A slug that survives a label change: the machine's name for the step. */
function slug(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function targetKeyFor(funnelName: string, fromKey: string, toKey: string): string {
  return `${TARGET_KEY_PREFIX}${slug(funnelName)}:${slug(fromKey)}_to_${slug(toKey)}`;
}

export function isTargetKey(key: string | null | undefined): boolean {
  return String(key ?? "").startsWith(TARGET_KEY_PREFIX);
}

/** The funnel and step a target key names, or null when it is not one. */
export function parseTargetKey(key: string | null | undefined): { funnel: string; fromKey: string; toKey: string } | null {
  const raw = String(key ?? "");
  if (!isTargetKey(raw)) return null;
  const [funnel, step] = raw.slice(TARGET_KEY_PREFIX.length).split(":", 2);
  const match = /^(.+)_to_(.+)$/.exec(String(step ?? ""));
  if (!funnel || !match) return null;
  return { funnel, fromKey: match[1], toKey: match[2] };
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
};

/**
 * The goals the ready branch offers: one per funnel's weakest step.
 *
 * ONE PER FUNNEL, NOT ONE PER STEP. Every step below the weakest is
 * also "improvable", and offering five of them would be the suggestion
 * cap's problem all over again — the owner gets a list, not a plan.
 */
export function targetGoalsFrom(diagnosis: Diagnosis, maturity: Maturity): TargetDraft {
  // THE THIN BRANCH STILL OWNS ITS OWN CASE. Setup steps, not targets,
  // and S4's own sentence for it.
  if (maturity.kind !== "ready") return { goals: [], declared: [], why: maturity.why };

  const goals: DraftGoal[] = [];
  const declared: Counted[] = [];
  const thinReasons: string[] = [];

  for (const funnel of diagnosis.funnels) {
    if (goals.length >= MAX_TARGET_GOALS) break;
    if (!funnel.weakest) {
      if (funnel.thin) thinReasons.push(funnel.thin);
      continue;
    }
    const w = funnel.weakest;
    goals.push({
      key: targetKeyFor(funnel.name, w.fromKey, w.toKey),
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

  if (goals.length) return { goals, declared, why: null };
  return {
    goals: [],
    declared: [],
    why: thinReasons[0] ?? "There is enough history to set targets, but no funnel has a step with enough traffic to name yet.",
  };
}
