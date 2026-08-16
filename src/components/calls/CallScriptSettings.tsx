"use client";

import { useState, useEffect } from "react";
import { Loader2, MessageSquareText, Check } from "lucide-react";

export default function CallScriptSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customCallInstructions, setCustomCallInstructions] = useState("");
  const [customFirstMessage, setCustomFirstMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings/call-script")
      .then((r) => r.json())
      .then((d) => {
        setCustomCallInstructions(d.customCallInstructions ?? "");
        setCustomFirstMessage(d.customFirstMessage ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings/call-script", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCallInstructions, customFirstMessage }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading script settings...</div>;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><MessageSquareText className="w-4 h-4 text-brand-400" /> Customize your calling script</p>
      <p className="text-xs text-slate-400 -mt-2">
        Every call is already scripted fresh from your business name, category, and Brand Voice tone. Use these fields to add
        anything specific the AI should mention or avoid, and to override the opening line it uses.
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Additional instructions (optional)</label>
        <textarea
          value={customCallInstructions}
          onChange={(e) => setCustomCallInstructions(e.target.value)}
          placeholder="e.g. Always mention our weekend delivery slots. Never discuss bulk-order pricing on the call — offer a callback instead."
          rows={4}
          className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Opening line (optional)</label>
        <textarea
          value={customFirstMessage}
          onChange={(e) => setCustomFirstMessage(e.target.value)}
          placeholder={'e.g. Hi {leadName}, thanks for your interest — this is calling from our team. Use {leadName} to insert the lead’s name.'}
          rows={2}
          className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <p className="text-[11px] text-slate-400">Leave blank to use the default: &ldquo;Hi, am I speaking with [name]? I&rsquo;m calling on behalf of [your business].&rdquo;</p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="text-xs bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white px-3 py-2 rounded-lg flex items-center gap-1.5"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
