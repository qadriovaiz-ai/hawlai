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

type Intent =
  | "ad_launch"
  | "analytics_query"
  | "seo_query"
  | "research_query"
  | "optimization_query"
  | "social_post_idea"
  | "retention_query"
  | "strategy_query"
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

async function answerAnalyticsQuery(supabase: any, dealershipId: string): Promise<string> {
  const [{ data: leads }, { data: calls }, { data: appointments }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId),
  ]);

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l: any) => l.lead_temperature === "hot").length ?? 0;
  const warmLeads = leads?.filter((l: any) => l.lead_temperature === "warm").length ?? 0;
  const coldLeads = leads?.filter((l: any) => l.lead_temperature === "cold").length ?? 0;

  if (totalLeads === 0) return "No leads yet. Launch an ad first, then performance will show up here.";

  return `You have ${totalLeads} total leads — ${hotLeads} Hot, ${warmLeads} Warm, ${coldLeads} Cold. ` +
    `${calls?.length ?? 0} calls made, and ${appointments?.length ?? 0} appointments booked. ` +
    `See the Analytics page for detailed cost-per-lead.`;
}

export async function routeRequest(
  supabase: any,
  dealershipId: string,
  message: string
): Promise<MasterBrainResult> {
  const { data: dealershipInfo } = await supabase
    .from("dealerships").select("business_category").eq("id", dealershipId).single();
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
    return { intent: "analytics_query", status: "answered", message: await answerAnalyticsQuery(supabase, dealershipId) };
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

  return {
    intent: "unclear",
    status: "unclear",
    message:
      'I didn\'t quite get that. Try asking me to launch an ad, check performance, get SEO/content ideas, research competitors, get campaign recommendations, brainstorm a social post, plan your monthly strategy, or follow up with past customers.',
  };
}
