"use client";

import { useState, useEffect } from "react";
import { Loader2, Compass } from "lucide-react";
import { MODE_LABELS, MODE_DESCRIPTIONS, type ProductMode } from "@/lib/onboarding/intentRouter";

const MODES: ProductMode[] = ["full", "calling", "marketing", "automation", "research", "website"];

// UX Transformation, piece 4 — the optional switcher.
//
// Every business that existed before this shipped has product_mode =
// null and stays on the full product (confirmed decision: no forced
// re-onboarding for working accounts). This is how they can opt into
// a focused experience if they want one — and how anyone who picked
// wrong at signup can change it.
export default function ProductModeCard() {
  const [mode, setMode] = useState<ProductMode | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dealership")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) setMode((d.product_mode as ProductMode | null) ?? null);
        else setMode(null);
      })
      .catch(() => setMode(null));
  }, []);

  async function pick(next: ProductMode) {
    if (next === mode) return;
    setSaving(true);
    setError(null);
    const previous = mode;
    setMode(next);
    try {
      const res = await fetch("/api/dealership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_mode: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save");
    } catch (err: any) {
      setMode(previous); // revert the optimistic update
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === undefined) {
    return (
      <div className="card p-5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Compass className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">What you mainly use Hawlai for</p>
      </div>
      <p className="text-xs text-slate-400">
        Helps Hawlai lead with what matters to you. Nothing is removed either way — everything stays available.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODES.map((m) => {
          const active = mode === m || (mode === null && m === "full");
          return (
            <button
              key={m}
              onClick={() => pick(m)}
              disabled={saving}
              className={`text-left rounded-lg border p-3 transition-colors disabled:opacity-50 ${
                active ? "border-brand-500/60 bg-brand-500/5" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className={`text-xs font-semibold ${active ? "text-brand-600" : "text-slate-700"}`}>
                {MODE_LABELS[m]}
              </p>
              <p className="text-[10.5px] text-slate-400 mt-0.5 leading-snug">{MODE_DESCRIPTIONS[m]}</p>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
