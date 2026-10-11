// Which keys of a generated output are WORDS A READER SEES.
//
// ONE list, shared, for the same reason ownerVoice.ts is one list: five
// places in this codebase decide independently which fields of an
// output object are content, and when they disagree the loosest one
// decides what gets published.
//
// THE LIVE LEAK (11 October 2026). A published Facebook caption
// contained the words "Concrete_details_used". That string is nowhere
// in this codebase - the MODEL invented the key, because the prompt
// asks for "at least one CONCRETE, specific detail", and composePost
// joined every string field it found. The key was not "_" prefixed and
// was not in NOT_CONTENT, so both filters passed it and its value went
// into the post. The department panel's humanizeKey then rendered it as
// "Concrete details used", which is what made it look deliberate.
//
// A DENYLIST CANNOT WORK. The next invented key has a different name,
// and nobody can enumerate what a model might call a field it made up
// for its own bookkeeping. So this is an allowlist BY SHAPE.
//
// This module has NO imports on purpose: client components and the
// unattended autopilot both use it.

/** Keys that are machinery, not words a reader sees. */
const NOT_CONTENT = new Set(["note", "hashtags"]);

/**
 * A key whose value is words a reader should see.
 *
 * Every real content key in this codebase is a single lowercase word or
 * lowerCamelCase - text, body, headline, intro, ctaLabel, bullets,
 * caption, slides. None contains an underscore, none starts with a
 * capital, and none has a space. So that is the rule, and anything else
 * is treated as a label the model invented.
 */
export function isContentKey(key: string): boolean {
  if (key.startsWith("_") || NOT_CONTENT.has(key)) return false;
  return /^[a-z][a-zA-Z0-9]*$/.test(key);
}

/**
 * The first string field that is real content.
 *
 * The fallback three separate places reached for as
 * `Object.values(output)[0]` or "first key not starting with _", each of
 * which would have published the invented key's value.
 */
export function firstContentString(output: unknown): string {
  if (!output || typeof output !== "object") return "";
  for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
    if (!isContentKey(k)) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
