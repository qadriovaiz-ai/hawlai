"use client";

// Instagram Store → Shipping (S3, 28 Nov 2026): the flat delivery fee for
// DM orders (migration 243), moved here from the Auto-Reply card. It is
// the ONLY shipping rule for Instagram orders; the website's own shipping
// rules live in Website & Products → Shipping and are not used here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSellerSettings } from "./useSellerSettings";

export default function DeliveryFeeSettings() {
  const { s, loading, saving, error, save } = useSellerSettings();
  const [feeInput, setFeeInput] = useState("");
  const [feeNote, setFeeNote] = useState<string | null>(null);

  useEffect(() => {
    if (s) setFeeInput(s.shippingFee ? String(s.shippingFee) : "");
  }, [s?.shippingFee]);

  async function saveFee() {
    // A note only for a save the server accepted — never left over.
    setFeeNote(null);
    if (await save({ shippingFee: feeInput })) setFeeNote("Saved.");
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (!s) return <div className="card p-5 text-sm text-red-400">{error ?? "Couldn't load these settings."}</div>;

  return (
    <div className="card p-5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Delivery fee for Instagram orders</p>
        <p className="text-xs text-slate-400">
          One flat amount added to every order placed in your Instagram DMs. Leave it empty for free delivery. Your website's shipping rules are separate — they're in{" "}
          <Link href="/dashboard/website-builder?tab=shipping" className="text-purple-500 hover:underline">Website &amp; Products → Shipping</Link>.
        </p>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
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
      {feeNote && <p className="text-xs text-green-600">{feeNote}</p>}
    </div>
  );
}
