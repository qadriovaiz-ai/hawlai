"use client";

import { useState, useEffect } from "react";
import { Loader2, ClipboardList } from "lucide-react";

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  items: { name: string; price: number; quantity: number }[];
  subtotal?: number;
  discount_code?: string | null;
  discount_amount?: number;
  shipping_amount?: number;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
  created_at: string;
}

const STATUS_OPTIONS = ["new", "confirmed", "shipped", "delivered", "cancelled"];
const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-600",
  confirmed: "bg-amber-100 text-amber-600",
  shipped: "bg-purple-100 text-purple-600",
  delivered: "bg-green-100 text-green-600",
  cancelled: "bg-red-100 text-red-600",
};

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  async function markPaid(id: string) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, payment_status: "paid" } : o)));
    await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentStatus: "paid" }) });
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading orders...</div>;

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Orders ({orders.length})</p>

      {orders.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No orders yet — they'll show up here the moment someone checks out on your store.</p>}

      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">{o.customer_name} · {o.customer_phone}</p>
                <p className="text-xs text-slate-400">{new Date(o.created_at).toLocaleString("en-IN")}</p>
              </div>
              <p className="text-sm font-bold text-slate-700">₹{Number(o.total).toLocaleString("en-IN")}</p>
            </div>
            <p className="text-xs text-slate-500">{(o.items ?? []).map((it) => `${it.name} x${it.quantity}`).join(", ")}</p>
            {o.discount_code && <p className="text-xs text-green-500">Code {o.discount_code} applied (-₹{o.discount_amount})</p>}
            {!!o.shipping_amount && <p className="text-xs text-slate-400">Shipping: ₹{o.shipping_amount}</p>}
            <p className="text-xs text-slate-400">Deliver to: {o.shipping_address}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full border-0 ${STATUS_COLORS[o.status] ?? "bg-slate-100"}`}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className={`text-[10px] px-2 py-1 rounded-full ${o.payment_status === "paid" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                {o.payment_method.toUpperCase()} · {o.payment_status}
              </span>
              {o.payment_status !== "paid" && (
                <button onClick={() => markPaid(o.id)} className="text-[10px] text-purple-500 hover:underline">Mark as paid</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
