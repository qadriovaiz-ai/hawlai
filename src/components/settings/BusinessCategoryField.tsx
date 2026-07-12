"use client";

import { useState } from "react";
import { Briefcase, Loader2, Check } from "lucide-react";

const SUGGESTIONS = ["Car Dealership", "Real Estate", "Restaurant", "Coaching Institute", "Salon / Spa", "Clinic", "Retail Store"];

export default function BusinessCategoryField({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "Car Dealership");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(newValue?: string) {
    const toSave = newValue ?? value;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/dealership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_category: toSave }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setValue(toSave);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-slate-400" /> Business Type
      </label>
      <p className="text-xs text-slate-400">
        Every AI-generated ad, post, email, and page uses this — set it once so everything sounds right for your actual business, not just car dealerships.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Car Dealership, Real Estate, Restaurant"
          className="bg-slate-100 text-slate-900 flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={() => handleSave()} disabled={saving} className="btn-primary text-sm shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleSave(s)}
            className="text-xs text-slate-500 hover:text-purple-600 bg-slate-50 hover:bg-purple-500/10 px-2.5 py-1 rounded-full transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
