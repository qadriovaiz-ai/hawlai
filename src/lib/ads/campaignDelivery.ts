// Meta's live state for a campaign → one delivery status a person can read.
//
// Server-side. Built on readCampaignState (all three levels, the ids on
// file checked against Meta's hierarchy, transient errors retried), so
// the Status column and the snapshot job decide "active" exactly the
// way activation does, and cannot drift from it.

import { explainEffective, type CampaignState } from "@/lib/ads/campaignStatus";
import { DELIVERY_LABELS, type Delivery, type DeliveryState } from "@/lib/ads/campaignDeliveryDisplay";

const d = (state: DeliveryState, detail: string | null = null): Delivery => ({ state, label: DELIVERY_LABELS[state], detail });

/**
 * Graph's answer for an object that no longer exists or can no longer be
 * seen: code 100 with subcode 33 ("does not exist, cannot be loaded due
 * to missing permissions"), or 803 ("some of the aliases you requested
 * do not exist").
 */
function isGoneFromMeta(e: { code: number | null; subcode: number | null } | undefined): boolean {
  return !!e && ((e.code === 100 && e.subcode === 33) || e.code === 803);
}

const PAUSED_EFFECTIVE = new Set(["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]);

export function describeDelivery(s: CampaignState): Delivery {
  if (!s.ok) {
    if (s.problem === "missing") return d("not_on_meta");
    if (s.problem === "mismatch") return d("mismatch", "The ad on file sits under a different campaign on Meta.");
    if (isGoneFromMeta(s.error)) return d("not_found", "Deleted, or no longer visible to this Facebook connection.");
    return d("unknown", s.error ? `Meta: ${s.error.message}` : null);
  }

  const effective = s.levels.map((l) => l.effective);
  if (effective.includes("DELETED")) return d("deleted");
  if (effective.includes("ARCHIVED")) return d("archived");
  if (s.running) return d("active");

  // Switched off somewhere — the toggle a person flips in Ads Manager.
  const adEffective = s.ad.effective ?? "UNKNOWN";
  if (s.levels.some((l) => l.status === "PAUSED") || PAUSED_EFFECTIVE.has(adEffective)) return d("paused");

  // Switched on, but Meta isn't delivering it: in review, rejected,
  // billing, flagged. Say why.
  return d("not_delivering", explainEffective(adEffective));
}
