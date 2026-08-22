"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BillingRow {
  id: string;
  name: string;
  plan: string;
  costInr: number;
  byService: Record<string, number>;
}

interface DepartmentRow {
  department: string;
  costInr: number;
  calls: number;
  share: number;
}

export default function AgencyBillingView() {
  const [rows, setRows] = useState<BillingRow[] | null>(null);
  const [byDepartment, setByDepartment] = useState<DepartmentRow[]>([]);
  const [totals, setTotals] = useState<{ businessCount: number; costInr: number; monthStart: string } | null>(null);

  useEffect(() => {
    fetch("/api/agency/billing")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setRows(d.businesses ?? []);
          setByDepartment(d.byDepartment ?? []);
          setTotals(d.totals);
        }
      })
      .catch(() => {});
  }, []);

  if (rows === null) return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading costs...</div>;
  if (rows.length === 0) return <p className="text-sm text-slate-400 text-center py-12">No businesses found.</p>;

  const monthLabel = totals ? new Date(totals.monthStart).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "";

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-1">
        <p className="text-xs text-slate-400">Combined AI cost — {monthLabel}</p>
        <p className="text-2xl font-semibold text-slate-900 tabular-nums">{formatCurrency(totals?.costInr ?? 0)}</p>
        <p className="text-xs text-slate-400">across {totals?.businessCount ?? 0} business{(totals?.businessCount ?? 0) === 1 ? "" : "es"}</p>
      </div>

      {byDepartment.length > 0 && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Where it goes</p>
          <div className="space-y-2">
            {byDepartment.map((d) => (
              <div key={d.department}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600">{d.department}</span>
                  <span className="text-slate-500 tabular-nums">
                    {formatCurrency(d.costInr)} <span className="text-slate-400">· {Math.round(d.share * 100)}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(d.share * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-slate-400">
            Across all your businesses combined, this month. Useful for spotting which kind of work is actually driving your cost.
          </p>
        </div>
      )}

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Per business</p>
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className="py-2.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate">{r.name}</p>
                <p className="text-xs text-slate-400">
                  {r.plan}
                  {Object.keys(r.byService).length > 0 && (
                    <> · {Object.entries(r.byService).map(([s, c]) => `${s} ${formatCurrency(c)}`).join(", ")}</>
                  )}
                </p>
              </div>
              <p className="text-sm font-medium text-slate-800 tabular-nums shrink-0">{formatCurrency(r.costInr)}</p>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-slate-400">
          This is real AI/API cost (Claude, calling, image and video generation), computed per call from actual provider pricing — not each business's plan fee. Plan fees are still billed to each business separately; this view is for understanding and re-billing what each client actually consumes.
        </p>
      </div>
    </div>
  );
}
