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
  // Active on Meta and reaching nobody. A budget alert cannot catch
  // this: a campaign spending zero is comfortably UNDER its budget, so
  // the one state that means broken looked like the thriftiest
  // campaign on the account. Seventy days, September to November 2026.
  | "campaign_not_delivering"
  // A scheduled export the owner turned on did not go out. Distinct
  // from email_delivery_problem, which is a bounce AFTER a send — this
  // one never left. Nothing told anybody before: the failure was
  // written to lead_export_log and shown on the Autopilot page, which
  // is a screen somebody has to open.
  | "scheduled_export_failed"
  | "variant_draft_generated"
  | "call_needs_follow_up"
  | "call_escalated"
  | "refund_requested"
  | "goal_completed"
  | "goal_task_failed"
  | "lead_merge_needs_review"
  | "platform_spend_alert"
  | "out_of_season_content"
  | "email_delivery_problem"
  // Platform admins only: AI is down for every business (migration 190).
  | "platform_ai_unavailable"
  // S7/P3 (migration 218): the product has stopped doing something on
  // its own, because a claim nothing supports went out or because
  // nothing could be checked for days.
  | "autonomy_lowered"
  // A connected account stopped working and needs reconnecting
  // (migration 219). Generic: Gmail, YouTube and Ads hold refresh
  // tokens from the same Google app and can die the same way.
  | "integration_disconnected";

/**
 * The kinds that leave the app — P-a.
 *
 * ──────────────────────────────────────────────────────────────────
 * THE OWNER CHOSE THIS LIST, on 23 November 2026, from the sizing in
 * docs/RESEARCH-WHATSAPP-PROACTIVE.md §4. Three push, three stay.
 *
 *   campaign_not_delivering   the strongest case by far. A campaign
 *                             read Active in Hawlai and in Ads Manager
 *                             with zero impressions for SEVENTY DAYS
 *                             and nobody was told. Migration 234.
 *   hot_lead                  a person waiting on a reply, and the
 *                             only one of the three that can fire at
 *                             any hour — it comes from the meta-leads
 *                             webhook, not the daily run.
 *   campaign_budget_overrun   money already spent past its limit.
 *
 * DELIBERATELY NOT PUSHED: competitor_alert, topic_alert,
 * content_performance. Those are READING material and the daily email
 * is the right place for them. A push that fires for everything gets
 * muted, and then the real one is muted too — which is the whole
 * reason this is a list somebody chose rather than every kind above.
 *
 * A FOURTH ENTRY IS A DECISION, not a convenience: the set is pinned
 * by tests/opportunityPush.test.ts, so adding one fails the suite
 * until somebody writes down why.
 * ──────────────────────────────────────────────────────────────────
 */
export const PUSHED_KINDS: readonly NotificationKind[] = [
  "campaign_not_delivering",
  "hot_lead",
  "campaign_budget_overrun",
] as const;

export function isPushedKind(kind: string): boolean {
  return (PUSHED_KINDS as readonly string[]).includes(kind);
}

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
    // THE ERROR IS READ NOW, AND IT IS THE WHOLE MECHANISM BELOW.
    // A repeated dedupe_key collides on the partial unique index and
    // comes back as an error rather than a throw — which is exactly
    // what "this fact is not new" looks like. It is still swallowed;
    // it is just no longer invisible.
    const { error } = await supabase.from("notifications").insert({
      dealership_id: input.dealershipId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      dedupe_key: input.dedupeKey ?? null,
    });

    // ──────────────────────────────────────────────────────────────
    // P-a — THE PUSH RIDES THE ROW THAT WAS ACTUALLY WRITTEN
    // ──────────────────────────────────────────────────────────────
    //
    // ONLY ON A REAL INSERT. These detectors run daily, with a stable
    // dedupe_key, so most calls are a no-op collision — "the campaign
    // is still not delivering". Emitting regardless would email the
    // same fact every morning until he fixed it, which is how a push
    // becomes noise and then becomes muted.
    //
    // ALSO NOT ON ANY OTHER ERROR, which matters more than it looks.
    // Migration 234's whole story is a kind the DB constraint
    // rejected while this function swallowed the error — the detector
    // ran daily, found the silence, and was silent about it. An email
    // about a notification that does not exist would be the same bug
    // wearing a second hat.
    //
    // ONE PLACE, SO DETECTOR AND PUSH CANNOT DRIFT. The alternative
    // was emitEvent at each of the three call sites; then a fourth
    // detector emitting a pushed kind would silently not push.
    if (!error && isPushedKind(input.kind)) {
      const { emitEvent } = await import("@/lib/events/emitEvent");
      await emitEvent(supabase, {
        dealershipId: input.dealershipId,
        eventType: "opportunity_noticed",
        // The words the owner already has on the bell, carried rather
        // than recomposed — the same reason the approval notice quotes
        // the card's stored sentence instead of paraphrasing it.
        payload: {
          kind: input.kind,
          title: input.title,
          body: input.body ?? null,
          href: input.href ?? null,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
    }
  } catch {
    // Best-effort — never break the real work this rides along with.
  }
}
