// ------------------------------------------------------------------
// Business Intelligence Agent — Phase 1
// ------------------------------------------------------------------
// Two ways in: a website URL (fetched and read server-side), or the
// owner just describing their business in their own words. Both draft
// a full Brand Profile (business type, tone, persona, messaging
// pillars) — turning brand setup from "fill out five fields yourself"
// into "tell me about your business, review the draft, save it".
// Nothing is saved automatically; these only return suggestions.
// ------------------------------------------------------------------

import { getModel } from "../models";

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface BusinessIntelligenceResult {
  summary: string;
  business_category: string;
  tone_of_voice: string;
  // gender is deliberately absent from age_range/income/concerns' "best
  // guess" pattern below — see RESPONSE_SCHEMA's prompt instruction.
  // Inferring "this business's customers are probably male/female" from
  // a category alone risks baking a stereotype into real ad targeting,
  // not just copy tone. Only returned when the source text itself
  // states it explicitly.
  target_persona: { age_range?: string; income?: string; concerns?: string[]; gender?: "male" | "female" };
  messaging_pillars: string[];
  // A DRAFT structured profile inferred purely from the source text —
  // the onboarding flow overrides formality_level, hinglish_ok,
  // personality_traits and vocabulary_preferences.avoid with the
  // owner's own explicit answers to the 3 conversational questions
  // where those were asked; this draft only fills in what wasn't
  // (sentence_rhythm, vocabulary_preferences.favor, punctuation style)
  // so nothing is left empty.
  brand_voice_draft: BrandVoiceProfile;
}

const RESPONSE_SCHEMA = `{"summary":"2-3 sentence plain-language summary of what this business is and how it presents itself","business_category":"a short label for the type of business, e.g. 'Car Dealership', 'Real Estate', 'Restaurant', 'Coaching Institute'","tone_of_voice":"a short description of the tone/voice this business seems to use or should use, e.g. 'Trustworthy, family-friendly, no hard-sell'","target_persona":{"age_range":"best guess or empty string","income":"best guess or empty string","concerns":["2-3 likely customer concerns"],"gender":"ONLY include this field if the business description EXPLICITLY states a gendered customer base (e.g. 'women's ethnic wear', 'men's grooming') — value 'male' or 'female'. NEVER infer gender from the business category or type alone (e.g. do not guess a gender for a car dealership, restaurant, or clinic just because of what kind of business it is) — omit the field entirely in every other case."},"messaging_pillars":["3-4 key selling points or values"],"brand_voice_draft":{"personality_traits":["3-4 adjectives capturing this brand's personality"],"vocabulary_preferences":{"favor":["2-3 words/phrases this business would naturally use"],"avoid":["1-2 words/phrases that would feel off-brand, or empty array if nothing obvious"]},"sentence_rhythm":"one sentence describing how this brand should sound written — short and punchy vs. flowing and detailed","formality_level":"casual|conversational|professional|formal","hinglish_ok":true,"punctuation_emoji_style":{"emoji_usage":"none|minimal|expressive","exclamation_marks":"avoid|occasional|frequent"}}}`;

import { logClaudeUsage } from "../usage/logUsage";
import type { BrandVoiceProfile } from "./brandVoice";

const FALLBACK_BRAND_VOICE: BrandVoiceProfile = {
  personality_traits: [],
  vocabulary_preferences: { favor: [], avoid: [] },
  sentence_rhythm: "Balanced — clear and natural, not overly short or overly long.",
  formality_level: "conversational",
  hinglish_ok: true,
  regional_language_notes: null,
  punctuation_emoji_style: { emoji_usage: "minimal", exclamation_marks: "occasional", notes: null },
  source: "conversational_extraction",
};

