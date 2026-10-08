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

// WHERE "LINK IN BIO" IS ITSELF THE DEAD END.
//
// FOUND LIVE (8 Oct 2026) on a public Facebook post: "Link in bio."
// Facebook posts carry real, clickable links — there is no bio to look
// in, and the reader is sent nowhere. This module knew one direction of
// the rule and not the other: it stripped links where they do not work,
// and never noticed the Instagram habit written where they do.
//
// A platform where links work gets the real link when the business has
// one, and the line removed when it does not. Never a made-up URL: the
// store address comes from the facts or nothing does.
// A FACTORY, NOT A SHARED REGEX.
//
// The first version was one module-level /g literal used with .test()
// and .replace(). A /g regex carries `lastIndex` between calls, so it
// matched the first caption of a session and then started searching the
// next one from wherever it had stopped — silently missing "Link in my
// bio." because an earlier call had left the cursor past it. A guard
// that works once is worse than none, because it reads as working.
const bioPhrase = () =>
  /(?:\s*(?:\u{1F446}|\u{2B06}\u{FE0F}|\u{1F517})\s*)?\b(?:the\s+)?link\s+(?:is\s+)?in\s+(?:my\s+|our\s+|the\s+)?bio\b[.!]?/giu;

/** Whether a caption for this content type can carry a real link. */
export function linksWork(contentType: string): boolean {
  return Boolean(contentType) && !LINKS_NOT_CLICKABLE.has(contentType);
}

/**
 * Replaces the Instagram habit with something that works here.
 *
 * `storeUrl` is the business's own address out of the canonical facts,
 * or null. With null the sentence goes rather than being left pointing
 * at a bio the reader cannot open.
 */
export function fixLinkInBio(text: string, storeUrl: string | null): { text: string; fixed: number; dropped: number } {
  if (!bioPhrase().test(text)) return { text, fixed: 0, dropped: 0 };

  if (storeUrl) {
    let fixed = 0;
    // The sentence's own full stop is kept. The first version swallowed
    // it and left "Order via https://..." with nothing to end on.
    const out = text.replace(bioPhrase(), (m) => {
      fixed++;
      const terminator = m.match(/[.!]$/)?.[0] ?? "";
      return storeUrl + terminator;
    });
    return { text: out, fixed, dropped: 0 };
  }

  // NO LINK TO GIVE, SO THE WHOLE SENTENCE GOES.
  //
  // Deleting the phrase alone leaves "Order via ." behind, which is
  // worse than the dead end it replaced. The claims guard removes whole
  // sentences for the same reason, and this follows it.
  let dropped = 0;
  const kept = splitSentences(text).filter((piece) => {
    if (!bioPhrase().test(piece)) return true;
    dropped++;
    return false;
  });
  const out = kept
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
  return { text: out, fixed: 0, dropped };
}

/**
 * Sentences, keeping their punctuation and spacing attached.
 *
 * Emoji count as terminators because social copy uses them that way
 * ("New candle is here 🕯 Link in bio") — treating the two halves as
 * one sentence would take the honest half with the dead one.
 */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?।]|🕯)\s*/u).filter((p) => p.length > 0);
}

/** Applies the above to every string in a generated result. */
export function applyBioRule<T>(contentType: string, output: T, storeUrl: string | null): { output: T; fixed: number; dropped: number } {
  if (!linksWork(contentType)) return { output, fixed: 0, dropped: 0 };
  let fixed = 0;
  let dropped = 0;
  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = fixLinkInBio(v, storeUrl);
      fixed += r.fixed;
      dropped += r.dropped;
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
  return { output: walk(output), fixed, dropped };
}

/** What the owner is told when the bio line was replaced or removed. */
export function bioRuleNote(fixed: number, dropped: number): string | null {
  if (fixed) return `This post was written with "${LINK_IN_BIO}", which is an Instagram habit — links work here, so Hawlai used your own store link instead.`;
  if (dropped)
    return `This post said "${LINK_IN_BIO}", which sends a reader nowhere on this platform, so Hawlai removed it — publish your site first if you want a link here.`;
  return null;
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
