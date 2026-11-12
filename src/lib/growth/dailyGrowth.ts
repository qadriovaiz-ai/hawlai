// THE GROWTH MANAGER'S LOOP BODY — S4/P5.
//
// Perceive -> Diagnose -> Plan -> Report, in one in-process function.
//
// IN-PROCESS, AND THAT IS A HARD CONSTRAINT RATHER THAN A PREFERENCE.
// CLAUDE.md: "A route that `fetch`es its own app gets a Vercel 508
// after roughly four hops. Extract the logic and call it; do not call
// the URL." /api/autopilot/daily-run is the route that produced that
// 508. Nothing here calls a URL of this app.
//
// THE REPORT IS NOT SENT IF IT FAILS ITS OWN CHECK. everyNumberIsCounted
// runs before the send, and a report with a number nobody counted is
// dropped with a log rather than delivered. That is the whole of S4's
// exit test turned into a precondition: the failing case is an owner
// acting on a figure that came from nowhere, and there is no outcome
// loop until S5 to catch it afterwards.
//
// M9's MODEL PASS IS OFF UNLESS ASKED FOR, and never on the clock. It
// is the only part of this loop that costs money, and an unattended
// run has nobody there to approve a bigger spend.

import { auditCatalogue, auditSite, type AuditFinding, type Counted } from "@/lib/growth/audit";
import { auditLiveCopy, type CopyLine } from "@/lib/growth/copyAudit";
import { buildDailyReport, everyNumberIsCounted, renderText, withoutUncountedBlocks, type DailyReport } from "@/lib/growth/report";
import { linkFindingsToGoals, pickToday, recordFindings } from "@/lib/growth/strategist";
import { existingTargetOffers, writeSetupGoalDrafts } from "@/lib/growth/goalDrafts";
import { hasNoPlan, maturityOf, setupGoalsFrom } from "@/lib/growth/strategy";
import { recordBlocksLeftOut, type LeftOutBlock } from "@/lib/growth/leftOut";
import { checkTracking } from "@/lib/growth/tracking";
import { askForMissingFact } from "@/lib/onboarding/factGaps";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import { aiFailureLabel } from "@/lib/ai/claude";

/**
 * The pages M9's model pass looks at, in order, when it is allowed to
 * run at all.
 *
 * TWO, AND THE FOUNDER CHOSE THEM. 96 text lines across six pages would
 * cost Rs 6-12; these two are what a customer actually reads and they
 * fit the Rs 2-4 he approved. Legal pages are excluded deliberately:
 * their wording is not marketing copy and the check has little to say
 * about it.
 */
const COPY_AUDIT_PAGES = ["home", "about"];

export type GrowthRunResult = {
  day: string;
  findings: number;
  suggestions: number;
  setupSteps: number;
  /** False when the report failed its own number check. */
  reportSound: boolean;
  /**
   * Blocks taken out because a figure in them traced to nothing.
   *
   * The email still goes, and says how many were left out — see
   * withoutUncountedBlocks. Before 3 November the whole email was
   * dropped instead, and the owner was told nothing at all.
   */
  blocksLeftOut: number;
  /**
   * Which blocks, and the figure that took each one out.
   *
   * CARRIED OUT OF HERE, not only counted. `blocksLeftOut` told a
   * caller that something was missing and gave it no way to say what,
   * which is the owner's position when he reads "I left 1 thing out".
   */
  leftOut: LeftOutBlock[];
  sent: boolean;
  /** Why nothing was sent, when nothing was. */
  notSentBecause: string | null;
  copyAuditCostInr: number;
  /** Setup steps put in front of the owner for the first time by this run. */
  goalsDrafted: number;
  /** Setup goals waiting on the Tasks page for the owner to confirm. */
  goalDraftsPending: number;
  /** Target goals the ready branch offered this run. */
  targetsDrafted: number;
  /** Why there were none, when there were none. */
  noTargetsBecause: string | null;
  report: DailyReport | null;
};


