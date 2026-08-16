"use client";

import { useState, useEffect } from "react";
import { Loader2, IndianRupee, Check, X, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, EmptyState, type BadgeTone } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = { requested: "Pending review", approved: "Approved", rejected: "Rejected", processed: "Refunded" };
const STATUS_TONES: Record<string, BadgeTone> = { requested: "warning", approved: "brand", rejected: "negative", processed: "positive" };

export default function RefundRequestsView() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/refunds").then((r) => r.json()).then((d) => setRequests(d.refundRequests ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/refunds", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setConfirmingId(null);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>;

  if (requests.length === 0) {
    return (
      <Card padding="none">
        <EmptyState title="No refund requests" description="Requests raised on a call show up here — nothing is ever refunded automatically, every one needs your approval." />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-500/10 border border-red-700/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
      {requests.map((r) => {
        const order = r.orders;
        const lead = r.leads;
        const pending = r.status === "requested";
        return (
          <Card key={r.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5 text-slate-400" />{Number(r.requested_amount).toLocaleString("en-IN")}
                  </p>
                  <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">{lead?.name ?? order?.customer_name ?? "Unknown caller"}{lead?.phone || order?.customer_phone ? ` · ${lead?.phone ?? order?.customer_phone}` : ""}</p>
                {order && <p className="text-xs text-slate-400">Order total ₹{Number(order.total).toLocaleString("en-IN")}{!order.razorpay_payment_id ? " · no Razorpay payment on record" : ""}</p>}
                <p className="text-sm text-slate-600 mt-1.5">{r.reason}</p>
                <p className="text-[11px] text-slate-400 mt-1">{new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · via {r.requested_via}</p>
              </div>
            </div>

            {pending && (
              confirmingId === r.id ? (
                <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-amber-800">Confirm: this will refund ₹{Number(r.requested_amount).toLocaleString("en-IN")} via Razorpay right now. This can't be undone from here.</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => act(r.id, "approve")} loading={busyId === r.id}>{!busyId && <Check className="w-3.5 h-3.5" />} Confirm refund</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={() => setConfirmingId(r.id)}><Check className="w-3.5 h-3.5" /> Approve & refund</Button>
                  <Button variant="ghost" size="sm" onClick={() => act(r.id, "reject")} loading={busyId === r.id}>{!busyId && <X className="w-3.5 h-3.5" />} Reject</Button>
                </div>
              )
            )}
          </Card>
        );
      })}
    </div>
  );
}
