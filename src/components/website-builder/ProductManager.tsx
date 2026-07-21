"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, X, Check, Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  sku: string | null;
  category: string | null;
  inventory_count: number | null;
  is_active: boolean;
}

const EMPTY_FORM = { name: "", description: "", price: "", compareAtPrice: "", images: "", sku: "", category: "", inventoryCount: "" };

export default function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAdding(true);
    setError(null);
  }

  function startEdit(p: Product) {
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      compareAtPrice: p.compare_at_price != null ? String(p.compare_at_price) : "",
      images: (p.images ?? []).join(", "),
      sku: p.sku ?? "",
      category: p.category ?? "",
      inventoryCount: p.inventory_count != null ? String(p.inventory_count) : "",
    });
    setEditingId(p.id);
    setAdding(true);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return setError("Product name is required");
    if (!form.price || isNaN(Number(form.price))) return setError("A valid price is required");
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      description: form.description || null,
      price: form.price,
      compareAtPrice: form.compareAtPrice || null,
      images: form.images.split(",").map((s) => s.trim()).filter(Boolean),
      sku: form.sku || null,
      category: form.category || null,
      inventoryCount: form.inventoryCount || null,
    };
    try {
      const url = editingId ? `/api/products/${editingId}` : "/api/products";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setAdding(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(p: Product) {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x)));
    await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !p.is_active }) });
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading products...</div>;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Package className="w-4 h-4" /> Products ({products.length})</p>
          {!adding && <button onClick={startAdd} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Product</button>}
        </div>

        {adding && (
          <div className="bg-slate-100 rounded-lg p-3 space-y-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price (₹)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
              <input value={form.compareAtPrice} onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })} placeholder="Compare-at price (optional)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            </div>
            <input value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} placeholder="Image URL(s), comma-separated" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            <div className="grid grid-cols-3 gap-2">
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU (optional)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (optional)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
              <input value={form.inventoryCount} onChange={(e) => setForm({ ...form, inventoryCount: e.target.value })} placeholder="Stock (optional)" className="text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={saving} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </button>
              <button onClick={() => { setAdding(false); setEditingId(null); }} className="text-xs text-slate-500 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${p.is_active ? "border-slate-200" : "border-slate-200 opacity-50"}`}>
              <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                <p className="text-xs text-slate-400">₹{Number(p.price).toLocaleString("en-IN")} {p.inventory_count != null && `· ${p.inventory_count} in stock`}</p>
              </div>
              <button onClick={() => toggleActive(p)} className={`text-[10px] px-2 py-1 rounded-full ${p.is_active ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500"}`}>
                {p.is_active ? "Active" : "Hidden"}
              </button>
              <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {products.length === 0 && !adding && <p className="text-xs text-slate-400 text-center py-4">No products yet — add your first one above.</p>}
        </div>
      </div>
    </div>
  );
}
