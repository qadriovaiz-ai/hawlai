// Reading and writing marketing OAuth tokens during the two-phase
// cutover to encryption at rest.
//
// SCOPE — twelve columns across six integrations:
//   gmail, youtube, google_ads, linkedin, pinterest, snapchat
//   (access + refresh token for each)
//
// fb_page_access_token WAS out of scope for the reason recorded here
// originally: it never refreshes, it spans 13 files across lead
// ingestion, ad launch and analytics, and touching that surface right
// before the live tests would make a regression there unattributable.
//
// It is now in scope, and the reason it can be is that the surface
// stopped being opaque: the [meta] tag covers the launch and activate
// paths, and adLaunchPaused.test.ts runs the launch handler end to
// end. A regression is now attributable. It is also the only
// ad-platform credential left in the clear, and the only one that can
// spend money — see META_PAGE_TOKEN_SELECT below.
//
// STILL NOT IN SCOPE: instagram_access_token. Same treatment, next
// pass; it is read at exactly one site and never spends.
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

// ---------------------------------------------------------------
// Meta Page access token.
//
// Kept separate from the provider table above because the column is
// not `${provider}_${kind}` — it is fb_page_access_token, named before
// that convention existed, and renaming it would mean a data migration
// on the one credential that can spend money. The read rule is
// identical; only the column names differ.
// ---------------------------------------------------------------

/**
 * Both columns, for a SELECT.
 *
 * MUST be used by every query that reads the Meta token. Selecting
 * only the plaintext column works today and returns null the moment
 * the backfill runs — a failure that would look like "Facebook
 * disconnected itself" across lead ingestion, ad launch, autopilot
 * posting and analytics at once. metaTokenSelect.test.ts enforces it.
 */
export const META_PAGE_TOKEN_SELECT = "fb_page_access_token, fb_page_access_token_encrypted";

/** Encrypted first, plaintext fallback. Null when neither column holds a value. */
export function readMetaPageToken(row: Row): string | null {
  return resolveSecret(
    row?.fb_page_access_token_encrypted,
    row?.fb_page_access_token,
    "marketing",
    "meta page access token"
  );
}

/**
 * True when a token is stored, WITHOUT decrypting it.
 *
 * For "is Facebook connected?" checks. Decrypting to answer a boolean
 * would turn a key-ring misconfiguration into "you are not connected",
 * which is both wrong and the sort of thing someone reconnects to fix
 * — overwriting a perfectly good token.
 */
export function hasMetaPageToken(row: Row): boolean {
  return Boolean(row?.fb_page_access_token_encrypted || row?.fb_page_access_token);
}

/**
 * Update payload for storing the Meta token.
 *
 * Writes encrypted and NULLS plaintext in the same statement, so from
 * this deploy forward no connect writes a token in the clear again,
 * whenever the backfill happens to run.
 */
export function metaPageTokenWrite(value: string) {
  return {
    fb_page_access_token_encrypted: encryptSecret(value, "marketing"),
    fb_page_access_token: null,
  };
}