/**
 * What the growth agent found and planned, before anything is written
 * for the owner to read.
 *
 * WHY THIS TYPE EXISTS — R1, 12 November 2026. `runDailyGrowth` did
 * four things in one function: perceive, diagnose, plan, and send an
 * email. The founder's decision is that the agent keeps running in the
 * background while the report becomes something he asks for — and that
 * cannot be done by deleting the send, because THE PLANNING WRITES TO
 * THE DATABASE. `recordFindings`, `writeSetupGoalDrafts`,
 * `linkFindingsToGoals` and I6's `askForMissingFact` all happen in the
 * middle of that function, so "no email" would have meant "no findings,
 * no goal drafts, no interview question" too.
 *
 * So the work is its own function now, and the report is built FROM
 * this rather than alongside it. R1 is deliberately a pure
 * restructuring: the same calls in the same order, the same report, the
 * same send. What changes is that they can now be asked for separately.
 */
export type GrowthWork = {
  day: string;
  now: Date;
  tracking: Awaited<ReturnType<typeof checkTracking>>;
  maturity: ReturnType<typeof maturityOf>;
  findings: AuditFinding[];
  counted: Counted[];
  alsoCounted: Counted[];
  setupGoals: ReturnType<typeof setupGoalsFrom>;
  targetGoals: ReturnType<typeof setupGoalsFrom>;
  targetNumbers: Counted[];
  noTargetsBecause: string | null;
  noTargetsNumbers: Counted[];
  askForFact: { text: string; counted: Counted[] } | null;
  drafts: { drafted: number; pending: number };
  picks: Awaited<ReturnType<typeof pickToday>>;
  activeGoals: number;
  suggestions: { row: any; goalTitle: string }[];
  copyAuditCostInr: number;
  copyAuditUnverified: boolean;
  copyLinesSeen: number;
};

/**
 * Perceive, diagnose and plan. Writes findings, goal drafts and the
 * interview ask. Builds nothing and sends nothing.
 *
 * THIS IS THE PART THAT RUNS DAILY, whatever the owner does about
 * reports.
 */
