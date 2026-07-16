// Paid Advertising Planning Agent — for the 5 platforms without a
// real API integration yet (Google, LinkedIn, TikTok, Snapchat,
// Pinterest Ads — each needs its own platform approval process, see
// the Integrations page). Meta Ads already has a full real
// integration (Ads Manager: live campaign launch, budget, ROAS) and
// isn't duplicated here. Creative Generation isn't a task here either
// — it links out to the Graphic Design page instead of a second image
// generator. Same flexible-generator pattern as the other toolkits.

export interface AdPlatformMeta {
  key: string;
  label: string;
}

export const AD_PLATFORMS: AdPlatformMeta[] = [
  { key: "google", label: "Google Ads" },
  { key: "linkedin", label: "LinkedIn Ads" },
  { key: "tiktok", label: "TikTok Ads" },
  { key: "snapchat", label: "Snapchat Ads" },
  { key: "pinterest", label: "Pinterest Ads" },
];

export interface AdTaskMeta {
  key: string;
  label: string;
  instructions: (platform: string) => string;
}

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

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateAdPlan(
  platformKey: string,
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  brandProfile?: BrandProfile | null
): Promise<{ output: any; _fallback?: boolean }> {
  const platform = AD_PLATFORMS.find((p) => p.key === platformKey);
  const task = AD_TASKS.find((t) => t.key === taskKey);
  if (!platform || !task) return { output: { text: "Unknown platform or task." }, _fallback: true };

  const fallback = {
    output: { text: `${task.label} plan for ${dealershipName} on ${platform.label}. Regenerate once the API is available for a tailored version.` },
    _fallback: true,
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        messages: [{
          role: "user",
          content: `You are a paid advertising strategist helping an Indian ${businessCategory} business called "${dealershipName}" plan for ${platform.label}. This platform isn't connected to any ad account yet — this is planning content the dealer will use manually or hand to whoever sets up the account.
${brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : ""}

Task: ${task.label}
Requirements: ${task.instructions(platform.label)}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly. Be accurate to how ${platform.label} actually works (real format names, real limits) — never invent platform features that don't exist, and never invent fake performance statistics.`,
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
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[paid-ads-agent] error:", err.message);
    return fallback;
  }
}
