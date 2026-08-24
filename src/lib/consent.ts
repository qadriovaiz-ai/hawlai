// ------------------------------------------------------------------
// Visitor tracking consent — retargeting piece 2/7.
// ------------------------------------------------------------------
// Confirmed policy: option (ii) — essential-only by default,
// third-party tracking and cross-session identification only after
// explicit consent.
//
// What each tier means here, decided from what the code ACTUALLY does
// rather than from the usual "first-party is fine" shorthand:
//
//   ALWAYS ALLOWED (no consent)
//     Aggregate page view / click counts with visitor_id = null.
//     No identifier, no linkage to a person, no cross-session
//     persistence — genuine site operation.
//
//   CONSENT REQUIRED
//     visitor_id — a persistent localStorage UUID that survives
//     sessions AND is retroactively bridged to a named lead by
//     bridgeVisitorTouchpoints once that person converts. That is
//     cross-session identification tied to a real identity, not
//     anonymous analytics.
//     UTM capture — only meaningful when tied to that identifier.
//     Meta Pixel / Google tags — third-party by definition.
//
// The localStorage flag is a UX cache so the banner doesn't reappear
// on every page; the server-side visitor_consent row is the record of
// record, because a value on the visitor's own device demonstrates
// nothing to a regulator.
// ------------------------------------------------------------------

export const CONSENT_STORAGE_KEY = "hawlai_tracking_consent";
export const VISITOR_ID_KEY = "hawlai_visitor_id";

export type ConsentStatus = "granted" | "denied" | "pending";

/** Reads the visitor's cached choice. "pending" means they haven't chosen — never treat that as consent. */
export function readConsent(): ConsentStatus {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "pending";
  } catch {
    // localStorage blocked (private browsing, cookies disabled). No
    // way to record a choice, so nothing beyond essential runs —
    // failing closed is the only defensible default.
    return "pending";
  }
}

export function writeConsent(status: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    // Non-fatal — the server-side record is what actually counts.
  }
}

/**
 * The visitor's persistent ID — created ONLY with consent.
 *
 * Deliberately does not generate an ID when consent is absent: an ID
 * minted "just in case" and stored locally is exactly the
 * cross-session identifier consent is meant to gate, whether or not
 * it's transmitted yet.
 */
export function getVisitorIdIfConsented(): string | null {
  if (readConsent() !== "granted") return null;
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Clears the persistent identifier when consent is withdrawn or
 * refused. Without this, a visitor who previously accepted and later
 * declined would keep the ID that consent was meant to control.
 */
export function clearVisitorId() {
  try {
    localStorage.removeItem(VISITOR_ID_KEY);
  } catch {
    // no-op
  }
}

/** Records the choice server-side so the business can demonstrate it later. Best-effort — never blocks the visitor. */
export function recordConsentServerSide(slug: string, status: "granted" | "denied", visitorId: string | null) {
  try {
    fetch("/api/public/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, status, visitorId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // no-op
  }
}
