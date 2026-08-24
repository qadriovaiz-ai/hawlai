// ------------------------------------------------------------------
// Google Ads remarketing + conversion events — piece 4/7.
// ------------------------------------------------------------------
// Google Ads previously had NO tag at all — only a GA4 property was
// configured, which tracks analytics but does not build remarketing
// audiences or record conversions. Both need a gtag('config', 'AW-…')
// alongside the GA config on the same shared tag.
//
// Same guard shape as pixelEvents.ts: every call no-ops unless
// window.gtag exists, and TrackingScripts only injects gtag after
// consent — so the absence of gtag IS the consent check, with no way
// to fire against a tag that shouldn't be loaded.
//
// Never throws. An analytics failure must never break a checkout.
// ------------------------------------------------------------------

type Gtag = (...args: any[]) => void;

function getGtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  const gtag = (window as any).gtag;
  return typeof gtag === "function" ? gtag : null;
}

// Google's dynamic-remarketing page types. Exact strings matter —
// Google matches on them, so these aren't free text.
export type EcommPageType = "home" | "searchresults" | "category" | "product" | "cart" | "purchase" | "other";

export interface RemarketingParams {
  pageType: EcommPageType;
  /** MUST match Merchant Center product ids for dynamic remarketing to actually show a product (see piece 7). */
  productIds?: string[];
  totalValue?: number;
}

/**
 * Dynamic remarketing signal for the current page.
 *
 * Sent as a `page_view` to the AW- destination with the ecomm_*
 * parameters Google's dynamic remarketing reads. Requires the
 * conversion id, since remarketing is an Ads-side feature — the GA4
 * property alone can't build these audiences.
 */
export function trackRemarketing(conversionId: string | null | undefined, params: RemarketingParams) {
  try {
    const gtag = getGtag();
    if (!gtag || !conversionId) return;
    gtag("event", "page_view", {
      send_to: conversionId,
      ecomm_pagetype: params.pageType,
      ...(params.productIds?.length ? { ecomm_prodid: params.productIds } : {}),
      ...(params.totalValue != null ? { ecomm_totalvalue: params.totalValue } : {}),
    });
  } catch {
    // no-op
  }
}

/**
 * Records a purchase conversion in Google Ads.
 *
 * transaction_id is the order id — Google uses it to deduplicate, the
 * same role event_id plays for Meta. Without it a reload of the
 * confirmation page would double-count the sale and inflate reported
 * conversions.
 *
 * Needs BOTH the conversion id and label: send_to is the composite
 * 'AW-ID/LABEL', and a conversion id alone doesn't identify which
 * conversion action fired.
 */
export function trackGoogleConversion(
  conversionId: string | null | undefined,
  conversionLabel: string | null | undefined,
  orderId: string,
  value: number,
  currency = "INR"
) {
  try {
    const gtag = getGtag();
    if (!gtag || !conversionId || !conversionLabel) return;
    gtag("event", "conversion", {
      send_to: `${conversionId}/${conversionLabel}`,
      value,
      currency,
      transaction_id: orderId,
    });
  } catch {
    // no-op
  }
}
