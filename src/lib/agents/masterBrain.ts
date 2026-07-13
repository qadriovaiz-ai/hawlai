// ------------------------------------------------------------------
// Master Brain — Phase 1 router (expanded)
// ------------------------------------------------------------------
// Routes a dealer's plain-language request to whichever agent fits.
// Agents that only need text (SEO, Research, Optimization) get
// executed directly and their answer comes straight back. Agents
// that need something this text box can't collect (a photo for
// Social Post, a specific customer for Retention) get a short
// pointer to the right page instead of a half-finished action.
// ------------------------------------------------------------------

import { generateSeoIdeas } from "./seoAgent";
import { searchCompetitorAds } from "./researchAgent";
import { analyzeCampaigns } from "./optimizationAgent";
import { generateSocialCaption } from "./socialMediaAgent";
import { matchCampaign, setCampaignStatus, proposeTargetingChange } from "./campaignEditAgent";
import { getCampaignPerformance } from "./analyticsAgent";
import { runOrchestration } from "./orchestratorAgent";

type Intent =
  | "ad_launch"
  | "analytics_query"
  | "seo_query"
  | "research_query"
  | "optimization_query"
  | "social_post_idea"
  | "retention_query"
  | "strategy_query"
  | "campaign_pause"
  | "campaign_resume"
  | "campaign_budget_change"
  | "campaign_targeting_change"
  | "orchestrate_goal"
  | "unclear";

interface ClassifiedIntent {
  intent: Intent;
  daily_budget?: number | null;
  duration_days?: number | null;
  car_type?: string | null;
  targeting_city?: string | null;
  topic?: string | null;
}

interface MasterBrainResult {
  intent: Intent;
  status: "pending_approval" | "auto_approved" | "answered" | "unclear";
  message: string;
  details?: Record<string, any>;
}

async function classifyIntent(message: string, businessCategory: string): Promise<ClassifiedIntent> {
  let rawText = "";
  let httpStatus: number | null = null;
  let bodyText = "";
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
            content: `You are the routing brain for an Indian ${businessCategory} business's marketing dashboard.
A dealer typed this request: "${message}"

Classify it and return JSON only (no markdown, no explanation, no extra text before or after):
{"intent":"ad_launch"|"analytics_query"|"seo_query"|"research_query"|"optimization_query"|"social_post_idea"|"retention_query"|"strategy_query"|"unclear","daily_budget":number or null (rupees per day, if mentioned),"duration_days":number or null (default 1 if a launch but not mentioned),"car_type":"the main product/service/item mentioned (e.g. car model, property type, course name, menu item) or null","targeting_city":"city mentioned or null","topic":"the general subject/product/campaign topic they're asking about, or null"}

"ad_launch" = wants to create/launch/run a paid ad or campaign.
"analytics_query" = asking about spend, leads, performance, results.
"seo_query" = wants keyword ideas, blog/content ideas, SEO help.
"research_query" = wants to see what competitors are advertising.
"optimization_query" = asking what to do about existing campaigns — scale, pause, improve.
"social_post_idea" = wants a caption or idea for an organic (non-ad) social post.
"retention_query" = asking about re-engaging or following up with existing customers.
"strategy_query" = asking for a marketing plan, roadmap, budget allocation, or "what should my overall strategy be".
"campaign_pause" = asking to pause, stop, or turn off a specific existing campaign (not a general "what should I pause" question — that's optimization_query).
"campaign_resume" = asking to resume, restart, unpause, or turn back on a specific existing campaign.
"campaign_budget_change" = asking to increase/decrease/change the budget of a specific existing campaign.
"campaign_targeting_change" = asking to change WHO a specific existing campaign targets — age, gender, audience (not city/location, and not budget).
"orchestrate_goal" = a BROAD goal needing multiple things drafted together — launching a new product/brand/service, "create a complete campaign for X", "help me promote X" where X hasn't been advertised before. NOT this if it's clearly just one specific thing (a single ad, a single post, a single question) — those go to their own specific intent above.
"unclear" = anything else, including greetings or vague requests.`,
          },
        ],
      }),
    });

    httpStatus = response.status;
    bodyText = await response.text();

    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in this environment");
    if (!response.ok) throw new Error(`Anthropic API returned ${httpStatus}: ${bodyText.slice(0, 300)}`);
    if (!bodyText.trim()) throw new Error(`Anthropic API returned an empty body (status ${httpStatus})`);

    const data = JSON.parse(bodyText);
    rawText = data.content?.[0]?.text ?? "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : rawText).replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("Claude's response had no JSON in it");
    return JSON.parse(clean);
  } catch (err: any) {
    console.error(
      "[master-brain] classifyIntent error:", err.message,
      "| http status:", httpStatus,
      "| body (first 300 chars):", bodyText.slice(0, 300),
      "| parsed text:", rawText
    );
    return { intent: "unclear" };
  }
}

