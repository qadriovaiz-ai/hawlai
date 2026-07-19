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
import { getCampaignPerformance } from "./analyticsAgent";
import { generateGrowthReport } from "./growthAdvisorAgent";
import { generateDeepStrategy } from "./deepStrategyAgent";
import { generateSeoIdeas } from "./seoAgent";
import { generateGraphic, GRAPHIC_TYPES } from "./graphicDesignAgent";
import { randomBytes } from "crypto";

interface DealershipCtx {
  id: string;
  name: string;
  category: string;
  city: string | null;
  toneOfVoice: string | null;
}

async function getContext(supabase: any, dealershipId: string): Promise<DealershipCtx> {
  const [{ data: d }, { data: bp }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
  ]);
  return {
    id: dealershipId,
    name: d?.dealership_name ?? "the business",
    category: d?.business_category ?? "business",
    city: d?.city ?? null,
    toneOfVoice: bp?.tone_of_voice ?? null,
  };
}

// ---- Tool definitions (Claude tool-use schema) ----

const TOOLS = [
  {
    name: "generate_brand_kit",
    description: "Generate the business's brand identity kit: colors, typography, tagline, mission, vision, brand story, social bios, guidelines. Use when the person wants to build/establish their brand identity from scratch or refresh it.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generate_content",
    description: `Generate a marketing content piece. Valid contentType values: ${CONTENT_TYPES.map((t) => t.key).join(", ")}. Use for social posts, blogs, newsletters, sales sequences, hooks, CTAs, content calendars.`,
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
    description: `Generate an actual AI image (ad creative, social graphic, banner, poster, logo-style asset, product photo, etc) and save it to Graphic Design. Valid designType values: ${GRAPHIC_TYPES.map((t) => t.key).join(", ")}. Note: you cannot display the image inline in chat — tell the person it's saved and they can view/download it on the Graphic Design page.`,
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
    description: "Turn a real automation ON or OFF. Only do this when the person explicitly asks to enable/disable/turn on/turn off a specific automation — never proactively. Valid toggle values: dm_auto_reply (auto-reply to Instagram/FB DMs), comment_auto_reply (auto-reply to post comments), welcome_email (auto welcome email for new leads), follow_up_email (auto follow-up for inactive leads), content_autopilot (auto-generate + auto-post to Facebook on a schedule).",
    input_schema: { type: "object", properties: { toggle: { type: "string", enum: ["dm_auto_reply", "comment_auto_reply", "welcome_email", "follow_up_email", "content_autopilot"] }, enabled: { type: "boolean" } }, required: ["toggle", "enabled"] },
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
    name: "add_lead",
    description: "Manually add a new lead to the CRM. Use when the person gives you a name and phone number to add (e.g. someone they met offline).",
    input_schema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, notes: { type: "string" } }, required: ["name", "phone"] },
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
  switch (toolName) {
    case "generate_brand_kit": {
      const kit = await generateBrandKit(ctx.name, ctx.city, { tone_of_voice: ctx.toneOfVoice }, ctx.category);
      if (!(kit as any)._fallback) await supabase.from("brand_kits").upsert({ dealership_id: ctx.id, kit, updated_at: new Date().toISOString() }, { onConflict: "dealership_id" });
      return kit;
    }
    case "generate_content": {
      const { output, _fallback } = await generateContent(input.contentType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice, messaging_pillars: [] });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "content_pieces", { content_type: input.contentType, topic: input.topic ?? "", output });
      return output;
    }
    case "generate_seo": {
      const { output, _fallback } = await generateSeoTask(input.taskType, ctx.name, ctx.city, ctx.category, { tone_of_voice: ctx.toneOfVoice });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "seo_toolkit_items", { task_type: input.taskType, output });
      return output;
    }
    case "generate_social_management": {
      const { output, _fallback } = await generateSocialTask(input.taskType, ctx.name, ctx.category, input.inputText ?? "", { tone_of_voice: ctx.toneOfVoice });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "social_management_items", { task_type: input.taskType, input_text: input.inputText ?? "", output });
      return output;
    }
    case "generate_email": {
      const { output, _fallback } = await generateEmailContent(input.taskType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "email_marketing_pieces", { task_type: input.taskType, topic: input.topic ?? "", output });
      return output;
    }
    case "generate_whatsapp": {
      const { output, _fallback } = await generateWhatsappContent(input.taskType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "whatsapp_marketing_pieces", { task_type: input.taskType, topic: input.topic ?? "", output });
      return output;
    }
    case "generate_ad_plan": {
      const { output, _fallback } = await generateAdPlan(input.platform, input.taskType, ctx.name, ctx.category, { tone_of_voice: ctx.toneOfVoice });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "paid_ads_plans", { platform: input.platform, task_type: input.taskType, output });
      return output;
    }
    case "generate_video_task": {
      const { output, _fallback } = await generateVideoTask(input.taskType, ctx.name, ctx.category, input.topic ?? "", { tone_of_voice: ctx.toneOfVoice });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "video_marketing_pieces", { task_type: input.taskType, topic: input.topic ?? "", output });
      return output;
    }
    case "research_competitor": {
      const { output, _fallback } = await generateCompetitorIntel(input.taskType, input.competitorName, ctx.name, ctx.category);
      if (!_fallback) await saveGenerated(supabase, ctx.id, "competitor_intel_items", { task_type: input.taskType, competitor_name: input.competitorName, output });
      return output;
    }
    case "research_market": {
      const { output, _fallback } = await generateResearch(input.taskType, ctx.name, ctx.category, ctx.city);
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
      });
      if (!_fallback) await saveGenerated(supabase, ctx.id, "cro_items", { task_type: input.taskType, output });
      return output;
    }
    case "get_growth_advice": {
      if (input.kind === "forecast") return computeRevenueForecast(supabase, ctx.id, ctx.name, ctx.category);
      if (input.kind === "opportunities") {
        const { data: leads } = await supabase.from("leads").select("status, source").eq("dealership_id", ctx.id).limit(300);
        const all = leads ?? [];
        const byStatus: Record<string, number> = {};
        for (const l of all) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
        const { output } = await generateGrowthOpportunities(ctx.name, ctx.category, `Total leads: ${all.length}. By status: ${JSON.stringify(byStatus)}.`);
        return output;
      }
      if (input.kind === "budget") {
        const performance = await getCampaignPerformance(supabase, ctx.id);
        const context = performance.campaigns.length > 0 ? performance.campaigns.map((c) => `${c.headline}: spend ₹${c.spend}, leads ${c.leads}, revenue ₹${c.revenue}`).join("\n") : "No campaign data yet.";
        const { output } = await generateBudgetRecommendations(ctx.name, ctx.category, context);
        return output;
      }
      const growth = await generateGrowthReport(supabase, ctx.id, ctx.category);
      const { output } = await generateExpansionStrategy(ctx.name, ctx.category, ctx.city, growth.healthScore, `Health score: ${growth.healthScore}/100. Risks: ${growth.risks.join("; ") || "none"}.`);
      return output;
    }
    case "generate_influencer_outreach": {
      return generateInfluencerPlan(input.productOrService, ctx.city, { tone_of_voice: ctx.toneOfVoice }, ctx.category);
    }
    case "get_analytics_summary": {
      const performance = await getCampaignPerformance(supabase, ctx.id);
      return performance;
    }
    case "generate_marketing_strategy": {
      const { data: competitorRows } = await supabase.from("competitor_intel_items").select("competitor_name, output").eq("dealership_id", ctx.id).limit(3);
      const competitorContext = (competitorRows ?? []).length > 0 ? JSON.stringify(competitorRows) : null;
      const strategy = await generateDeepStrategy(ctx.name, ctx.city, { tone_of_voice: ctx.toneOfVoice }, ctx.category, competitorContext);
      if (!(strategy as any)._fallback) await supabase.from("deep_strategies").upsert({ dealership_id: ctx.id, strategy, updated_at: new Date().toISOString() }, { onConflict: "dealership_id" });
      return strategy;
    }
    case "generate_seo_keywords": {
      if (input.writeFullBlogPost) {
        const { generateBlogPost } = await import("./seoAgent");
        return generateBlogPost(input.topic, ctx.city, ctx.category);
      }
      return generateSeoIdeas(input.topic, ctx.city, ctx.category);
    }
    case "generate_graphic": {
      try {
        const buffer = await generateGraphic(input.designType, ctx.name, ctx.category, input.prompt ?? "", { tone_of_voice: ctx.toneOfVoice });
        const { createServiceClient } = await import("../supabase/service");
        const serviceClient = createServiceClient();
        const filePath = `graphic-designs/${ctx.id}/${input.designType}-${Date.now()}.png`;
        await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "image/png", upsert: true });
        const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
        await supabase.from("graphic_designs").insert({ dealership_id: ctx.id, design_type: input.designType, prompt: input.prompt ?? "", image_url: publicUrlData.publicUrl });
        return { success: true, imageUrl: publicUrlData.publicUrl, note: "Saved to Graphic Design — the person can view/download it there, you cannot show the image inline." };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case "get_customer_sentiment": {
      const { data: leads } = await supabase.from("leads").select("qualification_reason, lead_temperature, status").eq("dealership_id", ctx.id).limit(200);
      const { output } = await generateSentimentFromLeads(ctx.name, ctx.category, (leads ?? []).map((l: any) => ({ qualificationReason: l.qualification_reason, temperature: l.lead_temperature, status: l.status })));
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
        content_autopilot: "content_autopilot_enabled",
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
    case "add_lead": {
      const { data, error } = await supabase.from("leads").insert({ dealership_id: ctx.id, name: input.name, phone: input.phone, email: input.email ?? null, source: "manual_chat", qualification_reason: input.notes ?? null }).select().single();
      if (error) return { error: error.message };
      return { success: true, leadId: data.id };
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
}

export async function runMasterBrainChat(
  supabase: any,
  dealershipId: string,
  history: { role: "user" | "assistant"; content: string }[],
  message: string
): Promise<ChatTurnResult> {
  const ctx = await getContext(supabase, dealershipId);
  const toolsUsed: string[] = [];

  const systemPrompt = `You are Hawlai's AI marketing assistant, having a direct conversation with the owner of "${ctx.name}" (a ${ctx.category} business${ctx.city ? ` in ${ctx.city}` : ""}). You have tools to actually DO marketing work across every department — strategy, brand, content, graphic design, SEO, social, email, WhatsApp, ads planning, video, competitor research, market research, customer sentiment, CRO, growth advice, influencer outreach, analytics, workflows/automation, monitoring, CRM, website, and reporting — instead of just describing what could be done.

Guidelines:
- When the person asks for something concrete, USE THE RELEVANT TOOL rather than just talking about it. For a broad request ("help me launch my skincare brand"), call multiple tools in sequence (e.g. brand kit, then a launch content piece, then SEO) and weave the results into one helpful reply.
- Everything you generate is automatically saved and also shows up on its normal dashboard page — you don't need to tell the person to go save it, just mention where they can find/edit it if relevant (e.g. "you'll find this under Brand Building too").
- generate_graphic produces a real image but you cannot display it inline — tell the person it's ready on the Graphic Design page.
- set_automation_toggle turns on LIVE automation (auto-replies, auto-posting, auto-emails sent with no review). Only call it when the person explicitly says to turn something on/off by name — never proactively suggest turning it on and never call it just because a related topic came up in conversation.
- add_lead and create_workflow make real changes (a new CRM record, a real automated sequence) — fine to do whenever the person gives you the details and clearly wants it done, since these aren't live customer-facing sends by themselves (create_workflow defaults to disabled unless they say to turn it on now).
- You CANNOT launch real ads or spend money — that needs the person's explicit approval in Ads Manager. If asked, generate the plan/draft with your tools and clearly tell them where to go review and approve it.
- Be conversational and concise — you're texting with a business owner, not writing a report. Don't dump raw JSON at them; summarize the useful parts in plain language.
- If a request is ambiguous, ask ONE clarifying question rather than guessing wildly, unless a reasonable default is obvious.`;

  const messages: any[] = [...history.slice(-10), { role: "user", content: message }];

  for (let iteration = 0; iteration < 6; iteration++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      }),
    });

    if (!response.ok) {
      return { reply: "Sorry, something went wrong on my end — try again in a moment.", toolsUsed };
    }
    const data = await response.json();
    const blocks = data.content ?? [];
    const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const text = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      return { reply: text || "Done!", toolsUsed };
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
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).slice(0, 4000) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: "That took a lot of steps — here's what I've got so far, ask me to continue if you need more.", toolsUsed };
}
