"use client";

import { useState } from "react";

export default function ApprovalSlip() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="relative mx-auto max-w-sm">
      <div className="relative rounded-sm border border-ink/15 bg-paper shadow-[0_18px_40px_-20px_rgba(23,19,49,0.35)] p-6 rotate-[-1.2deg]">
        <div className="flex items-center justify-between border-b border-dashed border-ink/20 pb-3 mb-4">
          <span className="font-code text-[10px] tracking-[0.18em] uppercase text-ink/50">
            Requisition — #HW-2214
          </span>
          <span className="font-code text-[10px] tracking-[0.18em] uppercase text-ink/50">
            8:41 AM
          </span>
        </div>

        <p className="font-code text-[11px] uppercase tracking-wide text-ink/40 mb-1">Action requested</p>
        <p className="font-heading text-lg text-ink leading-snug mb-4">
          Boost "Diwali Sale" post — ₹1,200 spend, 3 days
        </p>

        <div className="flex items-center justify-between font-code text-[11px] text-ink/50 mb-5">
          <span>Requested by: AI Employee</span>
          <span>Approver: You</span>
        </div>

        {!approved ? (
          <button
            onClick={() => setApproved(true)}
            className="w-full font-code text-xs uppercase tracking-wide bg-ink text-paper py-2.5 rounded-sm hover:bg-ink/90 transition-colors"
          >
            Tap to approve
          </button>
        ) : (
          <div className="w-full text-center font-code text-xs uppercase tracking-wide text-ink/30 py-2.5 border border-dashed border-ink/20 rounded-sm">
            Spend released
          </div>
        )}
      </div>

      {approved && (
        <div className="pointer-events-none absolute -top-4 -right-6 rotate-[14deg] animate-[stamp-in_0.35s_ease-out]">
          <div className="border-[3px] border-stamp text-stamp rounded-full w-28 h-28 flex items-center justify-center">
            <span className="font-code text-[11px] font-bold uppercase tracking-wider text-center leading-tight">
              Approved<br />by you
            </span>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes stamp-in {
          0% { opacity: 0; transform: rotate(14deg) scale(1.6); }
          60% { opacity: 1; }
          100% { opacity: 1; transform: rotate(14deg) scale(1); }
        }
      `}</style>
    </div>
  );
}
