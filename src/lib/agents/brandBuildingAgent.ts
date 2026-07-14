// ------------------------------------------------------------------
// Brand Building Agent
// ------------------------------------------------------------------
// Generates the full brand identity kit that sits alongside the
// existing Brand Voice profile: color palette, typography pairing,
// tagline, mission/vision, brand story, social media identity
// (bios + hashtags) and personal branding guidance for the founder.
// Logo generation stays in brandKitAgent.ts (image model, separate
// concern) — this agent is text-only, same Claude call pattern as
// deepStrategyAgent.ts: generous max_tokens, never cache a fallback.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  target_persona?: any;
  messaging_pillars?: string[] | null;
}

export interface BrandColor {
  name: string;
  hex: string;
  role: string; // Primary | Secondary | Accent | Neutral
}

export interface BrandKit {
  colors: BrandColor[];
  typography: { headingFont: string; bodyFont: string; rationale: string };
  tagline: string;
  mission: string;
  vision: string;
  brandStory: string;
  socialIdentity: { instagramBio: string; facebookBio: string; hashtags: string[] };
  personalBranding: string;
  guidelines: string[];
}

export async function generateBrandKit(
  dealershipName: string,
  city: string | null,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "car dealership"
): Promise<BrandKit & { _fallback?: boolean }> {
  const fallback: BrandKit & { _fallback?: boolean } = {
    _fallback: true,
    colors: [
      { name: "Deep Indigo", hex: "#3730A3", role: "Primary" },
      { name: "Warm Amber", hex: "#F59E0B", role: "Accent" },
      { name: "Slate", hex: "#475569", role: "Secondary" },
      { name: "Off White", hex: "#F8FAFC", role: "Neutral" },
    ],
    typography: {
      headingFont: "Poppins",
      bodyFont: "Inter",
      rationale: "A clean, modern pairing that reads well in both English and Hinglish ad copy. Add a Brand Voice description for a sharper, more specific pairing.",
    },
    tagline: `${dealershipName} — trusted, local, straightforward.`,
    mission: `To give every customer of ${dealershipName} a simple, honest experience they'd recommend to family.`,
    vision: `To be the most trusted ${businessCategory} name${city ? ` in ${city}` : " in the area"}.`,
    brandStory: `${dealershipName} started with a simple idea — ${businessCategory.toLowerCase()} shouldn't feel confusing or pushy. Add a Brand Voice description first so this can be tailored to your actual story.`,
    socialIdentity: {
      instagramBio: `${dealershipName} 📍${city ?? "Local"} | Trusted ${businessCategory}`,
      facebookBio: `${dealershipName} is a ${businessCategory}${city ? ` based in ${city}` : ""}, focused on honest, straightforward service.`,
      hashtags: [`#${dealershipName.replace(/\s+/g, "")}`, `#${businessCategory.replace(/\s+/g, "")}`, city ? `#${city.replace(/\s+/g, "")}` : "#LocalBusiness"],
    },
    personalBranding: `Consider posting short, personal videos as the face of ${dealershipName} — customers trust a real person more than a logo. Add a Brand Voice description for tailored advice.`,
    guidelines: [
      "Keep messaging honest and specific — avoid generic sales language.",
      "Use the primary color for CTAs and headers, accent sparingly.",
      "Stay consistent with tone across ads, social, and WhatsApp replies.",
    ],
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "not set"}. Target persona: ${JSON.stringify(brandProfile.target_persona ?? {})}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand profile set yet — give reasonable, honest defaults for this business category rather than inventing specifics.";

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
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: `You are a senior brand strategist and designer building a complete brand identity kit for an Indian ${businessCategory} business called "${dealershipName}"${city ? ` in ${city}` : ""}.
${brandContext}

Return JSON only, no markdown:
{
"colors":[{"name":"color name","hex":"#RRGGBB","role":"Primary|Secondary|Accent|Neutral"}] (exactly 4 colors, a real usable palette that fits the brand tone and business type — not generic corporate blue unless it genuinely fits),
"typography":{"headingFont":"a real Google Font name","bodyFont":"a real Google Font name","rationale":"1-2 sentences on why this pairing fits the brand"},
"tagline":"one short, memorable tagline (under 8 words)",
"mission":"1-2 sentences — why this business exists, for its customers",
"vision":"1 sentence — where this business is headed long-term",
"brandStory":"3-4 sentences telling an authentic-feeling origin/purpose story for this specific business, grounded in the business type and locality — not generic",
"socialIdentity":{"instagramBio":"under 150 characters, ready to paste into Instagram bio","facebookBio":"1-2 sentences for Facebook About section","hashtags":["5-6 relevant hashtags including one branded and one local"]},
"personalBranding":"2-3 sentences of specific advice for the founder on building their own personal brand alongside the business (e.g. what to post, how to show up)",
"guidelines":["4-5 short, concrete do's/don'ts for staying visually and tonally consistent across ads, social and website"]
}
Be specific to this business type and city — avoid generic startup-brand-kit filler. Fonts must be real Google Fonts that actually pair well.`,
          },
        ],
      }),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error("[brand-building-agent] Claude API not ok:", response.status, errBody.slice(0, 300));
      return fallback;
    }
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return {
      colors: Array.isArray(parsed.colors) && parsed.colors.length > 0 ? parsed.colors : fallback.colors,
      typography: {
        headingFont: parsed.typography?.headingFont ?? fallback.typography.headingFont,
        bodyFont: parsed.typography?.bodyFont ?? fallback.typography.bodyFont,
        rationale: parsed.typography?.rationale ?? fallback.typography.rationale,
      },
      tagline: parsed.tagline ?? fallback.tagline,
      mission: parsed.mission ?? fallback.mission,
      vision: parsed.vision ?? fallback.vision,
      brandStory: parsed.brandStory ?? fallback.brandStory,
      socialIdentity: {
        instagramBio: parsed.socialIdentity?.instagramBio ?? fallback.socialIdentity.instagramBio,
        facebookBio: parsed.socialIdentity?.facebookBio ?? fallback.socialIdentity.facebookBio,
        hashtags: Array.isArray(parsed.socialIdentity?.hashtags) && parsed.socialIdentity.hashtags.length > 0 ? parsed.socialIdentity.hashtags : fallback.socialIdentity.hashtags,
      },
      personalBranding: parsed.personalBranding ?? fallback.personalBranding,
      guidelines: Array.isArray(parsed.guidelines) && parsed.guidelines.length > 0 ? parsed.guidelines : fallback.guidelines,
    };
  } catch (err: any) {
    console.error("[brand-building-agent] error:", err.message);
    return fallback;
  }
}
