// Website Builder Agent — generates a complete multi-page website:
// which pages to include (based on site type) and real content for
// each, composed from the same Block registry the editor and public
// renderer use (src/lib/blocks/registry.ts) so any business type is
// assembled from the same building blocks instead of needing a
// hardcoded template per industry. Distinct from the existing
// single-page landing_pages generator (quick-launch ad landing page)
// and seo_pages (standalone SEO content) — this is the "real
// multi-page website" builder.

import { BLOCK_REGISTRY, generateBlockId } from "@/lib/blocks/registry";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import { logClaudeUsage } from "../usage/logUsage";

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
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string }
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
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "website_plan", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
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

// Block-tree generation — one Anthropic tool-use call per page,
// registry-driven so the model's vocabulary of block types and their
// props always matches src/lib/blocks/registry.ts exactly (adding a
// new block type there automatically becomes something the AI can use,
// no prompt edit required). "product_grid" is deliberately excluded —
// real catalog data is spliced in programmatically after generation,
// same principle the old "product_catalog" splice used.
const AI_BLOCK_TYPES = Object.keys(BLOCK_REGISTRY).filter((t) => t !== "product_grid");

const BLOCK_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: AI_BLOCK_TYPES },
    props: { type: "object", description: "Shape depends on `type` — see the block vocabulary in the prompt." },
    children: { type: "array", items: { $ref: "#/$defs/block" }, description: "Only for container types (section, stack)." },
  },
  required: ["type", "props"],
};

const EMIT_PAGE_TOOL = {
  name: "emit_page",
  description: "Emit the content for one website page as a meta description and a tree of blocks.",
  input_schema: {
    type: "object",
    $defs: { block: BLOCK_SCHEMA },
    properties: {
      metaDescription: { type: "string", description: "Under 160 characters, for search results." },
      blocks: {
        type: "array",
        items: { $ref: "#/$defs/block" },
        description: "Top-level blocks for this page. Every item MUST have type \"section\" — that is the only block type allowed at the top level.",
      },
    },
    required: ["metaDescription", "blocks"],
  },
};

function blockVocabularyNote(): string {
  return AI_BLOCK_TYPES.map((type) => {
    const def = BLOCK_REGISTRY[type];
    const propsDesc = (def.propFields ?? []).map((f) => `${f.key}${f.options ? ` (${f.options.map((o) => o.value).join("|")})` : ""}`).join(", ") || "(no props)";
    return `- "${type}"${def.isContainer ? " [container — can have children]" : ""}: props { ${propsDesc} }`;
  }).join("\n");
}

// Validates a model-returned node against the registry before it's
// ever trusted: unknown types are rejected, and children are rejected
// on any type the registry doesn't mark as a container. A JSON Schema
// can express the recursive shape but not "children only valid if
// isContainer" cleanly, so this is real defense-in-depth, not
// redundant with the schema above.
function isValidBlockInput(node: any): boolean {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return false;
  const def = BLOCK_REGISTRY[node.type];
  if (!def || node.type === "product_grid") return false;
  if (typeof node.props !== "object" || node.props === null) return false;
  if (node.children !== undefined) {
    if (!def.isContainer || !Array.isArray(node.children)) return false;
    return node.children.every(isValidBlockInput);
  }
  return true;
}

function normalizeBlockInput(node: any): any {
  const def = BLOCK_REGISTRY[node.type];
  return {
    id: generateBlockId(),
    type: node.type,
    props: node.props ?? {},
    ...(def?.isContainer ? { children: (node.children ?? []).map(normalizeBlockInput) } : {}),
  };
}

