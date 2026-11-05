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
import { hasNoPlan, planLine } from "@/lib/growth/strategy";
import { measurementHealthLine, type TrackingState } from "@/lib/growth/tracking";

export type ReportBlock =
  /**
   * The one thing that goes above everything else.
   *
   * WHY IT EXISTS, 1 November 2026: the product's AI was dead for nine
   * days and the owner found out because a cost table was empty. The
   * daily report kept arriving and kept saying nothing about it, because
   * the audit is model-free and so the report had no idea anything was
   * wrong. A report that reaches the owner every morning is the right
   * place for "the AI is not working", and it was the one place not
   * saying it.
   */
  | {
      kind: "alert";
      text: string;
      numbers: Counted[];
      /**
       * A few words for the subject line, when this alert takes it.
       *
       * WHY, 3 November 2026: `subjectFor` took the alert's text up to
       * its first " — ", and the copy-audit note has no " — " in it. So
       * the whole sentence became the subject — "candle_by_qaaf — I
       * could not finish checking your page copy against your records
       * this time, so nothing below says anything about it." — and it
       * buried the three suggestions the email was actually carrying.
       */
      headline?: string;
      /**
       * Whether this is the most important thing in the email.
       *
       * TRUE FOR A DEAD AI, FALSE FOR A HALF-FINISHED CHECK. "Your AI is
       * not working" belongs in the subject; "the deeper copy check did
       * not finish" is a footnote next to three usable suggestions, and
       * on 3 November it took the subject from them.
       */
      ownsSubject?: boolean;
    }
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
  /**
   * A setup step while there is not enough history for a target — or,
   * past that point, a target drawn from this business's own funnel.
   *
   * ONE BLOCK KIND FOR BOTH, because they render the same way and go to
   * the same place: a draft goal on the Tasks page. `isTarget` changes
   * the word in front of it and the subject line, not the machinery.
   *
   * `declared` exists because a target's own sentence states counted
   * figures — how many entered the step, what share got through — and
   * the digit walk reads the block's own declarations, not the
   * report's. Without it the target blocks would be pruned, by exactly
   * the rule that is there to catch invented numbers.
   */
  | {
      kind: "setup";
      title: string;
      description: string;
      target: Counted | null;
      declared?: Counted[];
      isTarget?: boolean;
    };

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

/**
 * A provider's message with its numbers taken out.
 *
 * Only used on the AI-failure alert, which must survive the number
 * check under every circumstance — see where it is called.
 */
export function stripDigits(text: string): string {
  return String(text ?? "").replace(NUMBER_IN_TEXT, "").replace(/\s{2,}/g, " ").trim();
}

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

/**
 * The report with any block that fails the number check taken out.
 *
 * WHY THIS EXISTS, 3 November 2026. The precondition was all or
 * nothing: a report carrying one untraceable figure was NOT SENT. On
 * the first morning suggestions were renderable, one of them said "5
 * pages have no search title" against an audit that had declared only
 * the complement — and the owner got SILENCE. The number was wrong in
 * the safe direction and the SILENCE was not: he had no email, no
 * reason, and the explanation was a line in a Vercel log he has never
 * read.
 *
 * Nine days of a dead product taught the same lesson in October. A
 * guard whose failure mode is "say nothing" hands the owner the one
 * outcome he cannot act on.
 *
 * SO THE RULE IS NARROWED, NOT WEAKENED. A figure nobody counted still
 * never reaches him. It is now the BLOCK that is refused rather than
 * the email, and the email says how many were left out — which is
 * itself a counted number.
 */
export type PrunedReport = {
  report: DailyReport;
  /** What was taken out, and the figure that took it out. */
  removed: { block: string; found: string }[];
};

