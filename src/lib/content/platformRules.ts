// Rules a platform imposes on the words, enforced in code — a prompt can
// ask, but only code guarantees.
//
// WHY (2026-09-18): a Candle Making Workshop caption for Instagram came
// back with "Seat book karo: https://calendly.com/…". Instagram doesn't make
// links in captions clickable, so that line was a dead end for every
// reader. The version from before the Business Story work said "link in
// bio" — correctly, by habit. Once a real booking link was in the facts,
// the model used it. The prompt now says not to; this makes sure.

/** Where a caption's links don't work, and where they do. */
const LINKS_NOT_CLICKABLE = new Set(["instagram_post", "carousel", "reel_ideas", "shorts_script"]);

// A link with a scheme, starting www., or a bare domain on a common TLD —
// never the domain half of an email address.
const URL = /(?<![@\w.-])(?:https?:\/\/[^\s<>"'()\]]+|www\.[^\s<>"'()\]]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|co\.in|net|org|shop|store|online|io|co|app|me|link)(?![a-z0-9-])(?:\/[^\s<>"'()\]]*)?)/gi;

export const LINK_IN_BIO = "link in bio";

/** Replaces every link in one piece of text with "link in bio", once. */
export function replaceLinksWithBio(text: string): { text: string; replaced: number } {
  let replaced = 0;
  let out = text.replace(URL, (m) => {
    replaced++;
    // Keep sentence punctuation the link swallowed.
    const trail = m.match(/[.,;:!?)]+$/)?.[0] ?? "";
    return LINK_IN_BIO + trail;
  });
  if (!replaced) return { text, replaced: 0 };
  // "link in bio — link in bio" or a caption that already said it.
  out = out.replace(new RegExp(`(${LINK_IN_BIO})(?:[\\s,;:—–-]*(?:👆|⬆️)?\\s*${LINK_IN_BIO})+`, "gi"), "$1");
  return { text: out, replaced };
}

/**
 * Applies the platform's link rule to every piece of text in a generated
 * result, whatever its shape. Keys starting with "_" are metadata and left
 * alone. Returns the result unchanged for content types where links work.
 */
export function applyLinkRule<T>(contentType: string, output: T): { output: T; replaced: number } {
  if (!LINKS_NOT_CLICKABLE.has(contentType)) return { output, replaced: 0 };
  let replaced = 0;
  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = replaceLinksWithBio(v);
      replaced += r.replaced;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = k.startsWith("_") ? x : walk(x);
      return o;
    }
    return v;
  };
  return { output: walk(output), replaced };
}

/** What the owner is told when a link was swapped, so they put it where it works. */
export function linkRuleNote(replaced: number): string | null {
  if (!replaced) return null;
  return `Instagram doesn't make links in captions clickable, so Hawlai wrote "${LINK_IN_BIO}" instead — make sure the link is in your profile.`;
}
