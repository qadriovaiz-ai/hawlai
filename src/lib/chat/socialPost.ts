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

/**
 * A hashtag written inside the caption prose.
 *
 * Deliberately narrow: a "#" followed by letters, digits or an
 * underscore. It must NOT match a "#" in ordinary text ("#1 priority",
 * "flat #3"), so a digit-only tail is excluded — `#1` is a rank, not a
 * tag. Devanagari is included, because a Hinglish caption tags in both
 * scripts, and `\b` is not used anywhere near it: JS word boundaries
 * are defined over [A-Za-z0-9_] and do not work on Devanagari, which
 * has cost this codebase four separate incidents.
 */
const TAG_IN_TEXT = /#(?![0-9]+(?:\s|$))[\wऀ-ॿ]+/gu;

// The allowlist lives in src/lib/content/contentKeys.ts, because the
// unattended autopilot queue and two client components make the same
// decision and had each made it differently. Re-exported so existing
// importers do not change.
import { isContentKey } from "@/lib/content/contentKeys";
export { isContentKey };

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
    if (!isContentKey(key)) continue;
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }

  // TWO SOURCES, ONE LIST (2026-10-11).
  //
  // The live post went out with its hashtags twice. Nothing was broken
  // and nobody edited anything: the prompt asks for "2-3 relevant
  // hashtags at the end" of the caption text, and the shape ALSO has a
  // `hashtags` field, so a model that does both produces both — once
  // inside the prose, once appended here.
  //
  // So the tags already in the body are found and counted as the same
  // list, case-insensitively, and the block appended below carries only
  // what the body does not already say. Order is the model's.
  const body = parts.join("\n\n");
  const inBody = new Set(Array.from(body.matchAll(TAG_IN_TEXT)).map((m) => m[0].toLowerCase()));

  const seen = new Set<string>(inBody);
  const hashtags: string[] = [];
  for (const raw of Array.isArray(row.hashtags) ? row.hashtags : []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const tag = raw.trim().startsWith("#") ? raw.trim() : `#${raw.trim()}`;
    const key = tag.toLowerCase();
    // A duplicate WITHIN the field is dropped too: the same model that
    // repeats a tag across the two sources repeats it inside one.
    if (seen.has(key)) continue;
    seen.add(key);
    hashtags.push(tag);
  }
  if (hashtags.length) parts.push(hashtags.join(" "));

  // What the card shows IS what gets published, so the returned list is
  // every tag the reader will see — the ones already in the body plus
  // the ones appended — not just the appended block.
  const shown = [
    ...Array.from(body.matchAll(TAG_IN_TEXT)).map((m) => m[0]),
    ...hashtags,
  ];
  return { text: parts.join("\n\n"), hashtags: shown, heading };
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
