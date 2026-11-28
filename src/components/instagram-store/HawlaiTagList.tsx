"use client";

// Instagram Store → Products (S2, 28 Nov 2026): each product's
// `#HawlaiTag: <name>` line, ready to paste into a post's caption. With it
// in the caption, a customer who shares that post or replies to it is
// answered knowing the product (T1). The name is the catalog's own, so it
// matches exactly — which is the only way T1 names a product.

import { useEffect, useState } from "react";

export function hawlaiTagFor(name: string): string {
  return `#HawlaiTag: ${String(name ?? "").replace(/\s+/g, " ").trim()}`;
}

export default function HawlaiTagList() {
  const [products, setProducts] = useState<{ id: string; name: string; kind?: string | null; is_active?: boolean | null }[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => (d?.error ? setError(d.error) : setProducts((d.products ?? []).filter((p: any) => p.kind !== "service"))))
      .catch(() => setError("Couldn't load your products."));
  }, []);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  }

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!products) return null;
  if (!products.length) return null;

  return (
    <div className="card p-5 space-y-2">
      <p className="text-sm font-semibold text-slate-700">Tag your Instagram posts</p>
      <p className="text-xs text-slate-400">
        Paste a product's line into the caption of the post that shows it. When a customer shares that post or replies to it, Hawlai knows which product they mean.
      </p>
      <div className="space-y-1.5">
        {products.map((p) => {
          const tag = hawlaiTagFor(p.name);
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-slate-100 rounded-lg px-2 py-1.5">
              <code className="text-slate-700 truncate">{tag}</code>
              <button onClick={() => copy(p.id, tag)} className="shrink-0 text-purple-500 hover:underline">
                {copied === p.id ? "Copied" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
