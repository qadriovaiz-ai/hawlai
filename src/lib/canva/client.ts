// ------------------------------------------------------------------
// Canva Connect API client — OAuth and token lifecycle.
// ------------------------------------------------------------------
// VERIFIED against Canva's docs before writing:
//   - authorize:  https://www.canva.com/api/oauth/authorize
//   - token:      POST https://api.canva.com/rest/v1/oauth/token
//                 Content-Type: application/x-www-form-urlencoded
//                 client auth via HTTP Basic (base64 id:secret)
//   - PKCE is mandatory, code_challenge_method=S256, verifier 43-128
//     chars from the unreserved set.
//   - access tokens last 4 hours.
//   - REFRESH TOKENS ARE SINGLE USE and rotate: every refresh returns a
//     new one and invalidates the old. This drives most of the care
//     below — see refreshConnection().
// ------------------------------------------------------------------

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "./tokenCrypto";

export const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
export const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
export const CANVA_API_BASE = "https://api.canva.com/rest/v1";

/**
 * Exactly what Design & Edit needs, and nothing more — each extra
 * scope is another line on the consent screen a dealer has to accept.
 *   design:content:write — create the design they'll edit
 *   design:content:read  — export it afterwards (verified: this is the
 *                          scope the export endpoint requires, not a
 *                          separate export scope)
 *   design:meta:read     — read title/thumbnail for the history list
 *   asset:write          — upload an existing Hawlai image so it can be
 *                          opened for editing (the "photo editing" half)
 *   profile:read         — show WHICH Canva account is connected, so a
 *                          dealer with personal and business accounts
 *                          can tell they linked the right one
 */
export const CANVA_SCOPES = [
  "design:content:read",
  "design:content:write",
  "design:meta:read",
  "asset:write",
  "profile:read",
].join(" ");

export interface CanvaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export function isCanvaConfigured(): boolean {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && process.env.CANVA_REDIRECT_URI);
}

function basicAuthHeader(): string {
  const id = process.env.CANVA_CLIENT_ID;
  const secret = process.env.CANVA_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Canva client credentials are not configured.");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

// ---------------- PKCE ----------------

/** 43-128 chars from the unreserved set. 32 random bytes base64url-encoded lands at 43. */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function codeChallengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    client_id: process.env.CANVA_CLIENT_ID!,
    redirect_uri: process.env.CANVA_REDIRECT_URI!,
    response_type: "code",
    scope: CANVA_SCOPES,
    state,
  });
  return `${CANVA_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------- Token exchange ----------------

async function postToken(body: URLSearchParams): Promise<CanvaTokenResponse> {
  const res = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    // Canva's error body is small and specific (invalid_grant,
    // invalid_client...). Passed through rather than flattened to
    // "something went wrong", because these distinguish a wrong secret
    // from an expired code and that changes what you go fix.
    throw new Error(`Canva token request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text) as CanvaTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Canva returned a token response with no tokens in it.");
  }
  return data;
}

export function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CanvaTokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: process.env.CANVA_REDIRECT_URI!,
    })
  );
}

// ---------------- Stored connection ----------------

export interface StoredConnection {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Refreshed this far before actual expiry, so a token doesn't die
 * mid-export. Canva's tokens last 4 hours, so five minutes is ample
 * headroom without refreshing constantly.
 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function persistTokens(
  supabase: SupabaseClient,
  userId: string,
  tokens: CanvaTokenResponse
): Promise<void> {
  const { error } = await supabase
    .from("canva_connections")
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // A failed write here is NOT cosmetic. Canva has already invalidated
  // the old refresh token, so if the new one doesn't reach the database
  // the connection is unrecoverable and the user must reconnect. Loud
  // failure beats returning a working access token that becomes a dead
  // connection in four hours with no explanation.
  if (error) {
    throw new Error(`Canva token refreshed but could not be saved (${error.message}). Reconnect Canva to continue.`);
  }
}

/**
 * Returns a usable access token for this user, refreshing first if it's
 * expired or about to be.
 *
 * On refresh failure the connection row is DELETED rather than left in
 * place. Because refresh tokens are single-use, a failed refresh
 * usually means the stored one was already spent (two requests racing,
 * or an interrupted earlier refresh) and it will never work again.
 * Keeping the row would leave the UI claiming "Connected" over
 * credentials that can't authenticate anything.
 *
 * Returns null when there's no connection at all — callers show the
 * connect prompt rather than treating it as an error.
 */
export async function getValidAccessToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from("canva_connections")
    .select("access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return decryptToken(row.access_token_encrypted);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token_encrypted);
  } catch {
    // Undecryptable means the encryption key changed or the row was
    // tampered with; either way it can't be recovered here.
    await supabase.from("canva_connections").delete().eq("user_id", userId);
    return null;
  }

  let tokens: CanvaTokenResponse;
  try {
    tokens = await postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  } catch {
    await supabase.from("canva_connections").delete().eq("user_id", userId);
    return null;
  }

  await persistTokens(supabase, userId, tokens);
  return tokens.access_token;
}

/** Upsert after a successful first-time authorization. */
export async function saveNewConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: CanvaTokenResponse
): Promise<void> {
  const { error } = await supabase.from("canva_connections").upsert(
    {
      user_id: userId,
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`Could not save the Canva connection: ${error.message}`);
}

/** Authenticated call against the Connect API with the user's token. */
export async function canvaFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${CANVA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
