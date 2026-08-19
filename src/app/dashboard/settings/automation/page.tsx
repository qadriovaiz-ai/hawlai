"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, Check, ShieldCheck, PauseCircle, PieChart, PartyPopper, FlaskConical } from "lucide-react";

export default function AutomationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoPause, setAutoPause] = useState(false);
  const [reallocatePercent, setReallocatePercent] = useState(0);
  const [seasonalEnabled, setSeasonalEnabled] = useState(false);
  const [autoGenerateVariant, setAutoGenerateVariant] = useState(false);

  useEffect(() => {
    fetch("/api/dealership/permissions")
      .then((res) => res.json())
      .then((data) => {
        setAutoPause(data.auto_pause_low_performers ?? false);
        setReallocatePercent(data.auto_budget_reallocate_percent ?? 0);
        setSeasonalEnabled(data.seasonal_campaigns_enabled ?? false);
        setAutoGenerateVariant(data.auto_generate_variant_on_pause ?? false);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(overrides?: { auto_pause_low_performers?: boolean; auto_budget_reallocate_percent?: number; seasonal_campaigns_enabled?: boolean; auto_generate_variant_on_pause?: boolean }) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/dealership/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_pause_low_performers: overrides?.auto_pause_low_performers ?? autoPause,
          auto_budget_reallocate_percent: overrides?.auto_budget_reallocate_percent ?? reallocatePercent,
          seasonal_campaigns_enabled: overrides?.seasonal_campaigns_enabled ?? seasonalEnabled,
          auto_generate_variant_on_pause: overrides?.auto_generate_variant_on_pause ?? autoGenerateVariant,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleAutoPause() {
    const next = !autoPause;
    setAutoPause(next);
    handleSave({ auto_pause_low_performers: next });
  }

  function toggleSeasonal() {
    const next = !seasonalEnabled;
    setSeasonalEnabled(next);
    handleSave({ seasonal_campaigns_enabled: next });
  }

  function toggleAutoGenerateVariant() {
    const next = !autoGenerateVariant;
    setAutoGenerateVariant(next);
    handleSave({ auto_generate_variant_on_pause: next });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Zap className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Automation Permissions</h1>
          <p className="text-sm text-slate-500">Everything here is off by default — you decide what runs on its own</p>
        </div>
      </div>

      <div className="card p-5 bg-slate-50 border-slate-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          Launching new campaigns and any budget increase always require your approval — that never changes here.
          What you can opt into below is narrow: small, reversible, safe actions on campaigns that are already live.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Auto-pause low performers</p>
          </div>
          <button
            onClick={toggleAutoPause}
            className={`w-11 h-6 rounded-full transition-colors relative ${autoPause ? "bg-purple-600" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-slate-100 rounded-full shadow-sm transition-transform ${autoPause ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          If Optimization clearly recommends pausing a campaign (genuinely underperforming, not just low on data), let it pause automatically instead of waiting for you to review it. Always reversible — you can resume any campaign anytime.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Auto-generate next variant</p>
          </div>
          <button
            onClick={toggleAutoGenerateVariant}
            className={`w-11 h-6 rounded-full transition-colors relative ${autoGenerateVariant ? "bg-purple-600" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-slate-100 rounded-full shadow-sm transition-transform ${autoGenerateVariant ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          When "Auto-pause low performers" above leaves one clear winner in an A/B test, prepare a new variant to test against it — as a draft only, never launched automatically. You'll always get a one-click review before it spends anything. Requires auto-pause to be on too, since that's what decides a winner.
        </p>
      </div>

      {/* P0 audit (Master Development Spec, Section 12) — confirmed
          dormant: this UI and dealerships.auto_budget_reallocate_percent
          both round-trip correctly, but nothing anywhere in the
          codebase reads the value to actually reallocate any budget.
          Marked clearly rather than removed, so a dealership that
          already set a non-zero % isn't silently reset — but disabled,
          since letting someone set an expectation the backend can't
          meet is exactly what the audit flagged. Real reallocation
          logic is a real, separate feature for later (P1/P2), not a
          P0 fix. */}
      <div className="card p-5 space-y-3 opacity-70">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Auto budget reallocation</p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-400/30">Coming soon</span>
        </div>
        <p className="text-xs text-slate-400">
          Not active yet — moving budget between campaigns automatically still requires a team member today, no matter what this is set to. We'll turn this on once the real logic ships; nothing above 0% does anything right now.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="25"
            step="5"
            value={reallocatePercent}
            disabled
            className="flex-1 cursor-not-allowed"
          />
          <span className="text-sm font-semibold text-slate-500 w-12 text-right">{reallocatePercent}%</span>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PartyPopper className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Seasonal campaign prep</p>
          </div>
          <button
            onClick={toggleSeasonal}
            className={`w-11 h-6 rounded-full transition-colors relative ${seasonalEnabled ? "bg-purple-600" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-slate-100 rounded-full shadow-sm transition-transform ${seasonalEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          When an Indian festival or seasonal moment is coming up within its lead time, add a planning entry to your Content Calendar automatically — nothing gets generated or sent on its own, it just makes sure you don't miss the window to prep.
        </p>
      </div>

      {saving && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</p>}
      {saved && <p className="text-xs text-green-400 flex items-center gap-1.5"><Check className="w-3 h-3" /> Saved</p>}
    </div>
  );
}
