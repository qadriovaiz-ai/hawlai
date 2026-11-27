// What an integration's connection is DOING, as opposed to what is stored.
//
// 27 November 2026, docs/AUDIT-INTEGRATION-HEALTH.md. Every one of the
// seventeen integrations decided "connected" from a stored value — an
// email, a page id, a token, a URL. Search Console said Connected on a
// token dead for 23 days; Instagram said connected on an invalidated
// token whose webhook was never subscribed. The screen said what was
// stored, not what worked.
//
// THIS FILE IS ONLY THE VOCABULARY and the one rule for reading a
// provider's refusal. Recording, reading and showing it live beside it.

/**
 * The states a connection can be in.
 *
 *   working          a real call to the provider just succeeded
 *   needs_reconnect  the provider refused the credential — only the owner
 *                    reconnecting can fix it
 *   not_responding   the call failed for another reason (timeout, 5xx) —
 *                    may pass on its own
 *   incomplete       the credential works but the connection is not set
 *                    up to do its job (no webhook subscription, no
 *                    property selected)
 *   unchecked        linked, and nothing has checked it yet — NEVER shown
 *                    as "Connected"
 *   unverifiable     linked, and it cannot be checked without a side
 *                    effect (an incoming webhook posts on any call)
 */
export const HEALTH_STATES = ["working", "needs_reconnect", "not_responding", "incomplete", "unchecked", "unverifiable"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export type Health = { state: HealthState; reason: string | null };

/** What a card is handed: the state, and when it was last confirmed. */
export type ShownHealth = Health & { checkedAt?: string | null };

/** The states that mean "this is not working", as opposed to "not known". */
export const BROKEN_STATES: readonly HealthState[] = ["needs_reconnect", "not_responding"];

export function isBroken(state: HealthState | null | undefined): boolean {
  return !!state && BROKEN_STATES.includes(state);
}

/**
 * The words in a provider's refusal that mean the CREDENTIAL was refused.
 *
 * Two different fixes hang on this, so it is worth getting right: a
 * refused credential needs the owner to reconnect, and nothing else will
 * help; anything else (a timeout, a 500, a store that is down) may pass
 * on its own, and telling the owner to reconnect would send them to do
 * something useless.
 */
const CREDENTIAL_REFUSED =
  /\b(401|403)\b|unauthori[sz]ed|forbidden|invalid api key|access token|invalid_grant|invalid_client|consumer.?key|cannot_view|session has been invalidated|OAuthException/i;

/** A failed call to a provider, read into a state and a reason. */
export function healthFromFailure(message: unknown): Health {
  const reason = String(message ?? "").trim().slice(0, 300) || "the provider gave no reason";
  return { state: CREDENTIAL_REFUSED.test(reason) ? "needs_reconnect" : "not_responding", reason };
}
