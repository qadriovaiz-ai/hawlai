// Which Razorpay connection a business has — read the same way
// everywhere money moves: checkout's "Pay Online", order creation,
// payment verification and refunds.
//
// select("*"), deliberately. The Connect Razorpay columns arrive with
// migration 178, which is run by hand. Naming them in a select would
// make every one of these reads FAIL until it runs — taking Pay Online
// down for businesses on API keys too. "*" returns whatever exists.

import { keyCredentials, type RazorpayCredentials } from "./razorpay";
import { razorpaySecret, razorpayOAuthAccessToken, razorpayOAuthRefreshToken } from "@/lib/crypto/commerceSecrets";
import { razorpayOAuthEnv, refreshRazorpayTokens, oauthTokensWrite } from "./razorpayOAuth";

type Row = Record<string, any> | null | undefined;

export type RazorpayConnection = {
  method: "oauth" | "keys" | null;
  /** For Razorpay API calls (orders, refunds). Null when there's no usable connection. */
  credentials: RazorpayCredentials | null;
  /**
   * Checks a payment's signature. Independent of token expiry: a
   * payment made a minute before the token lapsed is still real.
   */
  signingSecret: string | null;
  accountId: string | null;
  mode: string | null;
};

const NONE: RazorpayConnection = { method: null, credentials: null, signingSecret: null, accountId: null, mode: null };

/** Refresh this long before the access token lapses. */
const REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

function hasOAuth(row: Row): boolean {
  return Boolean(row?.razorpay_oauth_access_token_encrypted || row?.razorpay_oauth_refresh_token_encrypted);
}

function expiresAt(row: Row): number {
  return Date.parse(row?.razorpay_oauth_expires_at ?? "");
}

/** The connection a dealership row holds. Connect Razorpay wins over pasted keys. */
export function resolveRazorpay(row: Row, now = Date.now()): RazorpayConnection {
  if (hasOAuth(row)) {
    const { clientSecret } = razorpayOAuthEnv();
    const exp = expiresAt(row);
    const access = Number.isFinite(exp) && exp > now ? razorpayOAuthAccessToken(row) : null;
    const publicToken: string | null = row?.razorpay_oauth_public_token ?? null;
    return {
      method: "oauth",
      credentials: access && clientSecret && publicToken ? { method: "oauth", checkoutKey: publicToken, authorization: `Bearer ${access}` } : null,
      signingSecret: clientSecret,
      accountId: row?.razorpay_account_id ?? null,
      mode: row?.razorpay_oauth_mode ?? null,
    };
  }
  const secret = razorpaySecret(row);
  const credentials = keyCredentials(row?.razorpay_key_id, secret);
  return credentials ? { method: "keys", credentials, signingSecret: secret, accountId: null, mode: null } : NONE;
}

/**
 * What the Payments tab shows — worked out WITHOUT decrypting anything.
 * Whether a connection exists is answerable from which columns are set.
 */
export function razorpayStatus(row: Row, now = Date.now()) {
  if (hasOAuth(row)) {
    const exp = expiresAt(row);
    const usable = Boolean(
      razorpayOAuthEnv().clientSecret &&
        row?.razorpay_oauth_public_token &&
        ((Number.isFinite(exp) && exp > now) || row?.razorpay_oauth_refresh_token_encrypted)
    );
    return { method: "oauth" as const, connected: usable, needsReconnect: !usable, accountId: row?.razorpay_account_id ?? null, mode: row?.razorpay_oauth_mode ?? null };
  }
  const connected = Boolean(row?.razorpay_key_id && row?.razorpay_key_secret_encrypted);
  return { method: connected ? ("keys" as const) : null, connected, needsReconnect: false, accountId: null, mode: null };
}

/**
 * The business's Razorpay connection, refreshing Connect Razorpay tokens
 * that are about to lapse. Never throws: an unreadable or unusable
 * connection comes back without credentials, and checkout offers Cash
 * on Delivery instead of taking a payment it can't verify.
 */
export async function loadRazorpayConnection(supabase: any, dealershipId: string, now = Date.now()): Promise<RazorpayConnection> {
  const { data: row, error } = await supabase.from("dealerships").select("*").eq("id", dealershipId).maybeSingle();
  if (error) {
    console.error(`[razorpay] couldn't read the connection for ${dealershipId}: ${error.message}`);
    return NONE;
  }

  const current = resolveRazorpay(row, now);
  const exp = expiresAt(row);
  if (current.method !== "oauth" || (Number.isFinite(exp) && exp - now > REFRESH_WITHIN_MS)) return current;

  const refreshToken = razorpayOAuthRefreshToken(row);
  if (!refreshToken) return current;
  try {
    const t = await refreshRazorpayTokens(refreshToken);
    const write = oauthTokensWrite(
      { ...t, publicToken: t.publicToken ?? row.razorpay_oauth_public_token, accountId: t.accountId ?? row.razorpay_account_id ?? null },
      row.razorpay_oauth_mode ?? razorpayOAuthEnv().mode,
      now
    );
    // Only if nobody refreshed in between: Razorpay replaces the refresh
    // token on every refresh, and the loser of a race would otherwise
    // overwrite a live token with one Razorpay has already retired.
    const { error: saveError } = await supabase
      .from("dealerships")
      .update(write)
      .eq("id", dealershipId)
      .eq("razorpay_oauth_refresh_token_encrypted", row.razorpay_oauth_refresh_token_encrypted);
    if (saveError) console.error(`[razorpay] refreshed tokens couldn't be saved for ${dealershipId}: ${saveError.message}`);
    return resolveRazorpay({ ...row, ...write }, now);
  } catch (err: any) {
    // Still usable if the current token hasn't lapsed yet.
    console.error(`[razorpay] token refresh failed for ${dealershipId}: ${err?.message}`);
    return current;
  }
}

const CONNECTION_COLUMNS = [
  "razorpay_key_id",
  "razorpay_key_secret_encrypted",
  "razorpay_oauth_access_token_encrypted",
  "razorpay_oauth_refresh_token_encrypted",
  "razorpay_oauth_public_token",
  "razorpay_account_id",
  "razorpay_oauth_expires_at",
  "razorpay_oauth_mode",
];

/** Clears every Razorpay credential the row actually has — so it works before and after migration 178. */
export function clearedConnectionWrite(row: Record<string, any>): Record<string, null> {
  return Object.fromEntries(CONNECTION_COLUMNS.filter((c) => c in row).map((c) => [c, null]));
}
