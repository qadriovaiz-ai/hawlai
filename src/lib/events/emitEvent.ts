// P1 Event Bus foundation — outbox insert only. The actual reaction
// happens later, out of band, when pg_cron's frequent poll hits
// /api/events/dispatch (see migration 129's commented-out manual
// setup) — this function's job ends at "the event is durably queued,"
// same best-effort principle as emitNotification/logAuditEvent: a
// queueing failure must never break the real action that triggered it.

export async function emitEvent(
  supabase: any,
  params: { dealershipId: string; eventType: string; payload?: Record<string, any> }
) {
  try {
    await supabase.from("event_queue").insert({
      dealership_id: params.dealershipId,
      event_type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch {
    // swallow — see file header
  }
}
