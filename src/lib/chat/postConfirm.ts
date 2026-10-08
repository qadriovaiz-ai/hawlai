// The destination, and the sentence said before a post goes public.
//
// SPLIT OUT FROM destinations.ts ON PURPOSE. Resolving a destination
// needs the Page access token, so destinations.ts imports
// lib/crypto/oauthSecrets -> lib/crypto/secretCrypto, which reads
// MARKETING_ENCRYPTION_KEY. The chat card is a "use client" component
// and value-imports whatever it names, all the way down, so naming the
// confirmation sentence there would have pulled the decryption module
// into browser JavaScript (see tests/clientBundleBoundary.test.ts, and
// the 2026-09-28 outage it was written for).
//
// These two have no server dependencies at all, which is why the card
// can rebuild the sentence itself when the owner attaches a picture.

export type Destination = {
  platform: "facebook" | "instagram";
  /** The name a human would recognise — the Page, not an id. */
  name: string | null;
  connected: boolean;
  /** Why not, in words the owner can act on. Null when connected. */
  why: string | null;
};

/** The sentence a public-post confirmation has to say. */
export function publicPostConfirm(to: Destination, opts: { hasImage: boolean }): string {
  const where = to.platform === "facebook" ? `your Facebook Page${to.name ? `: ${to.name}` : ""}` : "your Instagram account";
  return `This posts publicly to ${where} right now, with ${opts.hasImage ? "this image and this caption" : "this caption"} exactly as shown above. Anyone can see it. It can be deleted afterwards, but not unseen.`;
}
