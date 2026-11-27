import { Check, AlertTriangle, CircleDashed } from "lucide-react";
import type { Health } from "@/lib/integrations/healthState";

// ONE WAY TO SAY WHETHER A CONNECTION WORKS — 27 November 2026.
//
// Every integration card used to render its own green "Connected" from a
// stored value, and that is how a 23-day-dead Search Console token and an
// invalidated Instagram token both read as connected
// (docs/AUDIT-INTEGRATION-HEALTH.md). This is the only place the word
// "Connected" is drawn for a connection, and it is drawn only for a
// connection a real call has just confirmed.
//
// No hooks: server pages and client cards can both render it.

export const HEALTH_TEXT: Record<Health["state"], string> = {
  working: "Connected",
  needs_reconnect: "Connected but not responding — reconnect needed",
  not_responding: "Connected, but it isn't answering right now",
  incomplete: "Connected, but not set up to work yet",
  unchecked: "Linked · not checked yet",
  unverifiable: "Linked · can't be checked without sending a message",
};

export default function IntegrationHealthLine({
  health,
  detail,
  checkedAt,
}: {
  health: Health;
  /** Extra words after "Connected", e.g. "12 products found". Working only. */
  detail?: string | null;
  /** When the state was last confirmed, if it came from a stored check. */
  checkedAt?: string | null;
}) {
  const { state, reason } = health;
  const tone =
    state === "working" ? "text-green-400" : state === "unchecked" || state === "unverifiable" ? "text-slate-400" : "text-amber-400";
  const Icon = state === "working" ? Check : state === "unchecked" || state === "unverifiable" ? CircleDashed : AlertTriangle;
  const when = checkedAt ? new Date(checkedAt) : null;

  return (
    <div className="space-y-0.5">
      <span className={`flex items-center gap-1.5 text-xs ${tone}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {HEALTH_TEXT[state]}
        {state === "working" && detail ? ` — ${detail}` : ""}
      </span>
      {/* THE PROVIDER'S OWN WORDS. "invalid_grant" or "session
          invalidated" is what tells the owner reconnecting is the fix. */}
      {reason && state !== "working" && <p className="text-xs text-slate-400 break-words">{reason}</p>}
      {when && !Number.isNaN(when.getTime()) && (
        <p className="text-[11px] text-slate-400">Checked {when.toLocaleString()}</p>
      )}
    </div>
  );
}
