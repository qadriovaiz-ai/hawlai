"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";

const FIELDS = [
  { value: "welcome_email_auto_enabled", label: "Welcome Email Automation" },
  { value: "follow_up_email_auto_enabled", label: "Follow-up Email Automation" },
  { value: "dm_auto_reply_enabled", label: "DM Auto-Reply" },
  { value: "comment_auto_reply_enabled", label: "Comment Auto-Reply" },
  { value: "content_autopilot_enabled", label: "Content Autopilot" },
  { value: "auto_call_new_leads", label: "Auto-Call New Leads" },
  { value: "auto_pause_low_performers", label: "Auto-Pause Low Performers" },
];

interface Business {
  id: string;
  dealershipName: string;
}

export default function BulkAutomationPanel({ businesses }: { businesses: Business[] }) {
  const [field, setField] = useState(FIELDS[0].value);
  const [value, setValue] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(businesses.map((b) => b.id)));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleBusiness(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agency/bulk-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, dealershipIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(`Applied to ${data.updated} business${data.updated === 1 ? "" : "es"}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (businesses.length === 0) return null;

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Zap className="w-4 h-4 text-slate-400" /> Bulk Automation</p>
      <p className="text-xs text-slate-400">Turn a setting on or off across several businesses in one go, instead of switching into each one.</p>

      <div className="flex flex-wrap items-center gap-2">
        <select value={field} onChange={(e) => setField(e.target.value)} className="input text-xs w-auto">
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select value={value ? "on" : "off"} onChange={(e) => setValue(e.target.value === "on")} className="input text-xs w-auto">
          <option value="on">Turn On</option>
          <option value="off">Turn Off</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {businesses.map((b) => (
          <label key={b.id} className="flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 cursor-pointer">
            <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleBusiness(b.id)} className="w-3.5 h-3.5 accent-brand-600" />
            {b.dealershipName}
          </label>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {result && <p className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {result}</p>}

      <Button onClick={apply} disabled={selected.size === 0} loading={saving} variant="secondary" size="sm">
        Apply to {selected.size} business{selected.size === 1 ? "" : "es"}
      </Button>
    </div>
  );
}
