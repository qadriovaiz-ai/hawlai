// ------------------------------------------------------------------
// Website Agent — basic landing page copy
// ------------------------------------------------------------------
// Generates headline/subheadline/offer copy for a dealership's public
// landing page, using the same Brand Profile as every other agent so
// tone stays consistent site-wide.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export interface LandingPageCopy {
  headline: string;
  subheadline: string;
  offer_text: string;
}

export async function generateLandingPageCopy(
  dealershipName: string,
  city: string | null,
  brandProfile?: BrandProfile | null
): Promise<LandingPageCopy> {
  const fallback: LandingPageCopy = {
    headline: `${dealershipName} — Your Trusted Car Partner${city ? ` in ${city}` : ""}`,
    subheadline: "Best deals, honest advice, and a hassle-free buying experience.",
    offer_text: "Book a free test drive today.",
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to include if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";

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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `Write landing page copy for an Indian car dealership called "${dealershipName}"${city ? ` in ${city}` : ""}.
${brandContext}
Return JSON only: {"headline":"under 60 chars, punchy","subheadline":"under 120 chars, builds trust","offer_text":"under 80 chars, a clear call-to-action like booking a test drive"}`,
          },
        ],
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
    const parsed = JSON.parse(clean);
    return {
      headline: parsed.headline ?? fallback.headline,
      subheadline: parsed.subheadline ?? fallback.subheadline,
      offer_text: parsed.offer_text ?? fallback.offer_text,
    };
  } catch (err: any) {
    console.error("[website-agent] generateLandingPageCopy error:", err.message);
    return fallback;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
