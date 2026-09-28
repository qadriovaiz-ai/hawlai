// The competitor intelligence tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface CompetitorTaskMeta {
  key: string;
  label: string;
  instructions: (competitor: string, business: string, category: string) => string;
}

export const COMPETITOR_TASKS: CompetitorTaskMeta[] = [
  {
    key: "social_media_monitor",
    label: "Social Media Monitor",
    instructions: (c, b, cat) => `Search for ${c}'s recent social media activity (Instagram, Facebook, or LinkedIn — whichever is most active for a ${cat} business). Summarize what they've been posting about recently, their apparent posting frequency, and any notable campaigns or announcements. Return {recentActivity, postingPattern, notableCampaigns: []}. Base this on what you actually find — if you can't find much, say so honestly rather than guessing.`,
  },
  {
    key: "pricing_compare",
    label: "Pricing Compare",
    instructions: (c, b, cat) => `Search for ${c}'s publicly listed pricing for their ${cat} offerings. Return {competitorPricing: [{item, price, source}], comparisonNotes} — comparisonNotes should note what's genuinely comparable to ${b}'s likely offerings and flag anything uncertain. If exact pricing isn't publicly available, say so rather than inventing numbers.`,
  },
  {
    key: "seo_comparison",
    label: "SEO Comparison",
    instructions: (c, b, cat) => `Search for how ${c} shows up in search results for their core ${cat} keywords — what pages rank, what their meta titles/descriptions look like, and what content they seem to be targeting. Return {rankingSignals: [], contentFocus, opportunityNotes} — this is a qualitative comparison based on visible search results, not real backlink/traffic data (that would need a paid SEO tool this doesn't have access to).`,
  },
  {
    key: "content_gap",
    label: "Content Gap Analysis",
    instructions: (c, b, cat) => `Search for the kind of content ${c} publishes (blog posts, guides, videos) for their ${cat} business. Compare that against what a business like ${b} would typically need to cover. Return {competitorContentTopics: [], gapsFound: [{topic, why}]} — gapsFound should be topics the competitor covers that ${b} likely doesn't yet, based on what you find.`,
  },
];
