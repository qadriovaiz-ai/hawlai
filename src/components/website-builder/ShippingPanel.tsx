"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Truck, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { loadSettings, shippingFromWebsite, shippingSaveBody, type LoadResult, type ShippingMode, type ShippingSettings } from "@/lib/settingsLoad";

const MODES: { key: ShippingMode; label: string; description: string }[] = [
  { key: "free", label: "Always Free", description: "No shipping charge, ever." },
  { key: "flat", label: "Flat Rate", description: "One fixed shipping fee on every order." },
  { key: "free_above", label: "Free Above ₹X", description: "Flat rate below the threshold, free at or above it." },
];

// Save is only possible once the stored settings have loaded — a failed
// load used to leave "Always Free" on screen and save it over the real
// settings (settingsLoad.ts).
export default function ShippingPanel() {
  const [load, setLoad] = useState<LoadResult<ShippingSettings> | null>(null);
  const [mode, setMode] = useState<ShippingMode>("free");
  const [rate, setRate] = useState("");
  const [freeThreshold, setFreeThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoad(null);
    const r = await loadSettings("/api/website-builder/generate", shippingFromWebsite, "Create your website first — shipping settings are saved with it.");
    if (r.ok) {
      setMode(r.data.mode);
      setRate(r.data.rate);
      setFreeThreshold(r.data.freeThreshold);
    }
    setLoad(r);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSave() {
    const body = shippingSaveBody(load, { mode, rate, freeThreshold });
    if (!body) return; // never save over settings that didn't load
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const r = await fetch("/api/website-builder/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't save shipping settings");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (load === null) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  if (!load.ok) {
    return (
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping</p>
        <p className="text-sm text-amber-500 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {load.error}</p>
        <p className="text-xs text-slate-400">Nothing was changed — your shipping settings are exactly as they were.</p>
        <Button onClick={refresh}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping</p>

      <div className="space-y-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`w-full text-left p-3 rounded-lg border ${mode === m.key ? "border-purple-500 bg-purple-50" : "border-slate-300 bg-slate-200"}`}
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

      <Button onClick={handleSave} disabled={saving} loading={saving}>
        {!saving && saved && <Check className="w-4 h-4" />} {saved ? "Saved" : "Save"}
      </Button>
    </div>
  );
}
