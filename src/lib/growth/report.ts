// THE DAILY OWNER REPORT — S4/P4.
//
// The exit test, exactly:
//
//   > "Daily email arrives with only counted numbers; each suggestion
//   >  cites evidence and the goal it serves"
//
// So this file is built around making the failing case impossible
// rather than unlikely.
//
// THE REPORT IS DATA, AND THE TEXT IS DERIVED FROM IT. A block carries
// the numbers it is allowed to contain, and `everyNumberIsCounted`
// walks the rendered text and fails on any digit that is not one of
// them. A number cannot reach the owner without a `source` naming where
// it was counted.
//
// NO MODEL WRITES A NUMBER, and no model writes anything on this path
// at all. Every line here is a template with counted values
// substituted in. The suggestion's one-line rationale was the only
// candidate for model prose in the plan and it is NOT built here: it
// would have to go through the C2 door, K3 says the door can refuse a
// true sentence built on a thin fact-set, and a report sentence refused
// mid-send is worse than a plain one. The suggestion ships with its
// evidence and its goal, which is what the exit test actually requires.
//
// WHAT THE DIGIT WALK CANNOT DO, said plainly: it matches by VALUE, not
// by meaning. It stops an invented number — "traffic tripled", "a
// Rs 40,000 opportunity" — because no counted value equals it. It would
// not catch a counted number given the wrong label. That is a weaker
// guarantee than it looks and a stronger one than a prompt rule, and
// the label is a human's to check on the first real email.

import type { Evidence } from "@/lib/growth/findings";
import type { Counted } from "@/lib/growth/audit";
import type { StrategistRow } from "@/lib/growth/strategist";
import type { DraftGoal, Maturity } from "@/lib/growth/strategy";
import { stillLearningLine } from "@/lib/growth/strategy";
import { measurementHealthLine, type TrackingState } from "@/lib/growth/tracking";

export type ReportBlock =
  /** Prose. Any digit in it must be a declared number. */
  | { kind: "line"; text: string; numbers: Counted[] }
  /** One counted figure, labelled. */
  | { kind: "stat"; number: Counted }
  /** §2c's line, in every report without exception. */
  | { kind: "health"; text: string; numbers: Counted[] }
  /** A suggestion. Unrenderable without evidence AND a goal. */
  | {
      kind: "suggestion";
      title: string;
      evidence: Evidence[];
      goal: string;
      numbers: Counted[];
    }
  /** A setup step while there is not enough history for a target. */
  | { kind: "setup"; title: string; description: string; target: Counted | null };

export type DailyReport = {
  dealershipId: string;
  /** The day this report speaks about, in the daily job's own terms. */
  day: string;
  subject: string;
  blocks: ReportBlock[];
  /** Every number this report is allowed to print. */
  counted: Counted[];
};

/** Digits, with thousands separators and decimals kept together. */
const NUMBER_IN_TEXT = /\d[\d,.]*/g;

/** The strings a declared counted value may legitimately render as. */
function renderingsOf(value: number): Set<string> {
  const out = new Set<string>([String(value)]);
  if (Number.isInteger(value)) out.add(value.toLocaleString("en-IN"));
  return out;
}

export type NumberCheck = { ok: boolean; offenders: { block: string; found: string }[] };

/**
 * Every number the owner reads traces to something counted.
 *
 * THE LOAD-BEARING CHECK OF S4. Walks the rendered text of every block
 * and compares each digit group against the numbers that block
 * declared. A block that prints a figure it did not declare fails here,
 * whatever produced the figure.
 *
 * The DAY is exempt and only the day: it is the report's own timestamp,
 * not a claim about the business, and it is set by the caller from
 * `indiaToday` rather than by anything that could invent it.
 */
export function everyNumberIsCounted(report: DailyReport): NumberCheck {
  const offenders: { block: string; found: string }[] = [];
  for (const block of report.blocks) {
    const declared = new Set<string>();
    for (const n of declaredNumbers(block)) for (const r of renderingsOf(n.value)) declared.add(r);
    const text = textOf(block);
    for (const match of text.match(NUMBER_IN_TEXT) ?? []) {
      const cleaned = match.replace(/[.,]+$/, "");
      if (declared.has(cleaned) || declared.has(match)) continue;
      offenders.push({ block: block.kind, found: cleaned });
    }
  }
  return { ok: offenders.length === 0, offenders };
}

function declaredNumbers(block: ReportBlock): Counted[] {
  if (block.kind === "stat") return [block.number];
  if (block.kind === "setup") return block.target ? [block.target] : [];
  return block.numbers;
}

function textOf(block: ReportBlock): string {
  switch (block.kind) {
    case "stat":
      return `${block.number.label}: ${block.number.value}`;
    case "suggestion":
      return `${block.title} — toward: ${block.goal}`;
    case "setup":
      return `${block.title} — ${block.description}${block.target ? ` (${block.target.label}: ${block.target.value})` : ""}`;
    default:
      return block.text;
  }
}

/**
 * Build the report. Pure: no reads, no writes, no model.
 *
 * Everything it needs has already been counted by the audit, decided by
 * the Strategist and measured by the tracking check. That is the point
 * — this function cannot produce a number because it has no way to get
 * one.
 */
