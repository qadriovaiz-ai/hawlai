// The technical audit against a business's real pages, and what it tells
// the rest of Hawlai (Brain, Phase 1c).
//
// Reads stored rows and runs pure code — no AI call, no web request — so
// it can run every day for every business. That is why it sits in the
// daily "signals" group, which is the database-only one.

import { auditSite, type SiteAudit } from "./technicalAudit";
import { recordSignal, fingerprintOf } from "@/lib/signals/signals";

export type AuditRun = SiteAudit & { skipped?: string };

const EMPTY: AuditRun = { findings: [], pagesChecked: 0, stats: { pages: 0, withoutDescription: 0, withoutHeading: 0, brokenLinks: 0, imagesWithoutAlt: 0 } };

/** Audits the business's Hawlai-built site. Silent when it hasn't got one. */
export async function runTechnicalAudit(supabase: any, dealershipId: string): Promise<AuditRun> {
  const { data: website } = await supabase
    .from("websites")
    .select("id, published")
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  // No Hawlai-built site: there is nothing here to read, and guessing at
  // a site we cannot see is exactly what this file refuses to do.
  if (!website) return { ...EMPTY, skipped: "no Hawlai-built site" };

  const { data: pages } = await supabase
    .from("website_pages")
    .select("slug, title, meta_description, page_type, sections, og_image_url")
    .eq("website_id", website.id);

  const audit = auditSite({ published: Boolean(website.published), pages: pages ?? [] });
  await recordAuditSignals(supabase, dealershipId, audit);
  return audit;
}

/**
 * What the other departments are told (migration 198).
 *
 * All `counted`: these are facts about the business's own pages, read
 * from its own rows. Nothing here is a model's opinion, which is the
 * whole reason this check is worth running daily.
 */
export async function recordAuditSignals(supabase: any, dealershipId: string, audit: SiteAudit): Promise<void> {
  if (audit.pagesChecked === 0) return;

  const high = audit.findings.filter((f) => f.priority === "high");
  await recordSignal(supabase, dealershipId, {
    source: "seo",
    topic: "site health",
    summary: high.length
      ? `${high.length} thing${high.length === 1 ? "" : "s"} on the site need${high.length === 1 ? "s" : ""} fixing before search or AI answers can work: ${high.map((f) => f.problem.replace(/\.$/, "")).join("; ")}`
      : `The site's ${audit.pagesChecked} page${audit.pagesChecked === 1 ? "" : "s"} have no high-priority technical problems`,
    evidence: { ...audit.stats, highPriority: high.length, findings: audit.findings.length },
    confidence: "counted",
    // One standing statement of site health, rewritten each run.
    fingerprint: fingerprintOf(["seo", "site health"]),
  });

  // A broken button is the one finding worth its own line: it loses a
  // sale outright, not a ranking.
  const broken = audit.findings.find((f) => f.code === "broken_internal_link");
  if (broken) {
    await recordSignal(supabase, dealershipId, {
      source: "seo",
      topic: "broken links",
      summary: `Buttons on ${broken.where.length} page${broken.where.length === 1 ? "" : "s"} point at pages that don't exist`,
      evidence: { pages: broken.where, brokenLinks: audit.stats.brokenLinks },
      confidence: "counted",
      fingerprint: fingerprintOf(["seo", "broken links"]),
    });
  }
}
