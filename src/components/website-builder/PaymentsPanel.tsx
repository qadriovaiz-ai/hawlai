"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CreditCard, Check, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { loadSettings, type LoadResult } from "@/lib/settingsLoad";

// Online payments go into the business's OWN Razorpay account.
//
// "Connect Razorpay" is the way in: the owner signs in on Razorpay's
// page and approves Hawlai — the same shape as connecting Meta, Shopify
// or Canva. Nobody copies or pastes a key. The paste form only appears
// when Connect Razorpay isn't switched on for this server, and even
// then what's saved is checked with Razorpay, encrypted, and never
// shown back.

type Status = {
  connected: boolean;
  method: "oauth" | "keys" | null;
  accountId: string | null;
  mode: string | null;
  needsReconnect: boolean;
  oauthAvailable: boolean;
};

type Notice = { tone: "good" | "info" | "error"; text: string };

const NOTICE_CLASS: Record<Notice["tone"], string> = { good: "text-green-500", info: "text-slate-500", error: "text-amber-500" };

// Codes from /api/integrations/razorpay/callback. Only these sentences
// can appear — never text taken from the URL.
const FAILED: Record<string, string> = {
  expired: "The connection attempt expired. Please try again.",
  mismatch: "That connection request didn't match this browser. Please try again.",
  no_business: "Your account isn't linked to a business yet.",
  not_configured: "Connect Razorpay isn't switched on for Hawlai yet.",
  exchange_failed: "Razorpay couldn't complete the connection. Please try again.",
  save_failed: "Razorpay approved the connection, but Hawlai couldn't save it. Nothing was changed — please try again.",
};

/** The result of coming back from Razorpay, read once and removed from the address bar. */
function readReturn(): Notice | null {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("razorpay");
  if (!result) return null;
  const reason = params.get("reason") ?? "";
  params.delete("razorpay");
  params.delete("reason");
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
  if (result === "connected") return { tone: "good", text: "Razorpay is connected. “Pay Online” now appears at checkout." };
  if (result === "cancelled") return { tone: "info", text: "Razorpay wasn't connected — it was cancelled on Razorpay's page." };
  return { tone: "error", text: FAILED[reason] ?? FAILED.exchange_failed };
}

const pickStatus = (b: any): Status | null => (typeof b?.connected === "boolean" ? (b as Status) : null);

