"use client";

import { useState, useEffect } from "react";
import {
  readConsent, writeConsent, clearVisitorId,
  getVisitorIdIfConsented, recordConsentServerSide,
} from "@/lib/consent";

// Visitor-facing tracking consent — retargeting piece 2/7.
//
// Policy (confirmed): essential-only by default. Nothing beyond
// aggregate view/click counts runs until the visitor actively
// chooses, and "no choice yet" is never treated as consent.
//
// Deliberately NOT a dark pattern: Decline is a real, equally
// reachable button, not a greyed-out link buried under "Manage
// preferences". A consent record obtained through a manipulated
// interface isn't valid consent, so making refusal awkward would
// undermine the very thing this exists to establish.
export default function ConsentBanner({ slug, businessName }: { slug: string; businessName?: string | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only surfaces for visitors who haven't chosen. Runs in an effect
    // so the server render never assumes a state it can't know.
    if (readConsent() === "pending") setVisible(true);
  }, []);

  function choose(status: "granted" | "denied") {
    writeConsent(status);

    if (status === "granted") {
      // The id is minted only now — never speculatively before a
      // choice, since an identifier stored "just in case" is exactly
      // what consent is meant to gate.
      const visitorId = getVisitorIdIfConsented();
      recordConsentServerSide(slug, status, visitorId);
    } else {
      // A visitor who previously accepted and now declines must not
      // keep the identifier that consent was controlling.
      const existingId = getVisitorIdIfConsented();
      recordConsentServerSide(slug, status, existingId);
      clearVisitorId();
    }

    setVisible(false);
    // Third-party pixels are rendered conditionally on consent, so a
    // reload is the simplest honest way to apply the new state —
    // rather than injecting scripts imperatively and leaving the two
    // paths able to drift apart.
    if (status === "granted") window.location.reload();
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white shadow-lg p-4 sm:flex sm:items-center sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">Can we use cookies?</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {businessName ? `${businessName} uses` : "We use"} cookies to understand what people look at
            and to show relevant ads. You can say no — the site works exactly the same either way.
          </p>
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0 shrink-0">
          <button
            onClick={() => choose("denied")}
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            No thanks
          </button>
          <button
            onClick={() => choose("granted")}
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
