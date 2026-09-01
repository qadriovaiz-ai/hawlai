import Link from "next/link";
import { PlugZap, Clock, AlertCircle } from "lucide-react";
import { CHANNEL_LABELS, type Loaded } from "@/lib/dashboard/dashboardData";

// Renders the three non-value states from §4.4, so no component has to
// decide for itself what "no number" looks like.
//
// The distinction this exists to protect: a disconnected channel, a
// connected channel with nothing yet, and a failed load are three
// different messages to a business owner. Only the middle one means
// "nothing happened". Showing 0 for the other two tells them their
// marketing produced nothing when we simply couldn't see it.

export function DataStateNote({ state, compact = false }: { state: Exclude<Loaded<unknown>, { state: "ok" }>; compact?: boolean }) {
  if (state.state === "not_connected") {
    return (
      <div className={compact ? "" : "py-2"}>
        <p className={`${compact ? "text-[11px]" : "text-xs"} text-slate-500 flex items-center gap-1.5`}>
          <PlugZap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {CHANNEL_LABELS[state.channel]} isn&apos;t connected
        </p>
        {/* Named destination rather than a vague "check settings" — the
            fix is one specific page and it should be one click. */}
        <Link
          href="/dashboard/settings/integrations"
          className={`${compact ? "text-[10.5px]" : "text-xs"} text-brand-500 hover:underline`}
        >
          Connect it to see this
        </Link>
      </div>
    );
  }

  if (state.state === "no_data") {
    return (
      <p className={`${compact ? "text-[11px]" : "text-xs"} text-slate-400 flex items-start gap-1.5 ${compact ? "" : "py-2"}`}>
        <Clock className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>{state.reason}</span>
      </p>
    );
  }

  return (
    <p className={`${compact ? "text-[11px]" : "text-xs"} text-red-500 flex items-start gap-1.5 ${compact ? "" : "py-2"}`}>
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
      {/* Retry is the Refresh button in the toolbar above — pointing at
          it beats a second button that does the same router.refresh(). */}
      <span>{state.message} Use Refresh above to try again.</span>
    </p>
  );
}
