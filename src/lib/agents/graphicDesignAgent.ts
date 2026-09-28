// Graphic Design Agent — covers all 13 tasks (ad creatives, Instagram
// posts, stories, thumbnails, banners, posters, flyers, brochures,
// pitch decks, mockups, AI images, product photos, social graphics)
// via one flexible generator, same Gemini image call as
// brandKitAgent.ts's logo concept generator, just with a
// type-specific style/aspect-ratio prompt template.

import { GRAPHIC_TYPES, type GraphicTypeMeta } from "@/lib/departments/graphic";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { GRAPHIC_TYPES };
export type { GraphicTypeMeta };

// Each template now encodes three things beyond a style adjective: what
// composition actually suits this format (where the eye enters the
// frame, what real-world constraints apply — e.g. Story UI safe zones,
// thumbnail scale), an explicit 1st/2nd/3rd visual hierarchy so the
// image has one clear read instead of competing elements, and enough
// context for the color guidance appended in generateGraphic() below
// to land on top of a real compositional plan rather than a flat scene.

import { logGeminiImageUsage } from "../usage/logUsage";
import type { BrandColor } from "./brandBuildingAgent";
import { type BrandVoiceProfile, formatBrandVoiceVisualHint } from "./brandVoice";
import { buildImageBrief, imageParts } from "@/lib/claims/imageBrief";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

interface BrandProfile {
  tone_of_voice?: string | null;
}

function formatBrandColorsForGraphic(colors?: BrandColor[] | null): string {
  if (!colors || colors.length === 0) {
    return " Choose a color palette deliberately: pick colors with real contrast between the focal element/text and the background so the key message stays legible even shrunk to a scrolling thumbnail — not a low-contrast, generic 'make it pop' palette.";
  }
  return ` Use this business's actual brand colors, not invented ones: ${colors.map((c) => `${c.name} ${c.hex} (${c.role})`).join(", ")} — apply them with enough contrast between the focal element/text and the background that the key message stays legible at thumbnail size.`;
}

export async function generateGraphic(
  designTypeKey: string,
  dealershipName: string,
  businessCategory: string,
  userPrompt: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  existingBrandColors?: BrandColor[] | null,
  brandVoice?: BrandVoiceProfile | null,
  /** The canonical facts (src/lib/claims). What anchors the picture to what the business actually sells. */
  facts?: BusinessFacts | null
): Promise<Buffer> {
  const meta = GRAPHIC_TYPES.find((t) => t.key === designTypeKey);
  if (!meta) throw new Error("Unknown design type");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const toneHint = brandProfile?.tone_of_voice ? ` The brand feels: ${brandProfile.tone_of_voice}.` : "";
  const personalityHint = formatBrandVoiceVisualHint(brandVoice);
  const colorHint = formatBrandColorsForGraphic(existingBrandColors ?? facts?.brand.colors ?? null);
  // Anchored to the real product, and shown the product's own photo when
  // there is one (imageBrief.ts). Without this the model gets a category
  // word and the theme decides the picture — a "Diwali post" for a candle
  // business came back as diyas and no candle.
  const brief = buildImageBrief(userPrompt, facts);
  const fullPrompt = meta.promptTemplate(dealershipName, businessCategory, brief.prompt) + toneHint + personalityHint + colorHint;
  const promptParts = await imageParts(brief, fullPrompt);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: promptParts }] }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Gemini request failed");
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inlineData || p.inline_data);
  const inline = imagePart?.inlineData ?? imagePart?.inline_data;
  if (!inline?.data) throw new Error("Gemini did not return an image — try rephrasing or try again");
  if (logContext) await logGeminiImageUsage(logContext.supabase, logContext.dealershipId, "graphic_design");
  return Buffer.from(inline.data, "base64");
}
