// Video Marketing Agent — covers the text/planning side of the 11
// tasks: Video ideas, Reels, Shorts, TikTok, Captions, Subtitles,
// Video editing (shot list/notes), B-roll suggestions, Animation
// concepts. "AI video generation" and "Voiceover" are NOT duplicated
// here — they already exist in Creative Studio (Veo + ElevenLabs,
// see videoAgent.ts / voiceoverAgent.ts) and this page links to that
// instead of rebuilding it. Same flexible-generator pattern as
// contentMarketingAgent.ts.

export interface VideoTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const VIDEO_TASKS: VideoTaskMeta[] = [
  { key: "video_ideas", label: "Video Ideas", instructions: "5 distinct short-form video concept ideas for this business, each with a one-line concept, target platform, and why it'd work." },
  { key: "reel_script", label: "Reel Script", instructions: "A 15-30 second Instagram Reel script: on-screen hook text, spoken line, 2-3 quick beats, closing CTA. Fast-paced." },
  { key: "shorts_script", label: "Shorts Script", instructions: "A 30-45 second YouTube Shorts script: hook (first 2 seconds), body beats, closing line — written for vertical, fast-cut delivery." },
  { key: "tiktok_script", label: "TikTok Script", instructions: "A TikTok-native script: trend-aware hook, casual spoken tone (not ad-like), 3-4 beats, natural sign-off — should feel native to the platform, not a repurposed ad." },
  { key: "captions", label: "Captions", instructions: "3 caption variants for a short-form video on this topic, each under 100 characters, punchy, with 1-2 relevant emoji and no hashtags (hashtags handled separately)." },
  { key: "subtitles", label: "Subtitles", instructions: "SRT-style subtitle lines for a 30-second video script on this topic: return as an array of {time, text} objects, 5-7 short lines timed roughly every 4-5 seconds starting at 00:00." },
  { key: "video_editing", label: "Video Editing Notes", instructions: "An editing shot list / cut plan for a 30-45 second video on this topic: return as an array of {shot, description, duration} — pacing notes, suggested cuts, text overlay timing, music mood suggestion." },
  { key: "broll", label: "B-Roll Suggestions", instructions: "8 B-roll shot ideas relevant to this business/topic, each a short concrete visual description (e.g. 'close-up hands typing on laptop') that could be filmed easily on a phone." },
  { key: "animation", label: "Animation Concepts", instructions: "3 short animation/motion-graphics concepts suited to a small business budget (e.g. animated text reveals, simple icon animations, kinetic typography), each with a one-line concept and where it'd be used." },
];

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateVideoTask(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null
): Promise<{ output: any; _fallback?: boolean }> {
  const meta = VIDEO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `Draft ${meta.label.toLowerCase()} for ${dealershipName} about "${topic || "your business"}". Regenerate once the API is available for a tailored version.` },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it natural and specific to the business type.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        messages: [{
          role: "user",
          content: `You are a short-form video strategist writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}
Topic/context: "${topic || "general brand content, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown. Shape the JSON sensibly (e.g. "ideas" array, "captions" array, "lines" array for subtitles with {time, text}, "shots" array for editing/b-roll with relevant fields, "concepts" array for animation). Be specific to this business — never generic filler.`,
        }],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[video-marketing-agent] error:", err.message);
    return fallback;
  }
}
