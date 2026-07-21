// Website Builder Agent — generates a complete multi-page website:
// which pages to include (based on site type) and real section
// content for each, built from a shared library of section "blocks"
// (hero, text, features, gallery, testimonials, team, pricing, faq,
// cta, contact form) so any business type is assembled from the same
// building blocks instead of needing a hardcoded template per
// industry. Distinct from the existing single-page landing_pages
// generator (quick-launch ad landing page) and seo_pages (standalone
// SEO content) — this is the "real multi-page website" builder.

export interface SiteTypeMeta {
  key: string;
  label: string;
  pages: { slug: string; title: string; pageType: string }[];
}

export const SITE_TYPES: SiteTypeMeta[] = [
  {
    key: "service_business",
    label: "Service Business",
    pages: [
      { slug: "home", title: "Home", pageType: "home" },
      { slug: "about", title: "About", pageType: "about" },
      { slug: "services", title: "Services", pageType: "services" },
      { slug: "contact", title: "Contact", pageType: "contact" },
    ],
  },
  {
    key: "real_estate",
    label: "Real Estate",
    pages: [
      { slug: "home", title: "Home", pageType: "home" },
      { slug: "about", title: "About", pageType: "about" },
      { slug: "listings", title: "Listings", pageType: "products" },
      { slug: "contact", title: "Contact", pageType: "contact" },
    ],
  },
  {
    key: "restaurant",
    label: "Restaurant / Food",
    pages: [
      { slug: "home", title: "Home", pageType: "home" },
      { slug: "menu", title: "Menu", pageType: "products" },
      { slug: "about", title: "About", pageType: "about" },
      { slug: "contact", title: "Contact", pageType: "contact" },
    ],
  },
  {
    key: "ecommerce",
    label: "E-commerce / Retail",
    pages: [
      { slug: "home", title: "Home", pageType: "home" },
      { slug: "products", title: "Products", pageType: "products" },
      { slug: "about", title: "About", pageType: "about" },
      { slug: "contact", title: "Contact", pageType: "contact" },
    ],
  },
  {
    key: "professional",
    label: "Professional / Corporate",
    pages: [
      { slug: "home", title: "Home", pageType: "home" },
      { slug: "about", title: "About", pageType: "about" },
      { slug: "services", title: "Services", pageType: "services" },
      { slug: "team", title: "Team", pageType: "team" },
      { slug: "contact", title: "Contact", pageType: "contact" },
    ],
  },
  {
    key: "portfolio",
    label: "Portfolio / Creative",
    pages: [
      { slug: "home", title: "Home", pageType: "home" },
      { slug: "portfolio", title: "Portfolio", pageType: "products" },
      { slug: "about", title: "About", pageType: "about" },
      { slug: "contact", title: "Contact", pageType: "contact" },
    ],
  },
];

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
}

export interface GeneratedPage {
  slug: string;
  title: string;
  pageType: string;
  metaDescription: string;
  sections: any[];
}

export interface PlannedPage {
  slug: string;
  title: string;
  pageType: string;
}

export interface WebsitePlan {
  businessSummary: string;
  themeKey: string;
  pages: PlannedPage[];
  _fallback?: boolean;
}

// Kept in sync with LANDING_THEMES in src/lib/landingThemes.ts — the plan
// picks one of these preset palettes rather than inventing free-form
// colors, so every generated site still looks intentional.
const THEME_OPTIONS = [
  { key: "navy_amber", desc: "Navy & Amber — trustworthy, professional, classic" },
  { key: "crimson_charcoal", desc: "Crimson & Charcoal — bold, premium, high-energy" },
  { key: "forest_cream", desc: "Forest & Cream — natural, organic, calm" },
  { key: "midnight_sky", desc: "Midnight & Sky — modern, tech-forward, clean" },
];

const DEFAULT_PLAN_PAGES: PlannedPage[] = [
  { slug: "home", title: "Home", pageType: "home" },
  { slug: "about", title: "About", pageType: "about" },
  { slug: "contact", title: "Contact", pageType: "contact" },
  { slug: "privacy-policy", title: "Privacy Policy", pageType: "legal" },
  { slug: "terms", title: "Terms & Conditions", pageType: "legal" },
];

