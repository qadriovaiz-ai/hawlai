// M1 SITE HEALTH AND M2 CATALOGUE FACTS — S4/P1.
//
// The onboarding audit's two cheap halves. READ ONLY and MODEL FREE:
// every number here comes from a count, every finding points at rows
// the owner can open, and nothing in this file writes anything or asks
// a model anything.
//
// WHY THAT IS A PROPERTY AND NOT A HABIT. The exit test is "a daily
// email with only counted numbers", and the surest way to pass it is
// that the audit has no way to produce a number any other way.
// tests/growthAudit.test.ts runs both halves against a Supabase double
// that FAILS THE TEST if insert, update, upsert or delete is called,
// and a fetch that fails the test if a model is called. The guarantee
// is checked, not declared.
//
// Findings carry their score inputs because the Strategist cannot rank
// what nobody assessed (findings.ts `scorable`), and their evidence
// because a suggestion the owner cannot check is not a suggestion.
// Effort is the honest part: a missing product description is a
// five-minute job, a site with no pages is not.

import type { Evidence, FindingScore } from "@/lib/growth/findings";

export type AuditFinding = {
  /** Stable machine key, so the same issue updates its own row. */
  type: string;
  reference: string;
  title: string;
  detail: string;
  score: FindingScore;
  evidence: Evidence[];
};

/** Numbers the report may print, each already counted. */
export type Counted = { label: string; value: number; source: string };

export type AuditResult = { findings: AuditFinding[]; counted: Counted[] };

const EMPTY: AuditResult = { findings: [], counted: [] };

/**
 * M1 — is there a site, is it published, and does each page have the
 * things a stranger needs to find it?
 *
 * No judgement about QUALITY. "This heading is weak" is an opinion and
 * belongs nowhere near a counted number; "this page has no search
 * title" is a fact with a row behind it.
 */
export async function auditSite(supabase: any, dealershipId: string): Promise<AuditResult> {
  const { data: site, error: siteError } = await supabase
    .from("websites")
    .select("id, slug, published")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  // A FAILED READ IS NOT A FINDING. Reporting "no website" because the
  // database hiccuped would put a false sentence in an owner's email,
  // which is the one thing S4's exit test exists to prevent.
  if (siteError) return EMPTY;

  if (!site) {
    return {
      findings: [
        {
          type: "site_missing",
          reference: "singleton",
          title: "There is no website yet",
          detail: "Nothing has been built, so there is no page for anyone to find.",
          score: { impact: 5, confidence: 5, effort: 3 },
          evidence: [{ kind: "absent", id: "websites" }],
        },
      ],
      counted: [{ label: "pages", value: 0, source: "website_pages" }],
    };
  }

  const { data: pages, error: pagesError } = await supabase
    .from("website_pages")
    .select("id, slug, title, seo_title, meta_description, is_fallback")
    .eq("website_id", site.id);
  if (pagesError) return EMPTY;

  const rows = (pages ?? []) as any[];
  const findings: AuditFinding[] = [];

  if (!site.published) {
    findings.push({
      type: "site_unpublished",
      reference: String(site.id),
      title: "The website is not published",
      detail: "The pages exist but nobody outside the business can open them.",
      score: { impact: 5, confidence: 5, effort: 1 },
      evidence: [{ kind: "website", id: String(site.id) }],
    });
  }

  const noTitle = rows.filter((p) => !String(p.seo_title ?? "").trim());
  if (noTitle.length) {
    findings.push({
      type: "pages_without_search_title",
      reference: "singleton",
      title: `${noTitle.length} ${noTitle.length === 1 ? "page has" : "pages have"} no search title`,
      detail: "Search engines fall back to whatever they can find, which is rarely what the owner would choose.",
      score: { impact: 3, confidence: 5, effort: 1 },
      evidence: noTitle.slice(0, 5).map((p) => ({ kind: "website_page", id: String(p.id) })),
    });
  }

  const noDescription = rows.filter((p) => !String(p.meta_description ?? "").trim());
  if (noDescription.length) {
    findings.push({
      type: "pages_without_meta_description",
      reference: "singleton",
      title: `${noDescription.length} ${noDescription.length === 1 ? "page has" : "pages have"} no search description`,
      detail: "The line under the title in a search result is being written by the search engine, not by the business.",
      score: { impact: 2, confidence: 5, effort: 1 },
      evidence: noDescription.slice(0, 5).map((p) => ({ kind: "website_page", id: String(p.id) })),
    });
  }

  // A fallback page is the builder's placeholder, flagged by migration
  // 097 precisely so it can be told apart from a page somebody wrote.
  const fallback = rows.filter((p) => p.is_fallback === true);
  if (fallback.length) {
    findings.push({
      type: "pages_still_fallback",
      reference: "singleton",
      title: `${fallback.length} ${fallback.length === 1 ? "page is" : "pages are"} still the placeholder`,
      detail: "These pages are serving the builder's default content rather than anything about this business.",
      score: { impact: 4, confidence: 5, effort: 2 },
      evidence: fallback.slice(0, 5).map((p) => ({ kind: "website_page", id: String(p.id) })),
    });
  }

  return {
    findings,
    counted: [
      { label: "pages", value: rows.length, source: "website_pages" },
      { label: "pages with a search title", value: rows.length - noTitle.length, source: "website_pages.seo_title" },
      { label: "pages still on the placeholder", value: fallback.length, source: "website_pages.is_fallback" },
    ],
  };
}

