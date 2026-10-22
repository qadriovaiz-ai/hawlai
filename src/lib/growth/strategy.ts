// S — THE 90-DAY STRATEGY, THIN BRANCH ONLY — S4/P1.
//
// §2c of the growth agent plan: the manager drafts goals and monthly
// targets "from the business's OWN baseline (never industry
// averages)", the owner approves once, and "if data thin (<14 days /
// <20 events) -> 'still learning' with setup goals instead".
//
// S4 BUILDS THE THIN BRANCH AND ONLY THE THIN BRANCH, on the founder's
// decision of 23 October. The ready branch — monthly targets,
// re-planning every 30 days, scoring daily actions against the plan —
// is S5, because it needs the outcome records S5 adds. For
// candle_by_qaaf the thin branch is the only one that would run anyway:
// 40 paid orders and 12 leads is not 14 days of site events.
//
// WHY THIS EXISTS AT ALL IN S4, stated because it was not in the
// founder's original scope line and he asked: S4/P0 made `goal_id`
// required before a finding may be surfaced, because the exit test is
// "each suggestion cites evidence AND THE GOAL IT SERVES". Without
// goals the daily report would be permanently empty. The alternative
// was relaxing the goal requirement, which breaks the exit test.
//
// THE RULE THAT MATTERS MOST HERE IS THE NEGATIVE ONE. A target may
// only come from a number counted about THIS business. Not an industry
// average, not a benchmark, not a model's guess at a reasonable figure.
// `draftTargetsAreOwn` is the test that holds it, and the type makes a
// target without a basis impossible to build.

import type { Evidence } from "@/lib/growth/findings";
import type { AuditFinding, Counted } from "@/lib/growth/audit";

/** §2c's two thresholds. Either one failing means "still learning". */
export const LEARNING_MIN_DAYS = 14;
export const LEARNING_MIN_EVENTS = 20;

export type Maturity = {
  kind: "learning" | "ready";
  daysOfData: number;
  events: number;
  why: string;
};

/**
 * Is there enough of this business's own history to set a target
 * against?
 *
 * BOTH thresholds, and either one is enough to keep it learning. Twenty
 * events in a day says nothing about a week, and three weeks with four
 * events says nothing at all.
 */
export function maturityOf(input: { firstAt: string | null; events: number }, now: Date): Maturity {
  const events = Math.max(0, Math.floor(input.events));
  const first = input.firstAt ? Date.parse(input.firstAt) : NaN;
  // NO DATA AND UNREADABLE DATA ARE THE SAME ANSWER. A date this code
  // cannot parse is not evidence of a long history.
  const daysOfData = Number.isFinite(first) ? Math.max(0, Math.floor((now.getTime() - first) / 86_400_000)) : 0;

  if (daysOfData < LEARNING_MIN_DAYS) {
    return { kind: "learning", daysOfData, events, why: `there are ${daysOfData} days of visitor data and a target needs ${LEARNING_MIN_DAYS}` };
  }
  if (events < LEARNING_MIN_EVENTS) {
    return { kind: "learning", daysOfData, events, why: `there are ${events} visitor events and a target needs ${LEARNING_MIN_EVENTS}` };
  }
  return { kind: "ready", daysOfData, events, why: `there are ${daysOfData} days of data and ${events} visitor events` };
}

/**
 * A goal the owner can approve once.
 *
 * `targetValue` is null unless `basis` carries the counted number it
 * came from. That is not a convention — `setupGoalsFrom` cannot
 * produce one without it, and a test walks every goal to prove no
 * number arrived from anywhere else.
 */
export type DraftGoal = {
  key: string;
  title: string;
  description: string;
  targetMetric: string | null;
  targetValue: number | null;
  /** The counted numbers and rows this goal rests on. */
  basis: Evidence[];
};

