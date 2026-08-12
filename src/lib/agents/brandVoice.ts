// ------------------------------------------------------------------
// Brand Voice Profile — Phase 3
// ------------------------------------------------------------------
// Structured replacement for the flat tone_of_voice string threaded
// into every generation function. brand_profiles.tone_of_voice is
// untouched by this — still the plain-English summary shown in
// Settings -> Brand Voice's textarea. This reads the new
// brand_profiles.brand_voice jsonb column when present, and falls back
// to a safe, generic profile derived from the legacy string when it
// isn't, so no business (old or new) is ever left with an empty voice.
// ------------------------------------------------------------------

export interface BrandVoiceProfile {
  personality_traits: string[]; // 3-4 adjectives, e.g. ["confident", "warm", "direct"]
  vocabulary_preferences: {
    favor: string[];
    avoid: string[];
  };
  sentence_rhythm: string; // free-text, LLM-actionable descriptor, e.g. "Short and punchy — one idea per sentence."
  formality_level: "casual" | "conversational" | "professional" | "formal";
  hinglish_ok: boolean;
  regional_language_notes?: string | null;
  punctuation_emoji_style: {
    emoji_usage: "none" | "minimal" | "expressive";
    exclamation_marks: "avoid" | "occasional" | "frequent";
    notes?: string | null;
  };
  source: "conversational_extraction" | "legacy_fallback" | "manual_edit";
}

// Used the instant a business has no brand_voice row yet — synthesized
// purely in code, no AI call, so it's free and never fails. Deliberately
// generic/safe rather than guessing specifics beyond wrapping the known
// tone_of_voice string as the one real personality signal available.
export function deriveBrandVoiceFallback(toneOfVoice: string | null | undefined): BrandVoiceProfile {
  return {
    personality_traits: toneOfVoice ? [toneOfVoice] : [],
    vocabulary_preferences: { favor: [], avoid: [] },
    sentence_rhythm: "Balanced — clear and natural, not overly short or overly long.",
    formality_level: "conversational",
    hinglish_ok: true,
    regional_language_notes: null,
    punctuation_emoji_style: { emoji_usage: "minimal", exclamation_marks: "occasional", notes: null },
    source: "legacy_fallback",
  };
}

// The full, explicit-instructions block for real text-generation
// prompts — same "pre-formatted, ready to drop in" shape as
// memorySection/knowledgeSection in masterBrainV2.ts.
export function formatBrandVoiceSection(profile: BrandVoiceProfile | null | undefined, toneOfVoice: string | null | undefined): string {
  const p = profile ?? deriveBrandVoiceFallback(toneOfVoice);
  const lines: string[] = [];
  if (p.personality_traits.length > 0) lines.push(`Personality: ${p.personality_traits.join(", ")}.`);
  lines.push(`Formality: ${p.formality_level}.`);
  lines.push(`Sentence rhythm: ${p.sentence_rhythm}`);
  lines.push(
    `Language mixing: ${
      p.hinglish_ok
        ? "Hindi/English mixing is on-brand — write naturally in Hinglish where it fits, don't force pure English."
        : "Keep language consistent — avoid mixing Hindi and English mid-sentence."
    }${p.regional_language_notes ? ` ${p.regional_language_notes}` : ""}`
  );
  if (p.vocabulary_preferences.favor.length > 0) lines.push(`Words/phrases to favor: ${p.vocabulary_preferences.favor.join(", ")}.`);
  if (p.vocabulary_preferences.avoid.length > 0) lines.push(`Words/phrases to NEVER use: ${p.vocabulary_preferences.avoid.join(", ")}.`);
  lines.push(
    `Emoji: ${p.punctuation_emoji_style.emoji_usage}. Exclamation marks: ${p.punctuation_emoji_style.exclamation_marks}.${
      p.punctuation_emoji_style.notes ? ` ${p.punctuation_emoji_style.notes}` : ""
    }`
  );
  return `\n\n## This business's Brand Voice (follow these exactly — this is how they specifically sound, not generic brand-safe filler)\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

// A short, visual-relevant subset for image-generation prompts
// (generate_logo, generate_graphic) — vocabulary/punctuation/emoji
// guidance is meaningless to an image model, so this deliberately omits
// it rather than padding an image prompt with irrelevant text.
export function formatBrandVoiceVisualHint(profile: BrandVoiceProfile | null | undefined): string {
  if (!profile || profile.personality_traits.length === 0) return "";
  return ` This brand's personality: ${profile.personality_traits.join(", ")} (formality: ${profile.formality_level}).`;
}
