// WHAT STEP 4 COLLECTS, AND WHAT IT WRITES — onboarding P4.
//
// THE RULE THAT SHAPES THIS FILE: `brand_profiles.tone_of_voice` is
// FREE TEXT that prompts read directly, all over this codebase.
// Step 4's tone pills produce an array. Replacing one with the other
// would quietly change what every agent sees, so step 4 writes BOTH —
// `tone_tags` as the array the pills own, and `tone_of_voice` composed
// from it as a sentence — and `composeToneOfVoice` is the only place
// that composition happens.
//
// AND IT FIXES SOMETHING THAT WAS ALREADY WRONG. The old flow asked
// "do you mix Hindi and English?", stored the answer in
// brand_voice.hinglish_ok, and then wrote `preferred_language:
// "hinglish"` for EVERYONE in the same save. So the question was asked
// and the field it belonged to was hardcoded. The language pills make
// that answer real, and `hinglishFrom` derives the brand-voice flag
// from the same single answer rather than asking twice.
//
// Pure: no I/O, no model, no React, so every rule below is checked
// without rendering anything.

/** The three the design offers, and the three brand_profiles allows. */
export const LANGUAGES = ["hindi", "english", "hinglish"] as const;
export type PreferredLanguage = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: PreferredLanguage = "hinglish";

/**
 * The tone words, from the reference design.
 *
 * INDUSTRY-NEUTRAL BY CONSTRUCTION. These six go to every business of
 * every kind, so not one of them may name a trade, a product or a
 * category — CLAUDE.md rule 3, and a test holds it. They describe how
 * the writing should feel, which is the one thing that is the same
 * question for a sweet shop and a coaching centre.
 */
export const TONE_TAGS = ["Modern", "Trendy", "Warm", "Premium", "Minimal", "Festive"] as const;
export type ToneTag = (typeof TONE_TAGS)[number];

/** More than this and it is not a palette, it is a paint catalogue. */
export const MAX_BRAND_COLORS = 6;

/** A strict #rrggbb. Anything else is not a colour we will store. */
const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

/**
 * The colour, in one spelling.
 *
 * ONE SPELLING ON PURPOSE: `#FFF`, `#ffffff` and `#FFFFFF` are the
 * same colour, and storing all three would make "is this colour
 * already in the list?" a question nobody can answer. Shorthand is
 * expanded, case is lowered, and anything that is not a colour returns
 * null rather than a guess.
 */
export function normaliseHexColor(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * The colours as they will be stored: normalised, de-duplicated,
 * capped, and with anything unrecognisable dropped.
 *
 * DROPPED RATHER THAN REFUSED, for this one field only: a colour the
 * owner cannot have typed by hand (the picker produces #rrggbb) is far
 * more likely to be a bug on our side than an answer worth blocking
 * setup over. The API still refuses a payload that is not an array.
 */
export function cleanBrandColors(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const colour = normaliseHexColor(String(item ?? ""));
    if (colour && !out.includes(colour)) out.push(colour);
    if (out.length >= MAX_BRAND_COLORS) break;
  }
  return out;
}

/**
 * The list after the owner adds one colour.
 *
 * A FUNCTION RATHER THAN THREE LINES IN THE COMPONENT, because the
 * property that matters is that THE LIST ON SCREEN IS THE LIST THAT
 * WILL BE STORED. A screen that appends raw and cleans only on save
 * shows a swatch that then vanishes — and a grep for "does the
 * component call the cleaner?" passed while exactly that was true,
 * because the cleaner was still called somewhere else in the file.
 */
export function addBrandColor(current: readonly string[], candidate: string): string[] {
  return cleanBrandColors([...current, candidate]);
}

/** Only the words we offered, de-duplicated, in the order we offered them. */
export function cleanToneTags(input: unknown): ToneTag[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.map((t) => String(t ?? "").trim().toLowerCase()));
  return TONE_TAGS.filter((tag) => picked.has(tag.toLowerCase()));
}

/**
 * The sentence every prompt reads, composed from the words the owner
 * picked.
 *
 * THE FALLBACK IS THE POINT. When the owner picked no tone words, the
 * draft sentence the analysis produced is kept — it is richer than a
 * list of adjectives and it is the only thing there. When he DID pick,
 * his words win outright rather than being blended with the model's,
 * because an owner who picked "Minimal" and a model that inferred
 * "warm and chatty" would otherwise both end up in the prompt,
 * contradicting each other.
 */
export function composeToneOfVoice(tags: readonly string[], draftSentence: string | null | undefined): string {
  const picked = tags.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!picked.length) return (draftSentence ?? "").trim();
  if (picked.length === 1) return `${picked[0]}.`;
  const last = picked[picked.length - 1];
  return `${picked.slice(0, -1).join(", ")} and ${last}.`;
}

/**
 * Does this business write in both languages?
 *
 * DERIVED FROM THE ONE ANSWER, so the flow does not ask about language
 * twice. brand_voice.hinglish_ok and preferred_language were two fields
 * answering the same question, and one of them was hardcoded.
 */
export function hinglishFrom(language: PreferredLanguage): boolean {
  return language === "hinglish";
}

export function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
