"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Loader2 } from "lucide-react";
import type { LeadStatus } from "@/types";

export default function AddToQueueButton({ leadId, currentStatus }: { leadId: string; currentStatus: LeadStatus }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus === "ready_to_call") {
    return (
      <span className="btn-secondary opacity-75 cursor-default">
        <PhoneCall className="w-4 h-4 text-purple-500" /> In Queue
      </span>
    );
  }

  if (currentStatus === "called" || currentStatus === "converted") return null;

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_call" }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={handleClick} disabled={loading} className="btn-secondary">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
      Add to Call Queue
    </button>
  );
}
