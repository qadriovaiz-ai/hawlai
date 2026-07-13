"use client";

import { useState, useEffect } from "react";
import { Loader2, X, Store, Search } from "lucide-react";

interface Product {
  source: "shopify" | "woocommerce";
  id: string;
  title: string;
  price: string | null;
  image_url: string | null;
  product_url: string | null;
}

export default function ProductPicker({
  onSelect,
  onClose,
}: {
  onSelect: (photoBase64: string, promptPrefill: string, productUrl: string | null) => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handlePick(product: Product) {
    if (!product.image_url) {
      setError("This product has no image to use — pick another or upload a photo manually.");
      return;
    }
    setError(null);
    setLoadingProductId(product.id);
    try {
      const res = await fetch(`/api/integrations/product-image?url=${encodeURIComponent(product.image_url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load that product's image");
      const priceText = product.price ? `, priced at ₹${product.price}` : "";
      onSelect(data.base64, `${product.title}${priceText}`, product.product_url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingProductId(null);
    }
  }

  const filtered = products.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" /> Pick a Product
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading products...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              {products.length === 0 ? "No products found — connect Shopify or WooCommerce in Settings → Integrations first." : "No products match your search."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((p) => (
                <button
                  key={`${p.source}-${p.id}`}
                  onClick={() => handlePick(p)}
                  disabled={loadingProductId === p.id}
                  className="text-left border border-slate-200 rounded-lg overflow-hidden hover:border-purple-400 transition-colors disabled:opacity-50"
                >
                  <div className="w-full h-24 bg-slate-100 flex items-center justify-center relative">
                    {loadingProductId === p.id ? (
                      <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    ) : p.image_url ? (
                      <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <Store className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-slate-800 truncate">{p.title}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      {p.price && <p className="text-xs text-slate-500">₹{p.price}</p>}
                      <span className="text-[10px] text-slate-400 capitalize">{p.source}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>
      </div>
    </div>
  );
}
