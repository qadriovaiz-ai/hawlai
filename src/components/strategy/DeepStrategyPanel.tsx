"use client";

import { useState, useEffect } from "react";
import {
  Loader2, Package, IndianRupee, Crosshair, Star, TrendingUp, TrendingDown,
  Lightbulb, ShieldAlert, Users2, CalendarRange, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";

export default function DeepStrategyPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);

  useEffect(() => {
    if (open && !loaded) {
      setLoading(true);
      fetch("/api/strategy/deep")
        .then((res) => res.json())
        .then((data) => {
          setStrategy(data);
          setLoaded(true);
        })
        .finally(() => setLoading(false));
    }
  }, [open, loaded]);

  function handleRegenerate() {
    setLoading(true);
    fetch("/api/strategy/deep?regenerate=true")
      .then((res) => res.json())
      .then((data) => {
        setStrategy(data);
        setLoaded(true);
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(!open)} className="flex-1 flex items-center justify-between text-left">
          <span className="text-sm font-semibold text-slate-700">Full Strategic Analysis</span>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {open && loaded && (
          <button onClick={handleRegenerate} disabled={loading} className="ml-3 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 shrink-0 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Regenerate
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Product analysis, pricing strategy, positioning, USP, SWOT, market gaps, personas, and a full quarterly + annual plan.
      </p>

      {open && (
        <div className="space-y-4 pt-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Analyzing your business...
            </div>
          ) : strategy ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-slate-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1"><Package className="w-3.5 h-3.5" /> Product Analysis</p>
                  <p className="text-sm text-slate-700">{strategy.productAnalysis}</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1"><IndianRupee className="w-3.5 h-3.5" /> Pricing Strategy</p>
                  <p className="text-sm text-slate-700">{strategy.pricingStrategy}</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1"><Crosshair className="w-3.5 h-3.5" /> Positioning</p>
                  <p className="text-sm text-slate-700">{strategy.positioningStatement}</p>
                </div>
                <div className="bg-purple-500/10 rounded-lg p-3">
                  <p className="text-xs font-semibold text-purple-400 flex items-center gap-1.5 mb-1"><Star className="w-3.5 h-3.5" /> USP</p>
                  <p className="text-sm text-purple-200">{strategy.usp}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">SWOT Analysis</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-500/10 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-400 flex items-center gap-1.5 mb-1"><TrendingUp className="w-3.5 h-3.5" /> Strengths</p>
                    {strategy.swot?.strengths?.map((s: string, i: number) => <p key={i} className="text-xs text-slate-600">• {s}</p>)}
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5 mb-1"><TrendingDown className="w-3.5 h-3.5" /> Weaknesses</p>
                    {strategy.swot?.weaknesses?.map((s: string, i: number) => <p key={i} className="text-xs text-slate-600">• {s}</p>)}
                  </div>
                  <div className="bg-blue-500/10 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 mb-1"><Lightbulb className="w-3.5 h-3.5" /> Opportunities</p>
                    {strategy.swot?.opportunities?.map((s: string, i: number) => <p key={i} className="text-xs text-slate-600">• {s}</p>)}
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-1"><ShieldAlert className="w-3.5 h-3.5" /> Threats</p>
                    {strategy.swot?.threats?.map((s: string, i: number) => <p key={i} className="text-xs text-slate-600">• {s}</p>)}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Market Gaps</p>
                <div className="space-y-1">
                  {strategy.marketGaps?.map((g: string, i: number) => (
                    <p key={i} className="text-sm text-slate-600 bg-slate-100 rounded-lg p-2.5">💡 {g}</p>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><Users2 className="w-3.5 h-3.5" /> Customer Personas</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {strategy.personas?.map((p: any, i: number) => (
                    <div key={i} className="bg-slate-100 rounded-lg p-3">
                      <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.painPoints?.map((pp: string, j: number) => (
                          <span key={j} className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{pp}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><CalendarRange className="w-3.5 h-3.5" /> Quarterly Plan</p>
                <div className="grid sm:grid-cols-4 gap-2">
                  {strategy.quarterlyPlan?.map((q: any, i: number) => (
                    <div key={i} className="bg-slate-100 rounded-lg p-3">
                      <p className="text-xs font-bold text-purple-400">{q.quarter}</p>
                      <p className="text-sm font-medium text-slate-800 mt-0.5">{q.focus}</p>
                      <ul className="mt-1.5 space-y-0.5">
                        {q.keyActions?.map((a: string, j: number) => (
                          <li key={j} className="text-xs text-slate-500">• {a}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-brand-900/30 border border-brand-700/40 rounded-lg p-3">
                <p className="text-xs font-semibold text-brand-300 mb-1">Annual Growth Plan</p>
                <p className="text-sm text-brand-100">{strategy.annualGrowthPlan}</p>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
