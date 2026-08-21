"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

// P3 9b — data subject rights, per-person. Deliberately placed on the
// lead's own page rather than buried in settings: it's an action taken
// about a specific person, usually because that person asked.
export default function LeadPrivacyActions({ leadId, leadName }: { leadId: string; leadName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setBusy("export");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/privacy`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't export");
      // Straight to a file download — the point is handing the person
      // their data, not displaying it in the dashboard.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${leadName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-data-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function erase() {
    setBusy("erase");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/privacy`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't erase");
      router.push("/dashboard/leads");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(null);
    }
  }

  return (
    <div className="card p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Privacy</p>
      </div>
      <p className="text-xs text-slate-400">
        If this person asks for their data or asks to be forgotten, do it here.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={exportData} loading={busy === "export"} variant="secondary" size="sm">
          {busy !== "export" && <Download className="w-3.5 h-3.5" />} Export their data
        </Button>
        {confirming ? (
          <div className="flex gap-2">
            <Button onClick={erase} loading={busy === "erase"} variant="secondary" size="sm" className="text-red-400 border-red-700/50 hover:bg-red-500/10">
              {busy !== "erase" && <Trash2 className="w-3.5 h-3.5" />} Confirm — erase permanently
            </Button>
            <Button onClick={() => setConfirming(false)} variant="ghost" size="sm" disabled={busy !== null}>Cancel</Button>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)} variant="secondary" size="sm" className="text-red-400 border-red-700/50 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" /> Erase their data
          </Button>
        )}
      </div>

      {confirming && (
        <p className="text-[10.5px] text-slate-400">
          Erases their profile, calls, notes, appointments, messages and email history — permanently, and this can&apos;t be undone. Order and refund records are kept but de-linked from them, since financial records have to be retained.
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
