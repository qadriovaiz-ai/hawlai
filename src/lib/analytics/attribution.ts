// ------------------------------------------------------------------
// Multi-touch attribution — P3 piece 8a
// ------------------------------------------------------------------
// lead_touchpoints (migration 112) has been collecting real
// multi-touch data all along — creation channel, bridged
// pre-conversion events (WhatsApp CTA click, chat widget open), and
// UTM source of the first page view. Nothing ever read it for
// attribution though, and /dashboard/analytics still showed
// single-touch-only source stats with a (now stale) comment saying a
// touchpoint table "doesn't exist yet".
//
// This is the attribution model over that existing data. No new
// collection, no schema.
//
// Three models, deliberately shown side by side rather than picking
// one "correct" answer: they genuinely disagree, and which one a
// business should trust depends on their sales cycle. Showing only
// one would imply a confidence the data doesn't support.
// ------------------------------------------------------------------

export type AttributionModel = "first_touch" | "last_touch" | "linear";

export interface ChannelAttribution {
  channel: string;
  firstTouch: { conversions: number; revenue: number };
  lastTouch: { conversions: number; revenue: number };
  linear: { conversions: number; revenue: number };
  totalTouches: number;
}

export interface AttributionResult {
  channels: ChannelAttribution[];
  convertedLeadsWithTouchpoints: number;
  convertedLeadsTotal: number;
  totalRevenue: number;
}

interface TouchpointRow { lead_id: string; channel: string; occurred_at: string }
interface ConvertedLeadRow { id: string; deal_value: number | null }

export function computeAttribution(
  convertedLeads: ConvertedLeadRow[],
  touchpoints: TouchpointRow[]
): AttributionResult {
  const byLead = new Map<string, TouchpointRow[]>();
  for (const t of touchpoints) {
    const list = byLead.get(t.lead_id) ?? [];
    list.push(t);
    byLead.set(t.lead_id, list);
  }

  const channels = new Map<string, ChannelAttribution>();
  const ensure = (channel: string): ChannelAttribution => {
    const existing = channels.get(channel);
    if (existing) return existing;
    const fresh: ChannelAttribution = {
      channel,
      firstTouch: { conversions: 0, revenue: 0 },
      lastTouch: { conversions: 0, revenue: 0 },
      linear: { conversions: 0, revenue: 0 },
      totalTouches: 0,
    };
    channels.set(channel, fresh);
    return fresh;
  };

  // Every touch counts toward totalTouches, including touches on leads
  // that never converted — that's the honest denominator for "how much
  // does this channel actually get used".
  for (const t of touchpoints) ensure(t.channel).totalTouches += 1;

  let convertedWithTouchpoints = 0;
  let totalRevenue = 0;

  for (const lead of convertedLeads) {
    const touches = (byLead.get(lead.id) ?? []).slice().sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );
    if (touches.length === 0) continue; // no touchpoint data for this lead — excluded, and reported as such
    convertedWithTouchpoints++;

    const revenue = Number(lead.deal_value) || 0;
    totalRevenue += revenue;

    ensure(touches[0].channel).firstTouch.conversions += 1;
    ensure(touches[0].channel).firstTouch.revenue += revenue;

    const last = touches[touches.length - 1];
    ensure(last.channel).lastTouch.conversions += 1;
    ensure(last.channel).lastTouch.revenue += revenue;

    // Linear splits credit evenly across DISTINCT channels, not raw
    // touches — otherwise a channel that fires three events for one
    // visit (chat open, WhatsApp click, page view) would out-credit a
    // channel that genuinely drove the conversion in one touch.
    const distinct = Array.from(new Set(touches.map((t) => t.channel)));
    const share = 1 / distinct.length;
    for (const channel of distinct) {
      const entry = ensure(channel);
      entry.linear.conversions += share;
      entry.linear.revenue += revenue * share;
    }
  }

  const rounded = Array.from(channels.values())
    .map((c) => ({
      ...c,
      linear: {
        conversions: Math.round(c.linear.conversions * 100) / 100,
        revenue: Math.round(c.linear.revenue),
      },
    }))
    .sort((a, b) => b.lastTouch.revenue - a.lastTouch.revenue || b.totalTouches - a.totalTouches);

  return {
    channels: rounded,
    convertedLeadsWithTouchpoints: convertedWithTouchpoints,
    convertedLeadsTotal: convertedLeads.length,
    totalRevenue,
  };
}
