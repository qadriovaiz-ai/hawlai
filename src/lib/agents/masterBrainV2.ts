// ------------------------------------------------------------------
// Master Brain V2 — tool-calling conversational orchestrator.
// ------------------------------------------------------------------
// The old masterBrain.ts used a manual "classify intent -> if/else"
// router. That doesn't scale past a handful of intents — with 21
// departments' worth of agents now built, this replaces it with
// Claude's native tool-calling: every department's key action is
// exposed as a tool, and Claude decides which tool(s) to call based
// on the conversation, chaining multiple tools for broad requests
// ("help me launch my skincare brand" -> brand kit, then content,
// then a landing page pointer, in one conversation).
//
// Every tool call that generates content also SAVES it to the same
// table the department's own page reads from — so anything generated
// via chat shows up in the normal dashboard page too, not just in
// the chat transcript. Actions that spend money or send something
// live (ad launch, real sends) are NOT exposed as silent tools here
// — those still go through their existing approval-first flows; the
// chat can only draft/plan them and point the person to where to
// review and approve.
// ------------------------------------------------------------------

import { generateBrandKit } from "./brandBuildingAgent";
import { generateLogoConcept } from "./brandKitAgent";
import { planWebsite, generateWebsite } from "./websiteBuilderAgent";
import { triggerVapiCall } from "./vapiCallAgent";
import { getValidYoutubeAccessToken, uploadVideoToYouTube } from "./youtubeAgent";
import { generate3DScene } from "./threeDAgent";
import { sendDealerEmail } from "../email/sendDealerEmail";
import { logClaudeUsage } from "../usage/logUsage";
import { generateContent, CONTENT_TYPES } from "./contentMarketingAgent";
import { generateSeoTask, SEO_TASKS } from "./seoToolkitAgent";
import { generateSocialTask, SOCIAL_TASKS } from "./socialManagementAgent";
import { generateEmailContent, EMAIL_TASKS } from "./emailMarketingAgent";
import { generateWhatsappContent, WHATSAPP_TASKS } from "./whatsappMarketingAgent";
import { generateAdPlan, AD_PLATFORMS, AD_TASKS } from "./paidAdsAgent";
import { generateVideoTask, VIDEO_TASKS } from "./videoMarketingAgent";
import { generateCompetitorIntel, COMPETITOR_TASKS } from "./competitorIntelAgent";
import { generateResearch, RESEARCH_TASKS, generateSentimentFromLeads } from "./researchAgentV2";
import { generateCroSuggestions, CRO_TASKS } from "./croAgentV2";
import { generateGrowthOpportunities, generateBudgetRecommendations, generateExpansionStrategy, computeRevenueForecast } from "./growthAdvisorV2";
import { generateInfluencerPlan } from "./influencerAgent";
import { generateRetargetingCopy } from "./retargetingAgent";
import { retrieveRelevantKnowledge } from "../knowledge/retrieveKnowledge";
import { getCampaignPerformance } from "./analyticsAgent";
import { generateGrowthReport } from "./growthAdvisorAgent";
import { generateDeepStrategy } from "./deepStrategyAgent";
import { generateSeoIdeas } from "./seoAgent";
import { generateGraphic, GRAPHIC_TYPES } from "./graphicDesignAgent";
import { getDealershipPlanLimits, hasFeature, type GatedFeatureKey } from "../plans";
import { upgradeMessage } from "../featureGate";
import { randomBytes } from "crypto";

// Tools that map to one of the 7 plan-gated features (migration 079's
// plan_limits) — checked once at the top of executeTool so a Free/Basic
// dealership asking Master Chat for a Pro-only capability gets a clear
// "upgrade to X" reply instead of the tool silently running. manage_watch
// is special-cased below since it also covers Market Research's ungated
// topic watches, not just Competitor Intel's competitor watches.
const TOOL_FEATURE_MAP: Partial<Record<string, GatedFeatureKey>> = {
  research_competitor: "competitorIntel",
  generate_cro_suggestions: "cro",
  get_growth_advice: "growthAdvisor",
  generate_influencer_outreach: "influencerMarketing",
  generate_retargeting_copy: "retargeting",
  generate_3d_scene: "threeDStudio",
  create_workflow: "marketingAutomationWorkflows",
  set_automation_toggle: "marketingAutomationWorkflows",
};

interface DealershipCtx {
  id: string;
  name: string;
  category: string;
  city: string | null;
  toneOfVoice: string | null;
  team: { id: string; role: string; email: string }[];
  memories: { id: string; category: string; insight: string }[];
}

async function getContext(supabase: any, dealershipId: string): Promise<DealershipCtx> {
  const [{ data: d }, { data: bp }, { data: team }, { data: memories }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("team_members").select("id, role, email").eq("dealership_id", dealershipId).eq("status", "active"),
    // Most recent 20 — an old, stale memory naturally falls out of
    // context rather than the list growing unbounded forever. If this
    // ever needs smarter pruning (e.g. relevance-based), that's a
    // real future upgrade, not something guessed at here.
    supabase.from("business_memory").select("id, category, insight").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    id: dealershipId,
    name: d?.dealership_name ?? "the business",
    category: d?.business_category ?? "business",
    city: d?.city ?? null,
    toneOfVoice: bp?.tone_of_voice ?? null,
    memories: memories ?? [],
    team: team ?? [],
  };
}

// ---- Tool definitions (Claude tool-use schema) ----