// Limits how many page-generation calls run at once — high enough to
// keep total latency reasonable for a multi-page site, low enough to
// avoid hammering the API or letting one slow call block everything.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function generatePageBlocks(
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  page: PlannedPage,
  businessSummary: string | null,
  brandContext: string,
  customInstructions: string | null,
  fallback: GeneratedPage,
  logContext?: { supabase: any; dealershipId: string }
): Promise<{ page: GeneratedPage; fellBack: boolean; reason?: string }> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        // Opus — this writes the actual page copy a visitor reads
        // first; planWebsite's structural planning stays Sonnet
        // (deciding a page list/theme is a lighter task), but the
        // real content quality here is worth the extra cost, and it
        // only runs once per page per generation, not on every visit.
        model: "claude-opus-4-8",
        max_tokens: 2000,
        tools: [EMIT_PAGE_TOOL],
        tool_choice: { type: "tool", name: "emit_page" },
        messages: [{
          role: "user",
          content: `You are building the "${page.title}" page (slug: ${page.slug}, type: ${page.pageType}) for a REAL, SPECIFIC business: "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}, India` : " in India"}. This business identity is fixed — the page must be genuinely about this business, never a different industry or an invented example.
${businessSummary ? `\nBusiness summary: ${businessSummary}\n` : ""}${brandContext}
${customInstructions?.trim() ? `\nThe owner's own description of what they want: "${customInstructions.trim()}" — follow this closely, it takes priority over generic assumptions.\n` : ""}
Block vocabulary (use ONLY these types):
${blockVocabularyNote()}

Compose the page as a small tree: every top-level item must be type "section" (2-4 of them). A "section" typically contains one "stack" (direction "column" for simple stacked content, or "row" with 2-3 child "stack"s each given a widthFraction like 0.33 or 0.5 for side-by-side columns/cards). Put actual content — heading/text/image/button — inside those stacks, not directly inside "section".

${page.pageType === "legal" ? `This is a legal page ("${page.slug}") — one section with a heading and genuinely usable, specific standard boilerplate for an Indian small business, naming "${dealershipName}" directly, not a generic disclaimer.` : `Include a "button" or "form" block near the end to drive leads, unless this is the contact page itself.`}

Never generic "Lorem ipsum" filler, never invented fake statistics/awards/client names. Call emit_page with the result.`,
        }],
      }),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return { page: fallback, fellBack: true, reason: `API returned ${response.status}: ${errBody.slice(0, 300)}` };
    }
    const data = await response.json();
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "website_page_generation", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0, "claude-opus-4-8");
    const toolUse = (data.content ?? []).find((c: any) => c.type === "tool_use" && c.name === "emit_page");
    const input = toolUse?.input;
    if (!input || !Array.isArray(input.blocks) || input.blocks.length === 0) {
      return { page: fallback, fellBack: true, reason: `No usable tool_use block in response (stop_reason: ${data.stop_reason ?? "unknown"})` };
    }
    if (!input.blocks.every((b: any) => b?.type === "section")) {
      return { page: fallback, fellBack: true, reason: "Top-level block(s) weren't all type \"section\"" };
    }
    if (!input.blocks.every(isValidBlockInput)) {
      return { page: fallback, fellBack: true, reason: "One or more blocks failed registry validation (unknown type, bad props, or invalid children)" };
    }

    return {
      page: {
        slug: page.slug,
        title: page.title,
        pageType: page.pageType,
        metaDescription: typeof input.metaDescription === "string" && input.metaDescription.trim() ? input.metaDescription.trim() : fallback.metaDescription,
        sections: input.blocks.map(normalizeBlockInput),
      },
      fellBack: false,
    };
  } catch (err: any) {
    console.error("[website-builder-agent] page generation error:", page.slug, err.message);
    return { page: fallback, fellBack: true, reason: `Exception: ${err.message}` };
  }
}

export async function generateWebsite(
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  pages: PlannedPage[],
  businessSummary?: string | null,
  brandProfile?: BrandProfile | null,
  customInstructions?: string | null,
  logContext?: { supabase: any; dealershipId: string }
): Promise<{ pages: GeneratedPage[]; _fallback?: boolean; fallbackWarnings?: string[] }> {
  const pageList = pages && pages.length > 0 ? pages : DEFAULT_PLAN_PAGES;

  // Fallback content is still authored in the old flat shape (kept
  // small and easy to read) and converted once — legacyToBlocks() is
  // the single place that knows what these old shapes mean, so the
  // fallback never needs its own parallel block-tree literals.
  const fallbackPages: GeneratedPage[] = pageList.map((p) => ({
    slug: p.slug,
    title: p.title,
    pageType: p.pageType,
    metaDescription: `${p.title} — ${dealershipName}`,
    sections: legacyToBlocks(
      p.pageType === "products"
        ? [
            { type: "hero", headline: `${dealershipName}`, subheadline: p.title, ctaText: "Shop Now" },
            { type: "product_catalog", heading: `Our ${p.title}` },
          ]
        : [
            { type: "hero", headline: `${dealershipName}`, subheadline: p.title, ctaText: "Get in Touch" },
            { type: "text", heading: p.title, body: "Content coming soon — regenerate once the API is available." },
            { type: "contact_form", heading: "Get in Touch" },
          ]
    ),
  }));

  const brandContext = brandProfile?.tone_of_voice
    ? `Brand tone: ${brandProfile.tone_of_voice}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand voice set yet — keep it natural, honest, and specific to this business.";

  const generated = await mapWithConcurrency(pageList, 3, (page) =>
    generatePageBlocks(dealershipName, businessCategory, city, page, businessSummary ?? null, brandContext, customInstructions ?? null, fallbackPages.find((f) => f.slug === page.slug)!, logContext)
  );

  // Pages meant to list real products (shop/products/menu/listings)
  // must show the owner's actual catalog, not AI-invented content —
  // deterministically rebuilt as hero + live product_grid rather than
  // trying to locate/preserve pieces of whatever tree the model
  // returned, since a live product_grid was never something it could
  // have produced anyway (excluded from AI_BLOCK_TYPES above).
  const resultPages: GeneratedPage[] = generated.map(({ page }, i) => {
    const p = pageList[i];
    if (p.pageType !== "products") return page;
    const hero = page.sections[0]?.type === "section" ? page.sections[0] : legacyToBlocks([{ type: "hero", headline: dealershipName, subheadline: p.title, ctaText: "Shop Now" }])[0];
    const productGrid = legacyToBlocks([{ type: "product_catalog", heading: `Our ${p.title}` }])[0];
    return { ...page, sections: [hero, productGrid] };
  });

  const fallbackWarnings = generated
    .map((g, i) => (g.fellBack ? `${pageList[i].title}: ${g.reason ?? "unknown reason"}` : null))
    .filter((w): w is string => !!w);

  return { pages: resultPages, _fallback: generated.some((g) => g.fellBack) || undefined, fallbackWarnings };
}
