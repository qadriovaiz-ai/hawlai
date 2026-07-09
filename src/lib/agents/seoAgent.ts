// ------------------------------------------------------------------
// SEO Agent — Phase 2 basic version
// ------------------------------------------------------------------
// Hawlai doesn't manage a dealer's own website/landing pages yet, so
// there's no page to optimize on-page SEO for. What IS useful right
// now: keyword research and content ideas the dealer can use for
// blog posts, social captions, or briefing a web developer — so this
// starts there rather than pretending a full technical-SEO audit
// tool has something to audit.
// ------------------------------------------------------------------

export interface SeoIdeas {
  keywords: string[];
  contentIdeas: string[];
}

export async function generateSeoIdeas(
  topic: string,
  city?: string | null
): Promise<SeoIdeas> {
  const fallback: SeoIdeas = {
    keywords: [`${topic} ${city ?? ""}`.trim(), `best ${topic} deals`, `${topic} price`],
    contentIdeas: [`Blog post: "Top 5 reasons to buy a ${topic}"`],
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
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are an SEO researcher for an Indian car dealership.
Topic: "${topic}"${city ? `, location: ${city}` : ""}

Return JSON only:
{"keywords":["8-10 realistic search keywords/phrases Indian car buyers would actually type into Google, mixing high-intent (e.g. 'X price on-road') and informational (e.g. 'X vs Y comparison') terms"],"contentIdeas":["4-5 short blog post or video content title ideas that would rank for these keywords and also help the dealership's brand"]}`,
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
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : fallback.keywords,
      contentIdeas: Array.isArray(parsed.contentIdeas) ? parsed.contentIdeas : fallback.contentIdeas,
    };
  } catch (err: any) {
    console.error("[seo-agent] generateSeoIdeas error:", err.message);
    return fallback;
  }
}
