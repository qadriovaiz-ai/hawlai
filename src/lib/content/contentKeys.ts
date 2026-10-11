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
 * THE RULE: it must start with a lowercase letter, and it may be
 * lowerCamelCase or lowercase snake_case. Anything starting with a
 * capital, anything mixing capitals with underscores, and anything with
 * a space or a dash is treated as a label the model invented.
 *
 * WHY SNAKE_CASE IS ALLOWED, corrected 2026-10-11. The first version of
 * this rule rejected every underscore, on the claim that "no real
 * content key in this codebase contains one". That was true of the
 * surfaces I had read and false of the ones I had not: a video script
 * returns total_duration_seconds, scene_number, voiceover_or_caption
 * and duration_seconds, and the rule silently deleted them - the
 * script's own timings came back as zero. Found by a test in Phase 3.5
 * step 7, not by reasoning.
 *
 * WHAT THE LIVE LEAK ACTUALLY LOOKED LIKE: "Concrete_details_used", and
 * the discriminator was the CAPITAL, not the underscore. A model
 * labelling its own bookkeeping capitalises it, the way a person
 * labelling a column would.
 *
 * THE RESIDUAL GAP, stated rather than discovered later: an invented
 * key in all-lowercase snake_case - "facts_used" - passes this rule.
 * The alternative was deleting real content, which is worse, and
 * nothing else in the stack can tell those two apart by shape.
 */
export function isContentKey(key: string): boolean {
  if (key.startsWith("_") || NOT_CONTENT.has(key)) return false;
  // lowerCamelCase, or lowercase snake_case. No leading capital, no
  // capital anywhere beside an underscore, no spaces, no dashes.
  if (/[^A-Za-z0-9_]/.test(key)) return false;
  if (key.includes("_")) return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(key);
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
