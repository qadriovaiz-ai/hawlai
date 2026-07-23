"use client";

import { useState, useEffect } from "react";
import { Loader2, ShoppingBag, Phone, Trash2 } from "lucide-react";

interface AbandonedCart {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  items: { name: string; price: number; quantity: number }[];
  contacted: boolean;
  updated_at: string;
}

export default function AbandonedCartsPanel() {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/abandoned-carts")
      .then((r) => r.json())
      .then((d) => setCarts(d.carts ?? []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggleContacted(cart: AbandonedCart) {
    setCarts((prev) => prev.map((c) => (c.id === cart.id ? { ...c, contacted: !c.contacted } : c)));
    await fetch(`/api/abandoned-carts/${cart.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contacted: !cart.contacted }) });
  }

  async function handleDismiss(id: string) {
    setCarts((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/abandoned-carts/${id}`, { method: "DELETE" });
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading abandoned carts...</div>;

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Abandoned Carts ({carts.length})</p>
      <p className="text-xs text-slate-400">Customers who started checkout and shared contact info but didn't complete the order. Follow up by phone or WhatsApp — nothing is sent automatically.</p>

      {carts.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Nothing here yet — abandoned checkouts with contact info will show up here.</p>}

      <div className="space-y-2">
        {carts.map((c) => (
          <div key={c.id} className={`border border-slate-200 rounded-lg p-3 space-y-2 ${c.contacted ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">{c.customer_name || "Unnamed customer"}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  {c.customer_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.customer_phone}</span>}
                  {c.customer_email && <span>{c.customer_phone ? " · " : ""}{c.customer_email}</span>}
                </p>
              </div>
              <p className="text-xs text-slate-400">{new Date(c.updated_at).toLocaleString("en-IN")}</p>
            </div>
            <p className="text-xs text-slate-500">{(c.items ?? []).map((it) => `${it.name} x${it.quantity}`).join(", ")}</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={c.contacted} onChange={() => toggleContacted(c)} className="w-3.5 h-3.5 accent-purple-600" /> Contacted
              </label>
              <button onClick={() => handleDismiss(c.id)} className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 ml-auto"><Trash2 className="w-3.5 h-3.5" /> Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
