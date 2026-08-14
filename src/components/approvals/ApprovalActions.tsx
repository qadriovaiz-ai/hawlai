"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ApprovalAuthorityResult } from "@/lib/approvalAuthority";
import { Button } from "@/components/ui";

const CONFIRM_WINDOW_MS = 4000;

export default function ApprovalActions({
  approvalId,
  authority,
  amount,
}: {
  approvalId: string;
  authority: ApprovalAuthorityResult;
  amount: number | null;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Anything with a real ₹ amount already crossed the dealership's
  // approval threshold to land here in the first place — that's real
  // money, so it gets a deliberate second click rather than a single
  // accidental one. Non-monetary actions (pause, targeting-only) stay
  // single-click.
  const needsConfirm = amount !== null;

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  async function submitDecision(status: "approved" | "rejected", reason: string | null) {
    setError(null);
    setLoading(status === "approved" ? "approve" : "reject");
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason }),
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

  function handleApproveClick() {
    if (!needsConfirm) {
      submitDecision("approved", null);
      return;
    }
    if (confirmingApprove) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      submitDecision("approved", null);
      return;
    }
    setConfirmingApprove(true);
    confirmTimer.current = setTimeout(() => setConfirmingApprove(false), CONFIRM_WINDOW_MS);
  }

  if (rejecting) {
    return (
      <div className="w-full sm:w-72 shrink-0 space-y-2">
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={2}
          autoFocus
          className="input text-sm resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => {
              setRejecting(false);
              setRejectReason("");
            }}
            disabled={loading !== null}
            variant="secondary"
            size="sm"
          >
            Cancel
          </Button>
          <Button
            onClick={() => submitDecision("rejected", rejectReason.trim() || null)}
            disabled={loading !== null}
            loading={loading === "reject"}
            variant="secondary"
            size="sm"
            className="text-red-400 border-red-700/50 hover:bg-red-500/10"
          >
            {loading !== "reject" && <X className="w-3.5 h-3.5" />}
            Confirm reject
          </Button>
        </div>
        {error && <p className="text-[11px] text-red-400 text-right">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0 w-full sm:w-auto">
      <div className="flex items-center gap-2 justify-end">
        {authority.canApprove ? (
          <Button
            onClick={handleApproveClick}
            disabled={loading !== null}
            loading={loading === "approve"}
            variant="primary"
            className={`transition-all duration-150 bg-gradient-to-b from-green-600 to-green-700 shadow-green-600/20 ${
              confirmingApprove ? "" : "hover:brightness-110"
            }`}
          >
            {loading !== "approve" && <Check className="w-4 h-4" />}
            {confirmingApprove ? `Confirm ${amount !== null ? formatCurrency(amount) : ""} →` : "Approve"}
          </Button>
        ) : (
          <span
            title={authority.reason}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200/80"
          >
            <Lock className="w-3.5 h-3.5" /> Needs owner
          </span>
        )}
        <Button
          onClick={() => setRejecting(true)}
          disabled={loading !== null}
          variant="secondary"
          className="text-red-400 border-red-700/50 hover:bg-red-500/10"
        >
          <X className="w-4 h-4" />
          Reject
        </Button>
      </div>
      {!authority.canApprove && authority.reason && (
        <p className="text-[11px] text-amber-500 max-w-[260px] text-right">{authority.reason}</p>
      )}
      {error && <p className="text-[11px] text-red-400 max-w-[260px] text-right">{error}</p>}
    </div>
  );
}
