"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const STAGES = [
  { value: "new", label: "New" },
  { value: "ready_to_call", label: "Ready to Call" },
  { value: "called", label: "Called" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "converted", label: "Converted" },
  { value: "not_interested", label: "Not Interested" },
];

export default function LeadStageSelect({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
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
      <select
        value={currentStatus}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
      >
        {STAGES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {loading && <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-2 text-slate-400" />}
    </div>
  );
}
