// ------------------------------------------------------------------
// Business Intelligence Agent — Phase 1
// ------------------------------------------------------------------
// Two ways in: a website URL (fetched and read server-side), or the
// owner just describing their business in their own words. Both draft
// a full Brand Profile (business type, tone, persona, messaging
// pillars) — turning brand setup from "fill out five fields yourself"
// into "tell me about your business, review the draft, save it".
// Nothing is saved automatically; these only return suggestions.
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
  business_category: string;
  tone_of_voice: string;
  target_persona: { age_range?: string; income?: string; concerns?: string[] };
  messaging_pillars: string[];
}

const RESPONSE_SCHEMA = `{"summary":"2-3 sentence plain-language summary of what this business is and how it presents itself","business_category":"a short label for the type of business, e.g. 'Car Dealership', 'Real Estate', 'Restaurant', 'Coaching Institute'","tone_of_voice":"a short description of the tone/voice this business seems to use or should use, e.g. 'Trustworthy, family-friendly, no hard-sell'","target_persona":{"age_range":"best guess or empty string","income":"best guess or empty string","concerns":["2-3 likely customer concerns"]},"messaging_pillars":["3-4 key selling points or values"]}`;

async function extractProfile(sourceLabel: string, sourceText: string): Promise<BusinessIntelligenceResult | null> {
  const fallback: BusinessIntelligenceResult = {
    summary: "Couldn't generate a detailed profile — try filling in the fields manually.",
    business_category: "",
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
            content: `${sourceLabel}:\n"""\n${sourceText}\n"""\n\nBased only on what's actually there, draft a brand profile. Return JSON only:\n${RESPONSE_SCHEMA}\nIf something isn't clear from the source, make a reasonable, honest default rather than inventing specifics.`,
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
      business_category: parsed.business_category ?? fallback.business_category,
      tone_of_voice: parsed.tone_of_voice ?? fallback.tone_of_voice,
      target_persona: parsed.target_persona ?? {},
      messaging_pillars: Array.isArray(parsed.messaging_pillars) ? parsed.messaging_pillars : [],
    };
  } catch (err: any) {
    console.error("[business-intelligence] extractProfile error:", err.message);
    return fallback;
  }
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

  const result = await extractProfile("Here is the text content of an Indian business's website", pageText);
  return result!;
}

export async function analyzeDescription(description: string): Promise<BusinessIntelligenceResult> {
  if (!description || description.trim().length < 10) {
    throw new Error("Tell me a bit more about your business — a couple of sentences is enough");
  }
  const result = await extractProfile(
    "Here is how the owner of an Indian business describes it, in their own words",
    description.trim().slice(0, 2000)
  );
  return result!;
}