export default function PaymentsPanel() {
  const [load, setLoad] = useState<LoadResult<Status> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "save" | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");

  const refresh = useCallback(async () => {
    setLoad(null);
    setLoad(await loadSettings("/api/settings/razorpay", pickStatus, "Couldn't read your payment settings."));
  }, []);

  useEffect(() => {
    setNotice(readReturn());
    refresh();
  }, [refresh]);

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      const r = await fetch("/api/integrations/razorpay/start", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || typeof d.url !== "string") throw new Error(d.error ?? "Couldn't start connecting Razorpay. Please try again.");
      window.location.href = d.url;
    } catch (err: any) {
      setError(err.message);
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/integrations/razorpay/disconnect", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't disconnect Razorpay. Try again.");
      setNotice(
        d.revokedAtRazorpay === false
          ? { tone: "info", text: "Disconnected from Hawlai. Razorpay didn't confirm it removed Hawlai's access, so Hawlai may still be listed under Apps in your Razorpay account." }
          : { tone: "info", text: "Razorpay disconnected. Checkout now offers Cash on Delivery only." }
      );
      setConfirmingDisconnect(false);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveKeys() {
    if (!load?.ok) return; // never save over settings that didn't load
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/settings/razorpay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId, keySecret }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't save your Razorpay keys. Try again.");
      setKeyId("");
      setKeySecret("");
      setNotice({ tone: "good", text: "Razorpay accepted your keys. “Pay Online” now appears at checkout." });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CreditCard className="w-4 h-4 text-slate-400" /> Online Payments (Razorpay)</p>
  );

  if (load === null) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  if (!load.ok) {
    return (
      <div className="card p-5 space-y-3">
        {header}
        <p className="text-sm text-amber-500 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {load.error}</p>
        <p className="text-xs text-slate-400">Nothing was changed — your payment settings are exactly as they were.</p>
        <Button onClick={refresh}>Try again</Button>
      </div>
    );
  }

  const s = load.data;

  return (
    <div className="card p-5 space-y-4">
      {header}
      {notice && <p className={`text-xs ${NOTICE_CLASS[notice.tone]}`}>{notice.text}</p>}

      {s.connected ? (
        <div className="space-y-3">
          <div className="bg-green-500/10 rounded-lg p-3 flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 space-y-0.5">
              <p className="font-semibold text-slate-700">Connected{s.method === "oauth" && s.mode === "test" ? " — test mode" : ""}</p>
              <p>{s.method === "oauth" ? (s.accountId ? `Razorpay account ${s.accountId}` : "Signed in with Razorpay") : "Connected with API keys (stored encrypted)"}</p>
              <p>“Pay Online” appears at checkout, and payments go straight into your own Razorpay account.</p>
            </div>
          </div>

          {s.method === "keys" && s.oauthAvailable && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">You can sign in with Razorpay instead of keeping pasted keys — they&apos;re removed once it&apos;s connected.</p>
              <Button onClick={connect} disabled={busy !== null} loading={busy === "connect"}>Connect Razorpay instead</Button>
            </div>
          )}

          {confirmingDisconnect ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-600">Turn off “Pay Online”? Checkout will offer Cash on Delivery only.</p>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy !== null}
                className="text-xs px-2.5 py-1 rounded-lg border border-red-400/40 text-red-400 hover:border-red-400 disabled:opacity-40"
              >
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
              <button type="button" onClick={() => setConfirmingDisconnect(false)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDisconnect(true)} className="text-xs text-slate-500 underline">
              Disconnect Razorpay
            </button>
          )}
        </div>
      ) : s.oauthAvailable ? (
        <div className="space-y-3">
          {s.needsReconnect && (
            <p className="text-xs text-amber-500">Your Razorpay connection has expired, so checkout is offering Cash on Delivery only. Reconnect to turn “Pay Online” back on.</p>
          )}
          <p className="text-xs text-slate-500">
            Let customers pay online, straight into <strong>your own</strong> Razorpay account. You&apos;ll sign in on Razorpay&apos;s page and approve Hawlai — there are no keys to copy.
          </p>
          <Button onClick={connect} disabled={busy !== null} loading={busy === "connect"}>
            {s.needsReconnect ? "Reconnect Razorpay" : "Connect Razorpay"}
          </Button>
          <p className="text-xs text-slate-400">Until then, checkout offers Cash on Delivery only.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {s.needsReconnect && (
            <p className="text-xs text-amber-500">Your Razorpay connection can&apos;t be used right now, so checkout is offering Cash on Delivery only.</p>
          )}
          <div className="bg-slate-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500">
              Connect your <strong>own</strong> Razorpay account so customers can pay online, straight into your bank. Copy the Key ID and Key Secret from Account &amp; Settings → API Keys in your{" "}
              <a href="https://dashboard.razorpay.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline inline-flex items-center gap-0.5">
                Razorpay dashboard <ExternalLink className="w-3 h-3" />
              </a>
              . Hawlai checks them with Razorpay, stores them encrypted, and never shows them again.
            </p>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Key ID</p>
              <input value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" placeholder="rzp_live_…" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Key Secret</p>
              <input type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete="off" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <Button onClick={saveKeys} disabled={busy !== null || !keyId.trim() || !keySecret.trim()} loading={busy === "save"}>
            Check &amp; save
          </Button>
          <p className="text-xs text-slate-400">Until then, checkout offers Cash on Delivery only.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