export async function runGrowthWork(
  supabase: any,
  dealershipId: string,
  opts: {
    now?: Date;
    /** Run M9's extractor and judge. Costs money. Never set by the cron. */
    allowCopyAudit?: boolean;
    /** Build and check, send nothing. */
    dryRun?: boolean;
    /**
     * What the AI could not do earlier in this run.
     *
     * PASSED IN RATHER THAN DETECTED HERE. runDailyAutopilot already
     * knows — draftStuckLeadFollowUps records it — and the growth run
     * is the only part of the loop that reaches the owner, so the fact
     * has to travel the short distance between them. For nine days in
     * October it did not, and the report arrived every morning saying
     * nothing about a product whose AI was dead.
     */
    aiFailure?: { kind: string; message: string } | null;
  } = {}
): Promise<GrowthWork> {
  const now = opts.now ?? new Date();
  const day = indiaToday(now);

  // ---- Perceive -------------------------------------------------------
  const site = await auditSite(supabase, dealershipId);
  const catalogue = await auditCatalogue(supabase, dealershipId);
  const tracking = await checkTracking(supabase, dealershipId, now);

  const findings: AuditFinding[] = [...site.findings, ...catalogue.findings];
  const counted: Counted[] = [...site.counted, ...catalogue.counted];
  // Counted and traceable, but not shown as lines of their own — the
  // numbers the findings themselves state. See AuditResult.alsoCounted.
  const alsoCounted: Counted[] = [...(site.alsoCounted ?? []), ...(catalogue.alsoCounted ?? [])];

  // ---- M9, only when asked -------------------------------------------
  //
  // A DATE AND ONE BUSINESS. Both, or the pass does not run.
  //
  // THE DATE, because the founder approved ONE paid pass at Rs 2-4 and
  // an on/off env var left on by accident is Rs 60-120 a month of
  // unattended spend with nobody watching. "Remember to turn it off
  // tomorrow" is not a safeguard, so GROWTH_COPY_AUDIT_ON names a
  // single day in the daily job's own terms and expires by itself at
  // midnight whether anyone remembers or not.
  //
  // AND THE BUSINESS, which the first version got wrong. dailyJobs.ts
  // creates one job PER DEALERSHIP per subsystem, so a bare date armed
  // the paid pass for EVERY business on that day — Rs 2-4 times
  // however many exist, against an approval for one. Found by reading
  // the dispatcher the evening before the run, not by it happening.
  //
  // A bare date therefore arms NOTHING and says so. The safe direction
  // is a lost day, not an unbudgeted spend, and the owner has to be
  // told rather than left to discover it on an invoice.
  //
  //   GROWTH_COPY_AUDIT_ON=2026-10-24:ba79191a-...   one business, one day
  //   GROWTH_COPY_AUDIT_ON=2026-10-24                arms nothing
  //
  // The explicit option still wins, for a caller that knows exactly
  // what it is spending — a test, or a run somebody is watching.
  const armed = String(process.env.GROWTH_COPY_AUDIT_ON ?? "").trim();
  const [onDate, onBusiness] = armed.includes(":") ? armed.split(":", 2) : [armed, ""];
  const armedForThis = onDate.trim() === day && onBusiness.trim() === dealershipId;
  if (armed !== "" && onDate.trim() === day && onBusiness.trim() === "") {
    console.error(
      `[growth] GROWTH_COPY_AUDIT_ON is set to a bare date, which would arm the paid copy audit for EVERY business. Nothing was run. Use "${day}:<dealership_id>".`
    );
  }
  const allowCopyAudit = opts.allowCopyAudit ?? armedForThis;
  let copyAuditCostInr = 0;
  let copyAuditUnverified = false;
  let copyLinesSeen = 0;
  if (allowCopyAudit) {
    const { gatherBusinessFacts } = await import("@/lib/claims/businessFacts");
    const facts = await gatherBusinessFacts(supabase, dealershipId);
    const lines = await copyLinesFor(supabase, dealershipId);
    if (lines.length) {
      const copy = await auditLiveCopy(lines, facts, {
        allowModel: true,
        dealershipId,
        logContext: { supabase, dealershipId },
      });
      findings.push(...copy.findings);
      // The copy audit declares its deficits directly, so everything it
      // counts is both shown and printable.
      counted.push(...copy.counted);
      copyAuditCostInr = copy.costInr;
      // What the FREE layer looked at, so the alert below can say which
      // check did not finish rather than implying none ran.
      copyLinesSeen = copy.counted.find((c) => c.label === "lines of page copy")?.value ?? 0;
      // ARMED AND INCOMPLETE IS WORTH SAYING. Silence here would read
      // as "your copy is fine", which is what nobody checked.
      copyAuditUnverified = copy.freeLayerOnly;
    }
  }

  // ---- Diagnose and Plan ---------------------------------------------
  await recordFindings(supabase, dealershipId, findings);

  const setupGoals = setupGoalsFrom(findings, counted);

  // THE READY BRANCH — S5/P4. `maturityOf` has returned "ready" past 14
  // days and 20 events since S4 built the thin branch, and nothing has
  // ever acted on it. A target goal names the narrowest step in this
  // business's own funnel and the rate it is running at; it carries NO
  // target number, because any number there would be a forecast
  // (targets.ts's header).
  //
  // READ-ONLY AND MODEL-FREE. loadDiagnosis counts rows; it costs
  // nothing and calls nothing.
  let targetGoals: typeof setupGoals = [];
  let targetNumbers: Counted[] = [];
  let noTargetsBecause: string | null = null;
  // THE REASON'S OWN FIGURES — 5 November 2026. The sentence goes in
  // the email now, so the digit walk reads it; see targets.ts's
  // `whyCounted`. The two sentences written here state no figure, which
  // is why both are declared as nothing.
  let noTargetsNumbers: Counted[] = [];
  // ONE QUESTION THE PRODUCT NEEDS ANSWERED (I6 — Tier 3).
  //
  // Raised here, before the report is assembled, because
  // askForMissingFact RECORDS the ask before handing back the sentence:
  // if the send then fails, one question is lost rather than the "once,
  // ever" promise. factGaps.ts states that trade the other way round
  // too, which is why it is worth repeating at the call site.
  //
  // It never throws into the run: a failed read asks nothing and says
  // why in the log, the same shape as every other optional block here.
  let askForFact: { text: string; counted: Counted[] } | null = null;
  try {
    const ask = await askForMissingFact(supabase, dealershipId);
    askForFact = ask.line;
  } catch (err: any) {
    console.error(`[growth] could not look for a missing fact to ask about: ${err?.message ?? err}`);
  }
  const maturityNow = maturityOf(
    { firstAt: tracking.siteEvents.firstAt, events: tracking.siteEvents.visitorEvents30d },
    now
  );
  if (maturityNow.kind === "ready") {
    try {
      const { loadDiagnosis } = await import("@/lib/strategy/diagnosis");
      const { targetGoalsFrom } = await import("@/lib/growth/targets");
      // WHAT HAS ALREADY BEEN OFFERED, AND WHEN. The same step comes
      // back after 30 days — the founder's answer of 4 November — so
      // "already offered" is a date here, not a yes or no.
      const offers = await existingTargetOffers(supabase, dealershipId);
      if (offers === null) {
        noTargetsBecause = "The goals already on record could not be read, so I could not tell which steps you have been offered before.";
      } else {
        const drafted = targetGoalsFrom(await loadDiagnosis(supabase, dealershipId, day), maturityNow, offers, day);
        targetGoals = drafted.goals;
        targetNumbers = drafted.declared;
        noTargetsBecause = drafted.why;
        noTargetsNumbers = drafted.whyCounted;
      }
    } catch (err: any) {
      // SAID, NOT SWALLOWED. A funnel that could not be read is not a
      // funnel with no weakest step, and the difference has cost this
      // project an email already.
      noTargetsBecause = "Your funnel could not be read this time, so there is nothing here about the narrowest step in it.";
      console.error(`[growth] could not draft targets for ${dealershipId}: ${err?.message}`);
    }
  }

  // PUT THEM WHERE THEY CAN BE APPROVED — S4/P6.
  //
  // A setup step existed only inside the email until now. A finding may
  // not be surfaced without a goal it serves (migration 210), the only
  // way to get an active goal is the owner confirming a draft on the
  // Tasks page, and nothing wrote a draft. So the chain had no first
  // link, and the report told the owner to "approve a plan" with
  // nothing to approve.
  //
  // DRAFTS ONLY, AND THEY DO NOT LINK TODAY. linkFindingsToGoals reads
  // active goals, so a step drafted this morning starts serving
  // findings the morning after the owner confirms it. That delay is the
  // owner's decision sitting in the middle, which is the point.
  // ONE WRITER FOR BOTH KINDS. A target goal is a draft goal with a
  // `target:` key, so it goes on the Tasks page by the same route and
  // is offered once by the same unique index.
  const drafts = await writeSetupGoalDrafts(supabase, dealershipId, [...setupGoals, ...targetGoals]);

  // NO MAP FROM TODAY'S FINDINGS. Linking reads the goals on record, so
  // a finding type that is not re-detected today — M9's copy findings,
  // which only run on a named day — still links to its approved goal.
  await linkFindingsToGoals(supabase, dealershipId);

  const maturity = maturityNow;
  const picks = await pickToday(supabase, dealershipId, tracking, now);
  const activeGoals = await countActiveGoals(supabase, dealershipId);

  const goalTitleById = await goalTitles(supabase, dealershipId);
  const suggestions = picks.picked
    .map((row) => ({ row, goalTitle: row.goal_id ? goalTitleById.get(row.goal_id) ?? "" : "" }))
    .filter((s) => s.goalTitle);


  return {
    day,
    now,
    tracking,
    maturity,
    findings,
    counted,
    alsoCounted,
    setupGoals,
    targetGoals,
    targetNumbers,
    noTargetsBecause,
    noTargetsNumbers,
    askForFact,
    drafts,
    picks,
    activeGoals,
    suggestions,
    copyAuditCostInr,
    copyAuditUnverified,
    copyLinesSeen,
  };
}

