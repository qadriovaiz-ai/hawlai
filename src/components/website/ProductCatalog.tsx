"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";
import type { LandingTheme } from "@/lib/landingThemes";
import { addToCart } from "@/lib/cart";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  inventory_count: number | null;
}

export default function ProductCatalog({ products, slug, theme, heading }: { products: Product[]; slug: string; theme: LandingTheme; heading?: string }) {
  const [addedId, setAddedId] = useState<string | null>(null);

  function handleAdd(p: Product) {
    addToCart(slug, { productId: p.id, name: p.name, price: Number(p.price), image: p.images?.[0] });
    setAddedId(p.id);
    setTimeout(() => setAddedId((cur) => (cur === p.id ? null : cur)), 1500);
  }

  if (products.length === 0) {
    return (
      <section className="px-6 py-12 max-w-4xl mx-auto text-center">
        {heading && <h2 className="text-2xl font-bold mb-3" style={{ color: theme.dark }}>{heading}</h2>}
        <p className="text-sm text-neutral-400">No products listed yet — check back soon.</p>
      </section>
    );
  }

  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      {heading && <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }}>{heading}</h2>}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
        {products.map((p) => {
          const outOfStock = p.inventory_count != null && p.inventory_count <= 0;
          return (
            <div key={p.id} className="rounded-xl border border-neutral-200 overflow-hidden flex flex-col">
              <div className="aspect-square bg-neutral-100">
                {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />}
              </div>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <p className="font-semibold" style={{ color: theme.dark }}>{p.name}</p>
                {p.description && <p className="text-sm text-neutral-500 line-clamp-2">{p.description}</p>}
                <div className="flex items-center gap-2 mt-auto pt-2">
                  <p className="font-bold" style={{ color: theme.accent }}>₹{Number(p.price).toLocaleString("en-IN")}</p>
                  {p.compare_at_price && p.compare_at_price > p.price && (
                    <p className="text-xs text-neutral-400 line-through">₹{Number(p.compare_at_price).toLocaleString("en-IN")}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAdd(p)}
                  disabled={outOfStock}
                  className="mt-1 w-full text-sm font-semibold px-3 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: theme.accent, color: theme.accentText }}
                >
                  {outOfStock ? "Out of Stock" : addedId === p.id ? (<><Check className="w-4 h-4" /> Added</>) : (<><ShoppingCart className="w-4 h-4" /> Add to Cart</>)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
