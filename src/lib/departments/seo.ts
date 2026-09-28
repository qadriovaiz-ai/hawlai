// The SEO toolkit tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface SeoTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const SEO_TASKS: SeoTaskMeta[] = [
  { key: "competitor_keywords", label: "Competitor Keywords", instructions: "Exactly 10 realistic keywords/search terms competitors in this business category and city are probably ranking for or targeting — roughly half informational (research/comparison intent, e.g. \"best X near me\") and half transactional (ready-to-buy intent, e.g. \"book X online\"). Return as {\"keywords\": [{\"keyword\": \"...\", \"intent\": \"informational\" | \"transactional\", \"note\": \"one short sentence on why this keyword matters or what the searcher wants\"}]} — this exact shape, since it's rendered as a two-column card, not read as raw JSON." },
  { key: "internal_linking", label: "Internal Linking", instructions: "5 internal linking suggestions for a small business website in this category — return {anchorText, linksTo, why} objects describing realistic page-to-page links (e.g. blog post -> service page) that would help SEO and user navigation." },
  { key: "meta_tags", label: "Meta Tags", instructions: "Meta title (under 60 chars) and meta description (under 160 chars) for the homepage of this business, keyword-aware and click-worthy, not generic." },
  { key: "schema", label: "Schema Markup", instructions: "A valid JSON-LD schema.org markup block appropriate for this business type (e.g. LocalBusiness or a more specific subtype), including name, description placeholder, address placeholder, and relevant fields. Return as a 'jsonLd' field containing the ready-to-paste JSON-LD object as a string." },
  { key: "site_speed", label: "Site Speed Suggestions", instructions: "6 concrete, prioritized site speed improvement suggestions relevant to a small business site (image optimization, hosting, caching, etc), each with {suggestion, impact} — impact being High/Medium/Low." },
  { key: "backlink_strategy", label: "Backlink Strategy", instructions: "6 realistic backlink-building tactics for a small local Indian business in this category (e.g. local directories, industry partnerships, guest posts, press) — each with {tactic, howTo}, practical and not spammy." },
  { key: "local_seo", label: "Local SEO", instructions: "6 local SEO action items specific to this business and city — NAP consistency, local citations, location pages, local keyword targeting, review strategy etc, each with {action, why}." },
  { key: "gbp_optimization", label: "Google Business Profile", instructions: "A Google Business Profile optimization checklist for this business: suggested business description (under 750 chars), 5 relevant GBP categories/attributes to add, and 3 post ideas to publish on the profile. Return as {description, categories: [], postIdeas: []}." },
  // Registered here so it's chat-reachable via generate_seo's taskType
  // enum and appears in the SEO page's task picker with zero new tool
  // registration and zero new navigation (see the approved AEO
  // architecture proposal, Task 1) — but its `instructions` field is
  // documentation only. Actual execution is NOT generateSeoTask() in
  // lib/agents/seoToolkitAgent.ts (a single templated Claude call
  // can't do this): it's
  // dispatched to generateAeoCheck() in aeoAgent.ts, which needs live
  // web search plus a structural read of the business's own site.
  // Special-cased at both call sites — /api/seo/toolkit/route.ts and
  // masterBrainV2.ts's "generate_seo" case.
  { key: "aeo_check", label: "AEO Check", instructions: "Checks how this business shows up when someone asks an AI assistant (ChatGPT/Gemini/Perplexity-style) a buying question in its category — a different mechanism from Google ranking. Dispatched to generateAeoCheck(), not this generic task runner." },
];
