// Multi-touch attribution, Phase A (see migrations 112 + 113). Three
// kinds of touchpoint get recorded:
//  - "creation" — the channel a lead was created through, derived from
//    the same `source` every lead row already carries. Written at all
//    5 lead-creation call sites, so every lead has at least one
//    touchpoint.
//  - "bridged" — pre-conversion engagement events (WhatsApp CTA click,
//    chat widget open) that happened on /p/[slug] or /site/[slug]
//    before the visitor became a lead, matched back via the anonymous
//    visitor_id set in localStorage and stamped onto page_events.
//  - "utm" — the traffic source of the visitor's first page view, if
//    the link they clicked was UTM-tagged (via /dashboard/website's
//    link generator, or an ad launched through Hawlai). No UTM tag
//    present just means no row gets added here — organic/direct
//    traffic is the implicit leftover, not a tracked channel.

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
      .select("event_type, created_at, utm_source, utm_medium")
      .eq("dealership_id", params.dealershipId)
      .eq("visitor_id", params.visitorId)
      .gte("created_at", lookback)
      .order("created_at", { ascending: true });

    if (!events || events.length === 0) return;

    const rows = events
      .filter((e: { event_type: string }) => e.event_type in PAGE_EVENT_CHANNEL)
      .map((e: { event_type: string; created_at: string }) => ({
        lead_id: params.leadId,
        dealership_id: params.dealershipId,
        channel: PAGE_EVENT_CHANNEL[e.event_type],
        occurred_at: e.created_at,
      }));

    // The earliest event carrying a UTM tag is the visitor's actual
    // entry point — later events on the same visit repeat the same
    // tag (trackEvent reads it fresh off the URL every call), so only
    // the first one matters for attribution.
    const firstTagged = events.find((e: { utm_source: string | null }) => e.utm_source);
    if (firstTagged) {
      rows.push({
        lead_id: params.leadId,
        dealership_id: params.dealershipId,
        channel: firstTagged.utm_medium ? `${firstTagged.utm_source}/${firstTagged.utm_medium}` : firstTagged.utm_source,
        occurred_at: firstTagged.created_at,
      });
    }

    if (rows.length === 0) return;

    // ignoreDuplicates so a retried bridge (or an event that already
    // got bridged for this lead) no-ops instead of erroring — relies
    // on the (lead_id, channel, occurred_at) unique index from
    // migration 112.
    await supabase.from("lead_touchpoints").upsert(rows, { onConflict: "lead_id,channel,occurred_at", ignoreDuplicates: true });
  } catch (err: any) {
    console.error("[touchpointAgent] bridgeVisitorTouchpoints failed:", err.message);
  }
}
