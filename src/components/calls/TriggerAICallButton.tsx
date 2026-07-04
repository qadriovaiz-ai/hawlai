"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Loader2 } from "lucide-react";

export default function TriggerAICallButton({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleTrigger() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Call trigger nahi ho paya");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={handleTrigger} disabled={loading} className="btn-secondary" title="AI se automatically call karo">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4 text-purple-500" />}
        AI Call
      </button>
      {error && (
        <p className="absolute top-full left-0 mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 whitespace-nowrap z-10">
          {error}
        </p>
      )}
    </div>
  );
}
