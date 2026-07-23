"use client";

import { useState, useEffect } from "react";
import { Loader2, Search, Globe2, X, CheckCircle2, XCircle, Clock } from "lucide-react";

interface DomainOrder {
  id: string;
  domain_name: string;
  status: string;
  price_estimate: number | null;
  currency: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  requested: { label: "Requested", color: "bg-blue-100 text-blue-600", icon: Clock },
  awaiting_payment: { label: "Awaiting Payment", color: "bg-amber-100 text-amber-600", icon: Clock },
  purchased: { label: "Purchased", color: "bg-purple-100 text-purple-600", icon: CheckCircle2 },
  connected: { label: "Connected — Live", color: "bg-green-100 text-green-600", icon: CheckCircle2 },
  unavailable: { label: "Unavailable", color: "bg-red-100 text-red-600", icon: XCircle },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-500", icon: XCircle },
};

export default function DomainPanel() {
  const [orders, setOrders] = useState<DomainOrder[]>([]);
  const [website, setWebsite] = useState<any>(null);
  const [registrarConnected, setRegistrarConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyErrors, setBuyErrors] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/domains")
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? []);
        setWebsite(d.website ?? null);
        setRegistrarConnected(!!d.registrarConnected);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleCheck() {
    if (!query.trim()) return;
    setChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const r = await fetch("/api/domains/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domainName: query.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Something went wrong");
      setCheckResult(d);
    } catch (err: any) {
      setCheckError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function handleRequest() {
    setRequesting(true);
    try {
      await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainName: query.trim(), priceEstimate: checkResult?.price ?? null, currency: checkResult?.currency ?? "INR" }),
      });
      setQuery("");
      setCheckResult(null);
      load();
    } finally {
      setRequesting(false);
    }
  }

  async function handleCancel(id: string) {
    await fetch(`/api/domains/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    load();
  }

  async function handleBuy(order: DomainOrder) {
    const verb = order.status === "purchased" ? "Finish connecting" : "Purchase";
    const priceNote = order.price_estimate ? ` (~${order.currency} ${order.price_estimate}/yr)` : "";
    if (order.status !== "purchased" && !confirm(`${verb} "${order.domain_name}"${priceNote} now? This charges your connected registrar account for real.`)) return;

    setBuyingId(order.id);
    setBuyErrors((prev) => { const next = { ...prev }; delete next[order.id]; return next; });
    try {
      const r = await fetch(`/api/domains/${order.id}/purchase`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) setBuyErrors((prev) => ({ ...prev, [order.id]: d.error ?? "Something went wrong" }));
      load();
    } finally {
      setBuyingId(null);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-1">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Globe2 className="w-4 h-4" /> Current Address</p>
        {website?.custom_domain && website.custom_domain_status === "connected" ? (
          <p className="text-sm text-green-600">Live at {website.custom_domain}</p>
        ) : (
          <p className="text-sm text-slate-500">Live at hawlai.vercel.app/site/{website?.slug ?? "…"} (free)</p>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Get a Custom Domain</p>
          {registrarConnected ? (
            <span className="text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Registrar connected, ready to purchase</span>
          ) : (
            <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> Registrar not connected</span>
          )}
        </div>
        {!registrarConnected && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5">Live availability search isn't connected yet — you can still request a domain below and the Hawlai team will confirm availability and price with you directly.</p>
        )}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCheckResult(null); setCheckError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            placeholder="mybrand.com"
            className="flex-1 text-sm bg-slate-100 text-slate-900 border border-slate-300 rounded-lg px-3 py-2.5"
          />
          <button onClick={handleCheck} disabled={checking || !query.trim()} className="text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Check
          </button>
        </div>

        {checkError && <p className="text-xs text-red-400">{checkError}</p>}

        {checkResult && checkResult.configured === false && (
          <div className="bg-slate-100 rounded-lg p-3 flex items-center justify-between">
            <p className="text-sm text-slate-600">Request "{query.trim()}" — team will confirm availability</p>
            <button onClick={handleRequest} disabled={requesting} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
              {requesting ? "…" : "Request"}
            </button>
          </div>
        )}

        {checkResult && checkResult.configured && (
          <div className="bg-slate-100 rounded-lg p-3 flex items-center justify-between">
            {checkResult.available ? (
              <>
                <p className="text-sm text-green-600">Available{checkResult.price ? ` — ${checkResult.currency} ${checkResult.price}/yr` : ""}</p>
                <button onClick={handleRequest} disabled={requesting} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {requesting ? "…" : "Request This Domain"}
                </button>
              </>
            ) : (
              <p className="text-sm text-red-500">Already taken</p>
            )}
          </div>
        )}
      </div>

      {orders.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Your Requests</p>
          {orders.map((o) => {
            const meta = STATUS_META[o.status] ?? STATUS_META.requested;
            const canBuy = registrarConnected && (o.status === "requested" || o.status === "awaiting_payment");
            const canFinishConnecting = registrarConnected && o.status === "purchased";
            return (
              <div key={o.id} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{o.domain_name}</p>
                    <p className="text-xs text-slate-400">{o.price_estimate ? `${o.currency} ${o.price_estimate}/yr · ` : ""}{new Date(o.created_at).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 ${meta.color}`}><meta.icon className="w-3 h-3" /> {meta.label}</span>
                    {(canBuy || canFinishConnecting) && (
                      <button onClick={() => handleBuy(o)} disabled={buyingId === o.id} className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded-full disabled:opacity-50">
                        {buyingId === o.id ? "…" : canFinishConnecting ? "Finish Connecting" : "Buy Now"}
                      </button>
                    )}
                    {(o.status === "requested" || o.status === "awaiting_payment") && (
                      <button onClick={() => handleCancel(o.id)} className="text-slate-400 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
                {buyErrors[o.id] && <p className="text-xs text-red-500">{buyErrors[o.id]}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
