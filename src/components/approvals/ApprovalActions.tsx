"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Lock } from "lucide-react";
import type { ApprovalAuthorityResult } from "@/lib/approvalAuthority";

export default function ApprovalActions({ approvalId, authority }: { approvalId: string; authority: ApprovalAuthorityResult }) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function decide(status: "approved" | "rejected") {
    setError(null);
    setLoading(status === "approved" ? "approve" : "reject");
    let rejection_reason: string | null = null;

    if (status === "rejected") {
      rejection_reason = window.prompt("Reason for rejecting (optional):");
    }

    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <div className="flex items-center gap-2">
        {authority.canApprove ? (
          <button
            onClick={() => decide("approved")}
            disabled={loading !== null}
            className="btn-primary bg-green-600 hover:bg-green-700"
          >
            {loading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve
          </button>
        ) : (
          <button
            disabled
            title={authority.reason}
            className="btn-secondary opacity-60 cursor-not-allowed flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" /> Needs owner
          </button>
        )}
        <button
          onClick={() => decide("rejected")}
          disabled={loading !== null}
          className="btn-secondary text-red-400 border-red-700/50 hover:bg-red-500/10"
        >
          {loading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          Reject
        </button>
      </div>
      {!authority.canApprove && authority.reason && (
        <p className="text-[11px] text-amber-500 max-w-[220px] text-right">{authority.reason}</p>
      )}
      {error && <p className="text-[11px] text-red-400 max-w-[220px] text-right">{error}</p>}
    </div>
  );
}
