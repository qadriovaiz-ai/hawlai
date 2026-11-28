"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

  async function load() {
    const d = await fetch("/api/social/auto-reply-settings").then((r) => r.json());
    if (d?.error) {
      setError(d.error);
      return;
    }
    setS(d);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  /** Ask the server, and show what it ANSWERED — never what was hoped. */
  async function save(change: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
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

      {/* SELLER MODE moved to Instagram Store (S5, 28 Nov 2026) — the
          switch, the UPI ID and the delivery fee live there now, on the
          same route and the same rules. */}
      <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <ShoppingBag className="w-4 h-4 text-purple-500" />
          Seller Mode {s.sellingEnabled ? "is on" : "is off"}. Your UPI ID, delivery fee and policies are in Instagram Store.
        </p>
        <Link href="/dashboard/instagram-store?tab=settings" className="text-xs text-purple-500 hover:underline shrink-0">Open Instagram Store</Link>
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
