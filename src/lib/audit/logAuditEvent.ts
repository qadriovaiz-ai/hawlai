// P0 30b — writes into the immutable audit_log table (migration 128).
// Best-effort, same principle as emitNotification/runAndLog elsewhere
// in this codebase: a logging failure must never break the real
// action it's describing.

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
) {
  try {
    await supabase.from("audit_log").insert({
      dealership_id: params.dealershipId,
      actor: params.actor,
      event_type: params.eventType,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      summary: params.summary,
      details: params.details ?? {},
    });
  } catch {
    // swallow — see file header
  }
}
