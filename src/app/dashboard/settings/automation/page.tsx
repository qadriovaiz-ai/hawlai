"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, Check, ShieldCheck, PauseCircle, PieChart } from "lucide-react";

export default function AutomationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoPause, setAutoPause] = useState(false);
  const [reallocatePercent, setReallocatePercent] = useState(0);

  useEffect(() => {
    fetch("/api/dealership/permissions")
      .then((res) => res.json())
      .then((data) => {
        setAutoPause(data.auto_pause_low_performers ?? false);
        setReallocatePercent(data.auto_budget_reallocate_percent ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(overrides?: { auto_pause_low_performers?: boolean; auto_budget_reallocate_percent?: number }) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/dealership/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_pause_low_performers: overrides?.auto_pause_low_performers ?? autoPause,
          auto_budget_reallocate_percent: overrides?.auto_budget_reallocate_percent ?? reallocatePercent,
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
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Auto budget reallocation</p>
        </div>
        <p className="text-xs text-slate-400">
          Allow moving up to this % of a campaign's budget toward better-performing campaigns automatically, without asking each time. Set to 0 to keep all budget changes manual.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="25"
            step="5"
            value={reallocatePercent}
            onChange={(e) => setReallocatePercent(Number(e.target.value))}
            onMouseUp={() => handleSave()}
            onTouchEnd={() => handleSave()}
            className="flex-1"
          />
          <span className="text-sm font-semibold text-slate-700 w-12 text-right">{reallocatePercent}%</span>
        </div>
      </div>

      {saving && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</p>}
      {saved && <p className="text-xs text-green-400 flex items-center gap-1.5"><Check className="w-3 h-3" /> Saved</p>}
    </div>
  );
}
