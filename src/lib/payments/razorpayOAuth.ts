// Connect Razorpay — OAuth through Hawlai's Razorpay Technology Partner app.
//
// Replaces pasting a Key ID and Key Secret. The owner signs in on
// Razorpay's own page and approves Hawlai, the same shape as connecting
// Meta, Shopify or Canva; Razorpay hands back tokens scoped to their
// account. Nobody copies, types or sees a key.
//
// Docs: https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/
//
// Server configuration (from Razorpay's Partner dashboard):
//   RAZORPAY_OAUTH_CLIENT_ID, RAZORPAY_OAUTH_CLIENT_SECRET
//   RAZORPAY_OAUTH_MODE = "test" while testing; anything else is live
//   COMMERCE_ENCRYPTION_KEY — the tokens are stored encrypted
// Redirect URI to register: https://<app domain>/api/integrations/razorpay/callback
//
// What Razorpay issues: access_token (Bearer, 90 days), refresh_token
// (180 days), public_token (the Checkout.js key) and the account id.
// Payments on orders created with these tokens are signed with the
// partner app's client secret.

import { encryptedWrite } from "@/lib/crypto/commerceSecrets";
import { isRingConfigured } from "@/lib/crypto/secretCrypto";

const AUTH_BASE = "https://auth.razorpay.com";

export function razorpayOAuthEnv(): { clientId: string | null; clientSecret: string | null; mode: "test" | "live" } {
  return {
    clientId: process.env.RAZORPAY_OAUTH_CLIENT_ID?.trim() || null,
    clientSecret: process.env.RAZORPAY_OAUTH_CLIENT_SECRET?.trim() || null,
    mode: process.env.RAZORPAY_OAUTH_MODE?.trim() === "test" ? "test" : "live",
  };
}

/** Connect Razorpay can be offered: partner app credentials AND somewhere safe to keep the tokens. */
export function isRazorpayOAuthConfigured(): boolean {
  const { clientId, clientSecret } = razorpayOAuthEnv();
  return Boolean(clientId && clientSecret) && isRingConfigured("commerce");
}

export function razorpayRedirectUri(origin: string): string {
  return `${origin}/api/integrations/razorpay/callback`;
}

export function buildRazorpayAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(`${AUTH_BASE}/authorize`);
  url.searchParams.set("client_id", razorpayOAuthEnv().clientId ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  // read_write: creating orders and refunds needs write access.
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", state);
  return url.toString();
}

export type RazorpayTokens = {
  accessToken: string;
  refreshToken: string;
  /** Absent on some refresh responses — keep the stored one then. */
  publicToken: string | null;
  accountId: string | null;
  expiresIn: number;
};

async function tokenRequest(body: Record<string, string>, what: string): Promise<RazorpayTokens> {
  const { clientId, clientSecret } = razorpayOAuthEnv();
  if (!clientId || !clientSecret) throw new Error("Connect Razorpay isn't configured on this server");

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  // Text first: a non-JSON body is exactly the evidence worth keeping
  // (the Shopify callback lesson). Never logged or thrown: the request,
  // which carries the client secret, or any token.
  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // handled below
  }
  if (!res.ok || !data?.access_token) {
    const why = data?.error_description ?? data?.error?.description ?? data?.error ?? raw.slice(0, 200);
    throw new Error(`Razorpay ${what} failed (${res.status}): ${typeof why === "string" ? why : JSON.stringify(why)}`);
  }
  if (!data.refresh_token) throw new Error(`Razorpay ${what} returned no refresh token`);
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token),
    publicToken: data.public_token ? String(data.public_token) : null,
    accountId: data.razorpay_account_id ? String(data.razorpay_account_id) : null,
    expiresIn: Number(data.expires_in) || 90 * 24 * 60 * 60,
  };
}

export async function exchangeRazorpayCode(code: string, redirectUri: string): Promise<RazorpayTokens> {
  const tokens = await tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri, mode: razorpayOAuthEnv().mode },
    "connection"
  );
  // Without it, Checkout.js has no key to open with.
  if (!tokens.publicToken) throw new Error("Razorpay connection returned no public token");
  return tokens;
}

export function refreshRazorpayTokens(refreshToken: string): Promise<RazorpayTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, "token refresh");
}

/** Asks Razorpay to revoke Hawlai's access. True only when Razorpay confirms it. */
export async function revokeRazorpayToken(accessToken: string): Promise<boolean> {
  const { clientId, clientSecret } = razorpayOAuthEnv();
  if (!clientId || !clientSecret) return false;
  try {
    const res = await fetch(`${AUTH_BASE}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, token_type_hint: "access_token", token: accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The dealership update that stores a connection. Tokens are only ever written encrypted. */
export function oauthTokensWrite(tokens: RazorpayTokens & { publicToken: string }, mode: string, now = Date.now()) {
  return {
    ...encryptedWrite("razorpay_oauth_access_token", tokens.accessToken),
    ...encryptedWrite("razorpay_oauth_refresh_token", tokens.refreshToken),
    razorpay_oauth_public_token: tokens.publicToken,
    razorpay_account_id: tokens.accountId,
    razorpay_oauth_expires_at: new Date(now + tokens.expiresIn * 1000).toISOString(),
    razorpay_oauth_mode: mode,
  };
}
