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
import { buildDailyReport, everyNumberIsCounted, renderText, type DailyReport } from "@/lib/growth/report";
import { linkFindingsToGoals, pickToday, recordFindings } from "@/lib/growth/strategist";
import { hasNoPlan, maturityOf, setupGoalsFrom } from "@/lib/growth/strategy";
import { checkTracking } from "@/lib/growth/tracking";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

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
  /** False when the report failed its own number check and was not sent. */
  reportSound: boolean;
  sent: boolean;
  /** Why nothing was sent, when nothing was. */
  notSentBecause: string | null;
  copyAuditCostInr: number;
  report: DailyReport | null;
};

export async function runDailyGrowth(
  supabase: any,
  dealershipId: string,
  opts: {
    now?: Date;
    /** Run M9's extractor and judge. Costs money. Never set by the cron. */
    allowCopyAudit?: boolean;
    /** Build and check, send nothing. */
    dryRun?: boolean;
  } = {}
): Promise<GrowthRunResult> {
  const now = opts.now ?? new Date();
  const day = indiaToday(now);
  const empty: GrowthRunResult = {
    day,
    findings: 0,
    suggestions: 0,
    setupSteps: 0,
    reportSound: false,
    sent: false,
    notSentBecause: null,
    copyAuditCostInr: 0,
    report: null,
  };

  // ---- Perceive -------------------------------------------------------
  const site = await auditSite(supabase, dealershipId);
  const catalogue = await auditCatalogue(supabase, dealershipId);
  const tracking = await checkTracking(supabase, dealershipId, now);

  const findings: AuditFinding[] = [...site.findings, ...catalogue.findings];
  const counted: Counted[] = [...site.counted, ...catalogue.counted];

  // ---- M9, only when asked -------------------------------------------
  //
  // A DATE, NOT A SWITCH, and that is the whole point of the design.
  //
  // The founder approved ONE paid pass at Rs 2-4. An on/off env var
  // left on by accident is Rs 60-120 a month of unattended spend with
  // nobody watching, and "remember to turn it off tomorrow" is not a
  // safeguard. So GROWTH_COPY_AUDIT_ON holds a single day in the daily
  // job's own terms (indiaToday), the pass runs only on that day, and
  // it expires by itself at midnight whether anyone remembers or not.
  //
  // The explicit option still wins, for a caller that knows exactly
  // what it is spending — a test, or a one-off run somebody is
  // watching.
  const onDate = String(process.env.GROWTH_COPY_AUDIT_ON ?? "").trim();
  const allowCopyAudit = opts.allowCopyAudit ?? (onDate !== "" && onDate === day);
  let copyAuditCostInr = 0;
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
      counted.push(...copy.counted);
      copyAuditCostInr = copy.costInr;
    }
  }

  // ---- Diagnose and Plan ---------------------------------------------
  await recordFindings(supabase, dealershipId, findings);

  const setupGoals = setupGoalsFrom(findings, counted);
  await linkFindingsToGoals(supabase, dealershipId, new Map(setupGoals.map((g) => [g.key, g.title])));

  const maturity = maturityOf(
    { firstAt: tracking.siteEvents.firstAt, events: tracking.siteEvents.visitorEvents30d },
    now
  );
  const picks = await pickToday(supabase, dealershipId, tracking, now);
  const activeGoals = await countActiveGoals(supabase, dealershipId);

  const goalTitleById = await goalTitles(supabase, dealershipId);
  const suggestions = picks.picked
    .map((row) => ({ row, goalTitle: row.goal_id ? goalTitleById.get(row.goal_id) ?? "" : "" }))
    .filter((s) => s.goalTitle);

  // ---- Report ---------------------------------------------------------
  const business = await businessName(supabase, dealershipId);
  const report = buildDailyReport({
    dealershipId,
    day,
    businessName: business,
    tracking,
    maturity,
    counted,
    suggestions,
    setupGoals: hasNoPlan(maturity, activeGoals) ? setupGoals : [],
    activeGoals,
    findingCount: findings.length,
  });

  const check = everyNumberIsCounted(report);
  const result: GrowthRunResult = {
    ...empty,
    findings: findings.length,
    suggestions: report.blocks.filter((b) => b.kind === "suggestion").length,
    setupSteps: report.blocks.filter((b) => b.kind === "setup").length,
    reportSound: check.ok,
    copyAuditCostInr,
    report,
  };

  // THE PRECONDITION. A report carrying a number nobody counted does
  // not go out, and the offenders are logged so the cause is findable.
  if (!check.ok) {
    console.error(
      `[growth] report for ${dealershipId} on ${day} had numbers nobody counted, so it was NOT sent: ${JSON.stringify(check.offenders)}`
    );
    return { ...result, notSentBecause: "the report failed its own number check" };
  }

  if (opts.dryRun) return { ...result, notSentBecause: "dry run" };

  // ---- Send ------------------------------------------------------------
  const { ownerEmail, sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
  const { data: dealership } = await supabase.from("dealerships").select("owner_id").eq("id", dealershipId).maybeSingle();
  const to = await ownerEmail(dealership?.owner_id ?? null);
  if (!to) return { ...result, notSentBecause: "no owner email on record" };

  const sent = await sendDealerEmail(supabase, dealershipId, to, report.subject, renderText(report), {
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
