// Turning a Meta campaign on, and proving it actually turned on.
//
// THE BUG THIS REPLACES: the activate path POSTed status: "ACTIVE" to
// the AD and nothing else. Meta accepted it, returned success, and the
// dashboard showed ACTIVE — while the campaign and ad set created by
// the launch flow were still PAUSED. Meta's own docs:
//
//   "If this status is PAUSED, all its active ad sets and ads will be
//    paused and have an effective status CAMPAIGN_PAUSED."
//
// So the ad's configured status said ACTIVE, its EFFECTIVE status said
// CAMPAIGN_PAUSED, and it delivered nothing. A merchant would watch a
// live campaign spend zero and conclude the product was broken.
//
// STATUS IS NOT EFFECTIVE_STATUS. The first is what you asked for; the
// second is what Meta will actually do. Writing the first and reporting
// success is the same class of failure as an unchecked database error —
// the call succeeded, the outcome did not happen.

import { metaLog, metaError } from "@/lib/ads/metaLog";

const GRAPH_VERSION = "v23.0";

export type CampaignObjects = {
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
};

export type StatusResult =
  | { ok: true; effectiveStatus: string; flipped: string[] }
  | { ok: false; reason: string; effectiveStatus?: string };

/**
 * Effective statuses that mean "this ad is not delivering".
 *
 * Meta returns the REASON in the value — CAMPAIGN_PAUSED, ADSET_PAUSED
 * — which is exactly the diagnostic that was missing. Listed rather
 * than inferred so a new one Meta adds is treated as unknown and
 * surfaced, not silently accepted as running.
 */
const PAUSED_STATES = new Set([
  "PAUSED",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "ARCHIVED",
  "DELETED",
  "DISAPPROVED",
  "PENDING_REVIEW",
  "PENDING_BILLING_INFO",
  "IN_PROCESS",
  "WITH_ISSUES",
]);

/** Says what a not-delivering state means, in words a merchant can act on. */
function explainEffective(status: string): string {
  switch (status) {
    case "CAMPAIGN_PAUSED": return "the campaign above it is still paused";
    case "ADSET_PAUSED": return "the ad set above it is still paused";
    case "PENDING_REVIEW": return "Meta is still reviewing the ad";
    case "DISAPPROVED": return "Meta rejected the ad";
    case "PENDING_BILLING_INFO": return "the ad account needs billing details";
    case "WITH_ISSUES": return "Meta has flagged an issue with it";
    case "IN_PROCESS": return "Meta is still processing the change";
    case "ARCHIVED": return "it has been archived";
    case "DELETED": return "it has been deleted";
    case "PAUSED": return "it is still paused";
    default: return `Meta reports it as "${status}"`;
  }
}

async function post(node: string, body: Record<string, unknown>, token: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${node}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`${e.message ?? "Meta API error"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}${e.error_subcode ? ` (subcode ${e.error_subcode})` : ""}`);
  }
  return data;
}

/** Ask Meta what it will ACTUALLY do, not what we asked for. */
export async function readEffectiveStatus(adId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=effective_status,status&access_token=${encodeURIComponent(token)}`
    );
    const data = await res.json();
    if (!res.ok || data.error) return null;
    return data.effective_status ?? null;
  } catch {
    return null;
  }
}

/**
 * Set a campaign's status across all three levels, then verify.
 *
 * ORDER MATTERS AND DIFFERS BY DIRECTION.
 *
 * Turning ON: campaign → ad set → ad. A child cannot deliver while a
 * parent is paused, so parents go first; doing it the other way leaves
 * a window where the ad is "active" under a paused parent, which is the
 * exact state this function exists to prevent.
 *
 * Turning OFF: campaign first. Pausing the parent stops delivery
 * immediately, and spend is what we are racing. The children are then
 * paused too so the record is unambiguous rather than relying on
 * inheritance.
 */
export async function setCampaignStatus(input: {
  objects: CampaignObjects;
  token: string;
  status: "ACTIVE" | "PAUSED";
  dealershipId?: string;
}): Promise<StatusResult> {
  const { objects, token, status, dealershipId } = input;
  const { campaignId, adsetId, adId } = objects;

  if (!adId) return { ok: false, reason: "This campaign hasn't been created on Meta yet." };

  // Campaign and ad set are optional so an older row that only stored
  // an ad id still works — it just cannot guarantee the parents.
  const levels: [string, string | null][] =
    status === "ACTIVE"
      ? [["campaign", campaignId], ["adset", adsetId], ["ad", adId]]
      : [["campaign", campaignId], ["adset", adsetId], ["ad", adId]];

  const flipped: string[] = [];
  for (const [level, id] of levels) {
    if (!id) continue;
    try {
      await post(id, { status }, token);
      flipped.push(level);
      metaLog("status.flipped", { dealership: dealershipId, level, id, status });
    } catch (err: any) {
      // Named by LEVEL. "Meta rejected the change" tells nobody which
      // of three objects refused or why.
      metaError("status.flip_failed", { dealership: dealershipId, level, id, status, detail: err?.message ?? String(err) });
      return {
        ok: false,
        reason: `Couldn't ${status === "ACTIVE" ? "start" : "pause"} the ${level}: ${err?.message ?? String(err)}`,
      };
    }
  }

  // THE VERIFICATION. Every flip above can succeed while the ad still
  // does not deliver — that is precisely what happened before.
  const effective = await readEffectiveStatus(adId, token);
  if (!effective) {
    metaError("status.unverified", { dealership: dealershipId, ad: adId, status });
    return {
      ok: false,
      reason: `The change was sent to Meta but couldn't be confirmed. Check the campaign in Ads Manager before relying on it.`,
    };
  }

  // ALLOW-LISTS IN BOTH DIRECTIONS. The first version computed
  // "delivering" as "not in the paused list", so a state Meta adds
  // tomorrow read as ACTIVE — the test for exactly that caught it,
  // contradicting this file's own header. Running means Meta says
  // ACTIVE; paused means Meta says one of the known paused states;
  // anything else is unconfirmed either way.
  const wanted = status === "ACTIVE" ? effective === "ACTIVE" : PAUSED_STATES.has(effective);

  metaLog("status.verified", { dealership: dealershipId, ad: adId, requested: status, effective, matched: wanted });

  if (!wanted) {
    return {
      ok: false,
      effectiveStatus: effective,
      reason:
        status === "ACTIVE"
          ? `Meta accepted the change but the ad still isn't running — ${explainEffective(effective)}. Nothing is being spent.`
          : `Meta accepted the change but the ad still shows as running (${effective}). Check it in Ads Manager.`,
    };
  }

  return { ok: true, effectiveStatus: effective, flipped };
}
