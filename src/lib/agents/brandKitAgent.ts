// ------------------------------------------------------------------
// Brand Kit Agent — Phase 4
// ------------------------------------------------------------------
// Pure text-to-image logo concept generation via Gemini (already
// connected for ad creative image generation elsewhere — this is the
// same API, just without an input photo to edit, since a logo isn't
// based on an existing image).
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
}

export async function generateLogoConcept(
  dealershipName: string,
  brandProfile?: BrandProfile | null
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const toneHint = brandProfile?.tone_of_voice ? ` The brand feels: ${brandProfile.tone_of_voice}.` : "";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Design a clean, modern, professional logo concept for an Indian car dealership named "${dealershipName}".${toneHint} Simple, memorable, works in a single color, no photorealistic cars — an icon/wordmark style logo suitable for a business, on a plain white background. High contrast, print-ready look.` },
          ],
        }],
      }),
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