const TOOLS = [
  {
    name: "generate_brand_kit",
    description: "Generate the business's brand identity kit: colors, typography, tagline, mission, vision, brand story, social bios, guidelines. Use when the person wants to build/establish their brand identity from scratch or refresh it. Saved to the 'Brand Voice' page. Note: this does NOT create an actual logo image — it's text/color guidance only. If the person's request implies they want a visual logo too (e.g. \"build my brand kit\", \"design a logo\"), also call generate_logo.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generate_logo",
    description: "Generate an actual AI logo image for the business and save it to the Brand Voice / Brand Building page. The image can and should be shown directly in your reply using markdown image syntax (![Logo](url)) — it renders inline in the chat.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "build_website",
    description: "Build a REAL, live-rendering multi-page website (Home, About, Contact, Products/Services, etc — pages and theme chosen automatically based on the business) with actual pages saved to the database, viewable at its own URL. This is completely different from generate_content's 'website_copy' type, which only writes homepage TEXT and does not create any real pages — use build_website whenever the person wants an actual website/store built, not just copy for one. The site is created as a DRAFT (not published/live) so the person can review it first in Website Builder before making it public — mention that they still need to hit Publish there when ready.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "A rich description of the business for the site: what they sell/do, who their customers are, and the desired look/feel (e.g. luxury, playful, minimal). Write this yourself from what you know about the business and conversation so far — don't just ask the person to repeat themselves if they've already told you enough." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_content",
    description: `Generate a marketing content piece. Valid contentType values: ${CONTENT_TYPES.map((t) => t.key).join(", ")}. Use for social posts, blogs, newsletters, sales sequences, hooks, CTAs, content calendars. The "website_copy" type only writes homepage text — it does NOT create a real website. If the person actually wants a website/store built (not just copy), use build_website instead.`,
    input_schema: {
      type: "object",
      properties: {
        contentType: { type: "string", enum: CONTENT_TYPES.map((t) => t.key) },
        topic: { type: "string", description: "What the content should be about" },
      },
      required: ["contentType"],
    },
  },
  {
    name: "generate_seo",
    description: `Generate SEO content/guidance. Valid taskType values: ${SEO_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: { type: "object", properties: { taskType: { type: "string", enum: SEO_TASKS.map((t) => t.key) } }, required: ["taskType"] },
  },
  {
    name: "generate_social_management",
    description: `Generate social media management content (not a post — replies, growth strategy, trends). Valid taskType values: ${SOCIAL_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { taskType: { type: "string", enum: SOCIAL_TASKS.map((t) => t.key) }, inputText: { type: "string", description: "For reply-type tasks, the message being replied to" } },
      required: ["taskType"],
    },
  },
  {
    name: "generate_email",
    description: `Generate email marketing content. Valid taskType values: ${EMAIL_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { taskType: { type: "string", enum: EMAIL_TASKS.map((t) => t.key) }, topic: { type: "string" } },
      required: ["taskType"],
    },
  },
  {
    name: "generate_whatsapp",
    description: `Generate WhatsApp marketing message content (drafts only — sending is always manual/tap-to-send, never automatic). Valid taskType values: ${WHATSAPP_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { taskType: { type: "string", enum: WHATSAPP_TASKS.map((t) => t.key) }, topic: { type: "string" } },
      required: ["taskType"],
    },
  },
  {
    name: "generate_ad_plan",
    description: `Generate a PLANNING document (not a live launch) for a non-Meta ad platform. Valid platform values: ${AD_PLATFORMS.map((p) => p.key).join(", ")}. Valid taskType values: ${AD_TASKS.map((t) => t.key).join(", ")}. For Meta/Facebook ad launches, don't use this — tell the person to use the Ads Manager page since that spends real money and needs their explicit review there.`,
    input_schema: {
      type: "object",
      properties: { platform: { type: "string", enum: AD_PLATFORMS.map((p) => p.key) }, taskType: { type: "string", enum: AD_TASKS.map((t) => t.key) } },
      required: ["platform", "taskType"],
    },
  },
  {
    name: "generate_video_task",
    description: `Generate video marketing planning content (scripts, ideas, captions — not actual video generation, point them to Creative Studio for that). Valid taskType values: ${VIDEO_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: { type: "object", properties: { taskType: { type: "string", enum: VIDEO_TASKS.map((t) => t.key) }, topic: { type: "string" } }, required: ["taskType"] },
  },
  {
    name: "research_competitor",
    description: `Research a named competitor using real web search. Valid taskType values: ${COMPETITOR_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: { type: "object", properties: { competitorName: { type: "string" }, taskType: { type: "string", enum: COMPETITOR_TASKS.map((t) => t.key) } }, required: ["competitorName", "taskType"] },
  },
  {
    name: "research_market",
    description: `Research using real web search. Valid taskType values: industry_trends, market_research, new_opportunities.`,
    input_schema: { type: "object", properties: { taskType: { type: "string", enum: ["industry_trends", "market_research", "new_opportunities"] } }, required: ["taskType"] },
  },
  {
    name: "generate_cro_suggestions",
    description: `Suggestions to improve the landing page's conversion rate, grounded in its real content and real visitor analytics. Valid taskType values: ${CRO_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: { type: "object", properties: { taskType: { type: "string", enum: CRO_TASKS.map((t) => t.key) } }, required: ["taskType"] },
  },
  {
    name: "remember_insight",
    description: "Save a durable, reusable observation about this business for future conversations — a real pattern worth remembering long-term (e.g. 'Diwali-themed campaigns get noticeably more leads than generic promos', 'this audience responds better to Hinglish than pure English', 'weekday evening posts outperform mornings'). Only call this for genuinely durable, specific learnings grounded in something real the person said or a real result you saw — never for routine facts already covered elsewhere (brand tone, team members), never for one-off details, and never invent a pattern that wasn't actually observed. Most conversations won't need this tool at all.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["campaign_performance", "audience_insight", "content_preference", "timing", "general"] },
        insight: { type: "string", description: "One clear, specific sentence stating the learning." },
      },
      required: ["category", "insight"],
    },
  },
  {
    name: "get_growth_advice",
    description: "Get real-data-grounded growth advice. kind='forecast' computes an actual revenue forecast from real lead/conversion data. kind='opportunities' finds gaps in the real lead funnel. kind='budget' recommends reallocating spend based on real campaign performance. kind='expansion' gives honest expansion-readiness advice based on real health score/data.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["forecast", "opportunities", "budget", "expansion"] } }, required: ["kind"] },
  },
  {
    name: "generate_influencer_outreach",
    description: "Find influencer search terms and draft an outreach DM + email for a product/service/collaboration idea.",
    input_schema: { type: "object", properties: { productOrService: { type: "string" } }, required: ["productOrService"] },
  },
  {
    name: "generate_retargeting_copy",
    description: "Write retargeting/win-back ad copy for a real audience segment — people who abandoned their cart, went cold as a lead, or bought once and haven't returned. Use when the person wants to re-engage past visitors or bring back lapsed customers.",
    input_schema: { type: "object", properties: { segmentType: { type: "string", enum: ["abandoned_cart", "cold_lead", "lapsed_buyer"] } }, required: ["segmentType"] },
  },
  {
    name: "get_analytics_summary",
    description: "Get the business's real current campaign performance numbers (spend, leads, revenue, cost per lead) — use when the person asks how things are doing / performance / numbers.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generate_marketing_strategy",
    description: "Generate a deep marketing strategy: SWOT analysis, target personas, quarterly/annual plan, market gap analysis. Use when the person wants an overall strategy, business plan, or asks 'where should I focus'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generate_seo_keywords",
    description: "Original keyword research + content ideas for a topic (separate from the SEO Toolkit tasks — this is the classic keyword brainstorm + blog post generator). Use when the person wants keyword ideas or a full blog post written.",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" }, writeFullBlogPost: { type: "boolean", description: "true to write the full blog post instead of just keyword ideas" } },
      required: ["topic"],
    },
  },
  {
    name: "generate_graphic",
    description: `Generate an actual AI image (ad creative, social graphic, banner, poster, logo-style asset, product photo, etc) and save it to Graphic Design. Valid designType values: ${GRAPHIC_TYPES.map((t) => t.key).join(", ")}. The image can and should be shown directly in your reply using markdown image syntax (![description](url)) — it renders inline in the chat.`,
    input_schema: { type: "object", properties: { designType: { type: "string", enum: GRAPHIC_TYPES.map((t) => t.key) }, prompt: { type: "string", description: "What the image should depict" } }, required: ["designType"] },
  },
  {
    name: "get_customer_sentiment",
    description: "Analyze real sentiment themes from the business's own lead qualification notes (not web search) — what's making leads hot vs cold, common objections. Needs at least a few leads with notes to work.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_workflow",
    description: "Create a real automated multi-step email workflow (Marketing Automation). Trigger is 'new_lead' or 'appointment_booked'. Steps are an ordered list, each with a delayDays (days after trigger to send) and either an emailTaskType (one of the generate_email taskType values) or custom subject/body. The workflow is created DISABLED by default — tell the person to enable it on the Marketing Automation page when ready, unless they explicitly say to turn it on now, in which case pass enableNow=true.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        triggerType: { type: "string", enum: ["new_lead", "appointment_booked"] },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              delayDays: { type: "number" },
              emailTaskType: { type: "string", description: `One of: ${EMAIL_TASKS.map((t) => t.key).join(", ")}, or 'custom'` },
              customSubject: { type: "string" },
              customBody: { type: "string" },
            },
          },
        },
        enableNow: { type: "boolean" },
      },
      required: ["name", "triggerType", "steps"],
    },
  },
  {
    name: "manage_watch",
    description: "Add something to the daily-monitored watch list — a named competitor (for New Product Alerts) or any general topic/keyword (for News Monitoring). Hawlai will check daily and surface genuinely new items.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["competitor", "topic"] }, value: { type: "string", description: "The competitor name or topic to watch" } }, required: ["kind", "value"] },
  },
  {
    name: "set_automation_toggle",
    description: "Turn a real automation ON or OFF. Only do this when the person explicitly asks to enable/disable/turn on/turn off a specific automation — never proactively. Valid toggle values: dm_auto_reply (auto-reply to Instagram/FB DMs), comment_auto_reply (auto-reply to post comments), welcome_email (auto welcome email for new leads), follow_up_email (auto follow-up for inactive leads), content_autopilot (auto-generate + auto-post to Facebook on a schedule), auto_call_new_leads (real AI phone call placed automatically the moment a new lead comes in — this spends real money per call and reaches an actual person; make sure the person is knowingly turning this on, not just exploring).",
    input_schema: { type: "object", properties: { toggle: { type: "string", enum: ["dm_auto_reply", "comment_auto_reply", "welcome_email", "follow_up_email", "content_autopilot", "auto_call_new_leads"] }, enabled: { type: "boolean" } }, required: ["toggle", "enabled"] },
  },
  {
    name: "get_follow_up_reminders",
    description: "Get real leads that need attention right now — stuck 2+ days with no follow-up, and today's scheduled appointments.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_booking_link",
    description: "Get (or create, if none exists yet) the public meeting-booking link leads can use to book a slot themselves.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_website_analytics",
    description: "Get real website visitor analytics for the last 30 days — page views, chat opens, leads captured, engagement/conversion rate.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_landing_page",
    description: "Update the live landing page's headline, subheadline, or offer/CTA text. Only change fields the person actually specifies.",
    input_schema: { type: "object", properties: { headline: { type: "string" }, subheadline: { type: "string" }, offerText: { type: "string" } }, required: [] },
  },
  {
    name: "generate_3d_scene",
    description: "Generate a REAL, interactive 3D scene (actual WebGL/Three.js code the person can drag to rotate and zoom) from a description — not a video, not a flat image. Use when the person explicitly asks for 3D, an interactive product view, or something they can rotate/spin. This is genuinely generative code and can occasionally fail to render — tell the person it's saved to 3D Studio to view, and that regenerating with a rephrased prompt usually fixes a broken one.",
    input_schema: {
      type: "object",
      properties: { prompt: { type: "string", description: "What the 3D scene should show, in visual detail." } },
      required: ["prompt"],
    },
  },
  {
    name: "publish_to_youtube",
    description: "Publish a ready, already-generated video to the business's connected YouTube channel — this makes it publicly live on YouTube immediately. Only use this on a clear, explicit request (\"publish this to YouTube\", \"upload the candle video\"). If no video is specified, uses the most recently generated ready video.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "YouTube title. If omitted, uses the video's original generation prompt." },
      },
      required: [],
    },
  },
  {
    name: "create_product_ad",
    description: "Automatically create a complete, ready-to-download ad creative using a real product photo already uploaded — places the actual photo and adds whatever text/badges/graphics the instruction asks for (e.g. a discount badge, a price, a headline), all without the person touching the editor. Use this whenever the person wants an ad made from an existing product, not a from-scratch AI-generated image.",
    input_schema: {
      type: "object",
      properties: {
        productName: { type: "string", description: "Which product to use — must match one that already has a photo uploaded." },
        instruction: { type: "string", description: "What to add on top of the photo, e.g. \"add a gold 20% OFF badge in the top corner and the text 'Mogra Nights' below it\"." },
      },
      required: ["productName", "instruction"],
    },
  },
  {
    name: "edit_canvas_design",
    description: "Make an edit to an existing canvas design (the advanced design editor with text/shapes/images) using a plain-language instruction — e.g. \"make the headline bigger\", \"change the background to navy blue\", \"move the logo to the top right\". Only works on designs that already exist. If the person doesn't name which design, this edits their most recently updated one.",
    input_schema: {
      type: "object",
      properties: {
        designName: { type: "string", description: "The design's name, if the person mentioned one. Omit to use their most recently edited design." },
        instruction: { type: "string", description: "What to change, in the person's own words." },
      },
      required: ["instruction"],
    },
  },
  {
    name: "assign_task",
    description: "Assign a piece of work to a specific team member instead of generating it yourself. Use this INSTEAD of generate_content/generate_graphic/generate_video/etc when a team member holds the matching role for this piece of work (check the team roster you were given). Never use this for approval-gated actions (publishing, ad launches) — those aren't delegated.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "The role of the team member this is for, e.g. 'designer', 'content_writer', 'sales' — must match a role from the team roster you were given." },
        title: { type: "string", description: "Short task title, e.g. 'Create Diwali sale banner'." },
        brief: { type: "string", description: "The full plain-language instruction for the person doing this — include concrete context (brand colors, product names, deadline) so they don't have to ask." },
        department: { type: "string", description: "Which department this task relates to, e.g. 'graphic_design', 'content_marketing', 'sales'." },
        goalId: { type: "string", description: "If this task is part of a larger multi-task goal, reuse the same goalId string across all tasks in that goal so they're grouped together." },
      },
      required: ["role", "title", "brief"],
    },
  },
  {
    name: "assign_lead",
    description: "Assign a specific existing lead to a Sales team member so it shows up in their Task Inbox as one of their leads to follow up. Use when the person says something like \"give this lead to Anjali\" or \"assign Rahul to my sales rep\". Only meaningful if a Sales team member exists on the roster you were given.",
    input_schema: {
      type: "object",
      properties: {
        leadName: { type: "string", description: "The lead's name, as close as possible to how the person referred to them." },
        salesRepEmail: { type: "string", description: "The team member's email, from the roster you were given — must be someone with the 'sales' role." },
      },
      required: ["leadName", "salesRepEmail"],
    },
  },
  {
    name: "add_lead",
    description: "Manually add a new lead to the CRM. Use when the person gives you a name and phone number to add (e.g. someone they met offline).",
    input_schema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, notes: { type: "string" } }, required: ["name", "phone"] },
  },
  {
    name: "trigger_call",
    description: "Place a real, live AI phone call to a specific existing lead right now via the calling assistant. Only use this when the person explicitly names a lead and asks to call them (e.g. \"call Rahul\", \"ring up the lead from yesterday\") — this is a real phone call that costs money and reaches an actual person, so only trigger it on a clear, specific request, never proactively or for a lead that doesn't clearly match one in the CRM.",
    input_schema: { type: "object", properties: { leadName: { type: "string", description: "The lead's name, as close as possible to how the person referred to them." } }, required: ["leadName"] },
  },
  {
    name: "send_email",
    description: "Send a real email right now to a specific recipient — a team member (by name or email) or a customer/lead (by email). Only use this when the person clearly wants it actually SENT, not just drafted (e.g. \"email Priya about the launch\", \"send a follow-up to this lead\") — for drafting content to review first, use generate_email instead.",
    input_schema: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "An email address, or a team member's name/email to look up." },
        subject: { type: "string" },
        body: { type: "string", description: "The full email body, in the business's tone of voice." },
      },
      required: ["recipient", "subject", "body"],
    },
  },
  {
    name: "add_product",
    description: "Add a real product to the business's store (Website Builder's Products tab / live storefront). Use when the person describes an actual product they sell and wants it listed, e.g. \"add a Mogra Nights candle at 599 rupees\". This is not a mockup or suggestion — it's saved and will genuinely appear for sale on their live site once published.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        category: { type: "string" },
        inventoryCount: { type: "number", description: "Stock count, if the person mentions one. Omit for unlimited/untracked stock." },
      },
      required: ["name", "price"],
    },
  },
  {
    name: "create_discount_code",
    description: "Create a real discount/coupon code customers can actually use at checkout on the business's store, e.g. \"make a WELCOME10 code for 10% off\". This is live the moment it's created — any customer who enters it gets the discount.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "e.g. WELCOME10 — letters/numbers only, no spaces." },
        discountType: { type: "string", enum: ["percentage", "fixed"] },
        value: { type: "number", description: "Percent (0-100) if discountType is percentage, or a flat rupee amount if fixed." },
        minOrderValue: { type: "number", description: "Optional minimum order subtotal to qualify." },
      },
      required: ["code", "discountType", "value"],
    },
  },
  {
    name: "get_report_links",
    description: "Get download links for a PDF report and a PowerPoint presentation of current performance, plus the client-shareable report link (generating one if it doesn't exist yet).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

async function saveGenerated(supabase: any, dealershipId: string, table: string, extra: Record<string, any>) {
  try {
    await supabase.from(table).insert({ dealership_id: dealershipId, ...extra });
  } catch (err: any) {
    console.error(`[master-brain-v2] failed saving to ${table}:`, err.message);
  }
}

async function executeTool(supabase: any, ctx: DealershipCtx, toolName: string, input: any): Promise<any> {
  const gatedFeature: GatedFeatureKey | undefined =
    toolName === "manage_watch" && input?.kind === "competitor" ? "competitorIntel" : TOOL_FEATURE_MAP[toolName];
  if (gatedFeature) {
    const limits = await getDealershipPlanLimits(supabase, ctx.id);
    if (!hasFeature(limits, gatedFeature)) {
      return { error: upgradeMessage(gatedFeature), upgradeRequired: true };
    }
  }

  switch (toolName) {
    case "generate_brand_kit": {
      const kit = await generateBrandKit(ctx.name, ctx.city, { tone_of_voice: ctx.toneOfVoice }, ctx.category, { supabase, dealershipId: ctx.id });
      if (!(kit as any)._fallback) await supabase.from("brand_kits").upsert({ dealership_id: ctx.id, kit, updated_at: new Date().toISOString() }, { onConflict: "dealership_id" });
      return kit;
    }
    case "generate_logo": {
      try {
        const buffer = await generateLogoConcept(ctx.name, { tone_of_voice: ctx.toneOfVoice } as any, ctx.category, { supabase, dealershipId: ctx.id });
        const { createServiceClient } = await import("../supabase/service");
        const serviceClient = createServiceClient();
        const filePath = `logos/${ctx.id}/${Date.now()}.png`;
        await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "image/png", upsert: true });
        const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
        await supabase.from("brand_kits").upsert({ dealership_id: ctx.id, logo_url: publicUrlData.publicUrl, updated_at: new Date().toISOString() }, { onConflict: "dealership_id" });
        return { success: true, logoUrl: publicUrlData.publicUrl, note: `Saved to Brand Voice. Show it to the person directly in your reply using markdown image syntax: ![Logo](${publicUrlData.publicUrl}) — it will render inline in the chat, don't just tell them to go check another tab.` };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "build_website": {
      try {
        const brandProfile = { tone_of_voice: ctx.toneOfVoice };
        const plan = await planWebsite(input.prompt, ctx.name, ctx.category, ctx.city, brandProfile, { supabase, dealershipId: ctx.id });
        const { pages: generatedPages, fallbackWarnings } = await generateWebsite(ctx.name, ctx.category, ctx.city, plan.pages, plan.businessSummary, brandProfile, input.prompt, { supabase, dealershipId: ctx.id });

        const validTheme = ["navy_amber", "crimson_charcoal", "forest_cream", "midnight_sky"].includes(plan.themeKey) ? plan.themeKey : "navy_amber";
        const base = ctx.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site";

        const { data: existing } = await supabase.from("websites").select("id, slug").eq("dealership_id", ctx.id).maybeSingle();
        let websiteId: string;
        let slug: string;
        if (existing) {
          websiteId = existing.id;
          slug = existing.slug;
          await supabase.from("websites").update({
            site_type: "custom", theme_key: validTheme, nav_order: generatedPages.map((p) => p.slug),
            prompt: input.prompt, business_summary: plan.businessSummary,
          }).eq("id", websiteId);
          await supabase.from("website_pages").delete().eq("website_id", websiteId);
        } else {
          slug = base;
          let attempt = 0;
          while (attempt < 20) {
            const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
            const { data: taken } = await supabase.from("websites").select("id").eq("slug", candidate).maybeSingle();
            if (!taken) { slug = candidate; break; }
            attempt++;
          }
          const { data: newSite, error } = await supabase.from("websites").insert({
            dealership_id: ctx.id, slug, site_type: "custom", theme_key: validTheme,
            nav_order: generatedPages.map((p) => p.slug), prompt: input.prompt, business_summary: plan.businessSummary,
          }).select("id").single();
          if (error) return { error: error.message };
          websiteId = newSite.id;
        }

        const pageRows = generatedPages.map((p, i) => ({
          website_id: websiteId, slug: p.slug, title: p.title, page_type: p.pageType,
          meta_description: p.metaDescription, sections: p.sections, order_index: i,
        }));
        const { error: pagesError } = await supabase.from("website_pages").insert(pageRows);
        if (pagesError) return { error: pagesError.message };

        return {
          success: true,
          pages: generatedPages.map((p) => p.title),
          theme: validTheme,
          slug,
          note: `Website built as a DRAFT with ${generatedPages.length} pages (${generatedPages.map((p) => p.title).join(", ")}) — it is NOT live yet. Tell the person to review it in Website Builder and hit Publish there when they're happy with it.${fallbackWarnings?.length ? ` Some pages fell back to placeholder content instead of real AI content (${fallbackWarnings.join("; ")}) — tell the person this happened and that they can hit Regenerate Website once it's resolved.` : ""}`,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "generate_content": {
      const { output, _fallback } = await generateContent(input.contentType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice, messaging_pillars: [] }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "content_pieces", { content_type: input.contentType, topic: input.topic ?? "", output });
      return output;
    }
    case "generate_seo": {
      const { output, _fallback } = await generateSeoTask(input.taskType, ctx.name, ctx.city, ctx.category, { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "seo_toolkit_items", { task_type: input.taskType, output });
      return output;
    }
    case "generate_social_management": {
      const { output, _fallback } = await generateSocialTask(input.taskType, ctx.name, ctx.category, input.inputText ?? "", { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "social_management_items", { task_type: input.taskType, input_text: input.inputText ?? "", output });
      return output;
    }
    case "generate_email": {
      const { output, _fallback } = await generateEmailContent(input.taskType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "email_marketing_pieces", { task_type: input.taskType, topic: input.topic ?? "", output });
      return output;
    }
    case "generate_whatsapp": {
      const { output, _fallback } = await generateWhatsappContent(input.taskType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "whatsapp_marketing_pieces", { task_type: input.taskType, topic: input.topic ?? "", output });
      return output;
    }
    case "generate_ad_plan": {
      const { output, _fallback } = await generateAdPlan(input.platform, input.taskType, ctx.name, ctx.category, { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "paid_ads_plans", { platform: input.platform, task_type: input.taskType, output });
      return output;
    }
    case "generate_video_task": {
      const { output, _fallback } = await generateVideoTask(input.taskType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "video_marketing_pieces", { task_type: input.taskType, topic: input.topic ?? "", output });
      return output;
    }
    case "research_competitor": {
      const { output, _fallback } = await generateCompetitorIntel(input.taskType, input.competitorName, ctx.name, ctx.category, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "competitor_intel_items", { task_type: input.taskType, competitor_name: input.competitorName, output });
      return output;
    }
    case "research_market": {
      const { output, _fallback } = await generateResearch(input.taskType, ctx.name, ctx.category, ctx.city, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "research_items", { task_type: input.taskType, output });
      return output;
    }
    case "generate_cro_suggestions": {
      const { data: page } = await supabase.from("landing_pages").select("headline, subheadline, offer_text").eq("dealership_id", ctx.id).maybeSingle();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await supabase.from("page_events").select("event_type").eq("dealership_id", ctx.id).gte("created_at", thirtyDaysAgo);
      const all = events ?? [];
      const { output, _fallback } = await generateCroSuggestions(input.taskType, ctx.name, ctx.category, {
        headline: page?.headline, subheadline: page?.subheadline, offerText: page?.offer_text,
        views: all.filter((e: any) => e.event_type === "view").length,
        chatOpens: all.filter((e: any) => e.event_type === "chat_open").length,
        formSubmits: all.filter((e: any) => e.event_type === "form_submit").length,
      }, { supabase, dealershipId: ctx.id });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "cro_items", { task_type: input.taskType, output });
      return output;
    }
    case "get_growth_advice": {
      // revenue_forecast is deliberately never saved here either — it's
      // computed live from current lead/deal data (same as the standalone
      // /dashboard/growth-advisor page), not a Claude-generated artifact
      // with an id to persist.
      if (input.kind === "forecast") return computeRevenueForecast(supabase, ctx.id, ctx.name, ctx.category);
      if (input.kind === "opportunities") {
        const { data: leads } = await supabase.from("leads").select("status, source").eq("dealership_id", ctx.id).limit(300);
        const all = leads ?? [];
        const byStatus: Record<string, number> = {};
        for (const l of all) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
        const { output, _fallback } = await generateGrowthOpportunities(ctx.name, ctx.category, `Total leads: ${all.length}. By status: ${JSON.stringify(byStatus)}.`) as { output: any; _fallback?: boolean };
        if (!_fallback) await saveGenerated(supabase, ctx.id, "growth_advisor_items", { task_type: "growth_opportunities", output });
        return output;
      }
      if (input.kind === "budget") {
        const performance = await getCampaignPerformance(supabase, ctx.id);
        const context = performance.campaigns.length > 0 ? performance.campaigns.map((c) => `${c.headline}: spend ₹${c.spend}, leads ${c.leads}, revenue ₹${c.revenue}`).join("\n") : "No campaign data yet.";
        const { output, _fallback } = await generateBudgetRecommendations(ctx.name, ctx.category, context) as { output: any; _fallback?: boolean };
        if (!_fallback) await saveGenerated(supabase, ctx.id, "growth_advisor_items", { task_type: "budget_recommendations", output });
        return output;
      }
      const growth = await generateGrowthReport(supabase, ctx.id, ctx.category);
      const { output, _fallback } = await generateExpansionStrategy(ctx.name, ctx.category, ctx.city, growth.healthScore, `Health score: ${growth.healthScore}/100. Risks: ${growth.risks.join("; ") || "none"}.`) as { output: any; _fallback?: boolean };
      if (!_fallback) await saveGenerated(supabase, ctx.id, "growth_advisor_items", { task_type: "expansion_strategy", output });
      return output;
    }
    case "generate_influencer_outreach": {
      const output = await generateInfluencerPlan(input.productOrService, ctx.city, { tone_of_voice: ctx.toneOfVoice }, ctx.category, { supabase, dealershipId: ctx.id });
      await saveGenerated(supabase, ctx.id, "influencer_outreach_plans", { product: input.productOrService, output });
      return output;
    }
    case "generate_retargeting_copy": {
      const segmentType = input.segmentType as "abandoned_cart" | "cold_lead" | "lapsed_buyer";
      let context = "General re-engagement audience.";
      if (segmentType === "abandoned_cart") {
        const { data: carts } = await supabase.from("abandoned_carts").select("items").eq("dealership_id", ctx.id).eq("contacted", false).limit(5);
        const items = (carts ?? []).flatMap((c: any) => (c.items ?? []).map((i: any) => i.name));
        context = items.length > 0 ? `Recently abandoned items include: ${items.slice(0, 8).join(", ")}.` : "No specific item data available — write generically.";
      } else if (segmentType === "cold_lead") {
        const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealership_id", ctx.id).neq("status", "converted");
        context = `Approximately ${count ?? 0} leads have gone cold.`;
      } else {
        context = "One-time customers who haven't returned to buy again.";
      }
      const output = await generateRetargetingCopy(segmentType, ctx.name, ctx.category, context, { supabase, dealershipId: ctx.id });
      await saveGenerated(supabase, ctx.id, "retargeting_campaigns", { segment_type: segmentType, output });
      return output;
    }
    case "remember_insight": {
      const { data, error } = await supabase.from("business_memory").insert({
        dealership_id: ctx.id,
        category: input.category ?? "general",
        insight: input.insight,
        source: "chat",
      }).select().single();
      if (error) return { error: error.message };
      return { success: true, note: "Noted — I'll remember this going forward." };
    }
    case "get_analytics_summary": {
      const performance = await getCampaignPerformance(supabase, ctx.id);
      return performance;
    }
    case "generate_marketing_strategy": {
      const { data: competitorRows } = await supabase.from("competitor_intel_items").select("competitor_name, output").eq("dealership_id", ctx.id).limit(3);
      const competitorContext = (competitorRows ?? []).length > 0 ? JSON.stringify(competitorRows) : null;
      const strategy = await generateDeepStrategy(ctx.name, ctx.city, { tone_of_voice: ctx.toneOfVoice }, ctx.category, competitorContext, { supabase, dealershipId: ctx.id });
      if (!(strategy as any)._fallback) await supabase.from("deep_strategies").upsert({ dealership_id: ctx.id, strategy, updated_at: new Date().toISOString() }, { onConflict: "dealership_id" });
      return strategy;
    }
    case "generate_seo_keywords": {
      if (input.writeFullBlogPost) {
        const { generateBlogPost } = await import("./seoAgent");
        return generateBlogPost(input.topic, ctx.city, ctx.category, { supabase, dealershipId: ctx.id });
      }
      return generateSeoIdeas(input.topic, ctx.city, ctx.category, { supabase, dealershipId: ctx.id });
    }
    case "generate_graphic": {
      try {
        const buffer = await generateGraphic(input.designType, ctx.name, ctx.category, input.prompt ?? "", { tone_of_voice: ctx.toneOfVoice }, { supabase, dealershipId: ctx.id });
        const { createServiceClient } = await import("../supabase/service");
        const serviceClient = createServiceClient();
        const filePath = `graphic-designs/${ctx.id}/${input.designType}-${Date.now()}.png`;
        await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "image/png", upsert: true });
        const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
        await supabase.from("graphic_designs").insert({ dealership_id: ctx.id, design_type: input.designType, prompt: input.prompt ?? "", image_url: publicUrlData.publicUrl });
        return { success: true, imageUrl: publicUrlData.publicUrl, note: `Saved to Graphic Design. Show it to the person directly in your reply using markdown image syntax: ![Generated image](${publicUrlData.publicUrl}) — it will render inline in the chat, don't just tell them to go check another tab.` };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "get_customer_sentiment": {
      const { data: leads } = await supabase.from("leads").select("qualification_reason, lead_temperature, status").eq("dealership_id", ctx.id).limit(200);
      const { output } = await generateSentimentFromLeads(ctx.name, ctx.category, (leads ?? []).map((l: any) => ({ qualificationReason: l.qualification_reason, temperature: l.lead_temperature, status: l.status })), { supabase, dealershipId: ctx.id });
      return output;
    }
    case "create_workflow": {
      const { data: workflow, error: wError } = await supabase
        .from("workflows")
        .insert({ dealership_id: ctx.id, name: input.name, trigger_type: input.triggerType, enabled: !!input.enableNow })
        .select()
        .single();
      if (wError) return { error: wError.message };
      const stepRows = (input.steps ?? []).map((s: any, i: number) => ({
        workflow_id: workflow.id, step_order: i, delay_days: s.delayDays ?? 0,
        email_task_type: s.emailTaskType ?? "custom", custom_subject: s.customSubject ?? null, custom_body: s.customBody ?? null,
      }));
      if (stepRows.length > 0) await supabase.from("workflow_steps").insert(stepRows);
      return { success: true, workflowId: workflow.id, enabled: !!input.enableNow };
    }
    case "manage_watch": {
      const table = input.kind === "competitor" ? "competitor_watches" : "topic_watches";
      const column = input.kind === "competitor" ? "competitor_name" : "topic";
      const { error } = await supabase.from(table).insert({ dealership_id: ctx.id, [column]: input.value });
      if (error && !error.message.includes("duplicate")) return { error: error.message };
      return { success: true };
    }
    case "set_automation_toggle": {
      const fieldMap: Record<string, string> = {
        dm_auto_reply: "dm_auto_reply_enabled", comment_auto_reply: "comment_auto_reply_enabled",
        welcome_email: "welcome_email_auto_enabled", follow_up_email: "follow_up_email_auto_enabled",
        content_autopilot: "content_autopilot_enabled", auto_call_new_leads: "auto_call_new_leads",
      };
      const field = fieldMap[input.toggle];
      if (!field) return { error: "Unknown toggle" };
      const { error } = await supabase.from("dealerships").update({ [field]: !!input.enabled }).eq("id", ctx.id);
      if (error) return { error: error.message };
      return { success: true, toggle: input.toggle, enabled: !!input.enabled };
    }
    case "get_follow_up_reminders": {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const [{ data: staleLeads }, { data: todaysAppointments }] = await Promise.all([
        supabase.from("leads").select("name, phone, status").eq("dealership_id", ctx.id).in("status", ["new", "ready_to_call"]).lt("created_at", twoDaysAgo).limit(20),
        supabase.from("appointments").select("appointment_date, appointment_type, leads(name)").eq("dealership_id", ctx.id).eq("status", "scheduled").gte("appointment_date", todayStart.toISOString()).lte("appointment_date", todayEnd.toISOString()),
      ]);
      return { staleLeads: staleLeads ?? [], todaysAppointments: todaysAppointments ?? [] };
    }
    case "get_booking_link": {
      const { data: dealership } = await supabase.from("dealerships").select("booking_slug, dealership_name").eq("id", ctx.id).single();
      if (dealership?.booking_slug) return { bookingUrl: `/book/${dealership.booking_slug}` };
      const base = (dealership?.dealership_name ?? "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "book";
      await supabase.from("dealerships").update({ booking_slug: base }).eq("id", ctx.id);
      return { bookingUrl: `/book/${base}` };
    }
    case "get_website_analytics": {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await supabase.from("page_events").select("event_type").eq("dealership_id", ctx.id).gte("created_at", thirtyDaysAgo);
      const all = events ?? [];
      const views = all.filter((e: any) => e.event_type === "view").length;
      const formSubmits = all.filter((e: any) => e.event_type === "form_submit").length;
      return { views, chatOpens: all.filter((e: any) => e.event_type === "chat_open").length, formSubmits, conversionRate: views > 0 ? (formSubmits / views) * 100 : null };
    }
    case "update_landing_page": {
      const update: any = {};
      if (input.headline) update.headline = input.headline;
      if (input.subheadline) update.subheadline = input.subheadline;
      if (input.offerText) update.offer_text = input.offerText;
      if (Object.keys(update).length === 0) return { error: "Nothing to update" };
      const { error } = await supabase.from("landing_pages").update(update).eq("dealership_id", ctx.id);
      if (error) return { error: error.message };
      return { success: true, updated: Object.keys(update) };
    }
    case "generate_3d_scene": {
      const { data: scene, error: insertError } = await supabase.from("three_d_scenes").insert({
        dealership_id: ctx.id, name: input.prompt.slice(0, 60), prompt: input.prompt, status: "pending",
      }).select("id").single();
      if (insertError) return { error: insertError.message };

      const result = await generate3DScene(input.prompt, ctx.name, ctx.category, { supabase, dealershipId: ctx.id });
      if (result.error || !result.html) {
        await supabase.from("three_d_scenes").update({ status: "failed", error_message: result.error }).eq("id", scene.id);
        return { error: result.error ?? "3D scene generation failed" };
      }
      await supabase.from("three_d_scenes").update({ status: "ready", html_code: result.html }).eq("id", scene.id);
      return { success: true, sceneId: scene.id, note: `3D scene ready — saved to 3D Studio (/dashboard/3d-studio) to view and interact with, you cannot show it inline in chat.` };
    }
    case "publish_to_youtube": {
      try {
        const { data: dealership } = await supabase.from("dealerships").select("youtube_access_token, youtube_refresh_token, youtube_token_expiry").eq("id", ctx.id).single();
        if (!dealership?.youtube_refresh_token) return { error: "YouTube isn't connected yet — connect it from Business → Integrations first." };

        const { data: video } = await supabase.from("video_generations").select("id, video_url, prompt").eq("dealership_id", ctx.id).eq("status", "ready").not("video_url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!video) return { error: "No ready video found to publish — generate one first." };

        const { accessToken, refreshed } = await getValidYoutubeAccessToken({
          accessToken: dealership.youtube_access_token,
          refreshToken: dealership.youtube_refresh_token,
          tokenExpiry: dealership.youtube_token_expiry,
        });
        if (refreshed) await supabase.from("dealerships").update({ youtube_access_token: refreshed.accessToken, youtube_token_expiry: refreshed.expiry }).eq("id", ctx.id);

        const result = await uploadVideoToYouTube(accessToken, video.video_url, input.title || video.prompt.slice(0, 90), video.prompt);
        await supabase.from("video_generations").update({ youtube_video_id: result.videoId, youtube_url: result.url }).eq("id", video.id);
        return { success: true, url: result.url, note: `Published to YouTube: ${result.url}` };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "create_product_ad": {
      try {
        const { data: matches } = await supabase.from("products").select("id, name, images").eq("dealership_id", ctx.id).ilike("name", `%${input.productName}%`).limit(5);
        const withPhoto = (matches ?? []).filter((p: any) => Array.isArray(p.images) && p.images.length > 0);
        if (withPhoto.length === 0) return { error: `No product matching "${input.productName}" with an uploaded photo found — add a photo to it in Website & Products first.` };
        const product = withPhoto[0];
        const photoUrl = product.images[0];

        const canvasWidth = 1080, canvasHeight = 1080;
        // Approximate placement — the real pixel dimensions of the
        // uploaded photo aren't known without fetching and decoding
        // it, so this is a reasonable default fill, not a guaranteed
        // pixel-perfect fit. The person can nudge/resize it slightly
        // in the editor afterward if needed; this is still the vast
        // majority of the work done automatically, not the whole
        // manual process.
        const photoElement = { type: "image", src: photoUrl, left: 0, top: 0, scaleX: 0.9, scaleY: 0.9, selectable: true };

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            messages: [{
              role: "user",
              content: `You're designing an ad creative for "${product.name}" on a ${canvasWidth}x${canvasHeight} fabric.js canvas. A real product photo already covers most of the canvas as the first element (don't move or remove it):
${JSON.stringify(photoElement)}

Add whatever additional fabric.js elements (type "i-text" for text with left/top/fontSize/fontFamily/fill/fontWeight, or "rect"/"circle" for badge shapes with left/top/width or radius/fill/rx for rounded corners) the instruction below asks for — badges, discount text, price, headline, etc. Position them so they don't cover the product's main subject, typically a corner or edge.

Instruction: "${input.instruction}"

Respond with ONLY the complete elements array as valid JSON (including the photo element unchanged as the first item) — no markdown, no explanation.`,
            }],
          }),
        });
        if (!response.ok) return { error: "Couldn't reach the design service — try again shortly." };
        const data = await response.json();
        if (data.usage) await logClaudeUsage(supabase, ctx.id, "canvas_edit", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
        const text = data.content?.[0]?.text ?? "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const elements = jsonMatch ? JSON.parse(jsonMatch[0]) : [photoElement];

        const { data: design, error: insertError } = await supabase.from("canvas_designs").insert({
          dealership_id: ctx.id, name: `${product.name} Ad`, canvas_width: canvasWidth, canvas_height: canvasHeight, elements,
        }).select("id").single();
        if (insertError) return { error: insertError.message };

        return { success: true, designId: design.id, note: `Ad created using ${product.name}'s real photo — saved to Design Studio (/design-editor?id=${design.id}) to review, download, or fine-tune.` };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "edit_canvas_design": {
      try {
        let query = supabase.from("canvas_designs").select("id, name, elements, canvas_width, canvas_height, background_color").eq("dealership_id", ctx.id);
        if (input.designName) query = query.ilike("name", `%${input.designName}%`);
        const { data: designs } = await query.order("updated_at", { ascending: false }).limit(1);
        const design = designs?.[0];
        if (!design) return { error: input.designName ? `No design found matching "${input.designName}".` : "No designs exist yet — create one first in the Advanced Editor." };

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            messages: [{
              role: "user",
              content: `You're editing a fabric.js canvas design. Canvas is ${design.canvas_width}x${design.canvas_height}, background color ${design.background_color}.

Current elements (fabric.js object JSON array — each has at least "type", "left", "top", and type-specific fields like "text"/"fontSize"/"fontFamily" for text, "fill"/"width"/"height" for rects, "fill"/"radius" for circles, "src" for images):
${JSON.stringify(design.elements)}

Instruction: "${input.instruction}"

Apply ONLY the change(s) implied by the instruction. Preserve every field you're not intentionally changing, and preserve every element not mentioned. Never invent new elements unless the instruction explicitly asks to add something. Respond with ONLY the complete updated elements array as valid JSON — no markdown, no explanation, no preamble.`,
            }],
          }),
        });
        if (!response.ok) return { error: "Couldn't reach the editing service — try again shortly." };
        const data = await response.json();
        if (data.usage) await logClaudeUsage(supabase, ctx.id, "canvas_edit", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
        const text = data.content?.[0]?.text ?? "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return { error: "Couldn't understand how to apply that edit — try rephrasing it." };
        const newElements = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(newElements)) return { error: "Edit didn't produce a valid design — nothing was changed." };

        const { error: updateError } = await supabase.from("canvas_designs").update({ elements: newElements }).eq("id", design.id);
        if (updateError) return { error: updateError.message };
        return { success: true, designName: design.name, designId: design.id, note: `Edited "${design.name}". Tell the person to open it in the Advanced Editor to review — link: /design-editor?id=${design.id}` };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "assign_task": {
      const match = ctx.team.find((t) => t.role === input.role);
      if (!match) return { error: `No active team member holds the "${input.role}" role — do this piece yourself instead.` };
      const { data, error } = await supabase.from("tasks").insert({
        dealership_id: ctx.id,
        goal_id: input.goalId ?? null,
        title: input.title,
        brief: input.brief,
        department: input.department ?? null,
        assigned_to: match.id,
        assigned_role: input.role,
        created_by: null,
        status: "open",
      }).select("id").single();
      if (error) return { error: error.message };
      return { success: true, taskId: data.id, assignedTo: match.email, note: `Assigned to ${match.email} (${input.role}) — they'll see it in their Task Inbox.` };
    }
    case "assign_lead": {
      const salesRep = ctx.team.find((t) => t.email === input.salesRepEmail && t.role === "sales");
      if (!salesRep) return { error: `No active Sales team member found with email "${input.salesRepEmail}" — check the team roster.` };
      const { data: matches } = await supabase.from("leads").select("id, name").eq("dealership_id", ctx.id).ilike("name", `%${input.leadName}%`).limit(5);
      if (!matches || matches.length === 0) return { error: `No lead found matching "${input.leadName}".` };
      if (matches.length > 1) return { error: `Multiple leads match "${input.leadName}" (${matches.map((m: any) => m.name).join(", ")}) — ask the person to be more specific.` };
      const { error } = await supabase.from("leads").update({ assigned_to: salesRep.id }).eq("id", matches[0].id);
      if (error) return { error: error.message };
      return { success: true, leadName: matches[0].name, assignedTo: salesRep.email, note: `${matches[0].name} is now assigned to ${salesRep.email} — it'll show up in their leads to follow up.` };
    }
    case "add_lead": {
      const { data, error } = await supabase.from("leads").insert({ dealership_id: ctx.id, name: input.name, phone: input.phone, email: input.email ?? null, source: "manual_chat", qualification_reason: input.notes ?? null }).select().single();
      if (error) return { error: error.message };
      return { success: true, leadId: data.id };
    }
    case "trigger_call": {
      const { data: matches } = await supabase.from("leads").select("id, name, phone, dealership_id").eq("dealership_id", ctx.id).ilike("name", `%${input.leadName}%`).limit(5);
      if (!matches || matches.length === 0) return { error: `No lead found matching "${input.leadName}" — check the CRM for the exact name.` };
      if (matches.length > 1) return { error: `Multiple leads match "${input.leadName}" (${matches.map((m: any) => m.name).join(", ")}) — ask the person to be more specific.` };
      const lead = matches[0];
      if (!lead.phone) return { error: `${lead.name} has no phone number on file, so a call can't be placed.` };
      const result = await triggerVapiCall(supabase, lead);
      if (!result.success) return { error: result.error };
      return { success: true, calledLead: lead.name, note: `Call placed to ${lead.name}. Tell the person the call is in progress — the transcript and an updated lead score will appear once it ends.` };
    }
    case "send_email": {
      let toEmail = input.recipient.trim();
      if (!toEmail.includes("@")) {
        const { data: matches } = await supabase.from("team_members").select("email").eq("dealership_id", ctx.id).eq("status", "active").ilike("email", `%${toEmail}%`).limit(5);
        if (!matches || matches.length === 0) return { error: `No team member or email found matching "${input.recipient}".` };
        if (matches.length > 1) return { error: `Multiple matches for "${input.recipient}" — ask the person to be more specific or give the exact email.` };
        toEmail = matches[0].email;
      }
      const result = await sendDealerEmail(supabase, ctx.id, toEmail, input.subject, input.body);
      if (!result.success) return { error: result.error };
      return { success: true, sentTo: toEmail, note: `Email sent to ${toEmail}.` };
    }
    case "add_product": {
      const { data, error } = await supabase.from("products").insert({
        dealership_id: ctx.id,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        category: input.category ?? null,
        inventory_count: input.inventoryCount ?? null,
      }).select("id").single();
      if (error) return { error: error.message };
      return { success: true, productId: data.id, note: `"${input.name}" added to the Products tab — saved with no image yet, the person can add one there.` };
    }
    case "create_discount_code": {
      const code = String(input.code).trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return { error: "Code must be 3-20 letters/numbers, e.g. WELCOME10" };
      const { data: existing } = await supabase.from("discount_codes").select("id").eq("dealership_id", ctx.id).eq("code", code).maybeSingle();
      if (existing) return { error: `A code "${code}" already exists.` };
      const { data, error } = await supabase.from("discount_codes").insert({
        dealership_id: ctx.id,
        code,
        discount_type: input.discountType,
        value: input.value,
        min_order_value: input.minOrderValue ?? null,
      }).select("id").single();
      if (error) return { error: error.message };
      return { success: true, code, note: `Code ${code} is live now — customers can use it at checkout immediately.` };
    }
    case "get_report_links": {
      const { data: dealership } = await supabase.from("dealerships").select("report_share_token").eq("id", ctx.id).single();
      let token = dealership?.report_share_token;
      if (!token) {
        token = randomBytes(16).toString("hex");
        await supabase.from("dealerships").update({ report_share_token: token }).eq("id", ctx.id);
      }
      return { pdfDownloadUrl: "/api/reports/pdf", presentationDownloadUrl: "/api/reports/presentation", clientShareUrl: `/report/${token}` };
    }
    default:
      return { error: "Unknown tool" };
  }
}

export interface ChatTurnResult {
  reply: string;
  toolsUsed: string[];
  artifacts: Artifact[];
}

export interface Artifact {
  // "visual" = renders in the side workspace panel (image/website/3d/canvas,
  // unchanged from before). Everything else renders as an inline summary
  // card directly under the assistant's message in the chat feed — the
  // whole point being the person can see what happened without leaving
  // the conversation to go check a department page manually.
  kind: "visual" | "document" | "record" | "metric" | "link";
  type?: "image" | "website" | "3d_scene" | "canvas_design"; // only set when kind === "visual"
  label: string;
  summary?: string; // one or two lines of what actually happened/was produced
  url?: string; // visual: direct viewable src. link: the URL to open.
  html?: string; // 3d_scene inline content, avoids a second fetch
  fields?: { label: string; value: string }[]; // structured facts for record/metric kinds
  groups?: { heading: string; items: { label: string; note?: string }[] }[]; // sectioned lists — e.g. keyword research grouped by search intent — so a document card never has to fall back to dumping raw JSON structure
  departmentHref?: string; // "open in <department>" deep link, shown on every kind when known
}

// Where each tool's result actually lives, so a person can jump straight
// there instead of hunting through the Business hub. Kept as one lookup
// table (rather than repeating a path string in every case below) so
// there's a single place to fix if a route ever moves.
const DEPARTMENT_HREF: Record<string, string> = {
  generate_brand_kit: "/dashboard/brand-building",
  generate_logo: "/dashboard/brand-building",
  build_website: "/dashboard/website-builder",
  generate_content: "/dashboard/content-marketing",
  generate_seo: "/dashboard/seo",
  generate_social_management: "/dashboard/social",
  generate_email: "/dashboard/email",
  generate_whatsapp: "/dashboard/whatsapp",
  generate_ad_plan: "/dashboard/paid-ads",
  generate_video_task: "/dashboard/video-marketing",
  research_competitor: "/dashboard/competitor-intel",
  research_market: "/dashboard/research",
  generate_cro_suggestions: "/dashboard/cro",
  get_growth_advice: "/dashboard/growth-advisor",
  generate_influencer_outreach: "/dashboard/influencer-marketing",
  generate_retargeting_copy: "/dashboard/retargeting",
  remember_insight: "/dashboard/business-memory",
  get_analytics_summary: "/dashboard/analytics",
  generate_marketing_strategy: "/dashboard/strategy",
  generate_seo_keywords: "/dashboard/seo",
  generate_graphic: "/dashboard/graphic-design",
  get_customer_sentiment: "/dashboard/insights",
  create_workflow: "/dashboard/marketing-automation",
  manage_watch: "/dashboard/competitor-intel",
  set_automation_toggle: "/dashboard/settings",
  get_follow_up_reminders: "/dashboard/leads-hub",
  get_booking_link: "/dashboard/appointments",
  get_website_analytics: "/dashboard/analytics",
  update_landing_page: "/dashboard/website-builder",
  generate_3d_scene: "/dashboard/3d-studio",
  publish_to_youtube: "/dashboard/video-marketing",
  create_product_ad: "/design-editor",
  edit_canvas_design: "/design-editor",
  assign_task: "/dashboard/tasks",
  assign_lead: "/dashboard/leads-hub",
  add_lead: "/dashboard/leads-hub",
  trigger_call: "/dashboard/calls",
  send_email: "/dashboard/email",
  add_product: "/dashboard/website-builder",
  create_discount_code: "/dashboard/website-builder",
  get_report_links: "/dashboard/reports",
};

// Generic fallback for tools whose result shape isn't hand-mapped below
// (mostly the ~14 "generate_X" content tools, whose exact field names
// live inside their individual agent functions rather than here). Rather
// than reading and hand-mapping every one of those agent files' return
// shapes, this pulls a reasonable one-line summary using common field
// names first, then falls back to any short-ish string field, so every
// tool produces SOMETHING visible instead of only the ones worth the
// bespoke handling below. This is a deliberate quality/coverage
// trade-off — worth revisiting per-tool later if a summary reads oddly.
// Groups a keyword-research-style result into sections by search intent,
// for a proper "Informational" / "Transactional" card instead of a flat
// dump. Anything without a recognized intent lands in "Other" rather
// than being silently dropped.
function groupKeywordsByIntent(keywords: { keyword?: string; intent?: string; note?: string }[]): { heading: string; items: { label: string; note?: string }[] }[] {
  const buckets: Record<"informational" | "transactional" | "other", { label: string; note?: string }[]> = {
    informational: [], transactional: [], other: [],
  };
  for (const k of keywords) {
    if (!k?.keyword) continue;
    const intent = (k.intent ?? "").toLowerCase();
    const bucket = intent.startsWith("info") ? "informational" : intent.startsWith("trans") ? "transactional" : "other";
    buckets[bucket].push({ label: k.keyword, note: k.note });
  }
  const groups: { heading: string; items: { label: string; note?: string }[] }[] = [];
  if (buckets.informational.length) groups.push({ heading: "Informational", items: buckets.informational });
  if (buckets.transactional.length) groups.push({ heading: "Transactional", items: buckets.transactional });
  if (buckets.other.length) groups.push({ heading: "Other", items: buckets.other });
  return groups;
}

function genericSummary(result: any): string {
  if (typeof result?.note === "string") return result.note;
  const titleish = result?.headline ?? result?.title ?? result?.subject ?? result?.name;
  if (typeof titleish === "string") return titleish;
  for (const key of Object.keys(result ?? {})) {
    const v = result[key];
    if (typeof v === "string" && v.length > 15 && v.length < 280) return v;
  }
  return "Done — view the full result.";
}

// Turns a raw tool-execution result into something the chat feed can
// show inline (or the workspace panel, for visual kinds), without the
// frontend needing to know each tool's individual response shape.
function extractArtifact(toolName: string, input: any, result: any): Artifact | null {
  if (!result || result.error) return null;
  const departmentHref = DEPARTMENT_HREF[toolName];

  switch (toolName) {
    // ---- Visual: unchanged from before, renders in the side panel ----
    case "generate_logo":
      return result.logoUrl ? { kind: "visual", type: "image", label: "Logo", url: result.logoUrl, departmentHref } : null;
    case "generate_graphic":
      return result.imageUrl ? { kind: "visual", type: "image", label: "Generated Image", url: result.imageUrl, departmentHref } : null;
    case "build_website":
      return { kind: "visual", type: "website", label: "Website Draft", url: departmentHref, summary: result.note, departmentHref };
    case "generate_3d_scene":
      return result.sceneId ? { kind: "visual", type: "3d_scene", label: "3D Scene", url: departmentHref, departmentHref } : null;
    case "create_product_ad":
    case "edit_canvas_design":
      return result.designId ? { kind: "visual", type: "canvas_design", label: "Design", url: `/design-editor?id=${result.designId}`, departmentHref: `/design-editor?id=${result.designId}` } : null;

    // ---- Record: something concrete got created/changed — show the
    // key facts, not just a text sentence ----
    case "create_discount_code":
      return { kind: "record", label: "Discount code created", fields: [{ label: "Code", value: result.code }], departmentHref };
    case "assign_task":
      return { kind: "record", label: "Task assigned", fields: [{ label: "Assigned to", value: result.assignedTo }], departmentHref };
    case "assign_lead":
      return { kind: "record", label: "Lead reassigned", fields: [{ label: "Lead", value: result.leadName }, { label: "Now with", value: result.assignedTo }], departmentHref };
    case "add_lead":
      return { kind: "record", label: "Lead added", departmentHref };
    case "add_product":
      return { kind: "record", label: "Product added", summary: result.note, departmentHref };
    case "trigger_call":
      return { kind: "record", label: "Call placed", fields: [{ label: "To", value: result.calledLead }], departmentHref };
    case "send_email":
      return { kind: "record", label: "Email sent", fields: [{ label: "To", value: result.sentTo }], departmentHref };
    case "create_workflow":
      return { kind: "record", label: "Automation workflow created", fields: [{ label: "Status", value: result.enabled ? "Enabled" : "Created, not enabled yet" }], departmentHref };
    case "set_automation_toggle":
      return { kind: "record", label: "Automation setting changed", fields: [{ label: result.toggle.replace(/_/g, " "), value: result.enabled ? "Turned on" : "Turned off" }], departmentHref };
    case "manage_watch":
      return { kind: "record", label: "Watch added", departmentHref };
    case "remember_insight":
      return { kind: "record", label: "Remembered for next time", summary: result.note, departmentHref };
    case "update_landing_page":
      return { kind: "record", label: "Landing page updated", fields: (result.updated ?? []).map((f: string) => ({ label: f, value: "Updated" })), departmentHref };
    case "publish_to_youtube":
      return { kind: "link", label: "Published to YouTube", url: result.url, departmentHref };

    // ---- Link: an actual URL to open ----
    case "get_booking_link":
      return { kind: "link", label: "Booking link", url: result.bookingUrl, departmentHref };
    case "get_report_links":
      return { kind: "link", label: "Client report", url: result.clientShareUrl, departmentHref };

    // ---- Metric: numbers worth surfacing as a quick glance ----
    case "get_follow_up_reminders":
      return {
        kind: "metric", label: "Follow-up check",
        fields: [
          { label: "Stale leads", value: String((result.staleLeads ?? []).length) },
          { label: "Today's appointments", value: String((result.todaysAppointments ?? []).length) },
        ],
        departmentHref,
      };
    case "get_website_analytics":
      return {
        kind: "metric", label: "Website analytics (30 days)",
        fields: [
          { label: "Views", value: String(result.views ?? 0) },
          { label: "Form submits", value: String(result.formSubmits ?? 0) },
          { label: "Conversion", value: result.conversionRate != null ? `${result.conversionRate.toFixed(1)}%` : "—" },
        ],
        departmentHref,
      };
    case "get_analytics_summary":
      return { kind: "metric", label: "Campaign performance", summary: genericSummary(result), departmentHref };

    case "generate_seo": {
      if (input?.taskType === "competitor_keywords" && Array.isArray(result?.keywords)) {
        return { kind: "document", label: "Competitor Keyword Research", groups: groupKeywordsByIntent(result.keywords), departmentHref };
      }
      return { kind: "document", label: "SEO", summary: genericSummary(result), departmentHref };
    }

    default:
      // Every remaining tool (generate_content, generate_seo,
      // generate_marketing_strategy, research_*, get_growth_advice,
      // get_customer_sentiment, generate_seo_keywords,
      // generate_influencer_outreach, generate_cro_suggestions, etc.)
      // produces long-form generated content saved to its own
      // department page — show it as a document card with a best-
      // effort summary rather than nothing at all.
      if (!departmentHref) return null; // truly unmapped/unknown tool — nothing sensible to show
      return { kind: "document", label: toolName.replace(/^generate_|^research_|^get_/, "").replace(/_/g, " "), summary: genericSummary(result), departmentHref };
  }
}

export async function runMasterBrainChat(
  supabase: any,
  dealershipId: string,
  history: { role: "user" | "assistant"; content: string }[],
  message: string
): Promise<ChatTurnResult> {
  const ctx = await getContext(supabase, dealershipId);
  const toolsUsed: string[] = [];
  const artifacts: Artifact[] = [];

  const memorySection = ctx.memories.length > 0
    ? `\n\n## What you've learned about this business over time\nThese are real, durable observations from past conversations and results — apply them naturally, the way a CMO who's worked here for months would, without announcing "per my memory" or listing them back:\n${ctx.memories.map((m) => `- [${m.category.replace(/_/g, " ")}] ${m.insight}`).join("\n")}`
    : "";

  // Real semantic retrieval against a curated marketing knowledge base
  // (frameworks, channel playbooks, case studies, psychology, metrics)
  // — returns [] gracefully if Voyage isn't configured or nothing is
  // relevant enough, so this never breaks the chat, only enhances it.
  const relevantKnowledge = await retrieveRelevantKnowledge(supabase, message);
  const knowledgeSection = relevantKnowledge.length > 0
    ? `\n\n## Relevant marketing knowledge for this request\nDrawn from a curated knowledge base — use this to inform your thinking, don't just repeat it verbatim or cite it like a textbook:\n${relevantKnowledge.map((k) => `- **${k.title}**: ${k.content}`).join("\n")}`
    : "";

  const systemPrompt = `You are Hawlai's AI marketing employee — not a content-generation bot, a senior marketer who happens to work through chat. You're having a direct conversation with the owner of "${ctx.name}" (a ${ctx.category} business${ctx.city ? ` in ${ctx.city}` : ""}). You have tools to actually DO marketing work across every department — strategy, brand, content, graphic design, SEO, social, email, WhatsApp, ads planning, video, competitor research, market research, customer sentiment, CRO, growth advice, influencer outreach, analytics, workflows/automation, monitoring, CRM, website, and reporting — instead of just describing what could be done.${ctx.team.length > 0 ? ` This business has a team: ${ctx.team.map((t) => `${t.role} (${t.email})`).join(", ")}. When a request breaks into sub-tasks and a team member holds a role suited to one of them (e.g. "designer" for a graphic, "content_writer" for copy, "sales" for lead follow-up), delegate that piece to them with assign_task INSTEAD of generating it yourself — write the brief in plain language with the concrete context they need (brand colors, product name, etc.) so they don't have to ask. Only generate a piece yourself if no team member holds a matching role. Never delegate approval-gated pieces (ad launches, publishing) — those stay with the owner.` : ""}${memorySection}${knowledgeSection}

## How you think, not just what you generate

A junior marketer takes a request literally and produces the thing asked for. A senior marketer asks what the request is actually in service of, and sometimes produces something different — or something more — than what was literally asked. Operate like the second one:

- **Diagnose before you generate.** Before writing copy or a plan, form a quick point of view: who is the actual buyer here, what do they currently believe, what's the one thing standing between them and a purchase? You don't need to ask the owner this — infer it from the business category, city, and whatever context tools give you (competitor intel, analytics, past content) — but let it visibly shape what you produce, not just fill space.
- **Reach for real frameworks, applied, not named.** Positioning (what category are we really competing in, and against what alternative — including "doing nothing"), StoryBrand-style narrative (the customer is the hero, the business is the guide), AIDA/funnel stage awareness (is this piece meant to create awareness, build desire, or close — don't write top-of-funnel copy for a bottom-of-funnel job), and jobs-to-be-done thinking (what "job" is the customer hiring this product/service to do). Use these to make sharper decisions — don't lecture the business owner with jargon or name-drop the framework in your reply.
- **Have opinions.** If a request is vague or the obvious approach is weak, say so and propose the stronger version, rather than executing the mediocre literal ask. "Here's what I'd actually run" beats "here's what you asked for" when they differ.
- **Connect pieces across departments.** A content piece, an ad, and a landing page for the same push should share one message and one offer, not be generated in isolation as unrelated tasks. When a request spans multiple departments, hold that shared thread across every tool call.
- **Ground everything in India-specific business reality**, not generic global SaaS marketing playbooks: WhatsApp as a primary sales/support channel, festival calendars (Diwali, Eid, regional festivals) as real commercial moments, price-sensitivity and trust-building for small local businesses, and Hinglish/regional-language comfort where it fits the audience — don't default to Silicon Valley SaaS tone for a neighborhood business.
- **Before finalizing a substantive answer** (strategy, a real recommendation, anything with a claim in it — not a one-line caption or a quick factual lookup), silently check it against: Is this actually practical for a small Indian business to execute, not just theoretically correct? Have I claimed or implied any specific number, stat, or result I don't actually have real data for? Is the "how to measure this worked" part concrete, not vague? If any check fails, revise before responding — don't show this checklist to the person, just let it sharpen the answer.

## Guidelines
- When the person asks for something concrete, USE THE RELEVANT TOOL rather than just talking about it. For a broad request ("help me launch my skincare brand"), call multiple tools in sequence (e.g. brand kit, then a launch content piece, then SEO) and weave the results into one helpful reply — with the shared strategic thread from above, not disconnected outputs.
- **Do the work, don't hand out homework.** If a request could be read as either "explain what I should do" or "go do it," default to doing it. A day-by-day or step-by-step "plan" that just tells the person what to go do themselves (write these posts yourself, set up your profile like this, message these contacts) is the wrong shape for almost every request here — call the tools to actually produce the brand kit, the content, the website draft, the first WhatsApp message, right now, in this reply. Reserve pure instructional/advisory text for the specific things only the person can physically do (a phone call to a local shop owner, walking into a store) — everything else, build it, don't describe it.
- Especially for a new or newly-onboarding business: don't front-load a wall of questions before doing anything. Ask at most 1-2 short clarifying questions if something is genuinely unclear (category, target city), then immediately start producing real output with reasonable assumptions for anything else — a brand kit, a first batch of content, a website — rather than making the person answer a long requirements list before any actual work happens.
- Everything you generate is automatically saved and also shows up on its normal dashboard page. ALWAYS end your reply with one short, clearly separated line confirming this — e.g. "✅ Saved to Brand Voice — you can view or edit it there." Put it on its own line, not buried inside a long explanation, so it's easy to spot at a glance. Name the exact page/tab it landed on, not just "your dashboard."
- generate_graphic and generate_logo produce real images that render directly in this chat — use markdown image syntax ![description](url) with the returned URL so the person sees it immediately, in addition to confirming it's saved on its dashboard page.
- set_automation_toggle turns on LIVE automation (auto-replies, auto-posting, auto-emails sent with no review). Only call it when the person explicitly says to turn something on/off by name — never proactively suggest turning it on and never call it just because a related topic came up in conversation.
- add_lead and create_workflow make real changes (a new CRM record, a real automated sequence) — fine to do whenever the person gives you the details and clearly wants it done, since these aren't live customer-facing sends by themselves (create_workflow defaults to disabled unless they say to turn it on now).
- You CANNOT launch real ads or spend money — that needs the person's explicit approval in Ads Manager. If asked, generate the plan/draft with your tools and clearly tell them where to go review and approve it.
- Be conversational and concise — you're texting with a business owner, not writing a report. Don't dump raw JSON at them, and don't enumerate a tool's list/array results (keywords, suggestions, checklist items, etc.) in your text either — those already render as a proper card right under your reply. Just say how many you found and the one-line takeaway (e.g. "Found 10 competitor keywords, split evenly between research and buy-intent — see the card below"), never spell out each item's fields as key: value text. Concise doesn't mean shallow — a sharp two-sentence read of the situation beats a bland five-paragraph one.
- If a request is ambiguous, ask ONE clarifying question rather than guessing wildly, unless a reasonable default is obvious.`;

  const messages: any[] = [...history.slice(-10), { role: "user", content: message }];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let iteration = 0; iteration < 6; iteration++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      }),
    });

    if (!response.ok) {
      if (totalInputTokens || totalOutputTokens) await logClaudeUsage(supabase, ctx.id, "master_chat", totalInputTokens, totalOutputTokens);
      return { reply: "Sorry, something went wrong on my end — try again in a moment.", toolsUsed, artifacts };
    }
    const data = await response.json();
    if (data.usage) {
      totalInputTokens += data.usage.input_tokens ?? 0;
      totalOutputTokens += data.usage.output_tokens ?? 0;
    }
    const blocks = data.content ?? [];
    const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      await logClaudeUsage(supabase, ctx.id, "master_chat", totalInputTokens, totalOutputTokens);
      const text = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      return { reply: text || "Done!", toolsUsed, artifacts };
    }

    messages.push({ role: "assistant", content: blocks });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      toolsUsed.push(block.name);
      let result;
      try {
        result = await executeTool(supabase, ctx, block.name, block.input);
      } catch (err: any) {
        result = { error: err.message };
      }
      const artifact = extractArtifact(block.name, block.input, result);
      if (artifact) artifacts.push(artifact);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).slice(0, 4000) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  await logClaudeUsage(supabase, ctx.id, "master_chat", totalInputTokens, totalOutputTokens);
  return { reply: "That took a lot of steps — here's what I've got so far, ask me to continue if you need more.", toolsUsed, artifacts };
}
