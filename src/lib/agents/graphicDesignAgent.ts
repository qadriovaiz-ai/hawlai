// Graphic Design Agent — covers all 13 tasks (ad creatives, Instagram
// posts, stories, thumbnails, banners, posters, flyers, brochures,
// pitch decks, mockups, AI images, product photos, social graphics)
// via one flexible generator, same Gemini image call as
// brandKitAgent.ts's logo concept generator, just with a
// type-specific style/aspect-ratio prompt template.

export interface GraphicTypeMeta {
  key: string;
  label: string;
  promptTemplate: (business: string, category: string, prompt: string) => string;
}

export const GRAPHIC_TYPES: GraphicTypeMeta[] = [
  { key: "ad_creative", label: "Ad Creative", promptTemplate: (b, c, p) => `A polished square (1:1) Meta/Instagram ad creative for "${b}", a ${c} in India. ${p || "Highlight the core offer clearly"}. Bold readable headline text baked into the image, high contrast, scroll-stopping, professional ad design — not a stock photo.` },
  { key: "instagram_post", label: "Instagram Post", promptTemplate: (b, c, p) => `A square (1:1) Instagram feed post graphic for "${b}", a ${c}. ${p || "Warm, on-brand, visually clean"}. Minimal but eye-catching, no watermarks.` },
  { key: "story", label: "Story", promptTemplate: (b, c, p) => `A vertical (9:16) Instagram/Facebook Story graphic for "${b}", a ${c}. ${p || "Bold, mobile-first design"}. Leave clear space near top/bottom for UI overlays, punchy short text baked in.` },
  { key: "thumbnail", label: "Thumbnail", promptTemplate: (b, c, p) => `A widescreen (16:9) YouTube-style video thumbnail for "${b}", a ${c}. ${p || "High-energy, curiosity-driving"}. Bold large text, high contrast colors, expressive, clickable.` },
  { key: "banner", label: "Banner", promptTemplate: (b, c, p) => `A wide horizontal web/social banner for "${b}", a ${c}. ${p || "Clean brand banner with headline"}. Professional, balanced composition, room for a logo corner.` },
  { key: "poster", label: "Poster", promptTemplate: (b, c, p) => `A portrait promotional poster for "${b}", a ${c}, print-ready look. ${p || "Event or offer poster"}. Bold typography hierarchy, clear focal point.` },
  { key: "flyer", label: "Flyer", promptTemplate: (b, c, p) => `A portrait A5 flyer design for "${b}", a ${c}. ${p || "Promotional flyer with offer details area"}. Clean layout with a clear headline, sub-text, and space implying contact info at the bottom.` },
  { key: "brochure", label: "Brochure", promptTemplate: (b, c, p) => `The front cover panel of a professional trifold brochure for "${b}", a ${c}. ${p || "Corporate, trustworthy design"}. Elegant cover layout, room for a title and tagline.` },
  { key: "pitch_deck", label: "Pitch Deck", promptTemplate: (b, c, p) => `A professional title slide for a pitch deck for "${b}", a ${c}. ${p || "Investor-grade, minimal, modern"}. Clean corporate design, plenty of negative space, looks like a real slide 1 of a deck.` },
  { key: "mockup", label: "Mockup", promptTemplate: (b, c, p) => `A realistic product/branding mockup for "${b}", a ${c}. ${p || "Show the brand applied to a realistic real-world context (signage, packaging, or device screen)"}. Photorealistic mockup style, soft studio lighting.` },
  { key: "ai_image", label: "AI Image", promptTemplate: (b, c, p) => `${p || `A relevant, high-quality image for "${b}", a ${c} in India`}. Photorealistic or clean illustration as best fits, professional quality, no watermarks or text artifacts.` },
  { key: "product_photo", label: "Product Photo", promptTemplate: (b, c, p) => `A clean studio product photo for "${b}", a ${c}. ${p || "The main product/service, centered"}. Plain white or soft gradient background, professional e-commerce style lighting, sharp focus.` },
  { key: "social_graphic", label: "Social Graphic", promptTemplate: (b, c, p) => `A square (1:1) social media graphic card for "${b}", a ${c}. ${p || "A quote, stat, or tip card"}. Modern card design, bold short text baked into the image, on-brand color use.` },
];

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateGraphic(
  designTypeKey: string,
  dealershipName: string,
  businessCategory: string,
  userPrompt: string,
  brandProfile?: BrandProfile | null
): Promise<Buffer> {
  const meta = GRAPHIC_TYPES.find((t) => t.key === designTypeKey);
  if (!meta) throw new Error("Unknown design type");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const toneHint = brandProfile?.tone_of_voice ? ` The brand feels: ${brandProfile.tone_of_voice}.` : "";
  const fullPrompt = meta.promptTemplate(dealershipName, businessCategory, userPrompt) + toneHint;

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
  return Buffer.from(inline.data, "base64");
}
