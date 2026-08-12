"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Users, Check, Copy, Tag, IndianRupee } from "lucide-react";

export default function AffiliateManagerView() {
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  const [commissionType, setCommissionType] = useState("percentage");
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    fetch("/api/affiliates").then((r) => r.json()).then((d) => setAffiliates(d.affiliates ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function addAffiliate() {
    if (!name.trim()) return;
    await fetch("/api/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, commissionRate: Number(commissionRate), commissionType }),
    });
    setName(""); setEmail(""); setPhone(""); setShowForm(false);
    load();
  }

  async function approve(id: string) {
    setBusy(id);
    try {
      await fetch("/api/affiliates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "approve" }) });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(id: string, currentPaid: number, owed: number) {
    await fetch("/api/affiliates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, totalPaid: currentPaid + owed }) });
    load();
  }

  const pending = affiliates.filter((a) => a.status === "pending");
  const active = affiliates.filter((a) => a.status !== "pending");
  const totalOwed = affiliates.reduce((s, a) => s + Math.max(0, Number(a.commission_owed) || 0), 0);
  const totalRevenue = affiliates.reduce((s, a) => s + (Number(a.real_revenue) || 0), 0);

  if (loading) return <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3"><IndianRupee className="w-4 h-4" /> Affiliate Program Summary</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">{active.length}</p>
            <p className="text-xs text-slate-400">Active Affiliates</p>
          </div>
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">₹{totalRevenue.toLocaleString("en-IN")}</p>
            <p className="text-xs text-slate-400">Revenue Driven</p>
          </div>
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">₹{totalOwed.toLocaleString("en-IN")}</p>
            <p className="text-xs text-slate-400">Commission Owed</p>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Pending applications ({pending.length})</p>
          {pending.map((a) => (
            <div key={a.id} className="bg-slate-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                <p className="text-xs text-slate-400">{a.email || a.phone}{a.notes ? ` · ${a.notes}` : ""}</p>
              </div>
              <button onClick={() => approve(a.id)} disabled={busy === a.id} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4" /> Affiliates</p>
          <button onClick={() => setShowForm(!showForm)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>

        {showForm && (
          <div className="space-y-2 bg-slate-200 rounded-lg p-3">
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <div className="flex gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2" />
              <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)} className="text-sm bg-white border border-slate-200 rounded-lg px-2 py-2">
                <option value="percentage">% of sale</option>
                <option value="fixed">₹ per order</option>
              </select>
              <input value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} type="number" className="w-20 text-sm bg-white border border-slate-200 rounded-lg px-2 py-2" />
            </div>
            <button onClick={addAffiliate} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg">Add & generate code</button>
          </div>
        )}

        {active.length === 0 ? (
          <p className="text-xs text-slate-400">No affiliates yet.</p>
        ) : (
          <div className="space-y-2">
            {active.map((a) => (
              <div key={a.id} className="bg-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{a.name} <span className="text-xs text-slate-400 font-normal">{a.commission_type === "percentage" ? `${a.commission_rate}%` : `₹${a.commission_rate}/order`}</span></p>
                  {a.discount_code && (
                    <span className="flex items-center gap-1 text-xs font-mono bg-slate-200 px-2 py-1 rounded">
                      <Tag className="w-3 h-3" /> {a.discount_code}
                      <button onClick={() => navigator.clipboard.writeText(a.discount_code)}><Copy className="w-3 h-3 text-slate-400 hover:text-slate-600" /></button>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-400">Orders:</span> <span className="font-semibold text-slate-700">{a.real_orders_count ?? 0}</span></div>
                  <div><span className="text-slate-400">Revenue:</span> <span className="font-semibold text-slate-700">₹{(Number(a.real_revenue) || 0).toLocaleString("en-IN")}</span></div>
                  <div><span className="text-slate-400">Owed:</span> <span className="font-semibold text-slate-700">₹{(Number(a.commission_owed) || 0).toLocaleString("en-IN")}</span></div>
                </div>
                {Number(a.commission_owed) > 0 && (
                  <button onClick={() => markPaid(a.id, Number(a.total_paid) || 0, Number(a.commission_owed))} className="text-xs text-emerald-600 hover:text-emerald-500">
                    Mark ₹{Number(a.commission_owed).toLocaleString("en-IN")} as paid
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
