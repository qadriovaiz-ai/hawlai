"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

export default function MarkCalledButton({ leadId, dealershipId }: { leadId: string; dealershipId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleMarkCalled() {
    setLoading(true);
    // Update lead status
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "called" }),
    });
    // Log the call
    await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        dealership_id: dealershipId,
        status: "completed",
        duration: 0,
        summary: "Call logged manually from queue",
      }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={handleMarkCalled} disabled={loading} className="btn-secondary">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
      Mark Called
    </button>
  );
}
