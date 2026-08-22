"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Invoice {
  id: string;
  dealership_id: string;
  dealership_name: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  plan: string;
  subtotal_inr: number;
  tax_inr: number;
  total_inr: number;
  status: "draft" | "issued" | "paid" | "void";
  issued_at: string | null;
}

interface Dealership { id: string; dealership_name: string; plan: string }

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<Invoice["status"], string> = {
  draft: "bg-slate-200 text-slate-600",
  issued: "bg-blue-500/15 text-blue-600",
  paid: "bg-green-500/15 text-green-600",
  void: "bg-red-500/10 text-red-500",
};

// Which transitions the API will accept — mirrored here only to decide
// which buttons to render. The API is the real authority and rejects
// anything invalid regardless of what this shows.
const NEXT_STATUSES: Record<Invoice["status"], Invoice["status"][]> = {
  draft: ["issued", "void"],
  issued: ["paid", "void"],
  paid: [],
  void: [],
};

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default function AdminInvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [genDealership, setGenDealership] = useState("");
  const [genMonth, setGenMonth] = useState(currentMonthStart());

  function load() {
    fetch("/api/admin/invoices")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setInvoices(d.invoices ?? []);
        setDealerships(d.dealerships ?? []);
        if (!genDealership && d.dealerships?.length) setGenDealership(d.dealerships[0].id);
      })
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function generate() {
    if (!genDealership) return;
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealershipId: genDealership, billingMonth: genMonth }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't generate");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't update");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (invoices === null && !error) {
    return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Tax is not calculated yet — every invoice shows ₹0 tax pending confirmation of GST rate, applicability, and CGST/SGST vs IGST treatment. These are records of manually-arranged billing, not automatically-collected payments, and the numbering format is provisional until the legal format is confirmed.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Generate a draft invoice</p>
        <div className="flex flex-wrap gap-2">
          <select value={genDealership} onChange={(e) => setGenDealership(e.target.value)} className="input text-xs flex-1 min-w-[180px]">
            {dealerships.map((d) => <option key={d.id} value={d.id}>{d.dealership_name} ({d.plan})</option>)}
          </select>
          <input
            type="text"
            value={genMonth}
            onChange={(e) => setGenMonth(e.target.value)}
            placeholder="YYYY-MM-01"
            className="input text-xs w-[130px]"
          />
          <Button onClick={generate} loading={busy === "generate"} size="sm">Generate</Button>
        </div>
        <p className="text-[10.5px] text-slate-400">
          Built from real recorded usage — the plan price plus any calling overage already charged that month. Creates a draft you review before issuing.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><FileText className="w-4 h-4 text-slate-400" /> Invoices</p>
        {(invoices ?? []).length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {(invoices ?? []).map((i) => (
              <div key={i.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700">{i.invoice_number}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLE[i.status]}`}>{i.status}</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {i.dealership_name} · {i.plan} · {i.billing_period_start} to {i.billing_period_end}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-700 tabular-nums">{inr(i.total_inr)}</p>
                    <p className="text-[10px] text-slate-400 tabular-nums">{inr(i.subtotal_inr)} + {inr(i.tax_inr)} tax</p>
                  </div>
                  <div className="flex gap-1.5">
                    {NEXT_STATUSES[i.status].map((next) => (
                      <Button
                        key={next}
                        onClick={() => setStatus(i.id, next)}
                        loading={busy === i.id}
                        variant="secondary"
                        size="sm"
                        className={next === "void" ? "text-red-400 border-red-700/50 hover:bg-red-500/10" : ""}
                      >
                        {next === "issued" ? "Issue" : next === "paid" ? "Mark paid" : "Void"}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