async function answerAnalyticsQuery(supabase: any, dealershipId: string, question: string): Promise<string> {
  const [{ data: leads }, { data: calls }, { data: appointments }, liveCampaigns, { data: history }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId),
    getCampaignPerformance(supabase, dealershipId),
    // Permanent record — includes campaigns that are paused or no
    // longer 'launched' status, not just what's currently live.
    supabase.from("campaign_performance_history").select("*").eq("dealership_id", dealershipId),
  ]);

  const totalLeads = leads?.length ?? 0;
  if (totalLeads === 0 && liveCampaigns.campaigns.length === 0) {
    return "No leads or campaigns yet. Launch an ad first, then performance will show up here.";
  }

  // Aggregate the permanent history into lifetime-per-campaign totals
  // — this is what makes past/paused campaigns answerable, not just
  // whatever is currently live.
  const lifetimeByCampaign = new Map<string, { headline: string; spend: number; leads: number; revenue: number; conversions: number }>();
  for (const row of history ?? []) {
    const existing = lifetimeByCampaign.get(row.ad_creative_id) ?? { headline: row.headline ?? "Untitled", spend: 0, leads: 0, revenue: 0, conversions: 0 };
    existing.spend += Number(row.spend ?? 0);
    existing.leads += Number(row.leads ?? 0);
    existing.revenue += Number(row.revenue ?? 0);
    existing.conversions += Number(row.conversions ?? 0);
    lifetimeByCampaign.set(row.ad_creative_id, existing);
  }

  const hotLeads = leads?.filter((l: any) => l.lead_temperature === "hot").length ?? 0;
  const warmLeads = leads?.filter((l: any) => l.lead_temperature === "warm").length ?? 0;
  const coldLeads = leads?.filter((l: any) => l.lead_temperature === "cold").length ?? 0;

  const totalRevenue = Array.from(lifetimeByCampaign.values()).reduce((sum, c) => sum + c.revenue, 0);
  const totalConversions = Array.from(lifetimeByCampaign.values()).reduce((sum, c) => sum + c.conversions, 0);
  const anyCampaignLive = liveCampaigns.campaigns.some((c) => c.meta_status === "ACTIVE");

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
        max_tokens: 250,
        messages: [
          {
            role: "user",
            content: `A dealer asked: "${question}"

Facts (use ONLY what's relevant to answer their exact question — never invent numbers):
- Total sales / conversions: ${totalConversions}
- Total revenue: ₹${totalRevenue}
- Any campaign currently live/active: ${anyCampaignLive ? "Yes" : "No"}
- Live campaigns right now: ${liveCampaigns.campaigns.map((c) => `"${c.headline}" (${c.meta_status})`).join(", ") || "none"}
- Per-campaign lifetime totals: ${Array.from(lifetimeByCampaign.values()).map((c) => `"${c.headline}": ₹${c.spend} spent, ${c.leads} leads, ${c.conversions} sales, ₹${c.revenue} revenue`).join("; ") || "no campaign history recorded"}
- Total leads: ${totalLeads} (${hotLeads} Hot, ${warmLeads} Warm, ${coldLeads} Cold)
- Calls made: ${calls?.length ?? 0}, appointments booked: ${appointments?.length ?? 0}

STRICT RULE: Only state facts that directly answer what was asked. Do NOT mention lead temperature (Hot/Warm/Cold), calls, or appointments UNLESS the question specifically asks about leads/calls/appointments. If they only asked about sales/revenue/campaigns, answer ONLY that — 1-2 short sentences, nothing else appended.`,
          },
        ],
      }),
    });
    if (!response.ok) throw new Error("Claude API error");
    const bodyText = await response.text();
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    return text.trim() || "Couldn't generate an answer right now — check the Analytics page directly.";
  } catch (err: any) {
    console.error("[master-brain] answerAnalyticsQuery error:", err.message);
    return `You have ${totalLeads} total leads — ${hotLeads} Hot, ${warmLeads} Warm, ${coldLeads} Cold. See the Analytics page for campaign-level detail.`;
  }
}

