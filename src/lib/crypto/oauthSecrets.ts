// Reading and writing marketing OAuth tokens during the two-phase
// cutover to encryption at rest.
//
// SCOPE — twelve columns across six integrations:
//   gmail, youtube, google_ads, linkedin, pinterest, snapchat
//   (access + refresh token for each)
//
// NOT IN SCOPE, deliberately: fb_page_access_token and
// instagram_access_token. Neither ever refreshes, and the Meta token
// spans 13 files across lead ingestion, ad launch and analytics.
// Touching that surface immediately before the pending live tests
// would make any regression there impossible to attribute to a cause.
// Scheduled for after those tests pass.
//
// WHY A BACKFILL IS THE WHOLE JOB, not a remainder. The original plan
// assumed most values would migrate naturally as tokens refreshed.
// Checking which integrations are actually live showed otherwise:
//   - google_ads, linkedin, pinterest, snapchat have refresh code, but
//     all four platforms are INACTIVE pending credentials, so it never
//     executes.
//   - youtube refreshes only when a video is published — rare.
//   - gmail is the only one with a routine refresh path.
// So eight of these twelve columns will never migrate on their own.
// The backfill runs immediately after deploy; there is nothing to wait
// for.
//
// Every call site goes through here so the read rule and the column
// names live in one place — a route naming a column directly would
// fail at runtime rather than compile time.

import { resolveSecret, encryptSecret } from "./secretCrypto";

export type OAuthProvider = "gmail" | "youtube" | "google_ads" | "linkedin" | "pinterest" | "snapchat";
export type TokenKind = "access_token" | "refresh_token";

type Row = Record<string, any> | null | undefined;

function plainColumn(provider: OAuthProvider, kind: TokenKind): string {
  return `${provider}_${kind}`;
}

function encryptedColumn(provider: OAuthProvider, kind: TokenKind): string {
  return `${provider}_${kind}_encrypted`;
}

/**
 * Both columns for one provider, for a SELECT.
 *
 * Both are needed during cutover: the encrypted one is preferred, the
 * plaintext one is the fallback until the backfill has run. A route
 * that selected only one would work today and break later.
 */
export function tokenSelect(provider: OAuthProvider): string {
  return [
    plainColumn(provider, "access_token"),
    encryptedColumn(provider, "access_token"),
    plainColumn(provider, "refresh_token"),
    encryptedColumn(provider, "refresh_token"),
  ].join(", ");
}

/** Encrypted first, plaintext fallback. Returns null when neither holds a value. */
export function readToken(row: Row, provider: OAuthProvider, kind: TokenKind): string | null {
  return resolveSecret(
    row?.[encryptedColumn(provider, kind)],
    row?.[plainColumn(provider, kind)],
    "marketing",
    `${provider} ${kind.replace("_", " ")}`
  );
}

/**
 * Update payload for storing a token.
 *
 * Writes the encrypted column and NULLS the plaintext one in the same
 * statement, so from this deploy forward no refreshed token is ever
 * written in the clear again — regardless of when the backfill runs.
 * That shrinks the exposure window rather than freezing it until the
 * plaintext columns are dropped.
 */
export function tokenWrite(provider: OAuthProvider, kind: TokenKind, value: string) {
  return {
    [encryptedColumn(provider, kind)]: encryptSecret(value, "marketing"),
    [plainColumn(provider, kind)]: null,
  };
}

/** Update payload for clearing a token pair — used by disconnect handlers. */
export function tokenClear(provider: OAuthProvider) {
  return {
    [encryptedColumn(provider, "access_token")]: null,
    [plainColumn(provider, "access_token")]: null,
    [encryptedColumn(provider, "refresh_token")]: null,
    [plainColumn(provider, "refresh_token")]: null,
  };
}

/** True when a token is stored in either column — for "is this connected" checks that must not decrypt. */
export function hasToken(row: Row, provider: OAuthProvider, kind: TokenKind = "access_token"): boolean {
  return Boolean(row?.[encryptedColumn(provider, kind)] || row?.[plainColumn(provider, kind)]);
}
