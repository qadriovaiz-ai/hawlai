"use client";

import { useState, useEffect } from "react";
import { Loader2, ClipboardList } from "lucide-react";
import OrderMessageBox from "./OrderMessageBox";
import type { ChannelSummary } from "@/lib/orders/summary";

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
  /** Where the order came from — migration 242. Website for every order before Seller Mode. */
  channel?: string;
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
  // Stats (28 Nov 2026): undefined while loading, null when it couldn't be read.
  const [summary, setSummary] = useState<ChannelSummary[] | null | undefined>(undefined);
  const [summaryDays, setSummaryDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? []);
        setSummary(d.summary ?? null);
        if (d.summaryDays) setSummaryDays(d.summaryDays);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  // THE SERVER'S ANSWER IS READ, Seller Mode O2 (28 Nov 2026). Both used to
  // change the screen and never look at the reply, so a refused change
  // looked done — the same fault F4 fixed on the auto-reply switches.
  async function patchOrder(id: string, body: Record<string, string>, optimistic: Partial<Order>) {
    setError(null);
    setNotice(null);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...optimistic } : o)));
    const res = await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setError(d?.error ?? "That change wasn't saved.");
      load();
      return;
    }
    // THE ROW AS THE SERVER LEFT IT: confirming an Instagram payment also
    // moves the order to confirmed, which the optimistic change can't know.
    if (d?.order) setOrders((prev) => prev.map((o) => (o.id === id ? d.order : o)));
    if (d?.note) setNotice(d.note);
  }

  const updateStatus = (id: string, status: string) => patchOrder(id, { status }, { status });
  const markPaid = (id: string) => patchOrder(id, { paymentStatus: "paid" }, { payment_status: "paid" });

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading orders...</div>;

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Orders ({orders.length})</p>

      {orders.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No orders yet — they'll show up here the moment someone checks out on your store.</p>}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* ORDERS BY CHANNEL — the last N days, said on screen. */}
      {summary === null && <p className="text-[11px] text-slate-400">The order summary couldn't be loaded just now.</p>}
      {summary && summary.some((s) => s.orders > 0) && (
        <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-600">Last {summaryDays} days, by where the order came from</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left">
                <th className="font-medium py-1"></th>
                <th className="font-medium py-1">Orders</th>
                <th className="font-medium py-1">Paid</th>
                <th className="font-medium py-1">Awaiting payment</th>
                <th className="font-medium py-1">Cancelled</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {summary.map((s) => (
                <tr key={s.channel}>
                  <td className="py-1">{s.channel === "instagram" ? "Instagram" : "Website"}</td>
                  <td className="py-1 tabular-nums">{s.orders}</td>
                  <td className="py-1 tabular-nums">{s.paidCount} · ₹{s.paidAmount.toLocaleString("en-IN")}</td>
                  <td className="py-1 tabular-nums">{s.awaitingCount} · ₹{s.awaitingAmount.toLocaleString("en-IN")}</td>
                  <td className="py-1 tabular-nums">{s.cancelled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notice && <p className="text-xs text-green-600">{notice}</p>}

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
              <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full border-0 ${STATUS_COLORS[o.status] ?? "bg-slate-200"}`}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className={`text-[10px] px-2 py-1 rounded-full ${o.payment_status === "paid" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                {o.payment_method.toUpperCase()} · {o.payment_status}
              </span>
              {o.channel === "instagram" && <span className="text-[10px] px-2 py-1 rounded-full bg-pink-100 text-pink-600">Instagram</span>}
              {/* An Instagram order's "Payment received" IS the seller confirming the UPI payment: stock moves and the customer gets their invoice (O3). */}
              {o.payment_status !== "paid" && o.channel === "instagram" && o.status !== "cancelled" && (
                <button onClick={() => markPaid(o.id)} className="text-[10px] text-purple-500 hover:underline">Payment received</button>
              )}
              {o.payment_status !== "paid" && (o.channel ?? "website") === "website" && (
                <button onClick={() => markPaid(o.id)} className="text-[10px] text-purple-500 hover:underline">Mark as paid</button>
              )}
              {/* O5: telling the customer, sent by the seller (key on status so the draft follows it). */}
              {o.channel === "instagram" && <OrderMessageBox key={`${o.id}:${o.status}`} orderId={o.id} status={o.status} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
