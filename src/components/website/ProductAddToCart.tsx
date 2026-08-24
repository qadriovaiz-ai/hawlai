"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Check } from "lucide-react";
import { addToCart } from "@/lib/cart";
import { trackViewContent, trackAddToCart } from "@/lib/pixelEvents";
import { trackRemarketing } from "@/lib/googleAdsEvents";
import { useTrackingConfig } from "@/components/website/TrackingConfigProvider";
import type { LandingTheme } from "@/lib/landingThemes";

export default function ProductAddToCart({
  slug,
  product,
  outOfStock,
  theme,
}: {
  slug: string;
  product: { id: string; name: string; price: number; image?: string; category?: string | null };
  outOfStock: boolean;
  theme: LandingTheme;
}) {
  const [added, setAdded] = useState(false);
  const trackingConfig = useTrackingConfig();

  // ViewContent lives here rather than in the server-rendered product
  // page because these events are inherently client-side (they need
  // `fbq`), and this component is already the client boundary that
  // holds the full product data — adding a second client component
  // beside it just to fire one event would be redundant.
  useEffect(() => {
    trackViewContent({ id: product.id, name: product.name, price: product.price, category: product.category });
    // Google dynamic remarketing for this product view. Only when the
    // business has actually enabled it — see migration 154 for why
    // it's off by default (no Merchant Center feed until piece 7).
    if (trackingConfig.googleRemarketingEnabled) {
      trackRemarketing(trackingConfig.googleAdsConversionId, {
        pageType: "product",
        productIds: [product.id],
        totalValue: product.price,
      });
    }
  }, [product.id]);

  function handleAdd() {
    addToCart(slug, { productId: product.id, name: product.name, price: product.price, image: product.image });
    trackAddToCart({ id: product.id, name: product.name, price: product.price, category: product.category });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      onClick={handleAdd}
      disabled={outOfStock}
      className="w-full sm:w-auto text-sm font-semibold px-6 py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: theme.accent, color: theme.accentText }}
    >
      {outOfStock ? "Out of Stock" : added ? (<><Check className="w-4 h-4" /> Added</>) : (<><ShoppingCart className="w-4 h-4" /> Add to Cart</>)}
    </button>
  );
}
