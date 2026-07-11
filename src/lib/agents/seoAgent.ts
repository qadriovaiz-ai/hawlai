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

export interface BlogPost {
  title: string;
  content: string;
}

export async function generateBlogPost(topic: string, city?: string | null, businessCategory: string = "car dealership"): Promise<BlogPost> {
  const fallback: BlogPost = {
    title: `A Buyer's Guide to ${topic}`,
    content: `${topic} is a popular choice for buyers in ${city ?? "India"}. Contact us to learn more about pricing, financing, and availability.`,
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
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: `Write a helpful, SEO-friendly blog post for an Indian ${businessCategory} business.
Topic: "${topic}"${city ? `, location: ${city}` : ""}

400-600 words, informative and genuinely useful (not just sales-y), plain language, a few short paragraphs with natural subheadings. Return JSON only:
{"title":"SEO-friendly title, under 70 chars","content":"the full article body, plain text with \\n\\n between paragraphs and short subheadings on their own line where natural"}`,
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
    return { title: parsed.title ?? fallback.title, content: parsed.content ?? fallback.content };
  } catch (err: any) {
    console.error("[seo-agent] generateBlogPost error:", err.message);
    return fallback;
  }
}

export async function generateSeoIdeas(
  topic: string,
  city?: string | null,
  businessCategory: string = "car dealership"
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
            content: `You are an SEO researcher for an Indian ${businessCategory} business.
Topic: "${topic}"${city ? `, location: ${city}` : ""}

Return JSON only:
{"keywords":["8-10 realistic search keywords/phrases Indian customers would actually type into Google, mixing high-intent (e.g. 'X price on-road') and informational (e.g. 'X vs Y comparison') terms"],"contentIdeas":["4-5 short blog post or video content title ideas that would rank for these keywords and also help the dealership's brand"]}`,
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

// ------------------------------------------------------------------
// Technical SEO Audit — Phase 13
// ------------------------------------------------------------------
// Rule-based, deterministic checks on the dealer's own landing page
// (no Claude call needed — this is genuinely checkable fact, not
// something to generate). Covers the things that actually matter for
// a small local-business page: title/description length for search
// snippets, image alt coverage, whether there's a hero image (also
// used for social share previews), and basic content depth.
// ------------------------------------------------------------------

export interface SeoCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface SeoAudit {
  score: number; // 0-100
  checks: SeoCheck[];
}

export function auditLandingPage(page: {
  published?: boolean;
  slug?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  hero_image_url?: string | null;
  car_listings?: any[] | null;
} | null): SeoAudit {
  if (!page) {
    return {
      score: 0,
      checks: [{ label: "Landing page exists", passed: false, detail: "No landing page set up yet — create one in the Website tab." }],
    };
  }

  const checks: SeoCheck[] = [];

  checks.push({
    label: "Page is published",
    passed: !!page.published,
    detail: page.published ? "Live and indexable by Google." : "Still a draft — Google can't index an unpublished page.",
  });

  const titleLen = page.headline?.length ?? 0;
  checks.push({
    label: "Title length",
    passed: titleLen >= 15 && titleLen <= 60,
    detail: titleLen === 0 ? "No headline set." : titleLen < 15 ? `Only ${titleLen} characters — likely too thin for search results.` : titleLen > 60 ? `${titleLen} characters — Google may truncate this in search results.` : `${titleLen} characters — good length.`,
  });

  const descLen = page.subheadline?.length ?? 0;
  checks.push({
    label: "Description length",
    passed: descLen >= 50 && descLen <= 160,
    detail: descLen === 0 ? "No subheadline set — this doubles as your meta description." : descLen > 160 ? `${descLen} characters — Google will truncate this in search results.` : descLen < 50 ? `Only ${descLen} characters — could say more.` : `${descLen} characters — good length.`,
  });

  checks.push({
    label: "Social share image",
    passed: !!page.hero_image_url,
    detail: page.hero_image_url ? "Set — links shared on WhatsApp/Facebook will show a preview image." : "No hero image — shared links will show no preview image.",
  });

  checks.push({
    label: "URL is descriptive",
    passed: !!page.slug && page.slug.length >= 3 && /[a-z]/.test(page.slug),
    detail: page.slug ? `/p/${page.slug}` : "No URL set yet.",
  });

  checks.push({
    label: "Page has real content depth",
    passed: (page.car_listings?.length ?? 0) > 0,
    detail: (page.car_listings?.length ?? 0) > 0 ? `${page.car_listings!.length} item(s) listed — gives Google more to index.` : "No featured items added yet — a page with just a headline and a form is thin content.",
  });

  const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
  return { score, checks };
}
