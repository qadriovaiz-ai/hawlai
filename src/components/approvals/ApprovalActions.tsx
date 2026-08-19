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
  modifiableBudget,
}: {
  approvalId: string;
  authority: ApprovalAuthorityResult;
  amount: number | null;
  // Present only for change_campaign_budget requests — lets the
  // approver authorize a different daily budget than requested,
  // instead of only being able to approve-as-is or reject.
  modifiableBudget?: number | null;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [modifying, setModifying] = useState(false);
  const [modifiedBudget, setModifiedBudget] = useState(modifiableBudget != null ? String(modifiableBudget) : "");
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

  async function submitDecision(status: "approved" | "rejected", reason: string | null, modifiedDetails?: { new_budget: number }) {
    setError(null);
    setLoading(status === "approved" ? "approve" : "reject");
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason, ...(modifiedDetails ? { modified_details: modifiedDetails } : {}) }),
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

  // Only sent when the approver actually changed the number from what
  // was requested — leaving it untouched approves exactly as asked,
  // same as before this feature existed.
  const parsedModifiedBudget = modifiableBudget != null ? Number(modifiedBudget) : null;
  const hasModification = modifiableBudget != null && parsedModifiedBudget != null && parsedModifiedBudget > 0 && parsedModifiedBudget !== modifiableBudget;
  const effectiveAmount = hasModification ? parsedModifiedBudget! : amount;

  function handleApproveClick() {
    const modifiedDetails = hasModification ? { new_budget: parsedModifiedBudget! } : undefined;
    if (!needsConfirm) {
      submitDecision("approved", null, modifiedDetails);
      return;
    }
    if (confirmingApprove) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      submitDecision("approved", null, modifiedDetails);
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
      {modifiableBudget != null && (
        modifying ? (
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-xs text-slate-400">₹</span>
            <input
              type="number"
              value={modifiedBudget}
              onChange={(e) => setModifiedBudget(e.target.value)}
              className="input text-sm w-28 py-1"
              min={1}
              autoFocus
            />
            <span className="text-xs text-slate-400">/day</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setModifying(true)}
            className="text-[11px] text-brand-400 hover:underline self-end"
          >
            {hasModification ? `Approving at ${formatCurrency(parsedModifiedBudget!)} instead — edit` : "Approve a different amount instead"}
          </button>
        )
      )}
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
            {confirmingApprove ? `Confirm ${effectiveAmount !== null ? formatCurrency(effectiveAmount) : ""} →` : "Approve"}
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
