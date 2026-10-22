// M9 — WHAT THE LIVE PAGES ALREADY CLAIM — S4/P1.
//
// The audit half that reads the copy a business is already publishing
// and asks whether its own records support it. READ ONLY: it never
// changes a word.
//
// R3 GOVERNS WHAT IT MAY DO WITH WHAT IT FINDS, and the founder settled
// it for S3: report once, offer, change nothing unasked. So this
// returns counts and examples. It does not edit, and the report's
// sentences carry the COUNT — "N lines on your site I could not
// support" — not the lines themselves, because a daily email that
// quotes a business owner's own website back at him as a list of
// falsehoods is a different product from the one we are building.
//
// THIS IS THE ONLY PART OF P1 THAT COSTS MONEY, so it is in two layers
// and the paid one is off by default:
//
//   free    placeholders left in the copy (notCopy), and the code-only
//           introduced-word checks — superlatives, rank phrases,
//           minimisers — measured against the business's own records.
//           No model, no cost, safe to run daily.
//   paid    the extractor, the second net and the judge, via
//           verifyEditedText. About Rs 0.5-1 a page. Onboarding and
//           on request, never on the daily clock, and capped.
//
// WHY IT REUSES verifyEditedText rather than calling the extractor
// itself: that function IS the fact-bound check for text nobody
// generated, built in S3/P4, and a second caller of the extractor would
// be a second description of the same pipeline. Its `refused` list is
// already "the line, and why the records do not support it", which is
// exactly what an audit wants.

import type { BusinessFacts } from "@/lib/claims/businessFacts";
import type { AuditFinding, Counted } from "@/lib/growth/audit";
import { introducedWords } from "@/lib/content/introducedWords";
import { notCopySentences } from "@/lib/content/notCopy";

/** One line of one page, as readPageContent reports it. */
export type CopyLine = { pageId: string; pageSlug: string; blockId: string; prop: string; text: string };

export type CopyAuditResult = {
  findings: AuditFinding[];
  counted: Counted[];
  /** What the paid layer cost, 0 when it did not run. */
  costInr: number;
  /** True when only the free layer ran, so the result is partial. */
  freeLayerOnly: boolean;
};

/**
 * How many lines the paid layer will look at in one run.
 *
 * A CAP RATHER THAN A BUDGET CHECK, because this runs unattended: there
 * is nobody there to approve a bigger spend, and a business with eighty
 * pages must not quietly become an expensive one. The count of lines it
 * did NOT examine is reported, so a partial audit never reads as a
 * complete one.
 */
export const PAID_LINE_CAP = 40;

/**
 * The words the business itself has on record, as the vocabulary the
 * code-only checks measure against.
 *
 * Built from the same records the fact-bound pipeline uses, so a term
 * the owner wrote down is never reported as an introduced one.
 */
function vocabularyFrom(facts: BusinessFacts | null | undefined): string[] {
  const f = (facts ?? {}) as any;
  const out: string[] = [f.businessName ?? "", f.category ?? "", f.businessCategory ?? ""];
  for (const p of f.products ?? []) out.push(String(p?.name ?? ""), String(p?.description ?? ""));
  for (const row of f.ownerFacts ?? []) out.push(String(row?.content ?? row?.text ?? ""));
  return out.filter(Boolean);
}

