"use client";

import { useState, useEffect } from "react";
import { Loader2, Rss, Copy, Check, AlertCircle } from "lucide-react";

// Product feed URLs — retargeting piece 7/7.
//
// Hosted-URL delivery rather than API push: both platforms fetch on a
// schedule, which means no second set of OAuth credentials, no
// per-product sync to keep reconciled, and a feed that's always
// current because it's generated from the database at fetch time.

export default function ProductFeedCard() {
  const [slug, setSlug] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/product-feed")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setSlug(d.slug ?? null);
          setPublished(!!d.published);
          setProductCount(d.productCount ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copy(url: string, key: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  if (loading) {
    return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  }

  // No storefront means no catalogue to feed — showing URLs that
  // return 404 would just look broken.
  if (!slug) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const feeds = [
    { key: "google", label: "Google Merchant Center", url: `${origin}/api/feeds/google/${slug}`, where: "Merchant Center → Products → Feeds → Add feed → Scheduled fetch" },
    { key: "meta", label: "Meta Commerce Manager", url: `${origin}/api/feeds/meta/${slug}`, where: "Commerce Manager → Catalogue → Data sources → Scheduled feed" },
  ];

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Rss className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Product feeds</p>
      </div>
      <p className="text-xs text-slate-400">
        Lets ads show the exact product someone looked at. Paste each link into the matching platform and set it to refresh daily — it always reflects your current products and prices.
      </p>

      {!published && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Your storefront isn&apos;t published yet, so these feeds return nothing. Publish it first — a feed pointing at unavailable products gets rejected.</span>
        </div>
      )}

      {published && productCount === 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>No active products yet — the feeds will be empty until you add some.</span>
        </div>
      )}

      <div className="space-y-2">
        {feeds.map((f) => (
          <div key={f.key} className="border border-slate-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-medium text-slate-700">{f.label}</p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 min-w-0 text-[10.5px] text-slate-500 bg-slate-100 rounded px-2 py-1.5 truncate">{f.url}</code>
              <button
                onClick={() => copy(f.url, f.key)}
                className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
                aria-label={`Copy ${f.label} feed URL`}
              >
                {copied === f.key ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">{f.where}</p>
          </div>
        ))}
      </div>

      {/* Stated plainly rather than implying the feature is live the
          moment a URL exists — approval genuinely takes hours and can
          reject items for reasons outside this app's control. */}
      <p className="text-[10.5px] text-slate-400">
        After adding a feed, the platform reviews your products — usually a few hours. Products can be rejected for their own reasons (image too small, category rules), so check the platform&apos;s own diagnostics if something doesn&apos;t appear.
      </p>
    </div>
  );
}
