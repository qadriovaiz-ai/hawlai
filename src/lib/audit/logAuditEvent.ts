// P0 30b — writes into the immutable audit_log table (migration 128).
// Best-effort, same principle as emitNotification/runAndLog elsewhere
// in this codebase: a logging failure must never break the real
// action it's describing.
//
// IT RETURNS WHETHER IT WROTE — 5 November 2026, and the swallow is
// unchanged: this still never throws, and the ten call sites that
// ignore the return behave exactly as before. It threw the REASON away
// as well, which is a different thing from not throwing. A caller whose
// row is the only record of something — see
// src/lib/growth/leftOut.ts — now has something to say when it is not
// there.
//
// The insert's own `error` was never looked at either: a refused insert
// and a successful one were indistinguishable to every caller.

export type AuditWrite = { ok: boolean; error?: string };

export async function logAuditEvent(
  supabase: any,
  params: {
    dealershipId: string;
    // Free text, matching the existing requested_by_agent/subsystem
    // convention — e.g. 'user:<uuid>', 'vapi_call_tool:log_complaint',
    // 'cron:daily_autopilot'. No agents/tools FK table (32d deferred).
    actor: string;
    eventType: string;
    resourceType?: string;
    resourceId?: string | null;
    summary: string;
    details?: Record<string, any>;
  }
): Promise<AuditWrite> {
  try {
    const { error } = await supabase.from("audit_log").insert({
      dealership_id: params.dealershipId,
      actor: params.actor,
      event_type: params.eventType,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      summary: params.summary,
      details: params.details ?? {},
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (err: any) {
    // STILL SWALLOWED — see the file header. Reported to the caller
    // rather than thrown at it.
    return { ok: false, error: String(err?.message ?? err) };
  }
}
