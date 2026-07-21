"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Tag, X, Check } from "lucide-react";

interface DiscountCode {
  id: string;
  code: string;
  discount_type: string;
  value: number;
  min_order_value: number | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
}

const EMPTY_FORM = { code: "", discountType: "percentage", value: "", minOrderValue: "", maxUses: "", expiresAt: "" };

export default function OffersPanel() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/discounts")
      .then((r) => r.json())
      .then((d) => setCodes(d.codes ?? []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleSave() {
    if (!form.code.trim()) return setError("Code is required, e.g. WELCOME10");
    if (!form.value || isNaN(Number(form.value))) return setError("A valid discount value is required");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discountType: form.discountType,
          value: form.value,
          minOrderValue: form.minOrderValue || null,
          maxUses: form.maxUses || null,
          expiresAt: form.expiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setAdding(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: DiscountCode) {
    setCodes((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
    await fetch(`/api/discounts/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !c.is_active }) });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this code?")) return;
    await fetch(`/api/discounts/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading offers...</div>;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Tag className="w-4 h-4" /> Discount Codes ({codes.length})</p>
          {!adding && <button onClick={() => setAdding(true)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New Code</button>}
        </div>

        {adding && (
          <div className="bg-slate-100 rounded-lg p-3 space-y-2">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CODE, e.g. WELCOME10" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2">
                <option value="percentage">% Percentage off</option>
                <option value="fixed">₹ Fixed amount off</option>
              </select>
              <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.discountType === "percentage" ? "10 (for 10%)" : "100 (for ₹100)"} className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} placeholder="Min order ₹ (optional)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
              <input value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="Max uses (optional)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            </div>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={saving} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </button>
              <button onClick={() => { setAdding(false); setForm(EMPTY_FORM); setError(null); }} className="text-xs text-slate-500 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 ${!c.is_active ? "opacity-50" : ""}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 font-mono">{c.code}</p>
                <p className="text-xs text-slate-400">
                  {c.discount_type === "percentage" ? `${c.value}% off` : `₹${c.value} off`}
                  {c.min_order_value ? ` · min ₹${c.min_order_value}` : ""}
                  {" · used "}{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}
                  {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString("en-IN")}` : ""}
                </p>
              </div>
              <button onClick={() => toggleActive(c)} className={`text-[10px] px-2 py-1 rounded-full ${c.is_active ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500"}`}>
                {c.is_active ? "Active" : "Inactive"}
              </button>
              <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {codes.length === 0 && !adding && <p className="text-xs text-slate-400 text-center py-4">No discount codes yet — create one to run an offer.</p>}
        </div>
      </div>
    </div>
  );
}