/**
 * Turn the work into the thing the owner reads, and record what had to
 * be left out of it.
 *
 * SENDS NOTHING. The digit walk, the left-out record and the un-marking
 * of findings that were not shown all live here, because every one of
 * them is a consequence of SHOWING something rather than of finding it.
 */
export async function buildGrowthReport(
  supabase: any,
  dealershipId: string,
  work: GrowthWork,
  opts: { aiFailure?: { kind: string; message: string } | null } = {}
): Promise<GrowthRunResult> {
  const {
    day, tracking, maturity, findings, counted, alsoCounted, setupGoals,
    targetGoals, targetNumbers, noTargetsBecause, noTargetsNumbers,
    askForFact, drafts, picks, activeGoals, suggestions,
    copyAuditCostInr, copyAuditUnverified, copyLinesSeen,
  } = work;
  const empty: GrowthRunResult = {
    day,
    findings: 0,
    suggestions: 0,
    setupSteps: 0,
    reportSound: false,
    blocksLeftOut: 0,
    leftOut: [],
    sent: false,
    notSentBecause: null,
    copyAuditCostInr: 0,
    goalsDrafted: 0,
    goalDraftsPending: 0,
    targetsDrafted: 0,
    noTargetsBecause: null,
    report: null,
  };

  // ---- Report ---------------------------------------------------------
  const business = await businessName(supabase, dealershipId);
  const report = buildDailyReport({
    dealershipId,
    day,
    businessName: business,
    tracking,
    maturity,
    counted,
    declared: [...counted, ...alsoCounted],
    suggestions,
    setupGoals: hasNoPlan(maturity, activeGoals) ? setupGoals : [],
    // NOT GATED ON hasNoPlan — 5 November 2026. The gate was here AND
    // in report.ts, and both had to come off: a business with an
    // approved plan had two targets drafted into `goals` on 5 November
    // and read an email that mentioned neither. See report.ts's
    // `targetGoals` input for the whole account.
    targetGoals,
    targetNumbers,
    noTargetsBecause,
    noTargetsNumbers,
    askForFact,
    activeGoals,
    findingCount: findings.length,
    pendingSetupDrafts: drafts.pending,
    aiFailure: opts.aiFailure
      ? { label: aiFailureLabel(opts.aiFailure.kind as any), message: opts.aiFailure.message }
      : null,
    copyAuditUnverified,
    copyLinesSeen,
  });

  const check = everyNumberIsCounted(report);

  // THE PRECONDITION, NARROWED ON 3 NOVEMBER 2026. It used to be all or
  // nothing: one untraceable figure and the email was NOT SENT. That
  // morning a suggestion said "5 pages have no search title" against an
  // audit that had declared only the complement, and the owner got
  // SILENCE — no email, no reason, and the explanation in a Vercel log
  // he has never read. The figure was refused in the safe direction;
  // the silence was not safe at all, and October's nine dead days
  // taught the same lesson.
  //
  // So a figure nobody counted still never reaches him, and it is the
  // BLOCK that is refused rather than the email.
  const { report: sendable, removed } = withoutUncountedBlocks(report);
  // WHICH BLOCK, AND OVER WHICH FIGURE, WHERE HE CAN FIND IT — 6
  // November 2026. The email has said "I left 1 thing out" since 3
  // November and the answer to "which thing" lived only in this log
  // line. See src/lib/growth/leftOut.ts.
  if (removed.length) {
    await recordBlocksLeftOut(supabase, { dealershipId, surface: "daily_report", day, removed });
  }

  const result: GrowthRunResult = {
    ...empty,
    leftOut: removed,
    targetsDrafted: targetGoals.length,
    noTargetsBecause,
    findings: findings.length,
    suggestions: sendable.blocks.filter((b) => b.kind === "suggestion").length,
    setupSteps: sendable.blocks.filter((b) => b.kind === "setup" && !b.isTarget).length,
    reportSound: check.ok,
    blocksLeftOut: removed.length,
    copyAuditCostInr,
    goalsDrafted: drafts.drafted,
    goalDraftsPending: drafts.pending,
    report: sendable,
  };

  // AND A FINDING THAT WAS NOT SHOWN IS NOT MARKED AS SHOWN. pickToday
  // writes last_surfaced_on BEFORE the report is built, so on 3
  // November both findings were recorded as surfaced on a day nothing
  // was surfaced — the record saying the owner had seen something he
  // never saw. Put back here, so tomorrow's cap and tomorrow's report
  // are working from what actually happened.
  if (removed.length) {
    const shown = new Set(sendable.blocks.filter((b) => b.kind === "suggestion").map((b: any) => b.title));
    const unshown = picks.picked.filter((row) => !shown.has(row.title)).map((row) => row.id);
    if (unshown.length) {
      const { error: unmarkError } = await supabase
        .from("opportunities")
        .update({ last_surfaced_on: null })
        .in("id", unshown);
      if (unmarkError) {
        console.error(`[growth] could not un-mark ${unshown.length} unshown findings for ${dealershipId}: ${unmarkError.message}`);
      }
    }
  }

  return result;
}

