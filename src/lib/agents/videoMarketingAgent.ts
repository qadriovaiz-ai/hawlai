// Video Marketing Agent — covers the text/planning side of the 11
// tasks: Video ideas, Reels, Shorts, TikTok, Captions, Subtitles,
// Video editing (shot list/notes), B-roll suggestions, Animation
// concepts. "AI video generation" and "Voiceover" are NOT duplicated
// here — they already exist in Creative Studio (Veo + ElevenLabs,
// see videoAgent.ts / voiceoverAgent.ts) and this page links to that
// instead of rebuilding it. Same flexible-generator pattern as
// contentMarketingAgent.ts.

import { VIDEO_TASKS, type VideoTaskMeta } from "@/lib/departments/video";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { VIDEO_TASKS };
export type { VideoTaskMeta };


import { getModel } from "../models";
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateVideoTask(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote }> {
  const meta = VIDEO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it natural and specific to the business type.";

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 1800,
      messages: [{
        role: "user",
        content: `You are a short-form video strategist writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}
Topic/context: "${topic || "general brand content, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown. Shape the JSON sensibly (e.g. "ideas" array, "captions" array, "lines" array for subtitles with {time, text}, "shots" array for editing/b-roll with relevant fields, "concepts" array for animation). Be specific to this business — never generic filler.`,
      }],
    }, { operation: "video_marketing", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[video-marketing-agent] error:", err.message);
    return fallback;
  }
}
