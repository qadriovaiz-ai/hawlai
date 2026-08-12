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

export interface SeoKeywordIdea {
  keyword: string;
  intent: "informational" | "transactional" | "navigational";
  note: string;
}

export interface SeoIdeas {
  // Flat list, kept exactly as-is for backward compatibility — the
  // /dashboard/seo page renders these directly as pills.
  keywords: string[];
  // Same keywords with real search-intent classification and reasoning,
  // matching the pattern already shipped for competitor_keywords in
  // seoToolkitAgent.ts. Master Chat's artifact card groups by this.
  keywordDetails: SeoKeywordIdea[];
  contentIdeas: string[];
}

import { logClaudeUsage } from "../usage/logUsage";

export interface BlogPost {
  title: string;
  content: string;
  metaDescription: string;
  // Made visible instead of left implicit — forces (and lets you audit)
  // real heading-hierarchy planning instead of a flat wall of text with
  // subheadings bolted on after the fact.
  headingOutline: { level: "H2" | "H3"; heading: string }[];
  targetIntent: "informational" | "transactional" | "navigational";
  // Only ever populated from existingPages below — never invented. This
  // app already shipped a fix (see websiteBuilderAgent.ts) for
  // hallucinated internal links breaking generated sites; a blog-linking
  // feature that guesses page slugs would reintroduce that exact bug.
  internalLinkSuggestions: { anchorText: string; linksToSlug: string; why: string }[];
}

