// ------------------------------------------------------------------
// Product feeds for dynamic remarketing — retargeting piece 7/7.
// ------------------------------------------------------------------
// Dynamic remarketing ("show them the exact product they viewed")
// needs the ad platform to hold its own copy of the catalogue. The
// pixel sends a product ID; the platform looks it up in its feed to
// build the creative. Without a feed the events fire and nothing is
// ever shown — which is why piece 4's remarketing toggle defaults off.
//
// VERIFIED, and the differences are load-bearing:
//   availability — Google 'in_stock' / 'out_of_stock' (underscores)
//                  Meta   'in stock' / 'out of stock' (spaces)
//   Same meaning, incompatible strings. One feed genuinely cannot
//   serve both, hence two builders below rather than one.
//
// CRITICAL for dynamic remarketing to work at all: the feed `id` must
// be the SAME value the pixel sends as ecomm_prodid / content_ids. We
// use products.id in both places (see pixelEvents.ts and
// googleAdsEvents.ts) so they match by construction rather than by
// a mapping table that could drift.
// ------------------------------------------------------------------

export interface FeedProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  images: string[] | null;
  inventory_count: number | null;
  brand: string | null;
  condition: string;
  gtin: string | null;
  category: string | null;
}

export interface FeedContext {
  /** Absolute storefront origin, e.g. https://hawlai.vercel.app */
  siteOrigin: string;
  /** Storefront slug, for building product links. */
  slug: string;
  /** Used as the brand fallback when a product has none of its own. */
  businessName: string;
}

/** XML text must be escaped — an unescaped `&` in a product name invalidates the whole feed, not just that item. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strips HTML from rich-text descriptions and caps length — feeds want plain text. */
function plainText(value: string | null, maxLength: number): string {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function productLink(ctx: FeedContext, productId: string): string {
  return `${ctx.siteOrigin.replace(/\/$/, "")}/site/${ctx.slug}/products/${productId}`;
}

/** null inventory means "not tracked", which is in stock — not out of stock. Treating it as unavailable would hide every untracked product. */
function isInStock(product: FeedProduct): boolean {
  return product.inventory_count == null || product.inventory_count > 0;
}

function brandOf(product: FeedProduct, ctx: FeedContext): string {
  return product.brand?.trim() || ctx.businessName;
}

/** Both platforms accept "1500.00 INR". */
function priceString(price: number): string {
  return `${Number(price).toFixed(2)} INR`;
}

/**
 * Products that can't form a valid feed item are OMITTED rather than
 * emitted incomplete. A feed item missing a required field is rejected
 * by the platform anyway, and a partial feed that imports cleanly is
 * more useful than a complete one the platform refuses wholesale.
 */
export function isFeedEligible(product: FeedProduct): boolean {
  return !!(product.id && product.name?.trim() && product.price > 0 && product.images?.[0]);
}

// ---- Google Merchant Center (RSS 2.0 + g: namespace) ----------------

export function buildGoogleFeed(products: FeedProduct[], ctx: FeedContext): string {
  const items = products
    .filter(isFeedEligible)
    .map((p) => {
      const description = plainText(p.description, 5000) || p.name;
      return `    <item>
      <g:id>${xmlEscape(p.id)}</g:id>
      <g:title>${xmlEscape(plainText(p.name, 150))}</g:title>
      <g:description>${xmlEscape(description)}</g:description>
      <g:link>${xmlEscape(productLink(ctx, p.id))}</g:link>
      <g:image_link>${xmlEscape(p.images![0])}</g:image_link>
      <g:availability>${isInStock(p) ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${priceString(p.price)}</g:price>
      <g:brand>${xmlEscape(brandOf(p, ctx))}</g:brand>
      <g:condition>${xmlEscape(p.condition || "new")}</g:condition>${
        p.gtin ? `\n      <g:gtin>${xmlEscape(p.gtin)}</g:gtin>` : ""
      }${
        // identifier_exists=no is REQUIRED when a product genuinely
        // has no GTIN/MPN. Omitting it makes Google reject the item
        // for a missing identifier instead of accepting that it has
        // none — a common and confusing feed rejection.
        !p.gtin ? `\n      <g:identifier_exists>no</g:identifier_exists>` : ""
      }${
        p.category ? `\n      <g:product_type>${xmlEscape(plainText(p.category, 750))}</g:product_type>` : ""
      }
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(ctx.businessName)} — Products</title>
    <link>${xmlEscape(`${ctx.siteOrigin.replace(/\/$/, "")}/site/${ctx.slug}`)}</link>
    <description>Product feed for Google Merchant Center</description>
${items}
  </channel>
</rss>`;
}

// ---- Meta Catalog (TSV) --------------------------------------------

const META_COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
] as const;

/** TSV cells must not contain tabs or newlines, or the columns shift and every subsequent field lands in the wrong place. */
function tsvCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

export function buildMetaFeed(products: FeedProduct[], ctx: FeedContext): string {
  const rows = products.filter(isFeedEligible).map((p) =>
    [
      p.id,
      plainText(p.name, 200),
      plainText(p.description, 5000) || p.name,
      // Spaces, not underscores — the difference from Google's format.
      isInStock(p) ? "in stock" : "out of stock",
      p.condition || "new",
      priceString(p.price),
      productLink(ctx, p.id),
      p.images![0],
      brandOf(p, ctx),
    ]
      .map((cell) => tsvCell(String(cell ?? "")))
      .join("\t")
  );

  return [META_COLUMNS.join("\t"), ...rows].join("\n");
}
