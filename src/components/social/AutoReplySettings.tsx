"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Zap, ShoppingBag } from "lucide-react";

// F4, 28 Nov 2026 — three things changed here besides Seller Mode, each a
// way this card used to mislead:
//   * an Instagram-only business could not switch DM auto-reply on: the
//     card required a FACEBOOK PAGE. DMs work on either.
//   * a switch flipped on screen before the server answered and never
//     looked at the answer, so a refused change looked done.
//   * every DM was labelled "Comment" in the log — the rows say
//     dm_instagram / dm_facebook, and the label tested for exactly "dm".

type Settings = {
  dmEnabled: boolean;
  commentEnabled: boolean;
  sellingEnabled: boolean;
  upiVpa: string | null;
  shippingFee: number;
  instagramConnected: boolean;
  facebookConnected: boolean;
  takesOrders: boolean;
  log: any[];
};

export default function AutoReplySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vpaInput, setVpaInput] = useState("");
  const [vpaNote, setVpaNote] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [feeNote, setFeeNote] = useState<string | null>(null);

  async function load() {
    const d = await fetch("/api/social/auto-reply-settings").then((r) => r.json());
    if (d?.error) {
      setError(d.error);
      return;
    }
    setS(d);
    setVpaInput(d.upiVpa ?? "");
    setFeeInput(d.shippingFee ? String(d.shippingFee) : "");
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  /** Ask the server, and show what it ANSWERED — never what was hoped. */
  async function save(change: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    // EVERY "Saved." NOTE GOES (28 Nov 2026). Each field cleared only its
    // own, so after saving the delivery fee a FAILED UPI save showed its
    // error beside the fee's old "Saved." — which read as the UPI ID saved.
    // A note appears again only for the save that just succeeded.
    setVpaNote(null);
    setFeeNote(null);
    try {
      const res = await fetch("/api/social/auto-reply-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error ?? "That change wasn't saved.");
        return false;
      }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveVpa() {
    setVpaNote(null);
    if (await save({ upiVpa: vpaInput })) setVpaNote("Saved.");
  }

  async function saveFee() {
    setFeeNote(null);
    if (await save({ shippingFee: feeInput })) setFeeNote("Saved.");
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading auto-reply settings...</div>;
  if (!s) return <div className="card p-5 text-sm text-red-400">{error ?? "Couldn't load auto-reply settings."}</div>;

  const anyAccount = s.instagramConnected || s.facebookConnected;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Real Auto-Reply (live, no review)</p>

      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          When ON, AI-generated replies are sent to real customers automatically — nobody reviews them first. Turning this ON is your approval for every message it sends. You can turn it off anytime; existing conversations aren't affected.
        </p>
      </div>

      {!anyAccount && (
        <p className="text-xs text-red-400">Connect Instagram or your Facebook Page first (Settings → Integrations) before enabling auto-reply.</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">DM Auto-Reply</p>
            <p className="text-xs text-slate-400">Automatically reply to Instagram and Messenger DMs</p>
          </div>
          <input type="checkbox" checked={s.dmEnabled} disabled={saving || !anyAccount} onChange={(e) => save({ dmEnabled: e.target.checked })} className="w-5 h-5 accent-purple-600" />
        </label>
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Comment Auto-Reply</p>
            <p className="text-xs text-slate-400">Automatically reply to public comments on your Facebook Page</p>
          </div>
          <input type="checkbox" checked={s.commentEnabled} disabled={saving || !s.facebookConnected} onChange={(e) => save({ commentEnabled: e.target.checked })} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {/* SELLER MODE — F4. Its own switch: answering DMs and asking
          customers for money are different promises. */}
      <div className="pt-3 border-t border-slate-200 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShoppingBag className="w-4 h-4 text-purple-500" /> Seller Mode — take orders in Instagram DMs</p>
        <p className="text-xs text-slate-400">
          Customers order inside your Instagram DMs and pay your own UPI ID directly — no gateway, no cut. You confirm each payment on WhatsApp.
        </p>
        {!s.takesOrders && (
          <p className="text-xs text-amber-700 bg-amber-500/10 rounded-lg p-2">
            Order-taking is still being built. You can save your UPI ID and switch this on now; Hawlai will start taking orders when it's ready, and not before.
          </p>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">Your UPI ID</p>
          <div className="flex gap-2">
            <input
              value={vpaInput}
              onChange={(e) => setVpaInput(e.target.value)}
              placeholder="yourname@okhdfcbank"
              className="flex-1 p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={saveVpa} disabled={saving} className="text-xs px-3 rounded-lg bg-purple-600 text-white disabled:opacity-50">Save</button>
          </div>
          <p className="text-[11px] text-slate-400">Copy it from your UPI app. Customers' payments go straight to it — check it carefully.</p>
          {vpaNote && <p className="text-xs text-green-600">{vpaNote}</p>}
        </div>

        {/* Migration 243 — the founder's call: one flat number, not the
            website builder's shipping system. */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">Delivery fee for DM orders (optional)</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-1 p-2 text-xs bg-slate-100 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-purple-500">
              <span className="text-slate-500">₹</span>
              <input
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="flex-1 bg-transparent text-slate-900 focus:outline-none"
              />
            </div>
            <button onClick={saveFee} disabled={saving} className="text-xs px-3 rounded-lg bg-purple-600 text-white disabled:opacity-50">Save</button>
          </div>
          <p className="text-[11px] text-slate-400">Added to every Instagram order. Leave it empty for free delivery.</p>
          {feeNote && <p className="text-xs text-green-600">{feeNote}</p>}
        </div>

        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Seller Mode</p>
            <p className="text-xs text-slate-400">Needs Instagram connected, your UPI ID saved, and DM auto-reply on</p>
          </div>
          <input type="checkbox" checked={s.sellingEnabled} disabled={saving} onChange={(e) => save({ sellingEnabled: e.target.checked })} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {s.log.length > 0 && (
        <div className="pt-2 border-t border-slate-200 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400">Recent auto-sent replies</p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {s.log.map((l) => (
              <div key={l.id} className={`text-xs rounded-lg p-2 ${l.success ? "bg-slate-200" : "bg-red-500/10"}`}>
                <span className="font-medium text-slate-600">{String(l.channel ?? "").startsWith("dm") ? "DM" : "Comment"}:</span>{" "}
                {l.success ? <span className="text-slate-700">{l.reply_text}</span> : <span className="text-red-400">Failed — {l.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