// Plans a website's page structure, positioning, and theme from a single
// free-form prompt the business owner writes (e.g. "Create a premium
// website for my skincare brand, I sell Vitamin C Serum and Face Wash,
// theme should be luxury"). This is a planning-only step — it does not
// generate page content or touch the database; the confirmed plan is
// passed to generateWebsite() to produce actual content.
export async function planWebsite(
  prompt: string,
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  brandProfile?: BrandProfile | null
): Promise<WebsitePlan> {
  const fallback: WebsitePlan = {
    businessSummary: `${dealershipName} — ${businessCategory}`,
    themeKey: "navy_amber",
    pages: DEFAULT_PLAN_PAGES,
    _fallback: true,
  };
  if (!prompt?.trim()) return fallback;

  const brandContext = brandProfile?.tone_of_voice
    ? `Existing brand tone: ${brandProfile.tone_of_voice}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand voice set yet.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `You are planning the structure of a website for a REAL business: "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}, India` : " in India"}.

The business owner described what they want in their own words:
"${prompt.trim()}"

${brandContext}

Decide three things:

1. businessSummary — one specific sentence capturing what this business actually sells/offers and its positioning (e.g. luxury/budget/modern/traditional), grounded in the owner's own words above.

2. pages — the ordered list of pages this site needs. Rules:
   - ALWAYS include "home", "about", "contact" (in that relative order, home first).
   - If the business sells physical products, add ONE page with pageType "products" (slug/title can be "products", "shop", "menu" (food), or "listings" (real estate) — pick whichever fits best).
   - If the business is service-based (not product-based), add ONE page with pageType "services" instead.
   - Add "faq" only if it would genuinely help this specific business.
   - Add "blog" only if the owner's description signals content/education matters to them (skip by default).
   - ALWAYS end the list with "privacy-policy" (pageType "legal") and "terms" (pageType "legal") as the final two pages.
   - Do not invent pages the owner didn't imply are needed — keep it lean and purposeful.

3. themeKey — pick exactly one from this list based on the mood/style the owner described:
${THEME_OPTIONS.map((t) => `   - ${t.key}: ${t.desc}`).join("\n")}

Return JSON only, no markdown, no preamble: {"businessSummary":"...","themeKey":"...","pages":[{"slug":"...","title":"...","pageType":"..."}]}`,
        }],
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
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return fallback;
    const themeKey = THEME_OPTIONS.find((t) => t.key === parsed.themeKey)?.key ?? "navy_amber";
    return {
      businessSummary: typeof parsed.businessSummary === "string" && parsed.businessSummary.trim() ? parsed.businessSummary.trim() : fallback.businessSummary,
      themeKey,
      pages: parsed.pages
        .filter((p: any) => p?.slug && p?.title)
        .map((p: any) => ({ slug: String(p.slug), title: String(p.title), pageType: String(p.pageType ?? "custom") })),
    };
  } catch (err: any) {
    console.error("[website-builder-agent] planWebsite error:", err.message);
    return fallback;
  }
}

const SECTION_LIBRARY_NOTE = `Available section types and their exact JSON shape (use ONLY these):
- {"type":"hero","headline":"...","subheadline":"...","ctaText":"..."}
- {"type":"text","heading":"...","body":"..."}
- {"type":"image_text","heading":"...","body":"...","imagePosition":"left"}
- {"type":"features_grid","heading":"...","items":[{"title":"...","description":"..."}]} (3-4 items)
- {"type":"testimonials","heading":"...","items":[{"quote":"...","author":"..."}]} (2-3 items)
- {"type":"team_grid","heading":"...","items":[{"name":"...","role":"...","bio":"..."}]} (2-4 items)
- {"type":"pricing","heading":"...","items":[{"name":"...","price":"...","features":["..."]}]} (2-3 items)
- {"type":"faq","heading":"...","items":[{"question":"...","answer":"..."}]} (3-5 items)
- {"type":"cta_banner","headline":"...","ctaText":"..."}
- {"type":"contact_form","heading":"..."}`;

export async function generateWebsite(
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  pages: PlannedPage[],
  businessSummary?: string | null,
  brandProfile?: BrandProfile | null,
  customInstructions?: string | null
): Promise<{ pages: GeneratedPage[]; _fallback?: boolean }> {
  const pageList = pages && pages.length > 0 ? pages : DEFAULT_PLAN_PAGES;

  const fallbackPages: GeneratedPage[] = pageList.map((p) => ({
    slug: p.slug,
    title: p.title,
    pageType: p.pageType,
    metaDescription: `${p.title} — ${dealershipName}`,
    sections: [
      { type: "hero", headline: `${dealershipName}`, subheadline: p.title, ctaText: "Get in Touch" },
      { type: "text", heading: p.title, body: "Content coming soon — regenerate once the API is available." },
      { type: "contact_form", heading: "Get in Touch" },
    ],
  }));

  const brandContext = brandProfile?.tone_of_voice
    ? `Brand tone: ${brandProfile.tone_of_voice}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand voice set yet — keep it natural, honest, and specific to this business.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        messages: [{
          role: "user",
          content: `You are building website content for a REAL, SPECIFIC business: "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}, India` : " in India"}. This business identity is fixed and non-negotiable — every page must be genuinely about this business, never a different industry or an invented example business.
${businessSummary ? `\nBusiness summary: ${businessSummary}\n` : ""}${brandContext}
${customInstructions?.trim() ? `\nThe business owner's own description of what they want: "${customInstructions.trim()}" — follow this closely, it takes priority over generic assumptions about this business type.\n` : ""}
Generate content for these pages: ${pageList.map((p) => `${p.slug} (${p.title}, type: ${p.pageType})`).join(", ")}.

${SECTION_LIBRARY_NOTE}

For each page, choose 2-4 sections that make sense for that page's purpose (e.g. Home gets a hero + features/testimonials + cta_banner; About gets text/image_text about the business's story; Services/Products/Menu/Listings gets features_grid or pricing describing what's actually offered — use real product/service names if the owner mentioned any; Contact gets a hero + contact_form). Legal pages ("privacy-policy", "terms") should each get ONE "text" section with genuinely usable, specific standard boilerplate for an Indian small business, naming "${dealershipName}" directly — not a generic disclaimer. Every non-legal, non-contact page should still include a contact_form or cta_banner near the end to drive leads.

Return JSON only, no markdown: {"pages": [{"slug": "home", "title": "Home", "metaDescription": "under 160 chars", "sections": [...]}]} — one object per page listed above, in the same order. Be specific to this real business — never generic "Lorem ipsum" style filler, and never invent fake statistics, awards, or client names.

IMPORTANT: Every single page must be about "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}` : ""}. Do not write about any other industry, product category, or business type under any circumstances — re-read the business name and category above before writing each page.`,
        }],
      }),
    });
    if (!response.ok) return { pages: fallbackPages, _fallback: true };
    const bodyText = await response.text();
    if (!bodyText.trim()) return { pages: fallbackPages, _fallback: true };
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return { pages: fallbackPages, _fallback: true };
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return { pages: fallbackPages, _fallback: true };

    const resultPages: GeneratedPage[] = pageList.map((p) => {
      const match = parsed.pages.find((pg: any) => pg.slug === p.slug) ?? parsed.pages[pageList.indexOf(p)];
      return {
        slug: p.slug,
        title: p.title,
        pageType: p.pageType,
        metaDescription: match?.metaDescription ?? `${p.title} — ${dealershipName}`,
        sections: Array.isArray(match?.sections) && match.sections.length > 0 ? match.sections : fallbackPages.find((f) => f.slug === p.slug)!.sections,
      };
    });
    return { pages: resultPages };
  } catch (err: any) {
    console.error("[website-builder-agent] error:", err.message);
    return { pages: fallbackPages, _fallback: true };
  }
}
