"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";
import { addToCart } from "@/lib/cart";
import type { LandingTheme } from "@/lib/landingThemes";

export default function ProductAddToCart({
  slug,
  product,
  outOfStock,
  theme,
}: {
  slug: string;
  product: { id: string; name: string; price: number; image?: string };
  outOfStock: boolean;
  theme: LandingTheme;
}) {
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addToCart(slug, { productId: product.id, name: product.name, price: product.price, image: product.image });
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
