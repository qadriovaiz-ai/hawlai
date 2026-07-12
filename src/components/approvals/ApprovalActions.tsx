"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";

export default function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const router = useRouter();

  async function decide(status: "approved" | "rejected") {
    setLoading(status === "approved" ? "approve" : "reject");
    let rejection_reason: string | null = null;

    if (status === "rejected") {
      rejection_reason = window.prompt("Reason for rejecting (optional):");
    }

    try {
      await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={() => decide("approved")}
        disabled={loading !== null}
        className="btn-primary bg-green-600 hover:bg-green-700"
      >
        {loading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Approve
      </button>
      <button
        onClick={() => decide("rejected")}
        disabled={loading !== null}
        className="btn-secondary text-red-600 border-red-200 hover:bg-red-500/10"
      >
        {loading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        Reject
      </button>
    </div>
  );
}
