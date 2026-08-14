"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff, ShieldCheck, Loader2 } from "lucide-react";

// Master audit Part C1.3 — the only place dnd_opt_out actually gets
// set today. Manual-only: no automated STOP-keyword detection on
// WhatsApp/calls yet, so a dealer marking this after a customer asks
// to be left alone is the real-world flow this exists for.
export default function DndOptOutToggle({ leadId, optedOut }: { leadId: string; optedOut: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        optedOut
          ? { dnd_opt_out: false, dnd_opt_out_at: null, dnd_opt_out_source: null }
          : { dnd_opt_out: true, dnd_opt_out_at: new Date().toISOString(), dnd_opt_out_source: "manual" }
      ),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={optedOut ? "btn-secondary" : "btn-secondary text-red-600"}
      title={optedOut ? "Re-allow contacting this lead" : "Mark this lead as do-not-contact — blocks future calls and automated emails"}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : optedOut ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
      {optedOut ? "Opted out (DND)" : "Mark do-not-contact"}
    </button>
  );
}
