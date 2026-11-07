// The technical audit against a business's real pages, and what it tells
// the rest of Hawlai (Brain, Phase 1c).
//
// Reads stored rows and runs pure code — no AI call, no web request — so
// it can run every day for every business. That is why it sits in the
// daily "signals" group, which is the database-only one.

import { auditSite, pageText, type SiteAudit, type Finding } from "./technicalAudit";
import { recordSignal, fingerprintOf } from "@/lib/signals/signals";
import { localFindings, localSummary } from "./localPresence";
import { readListingFacts } from "./listingFacts";

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
    .select("slug, title, meta_description, page_type, sections, og_image_url, updated_at")
    .eq("website_id", website.id);

  const audit = auditSite({ published: Boolean(website.published), pages: pages ?? [] });
  await recordAuditSignals(supabase, dealershipId, audit);
  // G5 — the local half, in the same subsystem on purpose. It reads rows
  // and runs pure code exactly as the technical half does, so it needs
  // no cron entry of its own (there is no third one to give it) and no
  // new screen.
  await recordLocalPresence(supabase, dealershipId, pages ?? []);
  return audit;
}

/**
 * The local-presence half of the daily audit (G5 / local plan L2).
 *
 * BEHIND THE SAME "has a Hawlai site" GATE as the technical half, and
 * that is a real limit worth stating: a business that has not built a
 * site here gets no local findings, even though its hours would still be
 * missing. Hawlai cannot publish a fact for a site it does not have, and
 * a finding nobody can act on is noise.
 *
 * ONE SIGNAL, SEPARATE FROM SITE HEALTH. Merging them would dilute a
 * standing statement that already has its own meaning, and the local one
 * is read by a different part of the daily email.
 */
export async function recordLocalPresence(
  supabase: any,
  dealershipId: string,
  pages: { slug?: string | null; page_type?: string | null; sections?: unknown }[]
): Promise<{ findings: Finding[]; skipped?: string }> {
  const [{ data: dealership, error: dealershipError }, { data: factsRow }] = await Promise.all([
    supabase.from("dealerships").select("city, business_address, google_place_id").eq("id", dealershipId).maybeSingle(),
    supabase
      .from("business_listing_facts")
      .select("public_phone, publish_phone, opening_hours, areas_served, street_address, publish_street_address, instagram_url, other_profile_urls")
      .eq("dealership_id", dealershipId)
      .maybeSingle(),
  ]);
  // A FAILED READ FINDS NOTHING. Reporting "no phone on record" because
  // the row could not be read would have the owner fixing something that
  // was never broken.
  if (dealershipError) return { findings: [], skipped: `could not read the business: ${dealershipError.message}` };

  const facts = readListingFacts(factsRow, { googlePlaceId: dealership?.google_place_id ?? null });

  // The page a stranger lands on, and every word a reader can see on it.
  // ONE READER for both halves of the audit since 7 Nov 2026: pageText
  // now includes the `heading` prop, which is where faq, faq_item and
  // product_grid keep their words — without it a page whose section
  // heading named the city was told it never mentions one.
  const landing = pages.find((p) => p?.slug === "home" || p?.page_type === "home") ?? pages[0];
  const landingText = landing ? pageText(landing.sections) : "";

  const findings = localFindings({
    facts,
    emailAddress: dealership?.business_address ?? null,
    addressOnRecord: factsRow?.street_address ?? null,
    addressPublished: factsRow?.publish_street_address === true,
    phoneOnRecord: factsRow?.public_phone ?? null,
    city: dealership?.city ?? null,
    landingText,
    placeId: dealership?.google_place_id ?? null,
  });

  await recordSignal(supabase, dealershipId, {
    source: "seo",
    topic: "local presence",
    summary: localSummary(findings),
    // All counted: these are the business's own rows compared with each
    // other and with its own pages. No model is involved.
    evidence: {
      findings: findings.length,
      high: findings.filter((f) => f.priority === "high").length,
      codes: findings.map((f) => f.code),
    },
    confidence: "counted",
    // One standing statement, rewritten each run.
    fingerprint: fingerprintOf(["seo", "local presence"]),
  });

  return { findings };
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
