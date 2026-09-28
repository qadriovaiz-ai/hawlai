// The ad platforms and tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface AdPlatformMeta {
  key: string;
  label: string;
}

export interface AdTaskMeta {
  key: string;
  label: string;
  instructions: (platform: string) => string;
}

export const AD_PLATFORMS: AdPlatformMeta[] = [
  { key: "google", label: "Google Ads" },
  { key: "linkedin", label: "LinkedIn Ads" },
  { key: "tiktok", label: "TikTok Ads" },
  { key: "snapchat", label: "Snapchat Ads" },
  { key: "pinterest", label: "Pinterest Ads" },
];

export const AD_TASKS: AdTaskMeta[] = [
  { key: "audience_research", label: "Audience Research", instructions: (p) => `Audience research for a ${p} campaign: return {segments: [{name, description, targetingNotes}]} — 4 realistic audience segments with platform-appropriate targeting notes (interests/demographics/keywords as fits ${p}).` },
  { key: "campaign_brief", label: "Campaign Creation", instructions: (p) => `A campaign brief for ${p}: return {objective, campaignStructure, targetingSummary, suggestedFormats} — campaignStructure should describe how to structure campaigns/ad groups on ${p} specifically, suggestedFormats an array of ad formats ${p} supports that fit this business.` },
  { key: "ad_copy", label: "Ad Copy", instructions: (p) => `Ad copy for ${p}, matching its actual character limits and conventions: return {headlines: [], primaryText: [], descriptions: []} — 3-5 items each, platform-appropriate lengths.` },
  { key: "budget_allocation", label: "Budget Allocation", instructions: (p) => `A budget allocation plan for a small business starting on ${p}: return {recommendedDailyBudgetRange, allocation: [{campaignType, percentage, why}]} — realistic starting-budget guidance for the Indian market, not fake precise numbers.` },
  { key: "ab_testing", label: "A/B Testing", instructions: (p) => `An A/B test plan for ${p} ads: return {tests: [{variable, variantA, variantB, whatToMeasure}]} — 4 test ideas covering creative, copy, audience, and placement variables relevant to ${p}.` },
  { key: "optimization", label: "Optimization", instructions: (p) => `A weekly optimization checklist for running ${p} ads: return {checklist: [{item, why}]} — 6 concrete things to check/adjust weekly, specific to how ${p}'s ad platform works.` },
  { key: "roas_tracking", label: "ROAS Tracking", instructions: (p) => `Guidance on tracking ROAS for ${p} ads: return {metricsToTrack: [], benchmarkNote} — key metrics available on ${p}'s ads dashboard to track ROI, and a benchmarkNote explaining that real ROAS numbers require the platform to be connected (this is guidance, not live data).` },
  { key: "pixel_setup", label: "Pixel Setup", instructions: (p) => `A step-by-step guide to installing the ${p} tracking pixel/tag on a small business website: return {steps: [{step, detail}]} — accurate to how ${p} actually names and sets up its pixel/tag.` },
  { key: "conversion_tracking", label: "Conversion Tracking", instructions: (p) => `A step-by-step guide to setting up conversion tracking (key events) on ${p} for this business type: return {steps: [{step, detail}], suggestedEvents: []} — suggestedEvents relevant to this business (e.g. lead form submit, contact click, purchase).` },
];
