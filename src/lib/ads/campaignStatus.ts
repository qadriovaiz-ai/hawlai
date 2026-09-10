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
//
// AND ONE LEVEL IS NOT THE CAMPAIGN. Chat once told someone a campaign
// was "already live" while Ads Manager showed it Off. The check read
// the AD's effective_status alone, for the ad id stored on the row, and
// never asked whether that ad belonged to the campaign on the row.
// Everything that decides "running" now goes through readCampaignState:
// all three levels, and the ids on file checked against Meta's own
// hierarchy.
//
// AND ONE FAILED READ IS NOT A FAILED ACTION. Chat reported "couldn't
// confirm" twice about actions Meta had carried out: every read was a
// single attempt, and a pause Meta had accepted was reported like one
// that never happened. Reads and status writes now retry transient
// errors (metaRead.ts), verification waits briefly for Meta to catch up,
// and "accepted but not read back" is its own outcome: unconfirmed.

import { metaLog, metaError } from "@/lib/ads/metaLog";
import { metaRead, metaWriteIdempotent, metaRetryTiming, describeGraphFailure, waitMs, type GraphFailure } from "@/lib/ads/metaRead";

export type CampaignObjects = {
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
};

export type StatusResult =
  | { ok: true; effectiveStatus: string; flipped: string[] }
  | {
      ok: false;
      reason: string;
      effectiveStatus?: string;
      /**
       * Meta ACCEPTED every write, but the result could not be read back.
       * Not "nothing happened": a pause has almost certainly taken
       * effect, and an activation may already be spending.
       */
      unconfirmed?: true;
    };

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
export function explainEffective(status: string): string {
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

/** "campaign, ad set and ad" — the levels Meta actually accepted. */
function levelList(levels: string[]): string {
  const names = levels.map((l) => (l === "adset" ? "ad set" : l));
  return names.length <= 1 ? (names[0] ?? "ad") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Ask Meta what the AD will actually do. Prefer readCampaignState: one level is not the campaign. */
export async function readEffectiveStatus(adId: string, token: string): Promise<string | null> {
  const r = await metaRead(adId, "effective_status,status", token, { stage: "status.read" });
  return r.ok ? (r.data.effective_status ?? null) : null;
}

export type LevelState = {
  level: "campaign" | "adset" | "ad";
  id: string;
  /** What was asked for — the Ads Manager toggle. */
  status: string | null;
  /** What Meta will actually do. */
  effective: string | null;
};

export type CampaignState =
  | { ok: true; levels: LevelState[]; ad: LevelState; running: boolean }
  | {
      ok: false;
      reason: string;
      problem: "missing" | "unreadable" | "mismatch";
      /** Meta's own error when unreadable — tells "gone from Meta" (100/33) apart from a hiccup. */
      error?: GraphFailure;
    };

const UNREADABLE =
  "I couldn't read this campaign's status from Meta, so I can't tell whether it's running. Nothing was changed — try again in a moment.";

const MISMATCH =
  "The ad on file for this campaign sits under a different campaign on Meta, so this record doesn't match Ads Manager. I won't switch anything on until it's fixed — it could start the wrong ad.";

/**
 * Meta's live state for a campaign, at every level, or a refusal.
 *
 * THE ONE DEFINITION OF "RUNNING": the campaign, the ad set and the ad
 * all report effective_status ACTIVE. The activation preview uses it to
 * decide "already running", and setCampaignStatus uses it to verify an
 * activation, so the two cannot disagree.
 *
 * The ad is read with its parents' ids and they must match the ids on
 * file. A mismatch is not a detail: it means the row points at objects
 * from two different campaigns, and switching them on would start an
 * ad nobody meant to start.
 */
export async function readCampaignState(
  objects: CampaignObjects,
  token: string,
  dealershipId?: string
): Promise<CampaignState> {
  const { campaignId, adsetId, adId } = objects;
  if (!adId) return { ok: false, reason: "This campaign hasn't been created on Meta yet.", problem: "missing" };

  const adRead = await metaRead(adId, "effective_status,status,campaign_id,adset_id", token, { stage: "status.read.ad", dealershipId });
  if (!adRead.ok) return { ok: false, reason: UNREADABLE, problem: "unreadable", error: adRead.error };
  const adNode = adRead.data;

  // Required, not optional: Graph always returns the parents when asked.
  // Missing counts as not matching — an unconfirmed hierarchy is not a
  // confirmed one.
  if ((campaignId && adNode.campaign_id !== campaignId) || (adsetId && adNode.adset_id !== adsetId)) {
    metaError("status.hierarchy_mismatch", {
      dealership: dealershipId,
      ad: adId,
      stored_campaign: campaignId,
      stored_adset: adsetId,
      meta_campaign: adNode.campaign_id ?? null,
      meta_adset: adNode.adset_id ?? null,
    });
    return { ok: false, reason: MISMATCH, problem: "mismatch" };
  }

  const levels: LevelState[] = [];
  for (const [level, id] of [["campaign", campaignId], ["adset", adsetId]] as const) {
    if (!id) continue; // an older row that only stored an ad id
    const read = await metaRead(id, "effective_status,status", token, { stage: `status.read.${level}`, dealershipId });
    if (!read.ok) return { ok: false, reason: UNREADABLE, problem: "unreadable", error: read.error };
    levels.push({ level, id, status: read.data.status ?? null, effective: read.data.effective_status ?? null });
  }
  const ad: LevelState = { level: "ad", id: adId, status: adNode.status ?? null, effective: adNode.effective_status ?? null };
  levels.push(ad);

  return { ok: true, levels, ad, running: levels.every((l) => l.effective === "ACTIVE") };
}

/** Why a campaign that should be running is not, in plain words. */
function whyNotRunning(state: Extract<CampaignState, { ok: true }>): string {
  // The ad's own effective status carries the reason (CAMPAIGN_PAUSED,
  // PENDING_REVIEW…). Only if the ad claims ACTIVE while a parent does
  // not is the parent named directly.
  if (state.ad.effective !== "ACTIVE") return explainEffective(state.ad.effective ?? "UNKNOWN");
  const parent = state.levels.find((l) => l.effective !== "ACTIVE");
  if (!parent) return "Meta reports it as not delivering";
  const name = parent.level === "adset" ? "ad set" : "campaign";
  return parent.effective === "PAUSED"
    ? `the ${name} above it is still paused`
    : `the ${name} above it reports "${parent.effective ?? "unknown"}"`;
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

  // BEFORE SWITCHING ANYTHING ON: the ids on file must be one real
  // campaign on Meta. Otherwise this would start the parents of one
  // campaign and the ad of another. Not done for PAUSE: stopping spend
  // must never wait on a read, and pausing the wrong ad spends nothing.
  if (status === "ACTIVE") {
    const before = await readCampaignState(objects, token, dealershipId);
    if (!before.ok) return { ok: false, reason: before.reason };
  }

  // Campaign and ad set are optional so an older row that only stored
  // an ad id still works — it just cannot guarantee the parents.
  const levels: [string, string | null][] = [["campaign", campaignId], ["adset", adsetId], ["ad", adId]];
  const verb = status === "ACTIVE" ? "start" : "pause";

  const flipped: string[] = [];
  for (const [level, id] of levels) {
    if (!id) continue;
    // Retried on transient errors: setting a status to a value it may
    // already have is safe to send twice.
    const write = await metaWriteIdempotent(id, { status }, token, { stage: `status.flip.${level}`, dealershipId });
    if (!write.ok) {
      // Named by LEVEL. "Meta rejected the change" tells nobody which
      // of three objects refused or why.
      metaError("status.flip_failed", { dealership: dealershipId, level, id, status, http: write.error.http, code: write.error.code, detail: write.error.message });
      return { ok: false, reason: `Couldn't ${verb} the ${level}: ${describeGraphFailure(write.error)}` };
    }
    flipped.push(level);
    metaLog("status.flipped", { dealership: dealershipId, level, id, status });
  }

  // THE VERIFICATION. Every flip above can succeed while the ad still
  // does not deliver — that is precisely what happened before.
  //
  // ALLOW-LISTS IN BOTH DIRECTIONS. Running means every level says
  // ACTIVE (readCampaignState); paused means the ad reports one of the
  // known paused states; anything else is unconfirmed either way.
  const matches = (s: Extract<CampaignState, { ok: true }>) =>
    status === "ACTIVE" ? s.running : PAUSED_STATES.has(s.ad.effective ?? "");

  // Meta can take a moment to reflect a status change it has accepted.
  // A readable state that doesn't match yet is re-read a couple of times
  // before it is called a failure.
  let after = await readCampaignState(objects, token, dealershipId);
  for (const wait of metaRetryTiming.settleMs) {
    if (!after.ok || !after.ad.effective || matches(after)) break;
    metaLog("status.settling", { dealership: dealershipId, ad: adId, requested: status, effective: after.ad.effective, wait_ms: wait });
    await waitMs(wait);
    after = await readCampaignState(objects, token, dealershipId);
  }

  if (!after.ok || !after.ad.effective) {
    // Every write was accepted; only the read-back failed. That is
    // neither success nor "nothing happened", and saying either would be
    // false.
    const problem = after.ok ? "no_effective_status" : after.problem;
    metaError("status.unconfirmed", { dealership: dealershipId, ad: adId, status, problem, flipped: flipped.join(",") });
    const accepted = levelList(flipped);
    const reason =
      !after.ok && after.problem === "mismatch"
        ? `Meta accepted the ${verb} for the ${accepted} on file, but that ad sits under a different campaign on Meta, so I can't confirm the right campaign ${status === "ACTIVE" ? "started" : "stopped"}. Check Ads Manager.`
        : status === "ACTIVE"
          ? `Meta accepted the start request for the ${accepted}, but I couldn't read back whether it's delivering. It may already be spending — check Ads Manager, and ask me to pause it if it shouldn't be running.`
          : `Meta accepted the pause for the ${accepted}, so it should have stopped — but I couldn't read it back from Meta to confirm. Check Ads Manager to be sure.`;
    return { ok: false, unconfirmed: true, reason };
  }

  const effective = after.ad.effective;
  const wanted = matches(after);

  metaLog("status.verified", {
    dealership: dealershipId,
    ad: adId,
    requested: status,
    effective,
    levels: after.levels.map((l) => `${l.level}:${l.effective}`).join(","),
    matched: wanted,
  });

  if (!wanted) {
    return {
      ok: false,
      effectiveStatus: effective,
      reason:
        status === "ACTIVE"
          ? `Meta accepted the change but the ad still isn't running — ${whyNotRunning(after)}. Nothing is being spent.`
          : `Meta accepted the change but the ad still shows as running (${effective}). Check it in Ads Manager.`,
    };
  }

  return { ok: true, effectiveStatus: effective, flipped };
}