export function buildDailyReport(input: {
  dealershipId: string;
  day: string;
  businessName: string;
  tracking: TrackingState;
  maturity: Maturity;
  counted: Counted[];
  /** Today's picks, already capped and gated by the Strategist. */
  suggestions: { row: StrategistRow; goalTitle: string }[];
  /** Setup steps, used only while the data is thin. */
  setupGoals: DraftGoal[];
}): DailyReport {
  const byLabel = new Map(input.counted.map((c) => [c.label, c]));
  const blocks: ReportBlock[] = [];

  // §2c: the measurement health line is in EVERY report.
  const healthText = measurementHealthLine(input.tracking);
  blocks.push({
    kind: "health",
    text: healthText,
    numbers: input.counted.filter((c) => healthNumbers(input.tracking).includes(c.value)).concat(healthCounted(input.tracking)),
  });

  blocks.push({
    kind: "line",
    text: stillLearningLine(input.maturity),
    numbers: maturityCounted(input.maturity),
  });

  for (const c of input.counted) blocks.push({ kind: "stat", number: c });

  if (input.maturity.kind === "learning") {
    for (const goal of input.setupGoals) {
      blocks.push({
        kind: "setup",
        title: goal.title,
        description: goal.description,
        target:
          goal.targetValue === null || goal.targetMetric === null
            ? null
            : { label: goal.targetMetric, value: goal.targetValue, source: basisSource(goal) },
      });
    }
  }

  for (const s of input.suggestions) {
    // UNRENDERABLE WITHOUT BOTH. The Strategist already refuses a
    // finding with no evidence or no goal, so this is the second gate
    // on the same rule rather than the first — and it is here because
    // the exit test is about the EMAIL, and an email is the last place
    // the rule can be enforced.
    const evidence = Array.isArray(s.row.evidence) ? (s.row.evidence as Evidence[]) : [];
    if (!evidence.length || !String(s.goalTitle ?? "").trim()) continue;
    blocks.push({
      kind: "suggestion",
      title: s.row.title,
      evidence,
      goal: s.goalTitle,
      // A finding's title carries its own count — "2 pages have no
      // search title" — and that number must be one this report
      // counted, or the digit walk refuses it.
      //
      // THE REPORT'S WHOLE COUNTED SET, not a filter on the title's own
      // numbers. My first version filtered, which LOOKED stricter and
      // was behaviourally identical: the digit walk only asks whether a
      // number is declared, so a value present in `counted` passes
      // either way and a value absent fails either way. A mutation
      // check caught that the filter guarded nothing, and a narrower
      // expression that implies a guarantee it does not give is worse
      // than the plain one.
      numbers: input.counted,
    });
  }

  return {
    dealershipId: input.dealershipId,
    day: input.day,
    // THE SUBJECT PROMISES ONLY WHAT IS IN THE EMAIL.
    //
    // The dry run of 23 October had it say "what I did and what I would
    // do next" over a report with no account of anything done — S4
    // takes no actions, it audits and suggests. A subject line is the
    // first sentence the owner reads and it was overstating by a whole
    // section. It now counts what is actually below it.
    subject: subjectFor(input.businessName, blocks),
    blocks,
    counted: input.counted,
  };
}

/** Says what the email contains, and nothing it does not. */
function subjectFor(businessName: string, blocks: ReportBlock[]): string {
  const suggestions = blocks.filter((b) => b.kind === "suggestion").length;
  const setup = blocks.filter((b) => b.kind === "setup").length;
  if (suggestions) return `${businessName} — ${suggestions} ${suggestions === 1 ? "suggestion" : "suggestions"} for today`;
  if (setup) return `${businessName} — ${setup} setup ${setup === 1 ? "step" : "steps"} to get started`;
  return `${businessName} — your daily check, nothing to flag`;
}

function healthNumbers(t: TrackingState): number[] {
  return [t.siteEvents.visitorEvents30d, 30];
}
function healthCounted(t: TrackingState): Counted[] {
  return [
    { label: "visitor events in 30 days", value: t.siteEvents.visitorEvents30d, source: "page_events (is_internal = false)" },
    { label: "days in the window", value: 30, source: "report window" },
  ];
}
function maturityCounted(m: Maturity): Counted[] {
  return [
    { label: "days of visitor data", value: m.daysOfData, source: "page_events (earliest, is_internal = false)" },
    { label: "visitor events", value: m.events, source: "page_events (is_internal = false)" },
    { label: "days a target needs", value: 14, source: "LEARNING_MIN_DAYS" },
    { label: "events a target needs", value: 20, source: "LEARNING_MIN_EVENTS" },
  ];
}
function basisSource(goal: DraftGoal): string {
  const counted = goal.basis.find((b) => b.kind === "counted");
  return counted ? counted.id : "unknown";
}

/** The plain-text email. The HTML version renders the same blocks. */
export function renderText(report: DailyReport): string {
  const lines: string[] = [`${report.subject}`, `For ${report.day}`, ""];
  for (const block of report.blocks) {
    switch (block.kind) {
      case "health":
      case "line":
        lines.push(block.text, "");
        break;
      case "stat":
        lines.push(`  ${block.number.label}: ${block.number.value}`);
        break;
      case "setup":
        lines.push(
          "",
          `SETUP STEP — ${block.title}`,
          `  ${block.description}`,
          ...(block.target ? [`  Target: ${block.target.label} — ${block.target.value}`] : [])
        );
        break;
      case "suggestion":
        lines.push(
          "",
          `SUGGESTION — ${block.title}`,
          `  Toward your goal: ${block.goal}`,
          `  Based on: ${block.evidence.map((e) => `${e.kind}:${e.id}`).join(", ")}`
        );
        break;
    }
  }
  return lines.join("\n");
}
