"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function ApprovalThresholdCard() {
  const [threshold, setThreshold] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/approval-threshold")
      .then((r) => r.json())
      .then((d) => {
        setThreshold(d.approvalThreshold);
        setDraft(String(d.approvalThreshold));
        setIsOwner(d.isOwner);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/approval-threshold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalThreshold: Number(draft) }),
      });
      if (res.ok) {
        setThreshold(Number(draft));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Approval Authority</p>
      <p className="text-xs text-slate-400">
        Owners and Admins can approve any amount. A Marketing Manager can approve spend up to this limit on their own —
        anything above it always needs you. Everyone else can view but not approve.
      </p>
      {isOwner ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">₹</span>
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-32 text-sm bg-slate-200 border border-slate-300 rounded-lg px-3 py-2"
          />
          <Button
            onClick={save}
            disabled={Number(draft) === threshold}
            loading={saving}
            size="sm"
          >
            {!saving && (saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />)}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Current limit: ₹{threshold?.toLocaleString("en-IN")} <span className="text-xs text-slate-400">— only the owner can change this</span></p>
      )}
    </div>
  );
}
