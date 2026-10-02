// Which kind of page this is, in one place.
//
// Two features need the same answer and had their own copy of it: the SEO
// health check skips the "has a visual" test on a privacy policy, and the
// claims review refuses to delete a sentence out of one. A safety rule
// kept in two places is a safety rule that will disagree with itself.

const LEGAL_SLUGS = /(privacy|terms|refund|shipping-policy|cookie|disclaimer)/i;

/**
 * A page whose words carry obligations rather than marketing.
 *
 * Privacy, terms, refunds, shipping policy. Copy here is read by a
 * customer deciding whether to trust the business and, if anything goes
 * wrong, by whoever is settling it — so a sentence is never removed from
 * one on Hawlai's initiative.
 */
export function isLegalPage(page: { slug?: string | null; page_type?: string | null; pageType?: string | null }): boolean {
  const slug = String(page.slug ?? "");
  const type = String(page.page_type ?? page.pageType ?? "");
  return LEGAL_SLUGS.test(slug) || LEGAL_SLUGS.test(type) || type === "legal";
}
