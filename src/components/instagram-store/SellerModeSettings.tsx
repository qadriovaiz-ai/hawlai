"use client";

// Instagram Store → Settings (S5, 28 Nov 2026): the Seller Mode switch and
// the seller's UPI ID, moved here from the Auto-Reply card. The same route
// and the same rules: switching on needs Instagram, a UPI ID and DM
// auto-reply; switching off is never refused.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSellerSettings } from "./useSellerSettings";

export default function SellerModeSettings() {
  const { s, loading, saving, error, save } = useSellerSettings();
  const [vpaInput, setVpaInput] = useState("");
  const [vpaNote, setVpaNote] = useState<string | null>(null);

  useEffect(() => {
    if (s) setVpaInput(s.upiVpa ?? "");
  }, [s?.upiVpa]);

  async function saveVpa() {
    // A note only for a save the server accepted — never left over.
    setVpaNote(null);
    if (await save({ upiVpa: vpaInput })) setVpaNote("Saved.");
  }

  async function toggle(on: boolean) {
    setVpaNote(null);
    await save({ sellingEnabled: on });
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (!s) return <div className="card p-5 text-sm text-red-400">{error ?? "Couldn't load these settings."}</div>;

  return (
    <div className="card p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700">Seller Mode — take orders in Instagram DMs</p>
        <p className="text-xs text-slate-400">
          Customers order inside your Instagram DMs and pay your own UPI ID directly — no gateway, no cut. You confirm each payment, and stock moves when you do.
        </p>
      </div>
      {!s.takesOrders && (
        <p className="text-xs text-amber-700 bg-amber-500/10 rounded-lg p-2">
          Order-taking is still being built. You can save your UPI ID and switch this on now; Hawlai will start taking orders when it's ready, and not before.
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}

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

      <label className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Seller Mode</p>
          <p className="text-xs text-slate-400">Needs Instagram connected, your UPI ID saved, and DM auto-reply on</p>
        </div>
        <input type="checkbox" checked={s.sellingEnabled} disabled={saving} onChange={(e) => toggle(e.target.checked)} className="w-5 h-5 accent-purple-600" />
      </label>
      {!s.dmEnabled && (
        <p className="text-[11px] text-slate-400">
          DM auto-reply is off — switch it on in <Link href="/dashboard/social" className="text-purple-500 hover:underline">Social → Auto-Reply</Link>.
        </p>
      )}
    </div>
  );
}
