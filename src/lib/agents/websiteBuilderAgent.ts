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
  siteTypeKey: string,
  brandProfile?: BrandProfile | null,
  customInstructions?: string | null
): Promise<{ pages: GeneratedPage[]; _fallback?: boolean }> {
  const siteType = SITE_TYPES.find((t) => t.key === siteTypeKey) ?? SITE_TYPES[0];

  const fallbackPages: GeneratedPage[] = siteType.pages.map((p) => ({
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

The dealer picked "${siteType.label}" as the closest-fitting page structure/template (it just decides which pages exist and their generic purpose, e.g. a "Products" page). If "${siteType.label}" doesn't perfectly match a ${businessCategory} business, ADAPT each page's purpose to fit the REAL business instead of inventing unrelated content — e.g. a "Products" page for a real estate business should show property listings, for a services business should show services offered, etc. Never let the template category override the actual business identity above.
${brandContext}
${customInstructions?.trim() ? `\nThe business owner specifically asked for: "${customInstructions.trim()}" — follow this closely, it takes priority over generic assumptions about this business type.\n` : ""}
Generate content for these pages: ${siteType.pages.map((p) => `${p.slug} (${p.title})`).join(", ")}.

${SECTION_LIBRARY_NOTE}

For each page, choose 2-4 sections that make sense for that page's purpose (e.g. Home gets a hero + features/testimonials + cta_banner; About gets text/image_text about the business's story; Services/Products gets features_grid or pricing; Team gets team_grid; Contact gets a hero + contact_form). Every page except Contact should still include a contact_form or cta_banner near the end to drive leads.

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

    const pages: GeneratedPage[] = siteType.pages.map((p) => {
      const match = parsed.pages.find((pg: any) => pg.slug === p.slug) ?? parsed.pages[siteType.pages.indexOf(p)];
      return {
        slug: p.slug,
        title: p.title,
        pageType: p.pageType,
        metaDescription: match?.metaDescription ?? `${p.title} — ${dealershipName}`,
        sections: Array.isArray(match?.sections) && match.sections.length > 0 ? match.sections : fallbackPages.find((f) => f.slug === p.slug)!.sections,
      };
    });
    return { pages };
  } catch (err: any) {
    console.error("[website-builder-agent] error:", err.message);
    return { pages: fallbackPages, _fallback: true };
  }
}