export function withoutUncountedBlocks(
  report: DailyReport,
  opts: {
    /**
     * How to write the subject for what is LEFT — S5/P5.
     *
     * The default is the daily report's own `subjectFor`, which counts
     * suggestions and setup steps. The monthly review's subject counts
     * results, and without this hook pruning one of its blocks would
     * have rewritten its subject as "your daily check, nothing to
     * flag". The rule the recompute exists for — the subject describes
     * what is in the email, after pruning — is the same either way,
     * which is why this is a hook and not a bypass.
     */
    resubject?: (kept: ReportBlock[]) => string;
  } = {}
): PrunedReport {
  const removed: { block: string; found: string }[] = [];
  const kept: ReportBlock[] = [];

  for (const block of report.blocks) {
    const offender = firstUncountedIn(block);
    if (offender) removed.push({ block: block.kind, found: offender });
    else kept.push(block);
  }

  if (!removed.length) return { report, removed };

  // THE LINE THAT EXPLAINS THE PRUNING IS ITSELF CHECKED. It is added
  // after the walk, so without this it would be the one block in the
  // email that bypassed the rule — and it states a number. A mutation
  // that stripped its declaration survived the first run precisely
  // because nothing looked at it.
  const n = removed.length;
  const explanation: ReportBlock = {
    kind: "line",
    text: `I left ${n} ${n === 1 ? "thing" : "things"} out of this email, because ${n === 1 ? "a figure in it" : "a figure in each"} did not trace back to anything I counted. Everything else here is sound.`,
    numbers: [{ label: "things left out of this email", value: n, source: "the report's own number check" }],
  };
  kept.push(
    firstUncountedIn(explanation)
      ? // Cannot happen with the line above, and if it ever does the
        // owner is told WITHOUT a figure rather than with a bad one.
        { kind: "line", text: "I left something out of this email, because a figure in it did not trace back to anything I counted. Everything else here is sound.", numbers: [] }
      : explanation
  );

  const pruned: DailyReport = { ...report, blocks: kept };
  // THE SUBJECT IS RECOMPUTED, because it counts what is in the email
  // and the email just changed. A subject promising two suggestions
  // over one is the same fault in a smaller place.
  const subject = opts.resubject
    ? opts.resubject(kept)
    : subjectFor(businessNameFrom(report.subject), kept, findingCountFrom(kept));
  return { report: { ...pruned, subject }, removed };
}

/** The first figure in this block that nothing declared, or null. */
function firstUncountedIn(block: ReportBlock): string | null {
  const declared = new Set<string>();
  for (const n of declaredNumbers(block)) for (const r of renderingsOf(n.value)) declared.add(r);
  for (const match of textOf(block).match(NUMBER_IN_TEXT) ?? []) {
    const cleaned = match.replace(/[.,]+$/, "");
    if (!declared.has(cleaned) && !declared.has(match)) return cleaned;
  }
  return null;
}

/**
 * The business's name back out of the subject it was put into.
 *
 * NOT A SECOND SOURCE OF TRUTH: the subject was built as
 * `${businessName} — ...` moments ago, so this reads back what was
 * written rather than looking the name up again. Passing the name
 * through would mean threading it into a function whose only job is to
 * prune.
 */
function businessNameFrom(subject: string): string {
  const at = subject.indexOf(" — ");
  return at === -1 ? subject : subject.slice(0, at);
}

/** What the kept blocks still say was found, for the subject's wording. */
function findingCountFrom(blocks: ReportBlock[]): number {
  const line = blocks.find((b) => b.kind === "line" && /^I found \d/.test(b.text));
  if (!line || line.kind !== "line") return 0;
  const first = line.numbers.find((n) => n.label === "findings the audit made");
  return first?.value ?? 0;
}

function declaredNumbers(block: ReportBlock): Counted[] {
  if (block.kind === "stat") return [block.number];
  if (block.kind === "setup") return [...(block.declared ?? []), ...(block.target ? [block.target] : [])];
  return block.numbers;
}

