"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Zap } from "lucide-react";

export default function EmailAutomationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(3);
  const [connected, setConnected] = useState(true);
  const [log, setLog] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/email/automation-settings").then((r) => r.json()).then((d) => {
      setWelcomeEnabled(d.welcomeEnabled);
      setFollowUpEnabled(d.followUpEnabled);
      setInactiveDays(d.followUpInactiveDays);
      setConnected(d.connected);
      setLog(d.log ?? []);
    }).finally(() => setLoading(false));
  }, []);

  async function toggle(field: "welcomeEnabled" | "followUpEnabled", value: boolean) {
    setSaving(true);
    if (field === "welcomeEnabled") setWelcomeEnabled(value); else setFollowUpEnabled(value);
    try {
      await fetch("/api/email/automation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveInactiveDays(days: number) {
    setInactiveDays(days);
    await fetch("/api/email/automation-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpInactiveDays: days }),
    });
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading automation settings...</div>;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Real Email Automation (live, no review)</p>

      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          When ON, AI-written emails are sent to real leads automatically from your Gmail — nobody reviews them first. Turning this ON is your approval for every email it sends. Runs once daily, so a new lead may get their welcome email up to ~24 hours later, not instantly. Each email is sent at most once per lead.
        </p>
      </div>

      {!connected && (
        <p className="text-xs text-red-400">Connect Gmail first (Integrations page) before enabling automation.</p>
      )}

      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Auto Welcome Emails</p>
            <p className="text-xs text-slate-400">Send a welcome email to every new lead with an email address</p>
          </div>
          <input type="checkbox" checked={welcomeEnabled} disabled={saving || !connected} onChange={(e) => toggle("welcomeEnabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Auto Follow-ups</p>
            <p className="text-xs text-slate-400">
              Send one follow-up to leads inactive for{" "}
              <input
                type="number"
                min={1}
                max={30}
                value={inactiveDays}
                onChange={(e) => saveInactiveDays(Number(e.target.value))}
                className="w-12 bg-slate-100 border border-slate-200 rounded px-1 text-center"
              />{" "}
              days
            </p>
          </div>
          <input type="checkbox" checked={followUpEnabled} disabled={saving || !connected} onChange={(e) => toggle("followUpEnabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {log.length > 0 && (
        <div className="pt-2 border-t border-slate-200 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400">Recent auto-sent emails</p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {log.map((l) => (
              <div key={l.id} className={`text-xs rounded-lg p-2 ${l.success ? "bg-slate-100" : "bg-red-500/10"}`}>
                <span className="font-medium text-slate-600">{l.email_type === "welcome" ? "Welcome" : "Follow-up"} → {l.recipient}:</span>{" "}
                {l.success ? <span className="text-slate-700">{l.subject}</span> : <span className="text-red-400">Failed — {l.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