export async function routeRequest(
  supabase: any,
  dealershipId: string,
  message: string
): Promise<MasterBrainResult> {
  const { data: dealershipInfo } = await supabase
    .from("dealerships").select("business_category, dealership_name, city").eq("id", dealershipId).single();
  const businessCategory = dealershipInfo?.business_category ?? "car dealership";

  const classification = await classifyIntent(message, businessCategory);
  const topic = classification.topic ?? classification.car_type ?? message;

  if (classification.intent === "ad_launch") {
    const { data: dealership } = await supabase
      .from("dealerships").select("approval_threshold").eq("id", dealershipId).single();

    const threshold = dealership?.approval_threshold ?? 50000;
    const dailyBudget = classification.daily_budget ?? 500;
    const durationDays = classification.duration_days ?? 1;
    const totalEstimate = dailyBudget * durationDays;

    if (totalEstimate > threshold) {
      const { data: approval } = await supabase
        .from("pending_approvals")
        .insert({
          dealership_id: dealershipId,
          requested_by_agent: "paid_ads_agent",
          action_type: "launch_campaign",
          action_details: { original_request: message, ...classification, total_estimate: totalEstimate },
          amount: totalEstimate,
        })
        .select().single();

      return {
        intent: "ad_launch",
        status: "pending_approval",
        message: `This campaign's estimated cost is ₹${totalEstimate.toLocaleString("en-IN")}, which is above your ₹${threshold.toLocaleString("en-IN")} approval limit. I've added it to "Pending Approvals" — it'll launch once you approve it there.`,
        details: approval,
      };
    }

    return {
      intent: "ad_launch",
      status: "auto_approved",
      message: `This campaign (~₹${totalEstimate.toLocaleString("en-IN")}, within your approval limit) is good to launch. Go to the "Launch Ad" page and upload a photo — the full ad will be built and launched from there.`,
      details: classification,
    };
  }

  if (classification.intent === "analytics_query") {
    return { intent: "analytics_query", status: "answered", message: await answerAnalyticsQuery(supabase, dealershipId, message) };
  }

  if (classification.intent === "seo_query") {
    const ideas = await generateSeoIdeas(topic, classification.targeting_city, businessCategory);
    return {
      intent: "seo_query",
      status: "answered",
      message: `Keywords: ${ideas.keywords.join(", ")}.\n\nContent ideas: ${ideas.contentIdeas.join(" | ")}`,
      details: ideas,
    };
  }

  if (classification.intent === "research_query") {
    const { data: dealership } = await supabase
      .from("dealerships").select("fb_page_access_token").eq("id", dealershipId).single();
    const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) {
      return { intent: "research_query", status: "unclear", message: "Connect your Facebook Page in Settings first, then I can look up competitor ads." };
    }
    const result = await searchCompetitorAds(token, topic);
    if (result.error || result.ads.length === 0) {
      return { intent: "research_query", status: "answered", message: `Couldn't find active ads for "${topic}" — try the Research page directly for more options.` };
    }
    const summary = result.ads.slice(0, 3).map((ad) => `${ad.page_name}: "${ad.body ?? ad.title ?? "no text"}"`).join("\n");
    return { intent: "research_query", status: "answered", message: `Found ${result.ads.length} ads for "${topic}":\n${summary}`, details: result.ads };
  }

  if (classification.intent === "optimization_query") {
    const result = await analyzeCampaigns(supabase, dealershipId);
    return { intent: "optimization_query", status: "answered", message: result.summary, details: result.recommendations };
  }

  if (classification.intent === "social_post_idea") {
    const { data: brandProfile } = await supabase
      .from("brand_profiles").select("tone_of_voice, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle();
    const caption = await generateSocialCaption(topic, brandProfile, businessCategory);
    return {
      intent: "social_post_idea",
      status: "answered",
      message: `Here's a caption idea: "${caption}"\n\nGo to the "Social Post" page to upload a photo and publish it.`,
      details: { caption },
    };
  }

  if (classification.intent === "retention_query") {
    return {
      intent: "retention_query",
      status: "answered",
      message: 'For re-engaging existing customers, go to the "Retention" page — it lists everyone marked as Converted and can generate a service reminder, referral ask, or upsell message for each.',
    };
  }

  if (classification.intent === "strategy_query") {
    return {
      intent: "strategy_query",
      status: "answered",
      message: 'Go to "Marketing" -> "Strategy" tab — enter your monthly budget and goal, and I\'ll generate a full roadmap: budget allocation across channels, this month\'s themes, and offer ideas.',
    };
  }

  if (classification.intent === "campaign_pause" || classification.intent === "campaign_resume") {
    const { data: campaigns } = await supabase
      .from("ad_creatives")
      .select("id, headline, car_type, targeting_city, daily_budget, meta_status, meta_ad_id")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched");

    const matched = await matchCampaign(campaigns ?? [], message);
    if (!matched) {
      return {
        intent: classification.intent,
        status: "unclear",
        message: (campaigns?.length ?? 0) === 0
          ? "You don't have any launched campaigns yet."
          : "I'm not sure which campaign you mean — go to \"Marketing\" -> \"My Campaigns\" to pick the right one directly.",
      };
    }

    const newStatus = classification.intent === "campaign_pause" ? "PAUSED" : "ACTIVE";
    const result = await setCampaignStatus(supabase, dealershipId, matched, newStatus);
    return {
      intent: classification.intent,
      status: result.success ? "auto_approved" : "unclear",
      message: result.success
        ? `Done — "${matched.headline}" is now ${newStatus === "PAUSED" ? "paused" : "active"}.`
        : `Couldn't update "${matched.headline}": ${result.error}`,
    };
  }

  if (classification.intent === "campaign_budget_change") {
    const { data: campaigns } = await supabase
      .from("ad_creatives")
      .select("id, headline, car_type, targeting_city, daily_budget, meta_status, meta_ad_id")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched");

    const matched = await matchCampaign(campaigns ?? [], message);
    if (!matched) {
      return {
        intent: "campaign_budget_change",
        status: "unclear",
        message: (campaigns?.length ?? 0) === 0
          ? "You don't have any launched campaigns yet."
          : "I'm not sure which campaign you mean — go to \"Marketing\" -> \"My Campaigns\" to change the budget directly.",
      };
    }
    if (!classification.daily_budget) {
      return {
        intent: "campaign_budget_change",
        status: "unclear",
        message: `Found "${matched.headline}" — what should the new daily budget be?`,
      };
    }

    // Budget changes always go through approval — Ovaiz chose this
    // explicitly earlier, and that doesn't change just because the
    // request arrived via chat instead of a form.
    const { data: approval } = await supabase
      .from("pending_approvals")
      .insert({
        dealership_id: dealershipId,
        requested_by_agent: "master_brain",
        action_type: "change_campaign_budget",
        action_details: { campaign_id: matched.id, headline: matched.headline, old_budget: matched.daily_budget, new_budget: classification.daily_budget },
        amount: classification.daily_budget,
      })
      .select().single();

    return {
      intent: "campaign_budget_change",
      status: "pending_approval",
      message: `Got it — I've queued a budget change for "${matched.headline}" (₹${matched.daily_budget} -> ₹${classification.daily_budget}/day) in Approvals for your review.`,
      details: approval,
    };
  }

  if (classification.intent === "campaign_targeting_change") {
    const { data: campaigns } = await supabase
      .from("ad_creatives")
      .select("id, headline, car_type, targeting_city, daily_budget, meta_status, meta_ad_id")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched");

    const matched = await matchCampaign(campaigns ?? [], message);
    if (!matched) {
      return {
        intent: "campaign_targeting_change",
        status: "unclear",
        message: (campaigns?.length ?? 0) === 0
          ? "You don't have any launched campaigns yet."
          : "I'm not sure which campaign you mean — go to \"Marketing\" -> \"My Campaigns\" to change targeting directly.",
      };
    }

    const change = await proposeTargetingChange(matched, message);
    if (!change) {
      return {
        intent: "campaign_targeting_change",
        status: "unclear",
        message: "I couldn't work out the exact targeting change from that — try being more specific, e.g. 'target only women aged 25-40'.",
      };
    }

    // Same principle as budget changes: propose it, don't apply it —
    // the dealer reviews the exact change and estimated impact before
    // anything actually updates on Meta.
    const { data: approval } = await supabase
      .from("pending_approvals")
      .insert({
        dealership_id: dealershipId,
        requested_by_agent: "master_brain",
        action_type: "change_campaign_targeting",
        action_details: { campaign_id: matched.id, headline: matched.headline, ...change },
      })
      .select().single();

    return {
      intent: "campaign_targeting_change",
      status: "pending_approval",
      message: `Understood. ${change.summary}\n\nEstimated impact: ${change.estimated_impact}\n\nI've queued this in Approvals — review and Apply when ready.`,
      details: approval,
    };
  }

  if (classification.intent === "orchestrate_goal") {
    const { data: brandProfile } = await supabase
      .from("brand_profiles")
      .select("tone_of_voice, target_persona, messaging_pillars, preferred_language")
      .eq("dealership_id", dealershipId)
      .maybeSingle();

    const result = await runOrchestration(
      message,
      dealershipInfo?.dealership_name ?? "the business",
      dealershipInfo?.city ?? null,
      brandProfile,
      businessCategory
    );

    const sections = [
      `Here's a full draft for "${result.topic}":`,
      result.strategySummary ? `**Strategy:** ${result.strategySummary}` : null,
      result.seoKeywords.length > 0 ? `**SEO keywords to target:** ${result.seoKeywords.slice(0, 6).join(", ")}` : null,
      result.socialCaption ? `**Social post draft:**\n${result.socialCaption}` : null,
      result.adCopyOptions.length > 0
        ? `**Ad copy options:**\n${result.adCopyOptions.map((c, i) => `${i + 1}. "${c.headline}" — ${c.body}`).join("\n")}`
        : null,
      `\n${result.nextStep}`,
    ].filter(Boolean);

    return {
      intent: "orchestrate_goal",
      status: "answered",
      message: sections.join("\n\n"),
    };
  }

  return {
    intent: "unclear",
    status: "unclear",
    message:
      'I didn\'t quite get that. Try asking me to launch an ad, check performance, get SEO/content ideas, research competitors, get campaign recommendations, brainstorm a social post, plan your monthly strategy, pause/resume a campaign, change a campaign\'s budget or targeting, follow up with past customers, or describe a bigger goal like "launch my new X" for a full draft across strategy, SEO, social, and ad copy.',
  };
}