/**
 * M2 — can the catalogue support a sentence about a product?
 *
 * This is C1's question asked backwards. The fact-bound pipeline can
 * only write what a record carries, so a product with no description
 * is not a marketing problem to be written around — it is the reason
 * the copy about it comes out thin. K2 in the roadmap is exactly this
 * failure seen from the other end.
 */
export async function auditCatalogue(supabase: any, dealershipId: string): Promise<AuditResult> {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, description, price, images")
    .eq("dealership_id", dealershipId);
  if (error) return EMPTY;

  const rows = (products ?? []) as any[];
  if (!rows.length) {
    return {
      findings: [
        {
          type: "catalogue_empty",
          reference: "singleton",
          title: "There are no products on record",
          detail: "Nothing can be written about a product that is not recorded, so copy about what the business sells has nothing to cite.",
          score: { impact: 5, confidence: 5, effort: 3 },
          evidence: [{ kind: "absent", id: "products" }],
        },
      ],
      counted: [{ label: "products", value: 0, source: "products" }],
    };
  }

  const findings: AuditFinding[] = [];
  const noDescription = rows.filter((p) => !String(p.description ?? "").trim());
  const noImage = rows.filter((p) => !Array.isArray(p.images) || p.images.length === 0);
  // `price` is NOT NULL in the catalogue (migration 054), so a missing
  // price cannot be a finding. Zero can.
  const freePrice = rows.filter((p) => Number(p.price) === 0);

  if (noDescription.length) {
    findings.push({
      type: "products_without_description",
      reference: "singleton",
      title: `${noDescription.length} of ${rows.length} products have no description`,
      detail: "A product with no recorded description gives the copy nothing to say about it beyond its name and price.",
      score: { impact: 4, confidence: 5, effort: 2 },
      evidence: noDescription.slice(0, 5).map((p) => ({ kind: "product", id: String(p.id) })),
    });
  }
  if (noImage.length) {
    findings.push({
      type: "products_without_image",
      reference: "singleton",
      title: `${noImage.length} of ${rows.length} products have no image`,
      detail: "The product page and every post about it have nothing to show.",
      score: { impact: 4, confidence: 5, effort: 2 },
      evidence: noImage.slice(0, 5).map((p) => ({ kind: "product", id: String(p.id) })),
    });
  }
  if (freePrice.length) {
    findings.push({
      type: "products_priced_zero",
      reference: "singleton",
      title: `${freePrice.length} ${freePrice.length === 1 ? "product is" : "products are"} priced at zero`,
      detail: "Either the price has not been set yet or the storefront is offering it free.",
      score: { impact: 5, confidence: 4, effort: 1 },
      evidence: freePrice.slice(0, 5).map((p) => ({ kind: "product", id: String(p.id) })),
    });
  }

  return {
    findings,
    counted: [
      { label: "products", value: rows.length, source: "products" },
      { label: "products with a description", value: rows.length - noDescription.length, source: "products.description" },
      { label: "products with an image", value: rows.length - noImage.length, source: "products.images" },
    ],
  };
}
