"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Zap, AlertTriangle, Clock, ArrowRight, ShieldCheck } from "lucide-react";

export default function AutopilotCommandCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/autopilot/settings").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggle(field: string, value: boolean) {
    setSaving(true);
    setData((prev: any) => ({ ...prev, dealership: { ...prev.dealership, [field]: value } }));
    try {
      await fetch("/api/autopilot/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    } finally {
      setSaving(false);
    }
  }

  async function setFrequency(field: string, value: number) {
    setData((prev: any) => ({ ...prev, dealership: { ...prev.dealership, [field]: value } }));
    await fetch("/api/autopilot/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
  }

  if (loading || !data) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading autopilot settings...</div>;

  const d = data.dealership;
  const activeWorkflows = (data.workflows ?? []).filter((w: any) => w.enabled).length;

  return (
    <div className="space-y-5">
      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-4 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Everything here posts, sends, or replies live with no review step. Turning any of these ON is your approval for everything it does from then on. <strong>Ads and budget spend are never included here</strong> — those always require you to manually launch/approve in Ads Manager, no matter what.
        </p>
      </div>

      {/* Content Autopilot — new, full auto posting */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Social Media Auto-Posting</p>
        <p className="text-xs text-slate-400">Hawlai generates an on-brand image + caption and posts it to your Facebook Page automatically — no copy-paste, no review.</p>
        {!d.fb_page_id && <p className="text-xs text-red-400">Connect Facebook first (Settings → Integrations).</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">Enabled</span>
            <input type="checkbox" checked={d.content_autopilot_enabled} disabled={saving || !d.fb_page_id} onChange={(e) => toggle("content_autopilot_enabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
          </div>
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Post every
            <input type="number" min={1} max={30} value={d.content_autopilot_frequency_days} onChange={(e) => setFrequency("content_autopilot_frequency_days", Number(e.target.value))} className="w-12 bg-slate-100 border border-slate-200 rounded px-1 text-center" />
            days
          </label>
        </div>
      </div>

      {/* DM/Comment auto-reply */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">DM &amp; Comment Auto-Reply</p>
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Auto-reply to DMs</span>
          <input type="checkbox" checked={d.dm_auto_reply_enabled} disabled={saving} onChange={(e) => toggle("dm_auto_reply_enabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Auto-reply to comments</span>
          <input type="checkbox" checked={d.comment_auto_reply_enabled} disabled={saving} onChange={(e) => toggle("comment_auto_reply_enabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {/* Email automation */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Email Automation</p>
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Auto welcome emails</span>
          <input type="checkbox" checked={d.welcome_email_auto_enabled} disabled={saving} onChange={(e) => toggle("welcome_email_auto_enabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Auto follow-ups (after {d.follow_up_inactive_days} days)</span>
          <input type="checkbox" checked={d.follow_up_email_auto_enabled} disabled={saving} onChange={(e) => toggle("follow_up_email_auto_enabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {/* Workflows */}
      <Link href="/dashboard/marketing-automation" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="text-sm text-slate-700">{activeWorkflows} active workflow{activeWorkflows !== 1 ? "s" : ""} (multi-step email sequences)</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      {/* Always-manual reminder */}
      <div className="card p-4 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">Ads launches, budget changes, and anything spending money always stay manual — <Link href="/dashboard/ads/campaigns" className="text-purple-500 hover:underline">Ads Manager</Link> requires you to click Launch every time, by design.</p>
      </div>

      {/* Recent activity across all automations */}
      {data.activity.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent Autopilot Activity</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {data.activity.map((a: any) => (
              <div key={a.id} className={`text-xs rounded-lg p-2 ${a.success ? "bg-slate-100" : "bg-red-500/10"}`}>
                <span className="font-medium text-slate-600">{a.type}</span> — {new Date(a.created_at).toLocaleString("en-IN")} {!a.success && <span className="text-red-400">(failed)</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
