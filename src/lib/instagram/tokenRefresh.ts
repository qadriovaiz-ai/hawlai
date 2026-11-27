// Keeping an Instagram connection alive — F3 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// AN INSTAGRAM LONG-LIVED TOKEN DIES AFTER ABOUT 60 DAYS, and nothing
// refreshed it. Every connection therefore stopped answering customers on
// a schedule, with nobody told — the integration-health audit's exact
// failure, timed. Instagram refreshes a long-lived token for another 60
// days when asked (`ig_refresh_token`), so long as it is still valid.
//
// DAILY, AND ONLY WHEN DUE: within REFRESH_WITHIN_MS of its known expiry,
// or with an unknown expiry — every connection made before migration 241.
// A refresh writes the token encrypted and nulls the plaintext, so this is
// also what migrates each row out of the clear.
//
// A FAILED REFRESH IS RECORDED through the integration-health helper, which
// tells the owner once. A SUCCESSFUL one is not recorded as "working": it
// proves the token, not the webhook subscription or the account id, and
// overwriting the health check's "not set up" with "working" would hide a
// real problem.

import { INSTAGRAM_TOKEN_SELECT, instagramTokenWrite, readInstagramToken } from "@/lib/crypto/oauthSecrets";
import { healthFromFailure, type Health } from "@/lib/integrations/healthState";

/** Refresh when the token has less than this left. */
export const REFRESH_WITHIN_MS = 10 * 24 * 60 * 60 * 1000;

const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";

export type RefreshResult =
  | { refreshed: true; expiresAt: string | null }
  | { skipped: string }
  | { error: string };

/** Is this token due for a refresh? Unknown expiry is due. */
export function refreshDue(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(t)) return true;
  return t - now.getTime() <= REFRESH_WITHIN_MS;
}

export async function refreshInstagramToken(service: any, dealershipId: string, now: Date = new Date()): Promise<RefreshResult> {
  const { data: row, error } = await service
    .from("dealerships")
    .select(`instagram_business_id, ${INSTAGRAM_TOKEN_SELECT}`)
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { error: `couldn't read the Instagram connection: ${error.message}` };
  if (!row?.instagram_business_id) return { skipped: "Instagram isn't connected" };

  let token: string | null;
  try {
    token = readInstagramToken(row, now.getTime());
  } catch (err: any) {
    return { error: `the stored Instagram token couldn't be read: ${err?.message ?? err}` };
  }
  if (!token) {
    // Past its known expiry, or never stored: only a reconnect helps.
    const fail = { state: "needs_reconnect" as const, reason: "the Instagram token has expired — reconnect Instagram once to fix this" };
    await recordFailure(service, dealershipId, fail);
    return { error: fail.reason };
  }
  if (!refreshDue(row.instagram_token_expires_at, now)) return { skipped: "not due yet" };

  let res: Response;
  let body: any;
  try {
    const url = new URL(REFRESH_URL);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", token);
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    body = await res.json().catch(() => ({}));
  } catch (err: any) {
    // NEVER the URL in a message: it carries the token.
    return { error: `couldn't reach Instagram to refresh the token: ${err?.name === "TimeoutError" ? "no answer within 10s" : err?.message ?? err}` };
  }
  if (!res.ok || !body?.access_token) {
    const e = body?.error;
    const why = [e?.type, e?.code ? `code ${e.code}` : null, e?.message].filter(Boolean).join(": ") || `HTTP ${res.status}`;
    await recordFailure(service, dealershipId, healthFromFailure(`${res.status} ${why}`));
    return { error: `Instagram refused to refresh the token (${why})` };
  }

  const write = instagramTokenWrite(String(body.access_token), Number(body.expires_in) || null, now.getTime());
  const { error: writeError } = await service.from("dealerships").update(write).eq("id", dealershipId);
  if (writeError) return { error: `the refreshed token couldn't be saved: ${writeError.message}` };
  return { refreshed: true, expiresAt: write.instagram_token_expires_at };
}

async function recordFailure(service: any, dealershipId: string, health: Health) {
  const { recordHealth } = await import("@/lib/integrations/health");
  await recordHealth(service, dealershipId, "instagram", health);
}
