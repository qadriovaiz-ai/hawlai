// Multi-touch attribution, Phase A (see migration 112). Two kinds of
// touchpoint get recorded:
//  - "creation" — the channel a lead was created through, derived from
//    the same `source` every lead row already carries. Written at all
//    5 lead-creation call sites, so every lead has at least one
//    touchpoint.
//  - "bridged" — pre-conversion engagement events (WhatsApp CTA click,
//    chat widget open) that happened on /p/[slug] before the visitor
//    became a lead, matched back via the anonymous visitor_id set in
//    localStorage and stamped onto page_events. Only /p/[slug] sends a
//    visitor_id today (Website Builder's /site/[slug] doesn't wire
//    tracking yet), so this is a no-op for other sources.
//
// Deliberately NOT full multi-touch across organic/paid-social/direct —
// that needs UTM capture, a separate, not-yet-built extension.

const BRIDGE_LOOKBACK_DAYS = 30;

const PAGE_EVENT_CHANNEL: Record<string, string> = {
  whatsapp_click: "whatsapp",
  chat_open: "chat_widget",
};

export function deriveCreationChannel(source: string | null | undefined): string {
  return source || "unknown";
}

export async function recordFirstTouchpoint(
  supabase: any,
  params: { leadId: string; dealershipId: string; source: string | null | undefined }
) {
  const channel = deriveCreationChannel(params.source);
  // Best-effort — a failed touchpoint insert should never affect lead
  // creation itself, same pattern as emitNotification().
  try {
    await supabase.from("lead_touchpoints").insert({
      lead_id: params.leadId,
      dealership_id: params.dealershipId,
      channel,
    });
  } catch (err: any) {
    console.error("[touchpointAgent] recordFirstTouchpoint failed:", err.message);
  }
}

export async function bridgeVisitorTouchpoints(
  supabase: any,
  params: { leadId: string; dealershipId: string; visitorId: string | null | undefined }
) {
  if (!params.visitorId) return;

  try {
    const lookback = new Date(Date.now() - BRIDGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await supabase
      .from("page_events")
      .select("event_type, created_at")
      .eq("dealership_id", params.dealershipId)
      .eq("visitor_id", params.visitorId)
      .in("event_type", Object.keys(PAGE_EVENT_CHANNEL))
      .gte("created_at", lookback);

    if (!events || events.length === 0) return;

    const rows = events.map((e: { event_type: string; created_at: string }) => ({
      lead_id: params.leadId,
      dealership_id: params.dealershipId,
      channel: PAGE_EVENT_CHANNEL[e.event_type],
      occurred_at: e.created_at,
    }));

    // ignoreDuplicates so a retried bridge (or an event that already
    // got bridged for this lead) no-ops instead of erroring — relies
    // on the (lead_id, channel, occurred_at) unique index from
    // migration 112.
    await supabase.from("lead_touchpoints").upsert(rows, { onConflict: "lead_id,channel,occurred_at", ignoreDuplicates: true });
  } catch (err: any) {
    console.error("[touchpointAgent] bridgeVisitorTouchpoints failed:", err.message);
  }
}
