"use client";

import { useState } from "react";
import { Layers, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { BUSINESS_MODELS, BUSINESS_MODEL_OPTIONS, type BusinessModel } from "@/lib/business/businessModel";

export default function BusinessModelField({ initial }: { initial: string[] | null }) {
  const [selected, setSelected] = useState<BusinessModel[]>(BUSINESS_MODELS.filter((m) => (initial ?? []).includes(m)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(m: BusinessModel) {
    setSaved(false);
    setSelected((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : BUSINESS_MODELS.filter((x) => x === m || prev.includes(x))));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dealership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_models: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
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
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Layers className="w-4 h-4 text-slate-400" /> How your business makes money
      </p>
      <p className="text-xs text-slate-400">
        Tick everything that applies. Hawlai uses this to set up your lead stages, the details it asks leads for, and how it writes about what you offer.
      </p>
      <div className="space-y-2">
        {BUSINESS_MODELS.map((m) => (
          <label key={m} className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} className="mt-0.5 w-4 h-4 accent-purple-600" />
            <span>
              <span className="text-sm text-slate-800">{BUSINESS_MODEL_OPTIONS[m].label}</span>
              <span className="block text-xs text-slate-400">{BUSINESS_MODEL_OPTIONS[m].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} loading={saving} className="shrink-0">
          {!saving && saved && <Check className="w-4 h-4" />}
          {saved ? "Saved" : "Save"}
        </Button>
        {!selected.length && <span className="text-xs text-amber-500">Nothing ticked — Hawlai will use general settings.</span>}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
