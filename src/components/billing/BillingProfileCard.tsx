"use client";

import { useState, useEffect } from "react";
import { Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface BillingProfile {
  legal_business_name: string | null;
  gstin: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_pincode: string | null;
  billing_email: string | null;
}

const EMPTY: BillingProfile = {
  legal_business_name: "", gstin: "",
  billing_address_line1: "", billing_address_line2: "",
  billing_city: "", billing_state: "", billing_pincode: "", billing_email: "",
};

const FIELDS: { key: keyof BillingProfile; label: string; placeholder: string; wide?: boolean }[] = [
  { key: "legal_business_name", label: "Registered business name", placeholder: "As it appears on your GST certificate or PAN", wide: true },
  { key: "gstin", label: "GSTIN (if you have one)", placeholder: "27AAPFU0939F1ZV", wide: true },
  { key: "billing_address_line1", label: "Address", placeholder: "Building, street", wide: true },
  { key: "billing_address_line2", label: "Address line 2", placeholder: "Area, landmark", wide: true },
  { key: "billing_city", label: "City", placeholder: "Mumbai" },
  { key: "billing_state", label: "State", placeholder: "Maharashtra" },
  { key: "billing_pincode", label: "PIN code", placeholder: "400001" },
  { key: "billing_email", label: "Billing email", placeholder: "accounts@yourbusiness.com" },
];

// Phase 4 / 1a — a business's own legal identity for invoicing.
// Deliberately optional: most small businesses won't have a GSTIN,
// and nothing in the product should be gated behind filling this in.
export default function BillingProfileCard() {
  const [form, setForm] = useState<BillingProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/billing/profile")
      .then(async (r) => {
        const d = await r.json();
        // A non-owner (team member) gets 403 here — that's expected,
        // and the card simply doesn't render for them.
        if (!r.ok) return setForm(null);
        setForm({ ...EMPTY, ...(d.profile ?? {}) });
      })
      .catch(() => setForm(null));
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/billing/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (form === null) return null;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Billing details</p>
      </div>
      <p className="text-xs text-slate-400">
        Used on your invoices. Optional — fill this in if you need invoices in your registered business name, or need your GSTIN on them.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{f.label}</label>
            <input
              type="text"
              value={form[f.key] ?? ""}
              onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setSaved(false); }}
              placeholder={f.placeholder}
              className="input text-sm"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {saved && <p className="text-xs text-green-500">Saved.</p>}

      <Button onClick={save} loading={saving} size="sm">Save billing details</Button>
    </div>
  );
}
