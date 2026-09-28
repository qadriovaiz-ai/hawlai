"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCw } from "lucide-react";

// The last catch for this route. Sections wrap themselves in
// components/ui/ErrorBoundary so one failure stays local; this is what
// shows if the failure is the page itself, and it exists because on
// 2026-09-28 that case rendered as a black screen with nothing on it.

export default function SeoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[seo-page] render failed:", error);
  }, [error]);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="card p-6 space-y-3">
        <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" /> SEO & Content didn't load
        </p>
        <p className="text-sm text-slate-500">
          Something on this page broke while it was loading. Nothing you've generated or saved is
          affected — it's this screen, not your data.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={reset} className="text-sm text-brand-400 hover:underline flex items-center gap-1.5">
            <RotateCw className="w-4 h-4" /> Try again
          </button>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
            Back to dashboard
          </Link>
        </div>
        {error.digest && (
          // The one thing support can match against the server logs.
          <p className="text-[11px] text-slate-400 pt-1">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
