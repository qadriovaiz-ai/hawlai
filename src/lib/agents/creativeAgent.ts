// ------------------------------------------------------------------
// Creative Agent — Phase 1 expansion
// ------------------------------------------------------------------
// So far Creative Agent only made static ad images (template or
// Gemini AI background). This adds two text-based capabilities that
// need no image processing:
//  1. Short-form video/reel scripts (scene-by-scene, for Instagram
//     Reels / YouTube Shorts style content)
//  2. Multiple ad-copy variations for the same idea, so a dealer can
//     A/B test angles (urgency vs trust vs price) before picking one
//     to actually launch as an ad.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export interface VideoScene {
  scene_number: number;
  visual: string;
  voiceover_or_caption: string;
  duration_seconds: number;
}

export interface VideoScript {
  title: string;
  total_duration_seconds: number;
  scenes: VideoScene[];
}

export interface CopyVariation {
  angle: string;
  headline: string;
  body: string;
  score: number;
}

function brandContextFor(brandProfile?: BrandProfile | null): string {
  return brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to weave in if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";
}

async function callClaude(prompt: string, maxTokens: number): Promise<any | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText.trim()) return null;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return null;
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[creative-agent] callClaude error:", err.message);
    return null;
  }
}

export async function generateVideoScript(
  topic: string,
  brandProfile?: BrandProfile | null
): Promise<VideoScript> {
  const fallback: VideoScript = {
    title: topic,
    total_duration_seconds: 20,
    scenes: [
      { scene_number: 1, visual: "Wide shot of the car in the showroom", voiceover_or_caption: `Introducing ${topic}`, duration_seconds: 5 },
      { scene_number: 2, visual: "Close-up of key features", voiceover_or_caption: "Packed with everything you need", duration_seconds: 8 },
      { scene_number: 3, visual: "Call-to-action text on screen", voiceover_or_caption: "Book your test drive today!", duration_seconds: 7 },
    ],
  };

  const parsed = await callClaude(
    `You are a short-form video scriptwriter for an Indian car dealership's Instagram Reels / YouTube Shorts.
Topic: "${topic}"
${brandContextFor(brandProfile)}

Write a 15-30 second video script, 3-6 scenes. Return JSON only:
{"title":"short title for the video","total_duration_seconds":number,"scenes":[{"scene_number":1,"visual":"what the camera shows, one short sentence","voiceover_or_caption":"what's said or shown as on-screen text, one short sentence","duration_seconds":number}]}`,
    600
  );

  if (!parsed || !Array.isArray(parsed.scenes)) return fallback;
  return {
    title: parsed.title ?? fallback.title,
    total_duration_seconds: parsed.total_duration_seconds ?? fallback.total_duration_seconds,
    scenes: parsed.scenes,
  };
}

export async function generateCopyVariations(
  topic: string,
  brandProfile?: BrandProfile | null,
  count: number = 3
): Promise<CopyVariation[]> {
  const fallback: CopyVariation[] = [
    { angle: "Urgency", headline: `${topic} — Limited Stock!`, body: "Hurry, offer ends soon. Book your test drive today.", score: 50 },
  ];

  const parsed = await callClaude(
    `You are an ad copywriter for an Indian car dealership, A/B testing different angles for the same offer.
Topic: "${topic}"
${brandContextFor(brandProfile)}

Write ${count} DISTINCT ad copy variations, each taking a different angle (e.g. urgency, trust/credibility, price/value, lifestyle/aspiration — pick whichever ${count} fit best). For each, also give an honest 0-100 confidence score for how well it will convert with Indian car buyers — be genuinely critical and vary the scores based on real strength, not uniformly high. Return JSON only:
{"variations":[{"angle":"short label for the angle used","headline":"under 40 chars, in Hinglish","body":"under 125 chars, in Hinglish","score":number}]}`,
    700
  );

  if (!parsed || !Array.isArray(parsed.variations)) return fallback;
  return parsed.variations;
}

// ------------------------------------------------------------------
// Phase 3 addition: product descriptions — pure text generation, no
// new dependencies. (Blog posts live in seoAgent.ts, generated from
// there instead, to avoid having two separate blog generators.)
// ------------------------------------------------------------------

export interface ProductDescription {
  title: string;
  description: string;
  highlights: string[];
}

export async function generateProductDescription(
  carModel: string,
  details: string,
  brandProfile?: BrandProfile | null
): Promise<ProductDescription> {
  const fallback: ProductDescription = {
    title: carModel,
    description: `Discover the ${carModel} — available now. Contact us for full details and pricing.`,
    highlights: [],
  };
  const parsed = await callClaude(
    `Write a product listing description for a car at an Indian dealership.
Car: "${carModel}"
Details provided: "${details}"
${brandContextFor(brandProfile)}
Return JSON only:
{"title":"short listing title","description":"2-3 sentence description, honest and specific to what was given, not generic","highlights":["4-5 short bullet-point features, based on the details given"]}`,
    500
  );
  if (!parsed) return fallback;
  return {
    title: parsed.title ?? fallback.title,
    description: parsed.description ?? fallback.description,
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
  };
}
