"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { LEAD_PROFILES, STAGES, type Stage } from "@/lib/leads/leadProfile";

export default function LeadStageSelect({ leadId, currentStatus, labels = LEAD_PROFILES.general.stages }: { leadId: string; currentStatus: string; labels?: Record<Stage, string> }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleChange(newStatus: string) {
    if (newStatus === currentStatus) return;
    setLoading(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <Select
        value={currentStatus}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="text-xs px-2 py-1.5"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </Select>
      {loading && <Loader2 className="w-3 h-3 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />}
    </div>
  );
}
