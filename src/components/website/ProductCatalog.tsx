"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { LandingTheme } from "@/lib/landingThemes";
import { addToCart } from "@/lib/cart";
import { renderRichText } from "@/lib/richText";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  inventory_count: number | null;
}

export function ProductImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (images.length === 0) return <div className="aspect-square bg-neutral-100" />;

  function go(delta: number) {
    setIndex((i) => (i + delta + images.length) % images.length);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  }

  return (
    <div className="relative aspect-square bg-neutral-100 group/gallery overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={images[index]} alt={alt} className="w-full h-full object-cover" />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(-1); }}
            aria-label="Previous image"
            className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/85 text-neutral-700 flex items-center justify-center opacity-0 group-hover/gallery:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(1); }}
            aria-label="Next image"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/85 text-neutral-700 flex items-center justify-center opacity-0 group-hover/gallery:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIndex(i); }}
                aria-label={`Show image ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
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
              <Link href={`/site/${slug}/products/${p.id}`}>
                <ProductImageGallery images={p.images ?? []} alt={p.name} />
              </Link>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <Link href={`/site/${slug}/products/${p.id}`} className="font-semibold hover:underline" style={{ color: theme.dark }}>{p.name}</Link>
                {p.description && <p className="text-sm text-neutral-500 line-clamp-2">{renderRichText(p.description)}</p>}
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
