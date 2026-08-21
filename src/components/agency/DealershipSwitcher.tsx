"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, ChevronDown } from "lucide-react";

export default function DealershipSwitcher() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/agency/my-dealerships").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  // P3 agency multi-business-switching fix — previously hidden
  // entirely from anyone who owns a business. Now shown whenever
  // there's genuinely somewhere to switch: 2+ client teams (pure
  // agency staff), or an owner who's also staff on someone else's
  // team (1 team + their own business to get back to).
  const teamCount = data?.dealerships?.length ?? 0;
  const homeDealership = data?.homeDealership ?? null;
  const switchTargetCount = teamCount + (homeDealership ? 1 : 0);
  if (loading || !data || switchTargetCount < 2) return null;

  const current = data.dealerships.find((d: any) => d.id === data.currentDealershipId)
    ?? (homeDealership && homeDealership.id === data.currentDealershipId ? { ...homeDealership, role: "owner" } : null);

  async function switchTo(id: string) {
    setSwitching(true);
    try {
      const res = await fetch("/api/agency/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealershipId: id }) });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        window.location.href = "/dashboard"; // full reload — every page's server-side dealership lookup needs the fresh session context
      }
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700"
      >
        <span className="flex items-center gap-2 truncate">
          <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="truncate">{current?.dealership_name ?? "Select business"}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {/* Own business first, visually separated — it's a different
              kind of thing from a client team you're staff on. */}
          {homeDealership && (
            <button
              onClick={() => switchTo(homeDealership.id)}
              disabled={switching}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 disabled:opacity-50 border-b border-slate-200"
            >
              <span className="truncate">{homeDealership.dealership_name} <span className="text-xs text-slate-400">(your business)</span></span>
              {homeDealership.id === data.currentDealershipId && (switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-purple-500" />)}
            </button>
          )}
          {data.dealerships.map((d: any) => (
            <button
              key={d.id}
              onClick={() => switchTo(d.id)}
              disabled={switching}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 disabled:opacity-50"
            >
              <span className="truncate">{d.dealership_name} <span className="text-xs text-slate-400">({d.role.replace(/_/g, " ")})</span></span>
              {d.id === data.currentDealershipId && (switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-purple-500" />)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
