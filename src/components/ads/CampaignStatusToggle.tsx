"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Loader2 } from "lucide-react";

export default function CampaignStatusToggle({
  creativeId,
  currentStatus,
}: {
  creativeId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ads/${creativeId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kuch gadbad ho gaya");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isActive = currentStatus === "ACTIVE";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={isActive ? "btn-secondary text-amber-600 border-amber-200 hover:bg-amber-50" : "btn-primary"}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isActive ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {isActive ? "Pause" : "Activate"}
      </button>
      {error && <p className="text-xs text-red-500 max-w-[200px] text-right">{error}</p>}
    </div>
  );
}
