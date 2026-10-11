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
import { parseModelJson } from "@/lib/ai/modelJson";
// Captions and subtitle lines are customer-facing copy: one door.
import { generateCopy } from "@/lib/content/generateCopy";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

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
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; publishable?: boolean }> {
  const meta = VIDEO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it natural and specific to the business type.";

  try {
    // PHASE 3.5, STEP 7. Captions, hooks and subtitle lines are read by
    // customers, and this path had no check on its output at all.
    const copy = await generateCopy({
      topic,
      businessName: dealershipName,
      businessCategory,
      facts,
      // The owner reviews these before using them.
      mode: "draft",
      revise: true,
      language: (brandProfile as any)?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "video_marketing",
      logContext,
      maxTokens: 1800,
      brief: {
        label: meta.label,
        instructions: meta.instructions,
        brandContext: `You are a short-form video strategist.
${brandContext}`,
        shapeHint: `Return JSON only, no markdown. Shape the JSON sensibly (e.g. "ideas" array, "captions" array, "lines" array for subtitles with {time, text}, "shots" array for editing/b-roll with relevant fields, "concepts" array for animation). Be specific to this business — never generic filler.`,
      },
    });
    if (copy._aiFailure) return { output: copy.output, _fallback: true, _aiFailure: copy._aiFailure };
    if (copy._fallback) return fallback;
    return { output: copy.output, claimsRemoved: copy.removed, publishable: copy.publishable };
  } catch (err: any) {
    console.error("[video-marketing-agent] error:", err.message);
    return fallback;
  }
}
