// What a machine reads off this business's site (Brain, Phase 1a).
//
// THE GAP THIS CLOSES: the SEO toolkit has a "Schema Markup" task that
// writes a JSON-LD block for the owner to paste somewhere — and Hawlai
// BUILDS the site, so there is nowhere for them to paste it and nothing
// was ever emitted. Every Hawlai storefront has been invisible to the
// structured-data readers that search engines and AI answer engines use
// to work out what a business is and what it sells.
//
// This is the cheapest real AEO work available: no AI call, no traffic
// needed, and verifiable in Google's Rich Results Test the day it ships.
//
// THE RULE, same as every other generator here: only what the business
// actually has. A field with no real value is left out, never filled
// with a plausible placeholder — structured data that claims an address
// the business never entered is worse than no structured data, because
// it is machine-readable and will be believed.

import { stripTags } from "@/lib/richText";
import type { StorefrontProduct } from "@/lib/catalog/storefrontCatalog";
import type { FaqPair } from "@/lib/blocks/utils";

export type SiteIdentity = {
  businessName: string;
  city?: string | null;
  category?: string | null;
  description?: string | null;
  siteUrl: string;
  logoUrl?: string | null;
  bookingUrl?: string | null;
};

type Json = Record<string, unknown>;

/** Drops every empty field, so nothing is published as a guess. */
function compact(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Plain words for a machine to read.
 *
 * Descriptions are stored as the markdown subset lib/richText renders
 * (**bold**, [links](url)) — and a tag or a link that found its way in
 * would be published verbatim here. Same lesson as the homepage that
 * showed "<p>" to every visitor.
 */
function plain(text: string | null | undefined, max = 500): string | undefined {
  const t = stripTags(String(text ?? ""))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, max) : undefined;
}

/** A service is booked; a product is bought. Schema.org says so differently. */
function isService(p: StorefrontProduct): boolean {
  return p.kind === "service";
}

/** One catalogue item, as Product or Service. */
export function itemNode(p: StorefrontProduct, identity: SiteIdentity): Json {
  const url = `${identity.siteUrl.replace(/\/+$/, "")}/products/${p.id}`;
  const offer = compact({
    "@type": "Offer",
    price: Number.isFinite(p.price) ? String(p.price) : undefined,
    priceCurrency: "INR",
    url: isService(p) ? p.book_href ?? url : url,
    // Stock is a fact we hold for products only — a service has no stock,
    // so it simply doesn't carry availability rather than claiming any.
    availability: isService(p)
      ? undefined
      : p.inventory_count === null || p.inventory_count === undefined
      ? undefined
      : p.inventory_count > 0
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  });

  return compact({
    "@type": isService(p) ? "Service" : "Product",
    name: plain(p.name, 200),
    description: plain(p.description),
    image: p.images?.filter(Boolean).slice(0, 5),
    url,
    ...(isService(p)
      ? { provider: compact({ "@type": "LocalBusiness", name: identity.businessName }) }
      : {}),
    offers: Object.keys(offer).length > 1 ? offer : undefined,
  });
}

/** The business itself. */
export function businessNode(identity: SiteIdentity): Json {
  return compact({
    "@type": "LocalBusiness",
    name: identity.businessName,
    description: plain(identity.description),
    url: identity.siteUrl,
    image: identity.logoUrl ?? undefined,
    logo: identity.logoUrl ?? undefined,
    // Only the city, because only the city is on record. An addressLocality
    // with no street is honest; an invented street address is not.
    address: identity.city ? { "@type": "PostalAddress", addressLocality: identity.city, addressCountry: "IN" } : undefined,
    // No aggregateRating anywhere in here: Hawlai has no rating data for
    // any business, and a rating is the single most tempting thing to
    // invent and the most damaging to get wrong.
  });
}

/**
 * The page's own questions and answers, as a machine reads them.
 *
 * THE HONEST LIMIT, and it is in docs/PLAN-AEO-GEO.md too: Google
 * narrowed FAQPage's rich-result eligibility in 2023, so this is not a
 * dropdown in a search result and nothing here should be sold as one.
 * What it is: the page saying, in a form that needs no parsing, "this
 * string is a question customers ask and that string is our answer" —
 * which is what an answer engine quotes.
 *
 * ONLY WHAT THE PAGE ACTUALLY SAYS. Every pair comes from a `faq_item`
 * block that is rendered, visibly, on the same page as this script tag.
 * Structured data describing content a visitor cannot find is the one
 * thing Google calls out as a violation, and it is also just a lie.
 *
 * Returns null for an empty list, so a page with no questions publishes
 * no FAQPage rather than an empty one.
 */
export function faqPageNode(pairs: FaqPair[]): Json | null {
  const items = (pairs ?? []).filter((p) => p?.question?.trim() && p?.answer?.trim());
  if (items.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: items.map((p) => ({
      "@type": "Question",
      // The answer is stored as the markdown subset lib/richText renders,
      // so plain() takes the ** and the [link](url) out. A machine
      // reading "**Yes**" learns the asterisks are part of the answer.
      name: plain(p.question, 300),
      acceptedAnswer: { "@type": "Answer", text: plain(p.answer, 2000) },
    })),
  };
}

/**
 * The whole graph for a storefront page.
 *
 * Returns null when there isn't enough to say anything true — a business
 * with no name publishes no structured data rather than an empty shell.
 */
export function storefrontJsonLd(
  identity: SiteIdentity,
  products: StorefrontProduct[],
  /**
   * The page's question-and-answer pairs, if it has any.
   *
   * Optional and defaulted, because three routes call this and only the
   * ones that have read the page's blocks can pass them.
   */
  faqPairs: FaqPair[] = []
): Json | null {
  if (!identity?.businessName?.trim() || !identity.siteUrl) return null;
  const items = (products ?? []).filter((p) => p?.name);

  const graph: Json[] = [businessNode(identity)];
  if (items.length > 0) {
    graph.push({
      "@type": "ItemList",
      itemListElement: items.slice(0, 50).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: itemNode(p, identity),
      })),
    });
  }
  const faq = faqPageNode(faqPairs);
  if (faq) graph.push(faq);
  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * The graph for one catalogue item's own page.
 *
 * THE GAP THIS CLOSES (A2): the product page emitted nothing. A
 * storefront's most specific page — the one with a price, a stock state
 * and a description — was the one page no machine could read, while the
 * home page carried a list of all of them.
 *
 * The item node is the same one the home page's ItemList uses, so a
 * product cannot be described two different ways on two pages.
 */
export function productPageJsonLd(identity: SiteIdentity, product: StorefrontProduct | null): Json | null {
  if (!identity?.businessName?.trim() || !identity.siteUrl || !product?.name) return null;
  return {
    "@context": "https://schema.org",
    "@graph": [itemNode(product, identity), businessNode(identity)],
  };
}

/**
 * The JSON as it goes into a <script> tag.
 *
 * "<" is escaped so a description containing "</script>" cannot close
 * the tag early and turn data into markup. This is the one reason this
 * function exists rather than calling JSON.stringify at the call site.
 */
export function jsonLdText(node: Json | null): string | null {
  if (!node) return null;
  return JSON.stringify(node).replace(/</g, "\\u003c");
}
