"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Zap, AlertTriangle, Clock, ArrowRight, ShieldCheck, Phone, Sparkles, PauseCircle, FlaskConical, PartyPopper, PieChart, Activity, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";

// All 13 daily-cron subsystems (see /api/autopilot/daily-run/route.ts)
// — shown even before any run exists yet, so a newly-deployed
// dealership sees "not run yet" rather than the row silently missing.
const SUBSYSTEM_LABELS: Record<string, string> = {
  daily_autopilot: "Auto-pause & Variant Drafts",
  budget_alerts: "Budget Alerts",
  email_automation: "Welcome & Follow-up Emails",
  workflows: "Custom Workflows",
  competitor_alerts: "Competitor Monitoring",
  topic_alerts: "Topic Monitoring",
  report_snapshots: "Report Snapshots",
  content_autopilot: "Social Media Auto-Posting",
  google_reviews: "Google Reviews Sync",
  seasonal_calendar: "Seasonal Campaign Prep",
  churn_detection: "At-Risk Customer Detection",
  cold_lead_detection: "Cold Lead Detection",
  lead_scoring: "Lead Scoring",
};

export default function AutopilotCommandCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enablingAll, setEnablingAll] = useState(false);

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

  // Turns on every toggle here in one go — deliberately still scoped
  // to only what this whole page already covers (never touches ads/
  // budget, which live entirely outside this settings object and
  // always require a manual Launch click regardless).
  async function enableAll() {
    setEnablingAll(true);
    const fields = ["dm_auto_reply_enabled", "comment_auto_reply_enabled", "welcome_email_auto_enabled", "follow_up_email_auto_enabled", "auto_call_new_leads", "auto_pause_low_performers", "auto_generate_variant_on_pause", "seasonal_campaigns_enabled"];
    if (data.dealership.fb_page_id) fields.push("content_autopilot_enabled"); // only if Facebook's actually connected — turning this on without it does nothing
    const update: any = {};
    for (const f of fields) update[f] = true;
    setData((prev: any) => ({ ...prev, dealership: { ...prev.dealership, ...update } }));
    try {
      await fetch("/api/autopilot/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
    } finally {
      setEnablingAll(false);
    }
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

      <Button
        onClick={enableAll}
        loading={enablingAll}
        className="w-full font-medium"
      >
        {!enablingAll && <Sparkles className="w-4 h-4" />}
        Enable everything below (except ads/budget — that's never auto)
      </Button>

      {/* AI Calling */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Phone className="w-4 h-4 text-amber-500" /> AI Calling</p>
        <p className="text-xs text-slate-400">The moment a new lead comes in (website form, Meta Lead Ad), Hawlai calls them automatically with a script built for your business — no waiting for a team member to pick up the list.</p>
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Auto-call new leads</span>
          <input type="checkbox" checked={d.auto_call_new_leads} disabled={saving} onChange={(e) => toggle("auto_call_new_leads", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {/* Campaign Automation — formerly a separate page
          (/dashboard/settings/automation), consolidated here per the
          P0 12b audit so this is genuinely the one canonical control
          surface, not one of several partial ones. */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><PauseCircle className="w-4 h-4 text-amber-500" /> Campaign Automation</p>
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Auto-pause low performers</span>
          <input type="checkbox" checked={d.auto_pause_low_performers} disabled={saving} onChange={(e) => toggle("auto_pause_low_performers", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
        <p className="text-xs text-slate-400">If Optimization clearly recommends pausing a campaign (genuinely underperforming, not just low on data), let it pause automatically instead of waiting for you to review it. Always reversible — you can resume any campaign anytime.</p>
        <label className="flex items-center justify-between pt-2 border-t border-slate-200">
          <span className="text-sm text-slate-700 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-slate-400" /> Auto-generate next variant</span>
          <input type="checkbox" checked={d.auto_generate_variant_on_pause} disabled={saving} onChange={(e) => toggle("auto_generate_variant_on_pause", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
        <p className="text-xs text-slate-400">When "Auto-pause low performers" above leaves one clear winner in an A/B test, prepare a new variant to test against it — as a draft only, never launched automatically. Requires auto-pause to be on too, since that's what decides a winner.</p>
        <div className="pt-2 border-t border-slate-200 space-y-1.5 opacity-70">
          <div className="flex items-center gap-2">
            <PieChart className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm text-slate-500">Auto budget reallocation</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-400/30">Coming soon</span>
          </div>
          <p className="text-xs text-slate-400">Not active yet — moving budget between campaigns automatically still requires a team member today.</p>
        </div>
      </div>

      {/* Seasonal campaign prep */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><PartyPopper className="w-4 h-4 text-amber-500" /> Seasonal Campaign Prep</p>
          <input type="checkbox" checked={d.seasonal_campaigns_enabled} disabled={saving} onChange={(e) => toggle("seasonal_campaigns_enabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </div>
        <p className="text-xs text-slate-400">When an Indian festival or seasonal moment is coming up within its lead time, add a planning entry to your Content Calendar automatically — nothing gets generated or sent on its own, it just makes sure you don't miss the window to prep.</p>
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
              <div key={a.id} className={`text-xs rounded-lg p-2 ${a.success ? "bg-slate-200" : "bg-red-500/10"}`}>
                <span className="font-medium text-slate-600">{a.type}</span> — {new Date(a.created_at).toLocaleString("en-IN")} {!a.success && <span className="text-red-400">(failed)</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation health — P0 12d, built on automation_run_log
          (migration 126, P0 12c). Every one of the 13 daily-cron
          subsystems shown, not just the ones that happen to be
          toggled on above — auto-pause/lead-scoring/etc run
          regardless of any UI toggle here. */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Activity className="w-4 h-4" /> Automation Health</p>
          <span className="text-xs text-slate-400 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Runs daily at 8:30 AM IST</span>
        </div>
        <div className="space-y-1.5">
          {Object.entries(SUBSYSTEM_LABELS).map(([key, label]) => {
            const health = (data.automationHealth ?? []).find((h: any) => h.subsystem === key);
            return (
              <div key={key} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${!health ? "bg-slate-300" : health.lastSuccess ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-slate-600">{label}</span>
                </div>
                {health ? (
                  <span className="text-slate-400">{health.successRatePct}% success (7d) · last {new Date(health.lastRunAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                ) : (
                  <span className="text-slate-400">Not run yet</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
