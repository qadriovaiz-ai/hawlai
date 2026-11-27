"use client";

import { useState, useEffect } from "react";
import IntegrationHealthLine from "@/components/settings/IntegrationHealthLine";
import type { Health } from "@/lib/integrations/healthState";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

export default function WooCommerceConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);
  // What the route's real call to the store found (H0, 27 Nov 2026).
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/integrations/woocommerce")
      .then((res) => res.json())
      .then((data) => {
        setConnected(data.connected);
        setProductCount(data.products?.length ?? 0);
        setHealth(data.health ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  // A6 — hand off to the store's own approval screen instead of asking
  // for a key and a secret. WooCommerce POSTs the credentials back to
  // our callback, so there is nothing for the dealer to copy: they
  // approve on their own site and land back here connected.
  async function handleConnect() {
    setError(null);
    if (!storeUrl.trim()) return setError("Enter your store address");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/woocommerce/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_url: storeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      // Full navigation, not a popup — the approval screen is on the
      // dealer's own domain and needs to be visibly theirs.
      window.location.href = data.authorizeUrl;
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
    // Deliberately no finally: on success the page is navigating away,
    // and clearing the spinner first would flash the form back.
  }

  async function handleDisconnect() {
    await fetch("/api/integrations/woocommerce", { method: "DELETE" });
    setConnected(false);
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;

  if (connected) {
    return (
      <div className="flex items-center justify-between">
        {/* Not a green tick on a stored row: what the call found. A store
            that refused the call says so, with WooCommerce's own reason. */}
        <IntegrationHealthLine
          health={health ?? { state: "unchecked", reason: null }}
          detail={productCount > 0 ? `${productCount} products found` : null}
        />
        <button onClick={handleDisconnect} className="text-xs text-slate-400 hover:text-red-400">Disconnect</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Enter your store address. You&apos;ll approve the connection on your own site — nothing to copy or paste.
      </p>
      <input
        value={storeUrl}
        onChange={(e) => setStoreUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
        placeholder="yourstore.com"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button variant="secondary" size="sm" onClick={handleConnect} loading={saving} className="w-full justify-center">
        {saving ? "Taking you to your store..." : "Connect WooCommerce"}
      </Button>
    </div>
  );
}
