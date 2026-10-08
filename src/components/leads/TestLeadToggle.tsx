"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * "This was my own test."
 *
 * WHY IT EXISTS: candle_by_qaaf's five leads are all the owner's own
 * tests, and every number and every piece of advice was computed from
 * them — a conversion rate, a Health Score, "call all 5 leads". A test
 * lead is not a customer who didn't buy; it is not a customer.
 *
 * MARKED, NEVER DELETED, the same way page_events.is_internal works. The
 * row stays readable and the trail stays intact; what changes is that
 * the Health Score, the Growth Advisor, Diagnosis and the business facts
 * stop counting it.
 *
 * MANUAL ONLY, and that is not a shortcut. There is no way to detect
 * this automatically with the current schema: page_events carries no
 * session identifier, leads carry no created_by, so a lead cannot be
 * tied to the visit that produced it or to the person who typed it. The
 * only automatic signal available would be the source being "manual
 * chat" — which is also how a real walk-in customer gets added, so
 * guessing from it would quietly erase genuine business. The owner knows
 * which ones were hers.
 */
export default function TestLeadToggle({ leadId, isTest }: { leadId: string; isTest: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Both directions: she may mis-mark one, and a mark she cannot
      // undo is a number she can never put right.
      body: JSON.stringify({ is_test: !isTest }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button variant={isTest ? "primary" : "ghost"} size="sm" onClick={handleClick} loading={loading}>
        {!loading && <FlaskConical className="w-3.5 h-3.5" />}
        {isTest ? "Counted as a test" : "This was my own test"}
      </Button>
      <p className="text-[11px] text-slate-500 leading-snug">
        {isTest
          ? "Kept here, and left out of your conversion rate, Health Score and any advice — so your numbers are about real customers."
          : "Mark a lead you created yourself while trying things out. It stays in your list; it just stops counting as a customer who didn't buy."}
      </p>
    </div>
  );
}
