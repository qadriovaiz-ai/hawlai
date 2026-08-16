// Graphic Design Agent — covers all 13 tasks (ad creatives, Instagram
// posts, stories, thumbnails, banners, posters, flyers, brochures,
// pitch decks, mockups, AI images, product photos, social graphics)
// via one flexible generator, same Gemini image call as
// brandKitAgent.ts's logo concept generator, just with a
// type-specific style/aspect-ratio prompt template.

export interface GraphicTypeMeta {
  key: string;
  label: string;
  // Shown in the UI before generation — every type here produces
  // exactly one image (this whole agent is one Gemini image call, see
  // generateGraphic() below), so "Pitch Deck Cover"/"Brochure Cover"
  // say plainly that's a cover/title slide, not the full document —
  // the master audit's "looks advanced, delivers basic" finding.
  description: string;
  promptTemplate: (business: string, category: string, prompt: string) => string;
}

// Each template now encodes three things beyond a style adjective: what
// composition actually suits this format (where the eye enters the
// frame, what real-world constraints apply — e.g. Story UI safe zones,
// thumbnail scale), an explicit 1st/2nd/3rd visual hierarchy so the
// image has one clear read instead of competing elements, and enough
// context for the color guidance appended in generateGraphic() below
// to land on top of a real compositional plan rather than a flat scene.
export const GRAPHIC_TYPES: GraphicTypeMeta[] = [
  { key: "ad_creative", label: "Ad Creative", description: "One square ad image — offer visual, bold headline, and a soft CTA cue.", promptTemplate: (b, c, p) => `A polished square (1:1) Meta/Instagram ad creative for "${b}", a ${c} in India. ${p || "Highlight the core offer clearly"}. Composition: the product/offer visual is the dominant element, occupying roughly 60% of the frame — don't split attention with a busy background. Visual hierarchy: 1st the offer visual itself, 2nd a bold headline in the top or bottom third (never crossing the subject), 3rd a smaller supporting detail (price, deadline, or a soft CTA cue). Baked-in text stays short enough to read in under 2 seconds while scrolling.` },
  { key: "instagram_post", label: "Instagram Post", description: "One square feed post image — on-brand and native-feeling, not ad-like.", promptTemplate: (b, c, p) => `A square (1:1) Instagram feed post graphic for "${b}", a ${c}. ${p || "Warm, on-brand, visually clean"}. Composition: rule-of-thirds placement of the main subject, generous breathing room — this should feel like a native post, not an ad. Visual hierarchy: 1st the subject/mood, 2nd any short caption text baked in (small, only if it adds real value), 3rd a small brand mark tucked in a corner, never dominant.` },
  { key: "story", label: "Story", description: "One vertical image sized for Instagram/Facebook's Story UI.", promptTemplate: (b, c, p) => `A vertical (9:16) Instagram/Facebook Story graphic for "${b}", a ${c}. ${p || "Bold, mobile-first design"}. Composition: keep the top ~15% and bottom ~20% of the frame clear of critical content — that's where the app's own reply bar and profile UI sit and will cover anything placed there. Visual hierarchy: 1st a bold, short hook line placed in the safe middle band, 2nd the supporting visual behind/around it, 3rd a subtle brand tag near (not at) the very bottom edge.` },
  { key: "thumbnail", label: "Thumbnail", description: "One YouTube-style thumbnail image — bold text, high-energy focal point.", promptTemplate: (b, c, p) => `A widescreen (16:9) YouTube-style video thumbnail for "${b}", a ${c}. ${p || "High-energy, curiosity-driving"}. Composition: an expressive focal element (a face, reaction, or the core object) on one side of the frame, bold large text on the other — this has to read as a small thumbnail while someone scrolls, not just at full size. Visual hierarchy: 1st the expressive/emotional focal element, 2nd the headline text (3-5 words max, huge and bold), 3rd background context kept simple so it doesn't compete.` },
  { key: "banner", label: "Banner", description: "One wide banner image for a website or social cover.", promptTemplate: (b, c, p) => `A wide horizontal web/social banner for "${b}", a ${c}. ${p || "Clean brand banner with headline"}. Composition: asymmetric layout — headline and supporting text anchored to one side, a reserved clear corner for a logo, generous negative space rather than filling the whole width. Visual hierarchy: 1st the headline, 2nd a visual/brand element balancing the composition, 3rd the logo corner.` },
  { key: "poster", label: "Poster", description: "One portrait poster image — headline, visual, and offer/event details.", promptTemplate: (b, c, p) => `A portrait promotional poster for "${b}", a ${c}, print-ready look. ${p || "Event or offer poster"}. Composition: a clear top-to-bottom vertical flow — bold headline anchoring the top, the main visual owning the middle, offer/event details anchored at the bottom. Visual hierarchy: 1st the headline/hook, 2nd the visual, 3rd the detail block (date, price, or contact), each zone distinct, not blended together.` },
  { key: "flyer", label: "Flyer", description: "One portrait flyer image — headline, one key detail, and a contact strip.", promptTemplate: (b, c, p) => `A portrait A5 flyer design for "${b}", a ${c}. ${p || "Promotional flyer with offer details area"}. Composition: three distinct zones — a header band with the offer headline, a body area with one key selling detail, a footer strip implying contact info. Visual hierarchy: 1st the offer headline, 2nd the single strongest selling detail (not a laundry list), 3rd the footer contact strip — resist cramming in more than these three zones.` },
  // Relabeled from "Brochure" — the prompt only ever produced the
  // cover panel, never the full trifold. See GraphicTypeMeta.description.
  { key: "brochure", label: "Brochure Cover", description: "Just the front cover panel of a trifold brochure — one image, not the full brochure.", promptTemplate: (b, c, p) => `The front cover panel of a professional trifold brochure for "${b}", a ${c}. ${p || "Corporate, trustworthy design"}. Composition: restrained and mostly negative space, title and tagline anchored in the lower third or dead-center — a cover sells restraint, not density. Visual hierarchy: 1st the business name/mark, 2nd the tagline, 3rd a quiet supporting visual texture that doesn't compete with the title.` },
  // Relabeled from "Pitch Deck" — the prompt only ever produced the
  // title slide, never a full deck. Real multi-slide generation lives
  // in the Pitch Deck Builder (src/lib/agents/pitchDeckAgent.ts), a
  // separate tool built for exactly that job.
  { key: "pitch_deck", label: "Pitch Deck Cover", description: "Just a title-slide image for a pitch deck — one image, not the full deck. For a real multi-slide deck, use Pitch Deck Builder.", promptTemplate: (b, c, p) => `A professional title slide for a pitch deck for "${b}", a ${c}. ${p || "Investor-grade, minimal, modern"}. Composition: strict grid alignment, generous margins, a single strong title anchored left or center — this needs to look like slide 1 of a real deck an investor would sit through, not a poster. Visual hierarchy: 1st the deck title, 2nd the business name/subtitle beneath it, 3rd one minimal visual accent, never more.` },
  { key: "mockup", label: "Mockup", description: "One realistic mockup image — your brand applied to a real-world scene.", promptTemplate: (b, c, p) => `A realistic product/branding mockup for "${b}", a ${c}. ${p || "Show the brand applied to a realistic real-world context (signage, packaging, or device screen)"}. Composition: correct real-world perspective and natural shadow/lighting — the brand asset must look physically placed in the scene, not pasted on. Visual hierarchy: 1st the branded object itself in sharp focus, 2nd the environment that grounds it as real (a storefront, a shelf, a hand holding a phone), 3rd incidental lighting/texture detail that sells the realism without distracting.` },
  { key: "ai_image", label: "AI Image", description: "One general-purpose AI image from your own description.", promptTemplate: (b, c, p) => `${p || `A relevant, high-quality image for "${b}", a ${c} in India`}. Composition: one clear focal point — avoid a busy, cluttered frame with competing subjects. Visual hierarchy: 1st the described subject, 2nd supporting environment/context that reinforces it, 3rd background detail kept simple. Photorealistic or clean illustration as best fits, professional quality, no watermarks or text artifacts.` },
  { key: "product_photo", label: "Product Photo", description: "One clean, studio-style product photo.", promptTemplate: (b, c, p) => `A clean studio product photo for "${b}", a ${c}. ${p || "The main product/service, centered"}. Composition: the product centered with even margin on all sides suited to e-commerce cropping, classic studio lighting setup (soft key light, gentle fill, subtle shadow beneath for grounding). Visual hierarchy: 1st the product in sharp focus, 2nd a subtle shadow/reflection that grounds it physically, 3rd a clean, non-distracting background — nothing else in frame.` },
  { key: "social_graphic", label: "Social Graphic", description: "One quote/stat/tip card image for social.", promptTemplate: (b, c, p) => `A square (1:1) social media graphic card for "${b}", a ${c}. ${p || "A quote, stat, or tip card"}. Composition: text-forward layout with generous margin so type never touches the edges, one clear typographic hierarchy rather than several competing text sizes. Visual hierarchy: 1st the quote/stat itself (the largest type on the card), 2nd a smaller attribution or context line beneath it, 3rd a small brand mark, unobtrusive.` },
];

import { logGeminiImageUsage } from "../usage/logUsage";
import type { BrandColor } from "./brandBuildingAgent";
import { type BrandVoiceProfile, formatBrandVoiceVisualHint } from "./brandVoice";

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
  brandVoice?: BrandVoiceProfile | null
): Promise<Buffer> {
  const meta = GRAPHIC_TYPES.find((t) => t.key === designTypeKey);
  if (!meta) throw new Error("Unknown design type");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const toneHint = brandProfile?.tone_of_voice ? ` The brand feels: ${brandProfile.tone_of_voice}.` : "";
  const personalityHint = formatBrandVoiceVisualHint(brandVoice);
  const colorHint = formatBrandColorsForGraphic(existingBrandColors);
  const fullPrompt = meta.promptTemplate(dealershipName, businessCategory, userPrompt) + toneHint + personalityHint + colorHint;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
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
