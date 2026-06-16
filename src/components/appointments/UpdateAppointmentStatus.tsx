"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function UpdateAppointmentStatus({ appointmentId, currentStatus }: { appointmentId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus !== "scheduled") return null;

  async function update(status: string) {
    setLoading(true);
    await fetch(`/api/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : (
        <>
          <button onClick={() => update("completed")} className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded transition-colors border border-green-200">
            Complete
          </button>
          <button onClick={() => update("cancelled")} className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded transition-colors border border-red-200">
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
