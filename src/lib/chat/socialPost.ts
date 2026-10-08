// What the card shows IS what gets published.
//
// THE LIVE INCIDENT (8 Oct 2026). The card showed a caption with
// hashtags under it. The Facebook post went out with the caption and no
// hashtags. Nobody edited anything in between — there were simply two
// functions that each produced "the text", and only one of them knew
// about hashtags:
//
//   the card    flattenDraftBody()  — joins every string field, then
//                                     appends raw.hashtags
//   the payload captionFrom()       — returns the FIRST matching string
//                                     field and never reads hashtags
//
// So this is one function, used by both. A preview that is computed
// differently from the payload is not a preview; it is a second opinion.

/** Heading-ish fields, in the order the card prefers them. */
const HEADING_KEYS = ["headline", "title", "subject", "heroHeadline", "hook"];

/** Keys that are machinery, not words a reader sees. */
const NOT_CONTENT = new Set(["note", "hashtags"]);

export type ComposedPost = {
  /** The exact text that will be published, hashtags included. */
  text: string;
  /** The hashtags, separately, so a card can show them as chips. */
  hashtags: string[];
  /** The heading, when the shape had one — already part of `text`. */
  heading: string | null;
};

/**
 * The post's text, assembled once.
 *
 * Deliberately the same order and the same joins the card already used
 * (flattenDraftBody): heading first, then every other string field, then
 * the hashtags. Changing the assembly to something "better" here would
 * reintroduce the bug from the other side — the card and the payload
 * agreeing matters more than either being pretty.
 */
export function composePost(raw: unknown): ComposedPost {
  if (!raw || typeof raw !== "object") return { text: "", hashtags: [], heading: null };
  const row = raw as Record<string, any>;

  const headingField = HEADING_KEYS.find((k) => typeof row[k] === "string" && row[k].trim());
  const heading = headingField ? String(row[headingField]).trim() : null;

  const parts: string[] = [];
  if (heading) parts.push(heading);
  for (const [key, value] of Object.entries(row)) {
    if (key === headingField) continue;
    // Keys the agents use for their own notes are not content.
    if (key.startsWith("_") || NOT_CONTENT.has(key)) continue;
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }

  const hashtags = Array.isArray(row.hashtags)
    ? row.hashtags.filter((h: unknown) => typeof h === "string" && h.trim()).map((h: string) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`))
    : [];
  if (hashtags.length) parts.push(hashtags.join(" "));

  return { text: parts.join("\n\n"), hashtags, heading };
}

/**
 * Whether the platform served back what was approved.
 *
 * Compared on the WORDS, not character for character: Facebook
 * normalises whitespace and its own response may differ in line endings.
 * A real difference — a missing hashtag block, a truncated caption — is
 * what this has to catch, and did not exist at all before.
 */
export function samePostText(approved: string, served: string | null | undefined): boolean {
  const norm = (value: string) => value.replace(/\s+/g, " ").trim();
  return Boolean(served) && norm(approved) === norm(String(served));
}
