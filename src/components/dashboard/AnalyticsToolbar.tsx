"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RefreshCw, Calendar } from "lucide-react";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/analytics/dateRange";

// Date range + refresh, Ads-Manager style.
//
// Both work through the URL and router rather than a client-side data
// layer, because the analytics page is a SERVER component:
//   - changing the range pushes searchParams, which re-runs the server
//     component with new queries
//   - refresh calls router.refresh(), which re-runs it against fresh
//     data and swaps the HTML WITHOUT a full page reload
// So neither needed a new fetching layer or an API endpoint — the
// existing server-rendered page already had the mechanism.
//
// useTransition gives real pending state for both, so the button
// reflects work actually happening instead of appearing inert while
// the server re-renders.
export default function AnalyticsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentRange = (searchParams.get("range") ?? "30d") as RangeKey;
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");
  const [showCustom, setShowCustom] = useState(currentRange === "custom");

  function apply(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function selectRange(key: RangeKey) {
    if (key === "custom") {
      setShowCustom(true);
      return; // wait for both dates before navigating
    }
    setShowCustom(false);
    apply({ range: key, from: null, to: null });
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    apply({ range: "custom", from: customFrom, to: customTo });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {RANGE_OPTIONS.map((opt) => {
            const active = currentRange === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => selectRange(opt.key)}
                disabled={isPending}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-brand-600 border-brand-600 text-white"
                    : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {opt.key === "custom" && <Calendar className="w-3 h-3 inline mr-1 -mt-px" />}
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => startTransition(() => router.refresh())}
          disabled={isPending}
          className="ml-auto text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "Updating..." : "Refresh"}
        </button>
      </div>

      {showCustom && (
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[10.5px] text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              // Prevents picking a start after the end, which would
              // otherwise silently fall back to the default range and
              // look like the picker ignored the input.
              max={customTo || undefined}
              className="input text-xs py-1.5"
            />
          </div>
          <div>
            <label className="block text-[10.5px] text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
              max={new Date().toISOString().slice(0, 10)}
              className="input text-xs py-1.5"
            />
          </div>
          <button
            onClick={applyCustom}
            disabled={!customFrom || !customTo || isPending}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
