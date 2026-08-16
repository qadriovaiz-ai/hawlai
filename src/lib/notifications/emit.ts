// ------------------------------------------------------------------
// Notification emit helper — master audit Part D.
// ------------------------------------------------------------------
// One insert point for every proactive signal the platform already
// detects. Best-effort by design: a notification is a convenience on
// top of work that already succeeded (an alert row was written, a
// campaign was paused, a lead was captured), so failing to record one
// must never fail the caller. Every call is wrapped and swallowed.
//
// dedupe_key carries a stable per-source identifier (an alert id, a
// campaign id, a lead id) so a re-run or retried cron step collides on
// the partial unique index and no-ops instead of emitting a duplicate.
// ------------------------------------------------------------------

export type NotificationKind =
  | "competitor_alert"
  | "topic_alert"
  | "campaign_auto_paused"
  | "hot_lead"
  | "approval_pending"
  | "customer_at_risk"
  | "lead_going_cold"
  | "campaign_budget_warning"
  | "campaign_budget_overrun"
  | "variant_draft_generated"
  | "call_needs_follow_up"
  | "call_escalated";

export interface EmitNotificationInput {
  dealershipId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  dedupeKey?: string | null;
}

export async function emitNotification(supabase: any, input: EmitNotificationInput): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      dealership_id: input.dealershipId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      dedupe_key: input.dedupeKey ?? null,
    });
  } catch {
    // Best-effort — never break the real work this rides along with.
  }
}
