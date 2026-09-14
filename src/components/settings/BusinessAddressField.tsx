"use client";

import { useState } from "react";
import { MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui";

export default function BusinessAddressField({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/dealership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_address: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setValue(data.business_address ?? "");
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
      <label htmlFor="business-address" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-slate-400" /> Business Address
      </label>
      <p className="text-xs text-slate-400">
        Printed in the footer of every marketing email, next to the unsubscribe link. Marketing emails can't be sent until it's set.
      </p>
      <div className="flex items-start gap-2">
        <textarea
          id="business-address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="e.g. 12 Hazratganj, Lucknow, Uttar Pradesh 226001"
          className="bg-slate-100 text-slate-900 flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <Button onClick={handleSave} loading={saving} className="shrink-0">
          {!saving && saved && <Check className="w-4 h-4" />}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
      {!value.trim() && <p className="text-xs text-amber-500">No address yet — marketing emails are paused until you add one.</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
