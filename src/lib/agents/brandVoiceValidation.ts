// ------------------------------------------------------------------
// Brand Voice consistency validation — Phase 3, Task 4
// ------------------------------------------------------------------
// Lightweight, deterministic, non-blocking post-generation check.
// Threading a BrandVoiceProfile into a prompt (Task 3) doesn't
// guarantee the model actually followed it — this scans the ACTUAL
// generated text for violations of the 3 rules that are reliably
// pattern-matchable without a second LLM call. Everything else in the
// profile (personality_traits, sentence_rhythm, formality_level,
// hinglish_ok) is qualitative and deliberately NOT checked here — a
// regex-based guess at those would produce more false positives than
// real signal, which defeats the point of an advisory flag.
// ------------------------------------------------------------------

import type { BrandVoiceProfile } from "./brandVoice";

export interface BrandVoiceViolation {
  rule: string;
  detail: string;
}

export interface BrandVoiceComplianceResult {
  compliant: boolean;
  violations: BrandVoiceViolation[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Unicode property escape rather than a hand-maintained codepoint
// table — covers the actual emoji ranges reliably across engines that
// support it (Node 12+ / all modern browsers).
const EMOJI_RE = /\p{Extended_Pictographic}/u;

export function validateBrandVoiceCompliance(text: string, profile: BrandVoiceProfile | null | undefined): BrandVoiceComplianceResult {
  const violations: BrandVoiceViolation[] = [];
  if (!profile || !text) return { compliant: true, violations };

  // Word-boundary match, not naive .includes() — a naive substring
  // check on a short avoid-word like "up" would flag "update"/"group"/
  // "cup", which has nothing to do with the actual word being avoided.
  // \b still matches a multi-word phrase like "limited time" as a whole
  // phrase, so this covers the realistic case without the false-positive
  // failure mode of pure substring matching.
  for (const avoidPhrase of profile.vocabulary_preferences?.avoid ?? []) {
    const trimmed = avoidPhrase?.trim();
    if (!trimmed) continue;
    const re = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i");
    if (re.test(text)) {
      violations.push({
        rule: "vocabulary_preferences.avoid",
        detail: `Contains "${trimmed}", which this business's brand voice says to avoid.`,
      });
    }
  }

  const exclCount = (text.match(/!/g) ?? []).length;
  const exclamationRule = profile.punctuation_emoji_style?.exclamation_marks;
  if (exclamationRule === "avoid" && exclCount > 0) {
    violations.push({
      rule: "punctuation_emoji_style.exclamation_marks",
      detail: `Contains ${exclCount} exclamation mark${exclCount === 1 ? "" : "s"}, but this business's brand voice says to avoid them.`,
    });
  } else if (exclamationRule === "frequent" && exclCount === 0) {
    violations.push({
      rule: "punctuation_emoji_style.exclamation_marks",
      detail: "Contains no exclamation marks, but this business's brand voice calls for frequent use.",
    });
  }

  const emojiRule = profile.punctuation_emoji_style?.emoji_usage;
  if (emojiRule === "none" && EMOJI_RE.test(text)) {
    violations.push({
      rule: "punctuation_emoji_style.emoji_usage",
      detail: "Contains emoji, but this business's brand voice says to use none.",
    });
  }

  return { compliant: violations.length === 0, violations };
}

// Flattens an arbitrarily-shaped generation result (each of the ~11
// text-generation tools returns a differently-shaped JSON object —
// {slides:[...]}, {days:[...]}, {text:"..."}, etc.) into scannable
// text. Only string VALUES are collected, never object keys — a key
// name like "ctaText" landing in the scanned text could otherwise trip
// a check that has nothing to do with what was actually generated.
export function flattenResultText(value: any, depth = 0): string {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => flattenResultText(v, depth + 1)).join(" ");
  if (typeof value === "object") return Object.values(value).map((v) => flattenResultText(v, depth + 1)).join(" ");
  return "";
}

// Runs the check and merges a `_brandVoiceCheck` field into the result
// only when there's something to flag — no `_brandVoiceCheck: {compliant:
// true, violations: []}` noise on every single generation. Never throws,
// never alters `output` itself beyond adding this one advisory field —
// this must never be able to block or change what gets returned/saved.
export function withBrandVoiceCheck<T extends object>(output: T, profile: BrandVoiceProfile | null | undefined): T {
  try {
    const check = validateBrandVoiceCompliance(flattenResultText(output), profile);
    if (check.compliant) return output;
    return { ...output, _brandVoiceCheck: check };
  } catch {
    // Advisory-only: a bug here must never break a real generation.
    return output;
  }
}
