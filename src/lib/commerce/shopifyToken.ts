// Keeping a Shopify access token usable.
//
// Shopify's expiring offline tokens live 60 MINUTES. Every caller that
// touches the Admin API has to come through here — a token read
// straight out of the database is very likely already dead.
//
// THE ROTATION HAZARD, which drives the whole design. Every refresh
// returns a NEW refresh token and invalidates the old one, and Shopify
// keeps exactly one current expiring offline token per app+store. Two
// concurrent refreshes are therefore destructive rather than merely
// wasteful: the loser's tokens are already dead at Shopify before
// either process writes anything, so no last-write-wins reconciliation
// can repair it. The race must be PREVENTED, not resolved afterwards.
//
// This is new in this codebase, and the reason no existing helper does
// it is not oversight: getValidGoogleAdsAccessToken, gmailAgent and
// youtubeAgent all skip locking because Google REUSES the same refresh
// token indefinitely. A concurrent refresh there wastes a request and
// harms nothing. Shopify is the first provider here that rotates.

import { encryptedWrite, shopifyAccessToken, shopifyRefreshToken } from "@/lib/crypto/commerceSecrets";

/** Refresh this far ahead of expiry, matching getValidGoogleAdsAccessToken. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** How long a refresh claim is honoured before another process may take it. */
export const REFRESH_LOCK_MS = 2 * 60 * 1000;

export type ShopifyTokenRow = {
  id: string;
  shopify_access_token_encrypted?: string | null;
  shopify_refresh_token_encrypted?: string | null;
  shopify_token_expires_at?: string | null;
  shopify_refresh_token_expires_at?: string | null;
  shopify_refresh_lock_at?: string | null;
};

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" | "reconnect_required" | "refresh_failed" | "busy"; detail?: string };

/** Whether a stored access token is still good, allowing for the refresh margin. */
export function isTokenFresh(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  // No expiry recorded means a legacy NON-EXPIRING token from before
  // migration 169. Those are exactly what Shopify now refuses, so
  // treating them as fresh would reintroduce the original bug. Stale
  // is the safe reading — it forces a refresh, and failing that, a
  // reconnect.
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return false;
  return expiry - now > REFRESH_MARGIN_MS;
}

/** Whether the 90-day refresh window has run out — only a merchant reconnect fixes this. */
export function isRefreshTokenExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return true;
  return expiry <= now;
}

/** Whether a held refresh claim is stale enough for another process to take over. */
export function isLockStale(lockAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lockAt) return true;
  const held = new Date(lockAt).getTime();
  if (!Number.isFinite(held)) return true;
  return now - held >= REFRESH_LOCK_MS;
}

/** The fields to persist after a successful refresh. Exported so the shape is testable. */
export function refreshedWrite(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
}, now: number = Date.now()) {
  return {
    ...encryptedWrite("shopify_access_token", data.access_token),
    // BOTH tokens are written together. Persisting the access token
    // without the rotated refresh token would strand the connection at
    // the next refresh, holding a refresh token Shopify has retired.
    ...encryptedWrite("shopify_refresh_token", data.refresh_token),
    shopify_token_expires_at: new Date(now + data.expires_in * 1000).toISOString(),
    shopify_refresh_token_expires_at: new Date(now + data.refresh_token_expires_in * 1000).toISOString(),
    // Releases the claim in the same write that stores the result.
    shopify_refresh_lock_at: null,
  };
}

/**
 * Exchange a refresh token for a new pair.
 *
 * Endpoint and parameters are per Shopify's OAuth documentation:
 * POST /admin/oauth/access_token with grant_type=refresh_token.
 */
export async function requestRefresh(
  shop: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; data: any } | { ok: false; detail: string }> {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, detail: "Shopify is not configured on this server." };

  try {
    const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token || !data?.refresh_token) {
      return { ok: false, detail: `Shopify refresh returned ${res.status}` };
    }
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, detail: err?.message ?? "Couldn't reach Shopify." };
  }
}

/**
 * A usable access token for this dealership, refreshing if needed.
 *
 * Unlike getValidGoogleAdsAccessToken this DOES write to the database,
 * and that is deliberate: the rotated refresh token must be persisted
 * atomically with the access token, so handing the caller a pair to
 * store would give every call site the chance to drop half of it.
 */
export async function getValidShopifyAccessToken(
  supabase: any,
  row: ShopifyTokenRow,
  shop: string,
  fetchImpl: typeof fetch = fetch
): Promise<TokenResult> {
  const current = shopifyAccessToken(row);
  if (!current) return { ok: false, reason: "not_connected" };

  if (isTokenFresh(row.shopify_token_expires_at)) return { ok: true, accessToken: current };

  const refreshToken = shopifyRefreshToken(row);
  if (!refreshToken) {
    // A pre-169 non-expiring token, or a connection whose refresh
    // token was never stored. Shopify refuses these outright, so the
    // merchant has to reconnect.
    return { ok: false, reason: "reconnect_required", detail: "legacy_non_expiring_token" };
  }
  if (isRefreshTokenExpired(row.shopify_refresh_token_expires_at)) {
    return { ok: false, reason: "reconnect_required", detail: "refresh_token_expired" };
  }

  // Claim the refresh. A conditional UPDATE is the mutex: exactly one
  // caller's UPDATE can match, and Postgres serialises them at row
  // level. Chosen over pg_advisory_lock because Supabase pools
  // connections — a session-scoped advisory lock is unreliable under
  // transaction pooling, and pg_advisory_xact_lock needs an explicit
  // transaction supabase-js does not expose.
  const staleBefore = new Date(Date.now() - REFRESH_LOCK_MS).toISOString();
  const { data: claimed } = await supabase
    .from("dealerships")
    .update({ shopify_refresh_lock_at: new Date().toISOString() })
    .eq("id", row.id)
    .or(`shopify_refresh_lock_at.is.null,shopify_refresh_lock_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Someone else is mid-refresh. Their result is written to the row
    // we just failed to claim, so re-read rather than refreshing in
    // parallel and killing their tokens.
    return { ok: false, reason: "busy", detail: "another refresh is in progress" };
  }

  const refreshed = await requestRefresh(shop, refreshToken, fetchImpl);
  if (!refreshed.ok) {
    // Release the claim so a later attempt is not blocked for two
    // minutes by a failure that already finished.
    await supabase.from("dealerships").update({ shopify_refresh_lock_at: null }).eq("id", row.id);
    return { ok: false, reason: "refresh_failed", detail: refreshed.detail };
  }

  const { error } = await supabase.from("dealerships").update(refreshedWrite(refreshed.data)).eq("id", row.id);
  if (error) {
    // The tokens are live at Shopify but unstored — the connection is
    // now broken and only a reconnect fixes it. Logged loudly because
    // nothing else will surface it.
    console.error(`[shopify-token] refreshed but could not persist for ${row.id}: ${error.message}`);
    return { ok: false, reason: "refresh_failed", detail: "could not persist refreshed token" };
  }

  return { ok: true, accessToken: refreshed.data.access_token };
}
