// ------------------------------------------------------------------
// Meta Pixel standard events — retargeting piece 3/7.
// ------------------------------------------------------------------
// The pixel previously fired only PageView, and only on landing pages
// (the storefront had no pixel at all). These are the standard events
// Meta's own retargeting and optimisation actually key off:
//   ViewContent       — looked at a specific product
//   AddToCart         — added it
//   InitiateCheckout  — started checking out
//   Purchase          — genuinely bought (with value, for real ROAS)
//   Search            — searched the site
//   Lead              — submitted a form
//
// Every call is a no-op unless BOTH the pixel is loaded and consent
// was granted — TrackingScripts only injects fbq after consent, so
// `window.fbq` being undefined is itself the consent check. Guarding
// on it directly (rather than re-reading consent) means there is no
// way for these to fire against a pixel that shouldn't exist.
//
// Never throws: an analytics failure must never break a real
// customer's checkout.
// ------------------------------------------------------------------

type Fbq = (...args: any[]) => void;

function getFbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const fbq = (window as any).fbq;
  return typeof fbq === "function" ? fbq : null;
}

/**
 * Meta deduplicates a browser event against its server-side twin only
 * when both send the SAME eventID. Anything with a natural stable key
 * (an order id) must pass it; without one Meta counts the conversion
 * twice and reported ROAS is inflated.
 */
function track(event: string, params?: Record<string, any>, eventId?: string) {
  try {
    const fbq = getFbq();
    if (!fbq) return;
    if (eventId) fbq("track", event, params ?? {}, { eventID: eventId });
    else fbq("track", event, params ?? {});
  } catch {
    // no-op — never break the page for a tracking failure
  }
}

export interface PixelProduct {
  id: string;
  name?: string;
  price?: number;
  category?: string | null;
}

export function trackViewContent(product: PixelProduct) {
  track("ViewContent", {
    content_ids: [product.id],
    content_type: "product",
    content_name: product.name,
    content_category: product.category ?? undefined,
    value: product.price,
    currency: "INR",
  });
}

export function trackAddToCart(product: PixelProduct, quantity = 1) {
  track("AddToCart", {
    content_ids: [product.id],
    content_type: "product",
    content_name: product.name,
    value: product.price != null ? product.price * quantity : undefined,
    currency: "INR",
  });
}

export function trackInitiateCheckout(items: { productId: string; price: number; quantity: number }[], total: number) {
  track("InitiateCheckout", {
    content_ids: items.map((i) => i.productId),
    content_type: "product",
    num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    value: total,
    currency: "INR",
  });
}

/**
 * eventId MUST be the order id — the server sends the identical value
 * via the Conversions API, and that match is the only thing stopping
 * Meta from counting one sale as two.
 */
export function trackPurchase(
  orderId: string,
  items: { productId: string; price: number; quantity: number }[],
  total: number
) {
  track(
    "Purchase",
    {
      content_ids: items.map((i) => i.productId),
      content_type: "product",
      num_items: items.reduce((sum, i) => sum + i.quantity, 0),
      value: total,
      currency: "INR",
    },
    orderId
  );
}

export function trackSearch(query: string) {
  track("Search", { search_string: query });
}

export function trackLead(value?: number) {
  track("Lead", value != null ? { value, currency: "INR" } : {});
}
