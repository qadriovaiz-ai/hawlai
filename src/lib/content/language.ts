// What language a piece is written in, and how it should sound
// (2026-09-20).
//
// THE BUG: the owner set Preferred Ad Language to English in Settings and
// kept getting Hinglish captions. The setting was reaching the prompt —
// but only as one passive line inside the facts ("Preferred language:
// english"), while their ten Business Story answers were printed in full,
// in Hinglish. Nothing said which of the two the piece should follow, so
// the writer matched the register it could see most of.
//
// A setting the owner changed has to win over a register the model infers.
// So it is stated as a rule, before the facts, in the words of an
// instruction rather than a field: write EVERY word in this language, and
// translate the owner's details into it instead of quoting them.

export type CopyLanguage = "english" | "hindi" | "hinglish";

/** The stored value, made safe. Hinglish is the product's default (brand_profiles). */
export function normaliseLanguage(value: unknown): CopyLanguage {
  const v = String(value ?? "").trim().toLowerCase();
  if (v.startsWith("eng")) return "english";
  if (v.startsWith("hindi") || v === "hi") return "hindi";
  return "hinglish";
}

/**
 * The language the owner asked for IN THIS PIECE, or null.
 *
 * Founder's decision, 2026-10-16: the ask for one piece beats the
 * setting. salon-08 in the 13 October baseline is the case — the brand
 * language is Hinglish, the owner typed "broadcast in english about the
 * haircut price", and the output came back in Hinglish. The reviewer
 * refused to grade it and said it needed a decision rather than a fix.
 *
 * NARROW ON PURPOSE. It matches only an explicit instruction about the
 * language of the writing — "in English", "English mein likho" — and not
 * a mention of a language as a subject ("post about our English
 * classes", "we translate to Hindi"), which would hijack the piece. The
 * word must follow a preposition that makes it an instruction.
 */
export function languageAskedFor(topic: string | null | undefined): CopyLanguage | null {
  const t = String(topic ?? "").toLowerCase();
  if (!t.trim()) return null;
  // "in english", "english me", "english mein", "english language me"
  const ask = /\b(?:in|into)\s+(english|hindi|hinglish)\b|\b(english|hindi|hinglish)(?:\s+language)?\s+(?:me|mein|m)\b/i.exec(t);
  if (!ask) return null;
  const named = (ask[1] ?? ask[2] ?? "").toLowerCase();
  // Devanagari is a script, not a third language here: "hindi mein"
  // means the hindi rule, which already says Devanagari.
  if (named === "english") return "english";
  if (named === "hindi") return "hindi";
  if (named === "hinglish") return "hinglish";
  return null;
}

/**
 * The language this piece is written in: the per-piece ask, then the
 * setting, then the product's default.
 */
export function languageFor(topic: string | null | undefined, setting: unknown): CopyLanguage {
  return languageAskedFor(topic) ?? normaliseLanguage(setting);
}

const RULES: Record<CopyLanguage, string> = {
  english: `Write EVERY word of this piece in English. The owner's notes, story answers and quotes below are mostly in Hinglish — that is their record of what happened, NOT the language of this piece. Take the detail and say it in English; never carry their Hinglish phrasing across, and never leave a Hindi word in Roman script (say it in English, not a Hindi word in Roman script). Indian English is right — plain, warm, not American.`,
  hindi: `Write EVERY word of this piece in Hindi, in Devanagari script. The owner's notes below may be in Roman-script Hinglish; take the detail and write it in Hindi. Keep the English words Indian customers actually use in Hindi speech (online, delivery, workshop) rather than forcing rare translations.`,
  hinglish: `Write this piece in natural Hinglish — Roman script, the way the owner speaks to customers in their notes below. Not translated Hindi, not English with a word or two sprinkled in.`,
};

/** The rule for the language, said as an instruction rather than a setting. */
export function languageRule(language: CopyLanguage): string {
  return RULES[language];
}

/**
 * The block that decides how the piece sounds: the language the owner
 * chose, and the tone they set. Both are settings the owner changed on
 * purpose, so they beat whatever the examples in the facts sound like.
 */
export function soundRule(language: CopyLanguage, tone: string | null | undefined): string {
  const lines = [`## The language and tone (these are settings the owner chose — they beat anything the examples below sound like)`, `- ${languageRule(language)}`];
  const t = String(tone ?? "").trim();
  if (t) lines.push(`- Tone: ${t}. Where the owner's own notes sound different from that tone, keep the FACT and use the tone — the notes are a record, not a style guide.`);
  return lines.join("\n");
}

// Everyday Hinglish, for telling what language the owner wrote their story
// in. Not a language detector — just enough to know whether a piece and
// the story it draws on are in the same register.
const HINGLISH_MARKERS = ["hai", "hain", "nahi", "karte", "karta", "kiya", "mein", "aur", "apne", "apni", "koi", "kuch", "bahut", "ghar", "jaldi", "khud", "sirf"];

export function looksHinglish(text: string): boolean {
  if (/[ऀ-ॿ]/.test(text)) return true; // Devanagari: Hindi, not English
  const words = new Set(String(text ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean));
  let hits = 0;
  for (const m of HINGLISH_MARKERS) if (words.has(m)) hits += 1;
  return hits >= 2;
}