/** How each finding becomes a goal. Generic by construction: no trade words. */
const GOAL_FOR: Record<string, { title: string; description: string; metric?: string; from?: string; want?: "all" | "zero" }> = {
  site_missing: { title: "Get a website live", description: "Until there is a page, there is nothing for anyone to find and nothing to measure." },
  site_unpublished: { title: "Publish the website", description: "The pages exist; nobody outside the business can open them yet." },
  pages_without_search_title: {
    title: "Give every page a search title",
    description: "A page without one lets the search engine choose what to call it.",
    metric: "pages with a search title",
    from: "pages",
    want: "all",
  },
  pages_without_meta_description: {
    title: "Give every page a search description",
    description: "The line under the title in a search result should be the business's words.",
    metric: "pages with a search description",
    from: "pages",
    want: "all",
  },
  pages_still_fallback: {
    title: "Replace the placeholder pages",
    description: "These pages are serving the builder's default content.",
    metric: "pages still on the placeholder",
    from: "pages still on the placeholder",
    want: "zero",
  },
  catalogue_empty: { title: "Record what the business sells", description: "Copy can only cite what is on record, so an empty catalogue means nothing specific can be written." },
  products_without_description: {
    title: "Describe every product",
    description: "A product with no recorded description gives the copy nothing to say beyond its name and price.",
    metric: "products with a description",
    from: "products",
    want: "all",
  },
  products_without_image: {
    title: "Add an image to every product",
    description: "The product page and every post about it have nothing to show.",
    metric: "products with an image",
    from: "products",
    want: "all",
  },
  products_priced_zero: { title: "Set a price on every product", description: "A product priced at zero is either unfinished or being given away." },
  live_copy_placeholder: {
    title: "Clear the placeholders off the site",
    description: "A bracketed slot is being served to visitors as if it were copy.",
    metric: "lines with a placeholder",
    from: "lines with a placeholder",
    want: "zero",
  },
  live_copy_unsupported_wording: {
    title: "Go through the wording the records do not support",
    description: "Nothing has been changed. These are lines to keep, record a fact for, or rewrite — the owner decides each one.",
    metric: "lines using unsupported wording",
    from: "lines using unsupported wording",
    want: "zero",
  },
  live_copy_unsupported_claim: {
    title: "Go through the claims the records cannot back",
    description: "Nothing has been changed. Each line is the owner's to keep, support with a record, or drop.",
    metric: "lines making a claim your records cannot back",
    from: "lines making a claim your records cannot back",
    want: "zero",
  },
};

/**
 * Setup goals, drawn from what the audit actually found.
 *
 * DERIVED, NOT LISTED. A fixed list of starter goals would be one
 * trade's idea of a good start shipped to every business — the thing
 * multiTenantVocabulary exists to stop. A business whose pages all have
 * titles gets no goal about titles.
 */
export function setupGoalsFrom(findings: AuditFinding[], counted: Counted[]): DraftGoal[] {
  const byLabel = new Map(counted.map((c) => [c.label, c]));
  const goals: DraftGoal[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const recipe = GOAL_FOR[finding.type];
    if (!recipe || seen.has(finding.type)) continue;
    seen.add(finding.type);

    let targetMetric: string | null = null;
    let targetValue: number | null = null;
    const basis: Evidence[] = [...finding.evidence];

    if (recipe.metric && recipe.from) {
      const source = byLabel.get(recipe.from);
      // NO COUNTED NUMBER, NO TARGET. The goal still goes to the owner
      // — it is worth doing — it simply arrives without a figure rather
      // than with an invented one.
      if (source) {
        targetMetric = recipe.metric;
        targetValue = recipe.want === "zero" ? 0 : source.value;
        basis.push({ kind: "counted", id: source.source });
      }
    }

    goals.push({
      key: finding.type,
      title: recipe.title,
      description: recipe.description,
      targetMetric,
      targetValue,
      basis,
    });
  }
  return goals;
}

/** Every target traces to a number counted about this business. */
export function draftTargetsAreOwn(goals: DraftGoal[]): boolean {
  return goals.every((g) => g.targetValue === null || g.basis.some((b) => b.kind === "counted"));
}

/** What the report says while there is not enough history for a target. */
export function stillLearningLine(m: Maturity): string {
  if (m.kind === "ready") return `Working to your plan: ${m.why}.`;
  return `Still learning: ${m.why}. Until then the goals below are setup steps, not targets.`;
}
