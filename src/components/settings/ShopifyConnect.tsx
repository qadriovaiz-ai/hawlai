"use client";

import { useState, useEffect } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui";

// The callback can only pass a short code through a redirect. These
// turn each one into something a dealer can act on — every entry says
// what to DO, not what went wrong internally.
const SHOPIFY_ERRORS: Record<string, string> = {
  not_configured: "Shopify isn't set up on this server yet.",
  invalid_state: "That connection link had expired or been used already. Start again.",
  expired: "The connection took too long. Start again — it needs finishing within 15 minutes.",
  unknown_request: "We couldn't match that approval to your account. Start again from here.",
  shop_mismatch: "You approved a different store than the one you entered. Start again with the right address.",
  bad_hmac: "That response didn't come from Shopify. Nothing was connected.",
  invalid_shop: "That store address isn't a valid .myshopify.com domain.",
  missing_code: "Shopify didn't send an approval back. Try again.",
  token_exchange_failed: "Shopify wouldn't finish the connection. Try again.",
  token_rejected: "Shopify approved the app but then rejected the access token. Try connecting again.",
  // Distinct from token_rejected on purpose: this one is never the
  // dealer's fault and there is nothing for them to fix, so it must
  // not send them off checking their own permissions.
  // DELIBERATELY WORDED NOTHING LIKE scope_not_granted below. These
  // are different failures at different stages, and when they read
  // alike on screen a working fix looks like a deploy that never
  // shipped — which is exactly what happened on 2026-09-04.
  products_forbidden: "Shopify accepted the connection but refused the product list. We're reading the exact reason from Shopify now.",
  // Shopify handed back a token carrying a different scope set than
  // the one requested. Always a configuration problem on our end or
  // in the Partner dashboard, never the dealer's.
  scope_not_granted: "Shopify didn't grant permission to read products. That's a setup problem on our side, not yours.",
  // Shopify issued a token it will then refuse on every API call.
  // Always our configuration, never the merchant's.
  non_expiring_token: "Shopify issued a token we can't use. That's a setup problem on our side, not yours.",
  network: "Couldn't reach Shopify. Try again in a moment.",
};

export default function ShopifyConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
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

    // The callback redirects back here with a result. Surfaced as
    // plain sentences rather than the raw reason codes, which are
    // meaningful to us and meaningless to a dealer.
    const params = new URLSearchParams(window.location.search);
    const failure = params.get("shopify_error");
    if (failure) {
      const base = SHOPIFY_ERRORS[failure] ?? "Couldn't connect to Shopify. Try again.";
      // The scope Shopify actually granted, shown verbatim. Not
      // secret, and it is the one fact that distinguishes "Shopify
      // granted nothing" from "Shopify granted something else" —
      // which two rounds of guessing could not separate.
      const granted = params.get("granted");
      const status = params.get("status");
      // Both appended when present, so every scope-related failure
      // carries the evidence needed to tell it from its neighbour.
      const detail = [granted && `Shopify granted: ${granted}`, status && `HTTP ${status}`].filter(Boolean).join(" · ");
      setError(detail ? `${base} (${detail})` : base);
    }
  }, []);

  // Hand off to Shopify's own approval screen instead of asking for an
  // Admin API token. Shopify sends the credential back to our
  // callback, so there is nothing for the dealer to copy.
  async function handleConnect() {
    setError(null);
    if (!storeUrl.trim()) return setError("Enter your store address");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/shopify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_url: storeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      window.location.href = data.installUrl;
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
    // No finally: on success the page is navigating away, and
    // clearing the spinner would flash the form back first.
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
        Enter your store address. You&apos;ll approve the connection on Shopify — nothing to copy or paste.
      </p>
      <input
        value={storeUrl}
        onChange={(e) => setStoreUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
        placeholder="yourstore.myshopify.com"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button variant="secondary" size="sm" onClick={handleConnect} loading={saving} className="w-full justify-center">
        {saving ? "Taking you to Shopify..." : "Connect Shopify"}
      </Button>
    </div>
  );
}