async function extractProfile(sourceLabel: string, sourceText: string, logContext?: { supabase: any; dealershipId: string }): Promise<BusinessIntelligenceResult | null> {
  const fallback: BusinessIntelligenceResult = {
    summary: "Couldn't generate a detailed profile — try filling in the fields manually.",
    business_category: "",
    tone_of_voice: "Professional and trustworthy",
    target_persona: {},
    messaging_pillars: [],
    brand_voice_draft: FALLBACK_BRAND_VOICE,
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getModel("standard"),
        // Was 600 — too tight once brand_voice_draft's nested fields ride
        // alongside the original summary/persona/pillars in one payload.
        max_tokens: 1100,
        messages: [
          {
            role: "user",
            content: `${sourceLabel}:\n"""\n${sourceText}\n"""\n\nBased only on what's actually there, draft a brand profile. Return JSON only:\n${RESPONSE_SCHEMA}\nIf something isn't clear from the source, make a reasonable, honest default rather than inventing specifics.`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "business_intelligence", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    const bv = parsed.brand_voice_draft ?? {};
    return {
      summary: parsed.summary ?? fallback.summary,
      business_category: parsed.business_category ?? fallback.business_category,
      tone_of_voice: parsed.tone_of_voice ?? fallback.tone_of_voice,
      target_persona: parsed.target_persona ?? {},
      messaging_pillars: Array.isArray(parsed.messaging_pillars) ? parsed.messaging_pillars : [],
      brand_voice_draft: {
        personality_traits: Array.isArray(bv.personality_traits) ? bv.personality_traits : FALLBACK_BRAND_VOICE.personality_traits,
        vocabulary_preferences: {
          favor: Array.isArray(bv.vocabulary_preferences?.favor) ? bv.vocabulary_preferences.favor : [],
          avoid: Array.isArray(bv.vocabulary_preferences?.avoid) ? bv.vocabulary_preferences.avoid : [],
        },
        sentence_rhythm: typeof bv.sentence_rhythm === "string" && bv.sentence_rhythm.trim() ? bv.sentence_rhythm.trim() : FALLBACK_BRAND_VOICE.sentence_rhythm,
        formality_level: ["casual", "conversational", "professional", "formal"].includes(bv.formality_level) ? bv.formality_level : FALLBACK_BRAND_VOICE.formality_level,
        hinglish_ok: typeof bv.hinglish_ok === "boolean" ? bv.hinglish_ok : FALLBACK_BRAND_VOICE.hinglish_ok,
        regional_language_notes: null,
        punctuation_emoji_style: {
          emoji_usage: ["none", "minimal", "expressive"].includes(bv.punctuation_emoji_style?.emoji_usage) ? bv.punctuation_emoji_style.emoji_usage : FALLBACK_BRAND_VOICE.punctuation_emoji_style.emoji_usage,
          exclamation_marks: ["avoid", "occasional", "frequent"].includes(bv.punctuation_emoji_style?.exclamation_marks) ? bv.punctuation_emoji_style.exclamation_marks : FALLBACK_BRAND_VOICE.punctuation_emoji_style.exclamation_marks,
          notes: null,
        },
        source: "conversational_extraction",
      },
    };
  } catch (err: any) {
    console.error("[business-intelligence] extractProfile error:", err.message);
    return fallback;
  }
}

export async function analyzeWebsite(url: string, logContext?: { supabase: any; dealershipId: string }): Promise<BusinessIntelligenceResult> {
  let pageText = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; HawlaiBot/1.0)" } });
    if (!res.ok) throw new Error(`Site returned ${res.status}`);
    const html = await res.text();
    pageText = stripHtmlToText(html).slice(0, 6000);
  } catch (err: any) {
    throw new Error(`Couldn't read that website: ${err.message}`);
  }

  if (!pageText || pageText.length < 50) {
    throw new Error("Couldn't find enough readable content on that page");
  }

  const result = await extractProfile("Here is the text content of an Indian business's website", pageText, logContext);
  return result!;
}

export async function analyzeDescription(description: string, logContext?: { supabase: any; dealershipId: string }): Promise<BusinessIntelligenceResult> {
  if (!description || description.trim().length < 10) {
    throw new Error("Tell me a bit more about your business — a couple of sentences is enough");
  }
  const result = await extractProfile(
    "Here is how the owner of an Indian business describes it, in their own words",
    description.trim().slice(0, 2000),
    logContext
  );
  return result!;
}
