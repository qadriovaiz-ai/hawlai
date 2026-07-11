// ------------------------------------------------------------------
// Business Intelligence Agent — Phase 1
// ------------------------------------------------------------------
// Given a dealership's website URL, fetches the page server-side,
// strips it down to readable text, and asks Claude to draft a full
// Brand Profile from it (tone, persona, messaging pillars) — turning
// brand setup from "write everything yourself" into "AI reads your
// site and drafts it, you review and edit". Nothing is saved
// automatically; this only returns suggestions.
// ------------------------------------------------------------------

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface BusinessIntelligenceResult {
  summary: string;
  tone_of_voice: string;
  target_persona: { age_range?: string; income?: string; concerns?: string[] };
  messaging_pillars: string[];
}

export async function analyzeWebsite(url: string): Promise<BusinessIntelligenceResult> {
  let pageText = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; HawlaiBot/1.0)" } });
    if (!res.ok) throw new Error(`Site returned ${res.status}`);
    const html = await res.text();
    pageText = stripHtmlToText(html).slice(0, 6000);
  } catch (err: any) {
    throw new Error(`Couldn't read that website: ${err.message}`);
  }

  if (!pageText || pageText.length < 50) {
    throw new Error("Couldn't find enough readable content on that page");
  }

  const fallback: BusinessIntelligenceResult = {
    summary: "Analyzed the website, but couldn't generate a detailed profile — try filling in the fields manually.",
    tone_of_voice: "Professional and trustworthy",
    target_persona: {},
    messaging_pillars: [],
  };

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
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `Here is the text content of an Indian business's website (business type unknown — infer it from the content itself):
"""
${pageText}
"""

Based only on what's actually there, draft a brand profile. Return JSON only:
{"summary":"2-3 sentence plain-language summary of what this business is and how it presents itself","tone_of_voice":"a short description of the tone/voice this business seems to use or should use, e.g. 'Trustworthy, family-friendly, no hard-sell'","target_persona":{"age_range":"best guess or empty string","income":"best guess or empty string","concerns":["2-3 likely customer concerns based on the site content"]},"messaging_pillars":["3-4 key selling points or values actually mentioned or implied on the site"]}
If the page doesn't give enough signal for a field, make a reasonable, honest default rather than inventing specifics.`,
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
      summary: parsed.summary ?? fallback.summary,
      tone_of_voice: parsed.tone_of_voice ?? fallback.tone_of_voice,
      target_persona: parsed.target_persona ?? {},
      messaging_pillars: Array.isArray(parsed.messaging_pillars) ? parsed.messaging_pillars : [],
    };
  } catch (err: any) {
    console.error("[business-intelligence] analyzeWebsite error:", err.message);
    return fallback;
  }
}