export async function generateBlogPost(
  topic: string,
  city?: string | null,
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  existingPages?: { slug: string; title: string }[] | null
): Promise<BlogPost> {
  const fallback: BlogPost = {
    title: `A Buyer's Guide to ${topic}`,
    content: `${topic} is a popular choice for buyers in ${city ?? "India"}. Contact us to learn more about pricing, financing, and availability.`,
    metaDescription: `Learn about ${topic} — pricing, options, and what to know before you buy.`.slice(0, 160),
    headingOutline: [],
    targetIntent: "informational",
    internalLinkSuggestions: [],
  };

  const pages = (existingPages ?? []).filter((p) => p?.slug && p?.title);
  const linkingContext = pages.length > 0
    ? `\nThis business's real website pages (the ONLY pages you may link to — never invent a slug that isn't in this list): ${pages.map((p) => `"${p.title}" (slug: "${p.slug}")`).join(", ")}.`
    : "\nNo real website page list is available — return an empty internalLinkSuggestions array rather than guessing plausible-sounding page names.";

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
        // Was 1200 — too tight once metaDescription/headingOutline/
        // targetIntent/internalLinkSuggestions ride alongside the full
        // 400-600 word body in one JSON payload; matches the same
        // truncation failure mode found and fixed in
        // websiteBuilderAgent.ts's page generation earlier this session.
        max_tokens: 2800,
        messages: [
          {
            role: "user",
            content: `Write a helpful, SEO-friendly blog post for an Indian ${businessCategory} business.
Topic: "${topic}"${city ? `, location: ${city}` : ""}${groundingContext ?? ""}${linkingContext}

Plan before you write:
1. Decide the primary search intent this post targets — informational (explaining/comparing), transactional (ready to act, e.g. "book X near me"), or navigational (looking for this specific business) — and let that decision shape the angle and the closing line.
2. Plan a real heading hierarchy (2-4 H2s, with an H3 only where a section genuinely needs a sub-point) that maps to how someone would actually scan this topic, not arbitrary section breaks.
3. Only if real pages were listed above: suggest 1-3 internal links using their ACTUAL slugs, each with a natural anchor text and a one-line reason it belongs at that point in the post. If no real pages were listed, return an empty array — never invent a slug.

400-600 words, informative and genuinely useful (not just sales-y), plain language, a few short paragraphs under each heading. Return JSON only:
{"title":"SEO-friendly title, under 70 chars","metaDescription":"under 160 chars, click-worthy and keyword-aware","targetIntent":"informational|transactional|navigational","headingOutline":[{"level":"H2|H3","heading":"..."}],"content":"the full article body, plain text with \\n\\n between paragraphs and each heading from headingOutline appearing on its own line exactly where it belongs","internalLinkSuggestions":[{"anchorText":"...","linksToSlug":"one of the real slugs listed above","why":"..."}]}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "seo_blog_post", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    const validSlugs = new Set(pages.map((p) => p.slug));
    return {
      title: parsed.title ?? fallback.title,
      content: parsed.content ?? fallback.content,
      metaDescription: typeof parsed.metaDescription === "string" && parsed.metaDescription.trim() ? parsed.metaDescription.trim() : fallback.metaDescription,
      headingOutline: Array.isArray(parsed.headingOutline) ? parsed.headingOutline.filter((h: any) => h?.heading) : fallback.headingOutline,
      targetIntent: ["informational", "transactional", "navigational"].includes(parsed.targetIntent) ? parsed.targetIntent : fallback.targetIntent,
      // Defense-in-depth beyond the prompt instruction, same principle as
      // sanitizeInternalLinks() in websiteBuilderAgent.ts: never trust a
      // model-returned slug without checking it against the real list.
      internalLinkSuggestions: Array.isArray(parsed.internalLinkSuggestions)
        ? parsed.internalLinkSuggestions.filter((l: any) => l?.linksToSlug && validSlugs.has(l.linksToSlug))
        : fallback.internalLinkSuggestions,
    };
  } catch (err: any) {
    console.error("[seo-agent] generateBlogPost error:", err.message);
    return fallback;
  }
}

export async function generateSeoIdeas(
  topic: string,
  city?: string | null,
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string
): Promise<SeoIdeas> {
  const fallbackKeywords = [`${topic} ${city ?? ""}`.trim(), `best ${topic} deals`, `${topic} price`];
  const fallback: SeoIdeas = {
    keywords: fallbackKeywords,
    keywordDetails: fallbackKeywords.map((k) => ({ keyword: k, intent: "informational" as const, note: "" })),
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
        // Was 500 — enough for a flat string array, not enough once
        // every keyword carries an intent label and a reasoning note.
        max_tokens: 1400,
        messages: [
          {
            role: "user",
            content: `You are an SEO researcher for an Indian ${businessCategory} business.
Topic: "${topic}"${city ? `, location: ${city}` : ""}${groundingContext ?? ""}

For each keyword, classify its search intent — informational (researching/comparing, e.g. "X vs Y", "how does X work"), transactional (ready to act, e.g. "X price on-road", "book X near me"), or navigational (searching for this specific business/brand by name) — and give a one-line note on why that keyword matters or what the searcher actually wants. Mix intents realistically: most SEO value for a small business comes from a blend, not all-transactional.

Return JSON only:
{"keywords":[{"keyword":"realistic search phrase an Indian customer would actually type into Google","intent":"informational|transactional|navigational","note":"one short sentence"}] (8-10 keywords),"contentIdeas":["4-5 short blog post or video content title ideas that would rank for these keywords and also help the business's brand"]}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "seo_keywords", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    const details: SeoKeywordIdea[] = Array.isArray(parsed.keywords) && parsed.keywords.length > 0
      ? parsed.keywords
          .filter((k: any) => k?.keyword)
          .map((k: any) => ({
            keyword: String(k.keyword),
            intent: ["informational", "transactional", "navigational"].includes(k.intent) ? k.intent : "informational",
            note: typeof k.note === "string" ? k.note : "",
          }))
      : fallback.keywordDetails;
    return {
      keywords: details.map((k) => k.keyword),
      keywordDetails: details,
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

export interface PageAuditResult {
  pageSlug: string;
  pageTitle: string;
  score: number;
  checks: SeoCheck[];
}

export interface WebsiteAudit {
  score: number; // average across all pages
  published: boolean;
  siteUrl: string | null;
  pages: PageAuditResult[];
}

// Real audit against the CURRENT website builder tables (websites +
// website_pages) — the ones actually used across every business type
// today, not the legacy single-page car-dealership `landing_pages`
// table auditLandingPage below still covers for its one remaining
// consumer (croAgent.ts).
export function auditWebsite(
  website: { published?: boolean; slug?: string | null } | null,
  pages: { slug: string; title?: string | null; meta_description?: string | null; sections?: any[] | null }[]
): WebsiteAudit {
  if (!website) {
    return { score: 0, published: false, siteUrl: null, pages: [] };
  }
  if (pages.length === 0) {
    return {
      score: 0,
      published: !!website.published,
      siteUrl: website.slug ? `/p/${website.slug}` : null,
      pages: [{ pageSlug: "—", pageTitle: "No pages yet", score: 0, checks: [{ label: "Website has pages", passed: false, detail: "Add pages in the Website Builder before there's anything to audit." }] }],
    };
  }

  const pageResults: PageAuditResult[] = pages.map((page) => {
    const checks: SeoCheck[] = [];

    const titleLen = page.title?.length ?? 0;
    checks.push({
      label: "Title length",
      passed: titleLen >= 15 && titleLen <= 60,
      detail: titleLen === 0 ? "No title set." : titleLen < 15 ? `Only ${titleLen} characters — likely too thin for search results.` : titleLen > 60 ? `${titleLen} characters — Google may truncate this.` : `${titleLen} characters — good length.`,
    });

    const descLen = page.meta_description?.length ?? 0;
    checks.push({
      label: "Meta description",
      passed: descLen >= 50 && descLen <= 160,
      detail: descLen === 0 ? "No meta description set for this page." : descLen > 160 ? `${descLen} characters — Google will truncate this in search results.` : descLen < 50 ? `Only ${descLen} characters — could say more.` : `${descLen} characters — good length.`,
    });

    // Real content-depth check — walks every section's string fields
    // (sections is a flexible jsonb array, shape varies by section
    // type) rather than assuming a fixed schema, since this needs to
    // work across every site_type Hawlai supports, not just one.
    const sections = page.sections ?? [];
    let totalTextLength = 0;
    let hasImage = false;
    for (const section of sections) {
      for (const [key, value] of Object.entries(section ?? {})) {
        if (typeof value === "string") totalTextLength += value.length;
        if (key.toLowerCase().includes("image") && value) hasImage = true;
      }
    }
    checks.push({
      label: "Content depth",
      passed: sections.length >= 2 && totalTextLength >= 150,
      detail: sections.length === 0 ? "No sections added — an empty page has nothing for Google to index." : `${sections.length} section(s), ~${totalTextLength} characters of real content.`,
    });

    checks.push({
      label: "Has a visual",
      passed: hasImage,
      detail: hasImage ? "At least one image found — helps engagement and social share previews." : "No image found on this page yet.",
    });

    checks.push({
      label: "URL is descriptive",
      passed: !!page.slug && page.slug.length >= 3 && /[a-z]/.test(page.slug),
      detail: `/${page.slug}`,
    });

    const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
    return { pageSlug: page.slug, pageTitle: page.title ?? page.slug, score, checks };
  });

  const overallScore = Math.round(pageResults.reduce((sum, p) => sum + p.score, 0) / pageResults.length);

  return {
    score: overallScore,
    published: !!website.published,
    siteUrl: website.slug ? `/p/${website.slug}` : null,
    pages: pageResults,
  };
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
