"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, ExternalLink } from "lucide-react";

export default function ShopifyConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    fetch("/api/integrations/shopify")
      .then((res) => res.json())
      .then((data) => {
        setConnected(data.connected);
        setProductCount(data.products?.length ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setError(null);
    if (!storeUrl.trim() || !accessToken.trim()) return setError("Both fields are required");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_url: storeUrl.trim(), access_token: accessToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConnected(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    await fetch("/api/integrations/shopify", { method: "DELETE" });
    setConnected(false);
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;

  if (connected) {
    return (
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-green-400"><Check className="w-3.5 h-3.5" /> Connected{productCount > 0 ? ` — ${productCount} products found` : ""}</span>
        <button onClick={handleDisconnect} className="text-xs text-slate-400 hover:text-red-400">Disconnect</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        In your store admin: Settings → Apps → Develop apps → Create an app → give it Products read access → install → copy the Admin API access token.
      </p>
      <input
        value={storeUrl}
        onChange={(e) => setStoreUrl(e.target.value)}
        placeholder="yourstore.myshopify.com"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <input
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
        placeholder="Admin API access token (shpat_...)"
        type="password"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={handleConnect} disabled={saving} className="btn-secondary text-xs w-full justify-center">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
      </button>
    </div>
  );
}
