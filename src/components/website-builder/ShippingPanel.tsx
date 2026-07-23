"use client";

import { useState, useEffect } from "react";
import { Loader2, Truck, Check } from "lucide-react";

const MODES: { key: string; label: string; description: string }[] = [
  { key: "free", label: "Always Free", description: "No shipping charge, ever." },
  { key: "flat", label: "Flat Rate", description: "One fixed shipping fee on every order." },
  { key: "free_above", label: "Free Above ₹X", description: "Flat rate below the threshold, free at or above it." },
];

export default function ShippingPanel() {
  const [mode, setMode] = useState("free");
  const [rate, setRate] = useState("");
  const [freeThreshold, setFreeThreshold] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/website-builder/generate")
      .then((r) => r.json())
      .then((d) => {
        const website = d.website ?? {};
        setMode(website.shipping_mode ?? "free");
        setRate(website.shipping_rate != null ? String(website.shipping_rate) : "");
        setFreeThreshold(website.shipping_free_threshold != null ? String(website.shipping_free_threshold) : "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const r = await fetch("/api/website-builder/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingMode: mode,
          shippingRate: mode === "free" ? 0 : (rate || 0),
          shippingFreeThreshold: mode === "free_above" ? (freeThreshold || 0) : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't save shipping settings");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping</p>

      <div className="space-y-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`w-full text-left p-3 rounded-lg border ${mode === m.key ? "border-purple-500 bg-purple-50" : "border-slate-200 bg-slate-100"}`}
          >
            <p className="text-sm font-semibold text-slate-700">{m.label}</p>
            <p className="text-xs text-slate-400">{m.description}</p>
          </button>
        ))}
      </div>

      {(mode === "flat" || mode === "free_above") && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Shipping rate (₹)</p>
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 60" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
        </div>
      )}

      {mode === "free_above" && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Free shipping when order value is at or above (₹)</p>
          <input value={freeThreshold} onChange={(e) => setFreeThreshold(e.target.value)} placeholder="e.g. 999" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button onClick={handleSave} disabled={saving} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null} {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
