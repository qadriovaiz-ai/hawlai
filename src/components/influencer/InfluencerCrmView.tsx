"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, ArrowRight, TrendingUp, Users, Tag, Copy, Check } from "lucide-react";

const STATUSES = ["identified", "contacted", "negotiating", "agreed", "active", "completed", "declined"];

export default function InfluencerCrmView() {
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");

  function load() {
    fetch("/api/influencer-crm").then((r) => r.json()).then((d) => setInfluencers(d.influencers ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function addInfluencer() {
    if (!name.trim()) return;
    await fetch("/api/influencer-crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, handle, platform }) });
    setName(""); setHandle(""); setShowForm(false);
    load();
  }

  async function updateField(id: string, field: string, value: any) {
    setInfluencers((prev) => prev.map((i) => (i.id === id ? { ...i, [fieldToDb(field)]: value } : i)));
    await fetch("/api/influencer-crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, [field]: value }) });
  }
  function fieldToDb(field: string) {
    const map: Record<string, string> = { agreedAmount: "agreed_amount", leadsGenerated: "leads_generated", revenueGenerated: "revenue_generated", campaignName: "campaign_name", discountCode: "discount_code" };
    return map[field] ?? field;
  }

  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  async function generateCode(id: string) {
    setGeneratingFor(id);
    try {
      const res = await fetch("/api/influencer-crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, generateCode: true }) });
      const data = await res.json();
      if (data.discountCode) setInfluencers((prev) => prev.map((i) => (i.id === id ? { ...i, discount_code: data.discountCode, real_orders_count: 0, real_revenue: 0 } : i)));
    } finally {
      setGeneratingFor(null);
    }
  }

  async function remove(id: string) {
    setInfluencers((prev) => prev.filter((i) => i.id !== id));
    await fetch("/api/influencer-crm", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const totalCost = influencers.reduce((s, i) => s + (Number(i.agreed_amount) || 0), 0);
  const totalRevenue = influencers.reduce((s, i) => s + (i.discount_code ? Number(i.real_revenue) || 0 : Number(i.revenue_generated) || 0), 0);
  const overallRoi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : null;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/social" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Users className="w-4 h-4 text-purple-400" /> Find Influencers & Outreach Messages/Emails</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      {/* ROI summary */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3"><TrendingUp className="w-4 h-4" /> Overall ROI</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">₹{totalCost.toLocaleString("en-IN")}</p>
            <p className="text-xs text-slate-400">Total Spent</p>
          </div>
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">₹{totalRevenue.toLocaleString("en-IN")}</p>
            <p className="text-xs text-slate-400">Revenue Generated</p>
          </div>
          <div className="bg-slate-200 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-slate-800">{overallRoi !== null ? `${overallRoi.toFixed(0)}%` : "—"}</p>
            <p className="text-xs text-slate-400">ROI</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">Revenue is pulled automatically from real orders for any influencer with a tracking code below — manual cost/leads/revenue fields are for collaborations without one (e.g. WhatsApp-only orders).</p>
      </div>

      {/* Add influencer */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Collaboration Pipeline</p>
          <button onClick={() => setShowForm(!showForm)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        {showForm && (
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Influencer name" className="flex-1 min-w-[140px] text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" className="flex-1 min-w-[100px] text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="facebook">Facebook</option>
              <option value="other">Other</option>
            </select>
            <button onClick={addInfluencer} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg">Save</button>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
        ) : influencers.length === 0 ? (
          <p className="text-xs text-slate-400">No influencers added yet.</p>
        ) : (
          <div className="space-y-2">
            {influencers.map((inf) => {
              const revenueForRoi = inf.discount_code ? Number(inf.real_revenue) || 0 : Number(inf.revenue_generated) || 0;
              const roi = inf.agreed_amount > 0 ? ((revenueForRoi - inf.agreed_amount) / inf.agreed_amount) * 100 : null;
              return (
                <div key={inf.id} className="bg-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{inf.name} <span className="text-xs text-slate-400 font-normal">{inf.handle} · {inf.platform}</span></p>
                    </div>
                    <button onClick={() => remove(inf.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <select value={inf.status} onChange={(e) => updateField(inf.id, "status", e.target.value)} className="text-xs bg-slate-200 border border-slate-300 rounded-lg px-2 py-1.5">
                    {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>

                  {/* Real, automatic attribution via a discount code — replaces
                      guesswork with actual order data once a code exists. */}
                  {inf.discount_code ? (
                    <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <Tag className="w-3.5 h-3.5" /> Tracking code: {inf.discount_code}
                        </span>
                        <CopyCodeButton code={inf.discount_code} />
                      </div>
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold">{inf.real_orders_count ?? 0} real orders</span> · ₹{(Number(inf.real_revenue) || 0).toLocaleString("en-IN")} revenue — pulled automatically from orders that used this code.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => generateCode(inf.id)}
                      disabled={generatingFor === inf.id}
                      className="w-full text-xs flex items-center justify-center gap-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg py-2 disabled:opacity-50"
                    >
                      {generatingFor === inf.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                      Give this influencer a tracking code (10% off, auto-tracks real orders)
                    </button>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-slate-500">Cost (₹)
                      <input type="number" defaultValue={inf.agreed_amount} onBlur={(e) => updateField(inf.id, "agreedAmount", Number(e.target.value))} className="w-full text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 mt-0.5" />
                    </label>
                    <label className="text-xs text-slate-500">{inf.discount_code ? "Leads (manual, if any offline)" : "Leads"}
                      <input type="number" defaultValue={inf.leads_generated} onBlur={(e) => updateField(inf.id, "leadsGenerated", Number(e.target.value))} className="w-full text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 mt-0.5" />
                    </label>
                    <label className="text-xs text-slate-500">{inf.discount_code ? "Revenue (manual, if any offline)" : "Revenue (₹)"}
                      <input type="number" defaultValue={inf.revenue_generated} onBlur={(e) => updateField(inf.id, "revenueGenerated", Number(e.target.value))} className="w-full text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 mt-0.5" />
                    </label>
                  </div>
                  {roi !== null && <p className="text-xs text-slate-500">ROI: <span className={`font-semibold ${roi >= 0 ? "text-green-500" : "text-red-400"}`}>{roi.toFixed(0)}%</span></p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="text-emerald-600 hover:text-emerald-500"
      title="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}