function textOf(block: ReportBlock): string {
  switch (block.kind) {
    case "alert":
      return block.text;
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
  /**
   * Every number the report may legitimately print, which is a SUPERSET
   * of what it shows as lines.
   *
   * 3 November 2026: the digit walk dropped an entire email over the
   * "5" in "5 pages have no search title". The audit had counted those
   * five pages and declared only the complement, so the number the
   * finding talks about was the one nobody declared. Defaults to
   * `counted`, so a caller that has nothing extra behaves exactly as
   * before.
   */
  declared?: Counted[];
  /** Today's picks, already capped and gated by the Strategist. */
  suggestions: { row: StrategistRow; goalTitle: string }[];
  /** Setup steps, shown whenever there is no plan to score against. */
  setupGoals: DraftGoal[];
  /** Active goals on record. Zero means there is no plan yet. */
  activeGoals: number;
  /**
   * Targets drawn from this business's own funnel, waiting for approval
   * — S5/P4.
   *
   * SHOWN WHENEVER THERE ARE ANY, SINCE 6 NOVEMBER 2026. They used to
   * sit inside the same `hasNoPlan` branch as setup steps, and that was
   * the bug the owner found on 5 November: two targets were drafted for
   * candle_by_qaaf at 14:37 UTC, written to `goals` as drafts, and the
   * email said nothing about either one. A target is about the narrowest
   * step in a funnel that is already running — which is to say about a
   * business that HAS a plan — so gating it on having no plan hid it
   * from every business it was built for.
   *
   * Setup steps keep that gate. "Getting started" is genuinely a thing
   * to say only while there is nothing to score against.
   */
  targetGoals?: DraftGoal[];
  /** The counted figures those targets' own sentences print. */
  targetNumbers?: Counted[];
  /**
   * Why there is no target this morning, in the words of whoever
   * decided — 5 November 2026.
   *
   * THE OTHER HALF OF THE SAME SILENCE. `targetGoalsFrom` has always
   * returned a sentence for the empty case, and `runDailyGrowth` has
   * always put it in its result — where the call site dropped it. So an
   * owner whose funnel was too thin, or whose step was offered three
   * weeks ago, read an email that did not mention targets at all and
   * could not tell that from a product that had forgotten about them.
   *
   * Only set once there is enough history to set targets: while the
   * business is still learning, the plan line already says so.
   */
  noTargetsBecause?: string | null;
  /** The figures that sentence prints — targets.ts's `whyCounted`. */
  noTargetsNumbers?: Counted[];
  /**
   * What the AI could not do during this run, if anything.
   *
   * Reported above everything else: an owner reading "2 setup steps"
   * while the product's AI is dead is being told the wrong thing first.
   */
  aiFailure?: { label: string; message: string } | null;
  /** True when M9 was armed but its deep check could not complete. */
  copyAuditUnverified?: boolean;
  /**
   * How many lines of page copy the audit actually looked at.
   *
   * Decides what the copy-audit alert may claim: with lines seen, the
   * FREE layer ran and its findings are below, so the alert may only
   * say the deeper check did not finish.
   */
  copyLinesSeen?: number;
  /**
   * How many findings the audit made.
   *
   * CARRIED SO THE REPORT CANNOT SAY "NOTHING TO FLAG" WHILE FINDINGS
   * EXIST. The first dry run did exactly that: two real findings, none
   * renderable, and a subject line telling the owner there was nothing
   * to look at.
   */
  findingCount: number;
  /**
   * Setup goals sitting on the Tasks page, waiting to be confirmed.
   *
   * WHY IT IS CARRIED, 1 November 2026. The block below used to end
   * with "Approve a plan and they will appear here", which named a
   * mechanism that did not exist: nothing wrote a drafted setup step
   * into `goals`, so there was never anything to approve. The sentence
   * shipped in every report from 24 October. A report may now only say
   * there is something to approve when a number says there is.
   */
  pendingSetupDrafts?: number;
}): DailyReport {
  const byLabel = new Map(input.counted.map((c) => [c.label, c]));
  // WHAT MAY BE PRINTED, as against what is shown. See `declared`.
  const declared = input.declared ?? input.counted;
  const blocks: ReportBlock[] = [];

  // FIRST, ALWAYS. Nothing below it matters as much.
  if (input.aiFailure) {
    blocks.push({
      kind: "alert",
      // THE MESSAGE'S DIGITS ARE STRIPPED, and that is not tidiness.
      // Since 3 November a block that fails the number check is dropped
      // rather than taking the email down with it — and this is the one
      // block that must never be dropped. The message comes from a
      // provider's error text ("try again in 42 seconds"), so it can
      // carry digits nothing counted. "The AI is not working" does not
      // depend on a number.
      text: `${input.aiFailure.label} — ${stripDigits(input.aiFailure.message)} Everything below was worked out without it, from your own records.`,
      numbers: [],
      headline: input.aiFailure.label,
      ownsSubject: true,
    });
  } else if (input.copyAuditUnverified) {
    // IT SAYS WHICH CHECK DID NOT FINISH, NOT THAT NOTHING WAS CHECKED.
    //
    // 3 November 2026: this alert said "nothing below says anything
    // about it" while the email carried a suggestion reading "9 lines
    // use wording your records do not support", with five evidence
    // ids. The copy audit has TWO layers — a free one for placeholders
    // and unsupported wording, and a paid one for the claims a line
    // makes — and `freeLayerOnly` means only the SECOND did not
    // finish. The alert was describing the whole audit as having
    // failed, and contradicted the body of its own email.
    const looked = Math.max(0, Math.floor(input.copyLinesSeen ?? 0));
    blocks.push({
      kind: "alert",
      text: looked
        ? "I checked your page copy for placeholders and for wording your records do not support, but could not finish the deeper check of the claims those lines make. Nothing below is about those claims."
        : "I could not finish checking your page copy against your records this time, so nothing below says anything about it.",
      numbers: [],
      // A footnote, not the headline: see ownsSubject.
      ownsSubject: false,
    });
  }

  // §2c: the measurement health line is in EVERY report.
  const healthText = measurementHealthLine(input.tracking);
  blocks.push({
    kind: "health",
    text: healthText,
    numbers: input.counted.filter((c) => healthNumbers(input.tracking).includes(c.value)).concat(healthCounted(input.tracking)),
  });

  blocks.push({
    kind: "line",
    text: planLine(input.maturity, input.activeGoals, (input.targetGoals ?? []).length),
    numbers: maturityCounted(input.maturity),
  });

  // AND WHY THERE IS NO TARGET, WHEN THERE IS NONE. See
  // `noTargetsBecause`: the sentence existed, and nobody showed it.
  //
  // NOT WHEN THERE ARE TARGETS. targetGoalsFrom returns a reason or
  // goals, never both, so this is belt and braces — but a report that
  // printed "no new target today" above two targets would be the 23
  // October fault again, in a smaller place.
  const noTargets = String(input.noTargetsBecause ?? "").trim();
  if (noTargets && !(input.targetGoals ?? []).length) {
    blocks.push({
      kind: "line",
      text: `No new target for you to approve today. ${noTargets}`,
      numbers: input.noTargetsNumbers ?? [],
    });
  }

  for (const c of input.counted) blocks.push({ kind: "stat", number: c });

  // SHOWN WHENEVER THERE IS NO PLAN, not only when the data is thin.
  // See hasNoPlan: the dry run of 23 October found a business past the
  // thin threshold with zero goals, where neither setup steps nor
  // suggestions could render and the owner was told nothing was wrong.
  if (hasNoPlan(input.maturity, input.activeGoals)) {
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

  // TARGETS AFTER SETUP STEPS AND OUTSIDE THAT GATE — 5 November 2026.
  //
  // They were inside it until today, which meant a business with an
  // approved plan never saw one. See `targetGoals` in the input above
  // for what that cost on 5 November. The drafting itself was never
  // gated — writeSetupGoalDrafts writes both kinds — so the rows went
  // to the Tasks page and the email stayed quiet about them, which is
  // the worst of the three possible behaviours.
  //
  // A target goal carries NO target number — see targets.ts's header;
  // any number there would be a forecast — so `target` is null and the
  // figures in its sentence are declared instead.
  for (const goal of input.targetGoals ?? []) {
    blocks.push({
      kind: "setup",
      isTarget: true,
      title: goal.title,
      description: goal.description,
      target: null,
      declared: input.targetNumbers ?? [],
    });
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
      // THE REPORT'S WHOLE DECLARED SET, not a filter on the title's own
      // numbers. My first version filtered, which LOOKED stricter and
      // was behaviourally identical: the digit walk only asks whether a
      // number is declared, so a value present in `counted` passes
      // either way and a value absent fails either way. A mutation
      // check caught that the filter guarded nothing, and a narrower
      // expression that implies a guarantee it does not give is worse
      // than the plain one.
      numbers: declared,
    });
  }

  // NOTHING RENDERABLE AND SOMETHING FOUND: say so, in the body as
  // well as the subject. Silence here is the failure the dry run
  // caught, and a subject alone is not an explanation.
  const renderable = blocks.some((b) => b.kind === "suggestion" || b.kind === "setup");
  if (!renderable && input.findingCount > 0) {
    const n = input.findingCount;
    const waiting = Math.max(0, Math.floor(input.pendingSetupDrafts ?? 0));
    const numbers: Counted[] = [{ label: "findings the audit made", value: n, source: "growth audit" }];
    // ONLY A COUNTED NUMBER MAY SEND HIM SOMEWHERE. With nothing
    // waiting, the honest end of this sentence is that there is
    // nothing to approve — not a suggestion that he go and look.
    let where = "and there is nothing waiting on your Tasks page to approve yet.";
    if (waiting > 0) {
      numbers.push({
        label: "setup goals waiting for you",
        value: waiting,
        source: "goals (status = 'draft', drafted from the audit)",
      });
      where = `${waiting} setup ${waiting === 1 ? "step is" : "steps are"} waiting on your Tasks page — confirm the ${waiting === 1 ? "one" : "ones"} you want and these will appear here.`;
    }
    blocks.push({
      kind: "line",
      text: `I found ${n} ${n === 1 ? "thing" : "things"} worth doing and could not put ${n === 1 ? "it" : "them"} in front of you, because nothing on record says which goal ${n === 1 ? "it serves" : "they serve"}. ${where}`,
      numbers,
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
    subject: subjectFor(input.businessName, blocks, input.findingCount),
    blocks,
    counted: input.counted,
  };
}

/** Says what the email contains, and nothing it does not. */
function subjectFor(businessName: string, blocks: ReportBlock[], findingCount: number): string {
  // AN ALERT OWNS THE SUBJECT LINE ONLY IF IT SAYS SO. "2 setup steps"
  // over a dead AI tells the owner the wrong thing first, which is
  // exactly what nine days of reports did — so the AI-failure alert
  // takes the subject.
  //
  // A HALF-FINISHED COPY CHECK DOES NOT. On 3 November it did, and the
  // subject became the whole of that sentence while three usable
  // suggestions went unmentioned.
  const alert = blocks.find((b) => b.kind === "alert" && b.ownsSubject);
  if (alert && alert.kind === "alert") {
    const headline = (alert.headline ?? alert.text.split(" — ")[0]).trim();
    return `${businessName} — ${headline}`;
  }
  const suggestions = blocks.filter((b) => b.kind === "suggestion").length;
  // SETUP AND TARGETS ARE COUNTED APART, though they share a block
  // kind. "3 setup steps to get started" over three targets would be
  // wrong about a business that is past getting started — and the
  // subject is the one line he reads before deciding to open it.
  const setupBlocks = blocks.filter((b) => b.kind === "setup");
  const targets = setupBlocks.filter((b) => b.kind === "setup" && b.isTarget).length;
  const setup = setupBlocks.length - targets;
  // BOTH, WHEN THERE ARE BOTH — 5 November 2026. Once targets stopped
  // being gated on having no plan, the ordinary morning for a running
  // business is suggestions AND targets, and suggestions won the
  // subject outright. A suggestion is something to read; a target is a
  // decision waiting on him. The one that needs him must not be the one
  // that goes unmentioned on the only line he reads before opening it.
  const suggestionWords = `${suggestions} ${suggestions === 1 ? "suggestion" : "suggestions"}`;
  const targetWords = `${targets} ${targets === 1 ? "target" : "targets"} to approve`;
  if (suggestions && targets) return `${businessName} — ${suggestionWords} and ${targetWords}`;
  if (suggestions) return `${businessName} — ${suggestionWords} for today`;
  if (targets) return `${businessName} — ${targetWords}`;
  if (setup) return `${businessName} — ${setup} setup ${setup === 1 ? "step" : "steps"} to get started`;
  // "NOTHING TO FLAG" REQUIRES THAT NOTHING WAS FOUND. The first dry
  // run said it over two findings that had nowhere to go.
  if (findingCount > 0) {
    return `${businessName} — ${findingCount} ${findingCount === 1 ? "thing" : "things"} I could not put in front of you`;
  }
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
      case "alert":
        lines.push(block.text, "");
        break;
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
          `${block.isTarget ? "TARGET" : "SETUP STEP"} — ${block.title}`,
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
