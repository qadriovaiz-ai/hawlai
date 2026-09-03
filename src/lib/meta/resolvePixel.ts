// Which Meta Pixel does a finished Facebook connection use?
//
// Extracted from the finalize route rather than left inline, because
// the rules are not obvious enough to trust to a reading: an untrusted
// id from the browser, an auto-pick that must not become a guess, and
// a "found nothing" case that must not be confused with "clear it".
// As a pure function these are six cheap assertions instead of six
// live OAuth round-trips against Meta.

export type DiscoveredPixel = { id: string; name?: string };
type DiscoveredAccount = { id: string; pixels?: DiscoveredPixel[] };

/**
 * The pixel to store, or null to leave whatever is already configured
 * untouched. Never returns a pixel the callback did not itself
 * discover on the selected ad account.
 *
 * @param accounts   ad accounts as captured by the OAuth callback
 * @param adAccountId the account the dealer selected, `act_`-prefixed or not
 * @param requestedPixelId a browser-supplied choice — UNTRUSTED
 */
export function resolvePixel(
  accounts: DiscoveredAccount[] | null | undefined,
  adAccountId: string,
  requestedPixelId?: string | null
): DiscoveredPixel | null {
  // Meta returns ids as `act_123`; the form may hand back either form.
  const account = (accounts ?? []).find(
    (a) => a.id === adAccountId || a.id === `act_${adAccountId}`
  );
  const pixels = account?.pixels ?? [];

  if (requestedPixelId) {
    // Membership check, not a trust check on the caller. Without it,
    // a crafted request could aim this business's conversion tracking
    // at an attacker's pixel — and the dealer would see a plausible
    // "connected" state while their conversions fed someone else.
    return pixels.find((p) => p.id === requestedPixelId) ?? null;
  }

  // One pixel is the common case and there is nothing to decide.
  // Two or more is a real decision, and picking the first would be a
  // guess that silently sends conversions to the wrong place — so
  // return null and let the UI ask.
  return pixels.length === 1 ? pixels[0] : null;
}