export async function auditLiveCopy(
  lines: CopyLine[],
  facts: BusinessFacts | null | undefined,
  opts: {
    /** Run the extractor and judge. Costs money. Off by default. */
    allowModel?: boolean;
    dealershipId: string;
    logContext?: { supabase: any; dealershipId: string } | null;
  }
): Promise<CopyAuditResult> {
  const texts = lines.map((l) => String(l.text ?? "").trim());
  if (!texts.some(Boolean)) {
    return { findings: [], counted: [{ label: "lines of page copy", value: 0, source: "website_pages.sections" }], costInr: 0, freeLayerOnly: true };
  }

  const findings: AuditFinding[] = [];

  // --- free layer -----------------------------------------------------
  const placeholders = notCopySentences(texts);
  if (placeholders.length) {
    findings.push({
      type: "live_copy_placeholder",
      reference: "singleton",
      title: `${placeholders.length} ${placeholders.length === 1 ? "line" : "lines"} on the site still contain a placeholder`,
      detail: "A bracketed slot or a note-to-self is being served to visitors as if it were copy.",
      score: { impact: 5, confidence: 5, effort: 1 },
      evidence: placeholders.slice(0, 5).map((p) => ({ kind: "page_line", id: lineRef(lines[p.sentenceIndex]) })),
    });
  }

  const introduced = introducedWords(texts, vocabularyFrom(facts));
  // Grouped by the LINE, not by the word: an owner wants to know how
  // many lines need attention, not how many adjectives were counted.
  const flaggedLines = [...new Set(introduced.map((f) => f.sentenceIndex))];
  if (flaggedLines.length) {
    findings.push({
      type: "live_copy_unsupported_wording",
      reference: "singleton",
      title: `${flaggedLines.length} ${flaggedLines.length === 1 ? "line" : "lines"} use wording your records do not support`,
      detail: "These are rankings, boosts or names that nothing on record accounts for. Nothing has been changed.",
      score: { impact: 4, confidence: 4, effort: 2 },
      evidence: flaggedLines.slice(0, 5).map((i) => ({ kind: "page_line", id: lineRef(lines[i]) })),
    });
  }

  const counted: Counted[] = [
    { label: "lines of page copy", value: texts.filter(Boolean).length, source: "website_pages.sections" },
    { label: "lines with a placeholder", value: placeholders.length, source: "notCopy" },
    { label: "lines using unsupported wording", value: flaggedLines.length, source: "introducedWords" },
  ];

  if (!opts.allowModel || !facts) {
    return { findings, counted, costInr: 0, freeLayerOnly: true };
  }

  // --- paid layer, capped ---------------------------------------------
  const examined = lines.slice(0, PAID_LINE_CAP);
  const { verifyEditedText } = await import("@/lib/content/verifyEditedText");
  const checked = await verifyEditedText({
    texts: examined.map((l) => l.text),
    facts,
    dealershipId: opts.dealershipId,
    topic: "home",
    logContext: opts.logContext ?? null,
  });

  // UNVERIFIED IS NOT CLEAN. If the extractor or the judge could not be
  // reached, the free layer's findings stand and the result still says
  // the deep check did not run — the same rule the door follows.
  if (checked.unverified) {
    return { findings, counted, costInr: checked.costInr, freeLayerOnly: true };
  }

  if (checked.refused.length) {
    findings.push({
      type: "live_copy_unsupported_claim",
      reference: "singleton",
      title: `${checked.refused.length} ${checked.refused.length === 1 ? "line" : "lines"} on your site make a claim your records cannot back`,
      detail:
        "Checked against your own records, not against anyone else's rules. Nothing has been changed — say the word and I will go through them with you.",
      score: { impact: 5, confidence: 4, effort: 3 },
      evidence: checked.refused.slice(0, 5).map((r) => {
        const at = examined.findIndex((l) => l.text.includes(r.text) || r.text.includes(l.text));
        return { kind: "page_line", id: at >= 0 ? lineRef(examined[at]) : "unmatched" };
      }),
    });
  }

  counted.push(
    { label: "lines checked against your records", value: examined.length, source: "verifyEditedText" },
    { label: "lines not checked this run", value: Math.max(0, lines.length - examined.length), source: "PAID_LINE_CAP" },
    { label: "lines making a claim your records cannot back", value: checked.refused.length, source: "verifyEditedText" }
  );

  return { findings, counted, costInr: checked.costInr, freeLayerOnly: false };
}

/** A pointer the owner can resolve: which page, which block, which field. */
function lineRef(line: CopyLine | undefined): string {
  if (!line) return "unknown";
  return `${line.pageSlug}:${line.blockId}:${line.prop}`;
}