/**
 * The daily composition: do the work, build the report, send it.
 *
 * KEPT AS ONE CALL so `runDailyAutopilot` is unchanged by R1 and the
 * suite proves the split did not alter behaviour. R2 is what changes
 * who calls what.
 */
export async function runDailyGrowth(
  supabase: any,
  dealershipId: string,
  opts: {
    now?: Date;
    /** Run M9's extractor and judge. Costs money. Never set by the cron. */
    allowCopyAudit?: boolean;
    /** Build and check, send nothing. */
    dryRun?: boolean;
    /**
     * What the AI could not do earlier in this run.
     *
     * PASSED IN RATHER THAN DETECTED HERE. runDailyAutopilot already
     * knows — draftStuckLeadFollowUps records it — and the growth run
     * is the only part of the loop that reaches the owner, so the fact
     * has to travel the short distance between them. For nine days in
     * October it did not, and the report arrived every morning saying
     * nothing about a product whose AI was dead.
     */
    aiFailure?: { kind: string; message: string } | null;
  } = {}
): Promise<GrowthRunResult> {
  const work = await runGrowthWork(supabase, dealershipId, opts);
  const result = await buildGrowthReport(supabase, dealershipId, work, { aiFailure: opts.aiFailure ?? null });
  const sendable = result.report;
  const day = work.day;
  if (!sendable) return { ...result, notSentBecause: "there was no report to send" };

  if (opts.dryRun) return { ...result, notSentBecause: "dry run" };

  // ---- Send ------------------------------------------------------------
  const { ownerEmail, sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
  const { data: dealership } = await supabase.from("dealerships").select("owner_id").eq("id", dealershipId).maybeSingle();
  const to = await ownerEmail(dealership?.owner_id ?? null);
  if (!to) return { ...result, notSentBecause: "no owner email on record" };

  const sent = await sendDealerEmail(supabase, dealershipId, to, sendable.subject, renderText(sendable), {
    // ONE EMAIL PER BUSINESS PER DAY. The dispatcher really re-enters a
    // run whose invocation ran out of time (dailyJobs.ts), so a retry
    // must not be a second email.
    idempotencyKey: `growth-report-${dealershipId}-${day}`,
  });
  return { ...result, sent: Boolean((sent as any)?.ok ?? sent), notSentBecause: null };
}

/** The lines M9 looks at: the pages a customer actually reads. */
async function copyLinesFor(supabase: any, dealershipId: string): Promise<CopyLine[]> {
  const { data: site } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).maybeSingle();
  if (!site) return [];
  const { data: pages } = await supabase
    .from("website_pages")
    .select("id, slug, title, page_type, sections, content_source")
    .eq("website_id", site.id);
  if (!Array.isArray(pages)) return [];

  const { readPageContent } = await import("@/lib/pages/readPage");
  const out: CopyLine[] = [];
  for (const slug of COPY_AUDIT_PAGES) {
    const page = pages.find((p: any) => String(p.slug) === slug);
    if (!page) continue;
    const content = readPageContent(page as any);
    for (const line of content.lines) {
      // A catalogue-driven line's words belong to the product rows, not
      // to the page, so judging it here would report the catalogue's
      // own data as unsupported page copy.
      if (line.catalogueDriven) continue;
      if (!line.blockId || !String(line.text ?? "").trim()) continue;
      out.push({ pageId: content.pageId, pageSlug: content.slug, blockId: line.blockId, prop: line.prop, text: line.text });
    }
  }
  return out;
}

async function countActiveGoals(supabase: any, dealershipId: string): Promise<number> {
  const { data, error } = await supabase.from("goals").select("id").eq("dealership_id", dealershipId).eq("status", "active");
  // A FAILED READ MEANS NO PLAN, not a plan. The consequence of being
  // wrong the other way is a report saying "working to your plan" to a
  // business that has none, which is one of the three false sentences
  // the first dry run produced.
  if (error || !Array.isArray(data)) return 0;
  return data.length;
}

async function goalTitles(supabase: any, dealershipId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from("goals").select("id, title").eq("dealership_id", dealershipId).eq("status", "active");
  return new Map((Array.isArray(data) ? data : []).map((g: any) => [String(g.id), String(g.title)]));
}

async function businessName(supabase: any, dealershipId: string): Promise<string> {
  const { data } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).maybeSingle();
  return String(data?.dealership_name ?? "Your business");
}
