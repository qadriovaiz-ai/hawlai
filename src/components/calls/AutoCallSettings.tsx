"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, PhoneCall } from "lucide-react";

export default function AutoCallSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/settings/auto-call").then((r) => r.json()).then((d) => setEnabled(d.autoCallNewLeads ?? false)).finally(() => setLoading(false));
  }, []);

  async function toggle(value: boolean) {
    setSaving(true);
    setEnabled(value);
    try {
      await fetch("/api/settings/auto-call", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoCallNewLeads: value }) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading calling settings...</div>;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><PhoneCall className="w-4 h-4 text-amber-500" /> Auto-Call New Leads (live, no review)</p>

      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          When ON, every new lead with a phone number gets an AI phone call automatically the moment they come in — nobody reviews or approves each call first. The lead's score is then set from what was actually said on the call, replacing the initial guess. Turning this ON is your approval for every call it makes. Make sure your Vapi number/DLT setup is ready for real customer calls before enabling this — see the calling compliance notes if you haven't checked yet.
        </p>
      </div>

      <label className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Auto-call on new lead</p>
          <p className="text-xs text-slate-400">Applies to leads from Meta Ads and your website's lead forms</p>
        </div>
        <input type="checkbox" checked={enabled} disabled={saving} onChange={(e) => toggle(e.target.checked)} className="w-5 h-5 accent-brand-600" />
      </label>
    </div>
  );
}
