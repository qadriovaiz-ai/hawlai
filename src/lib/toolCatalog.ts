// ============================================================================
// Hawlai Tool Catalog — powers /dashboard/tools (the "Tool Marketplace")
// ============================================================================
// Hand-curated consumer-facing copy — masterBrainV2.ts's tool `description`
// fields are written for Claude's tool-calling, not for a browsable card.
//
// Every `route` is cross-checked against DEPARTMENT_HREF in masterBrainV2.ts
// (the map the app already uses for "open in department" links from chat
// results) so this doesn't become a second, independently-drifting source of
// truth. Two exceptions, deliberately: `research_market` and
// `get_customer_sentiment` point at /dashboard/research-agent here, not at
// DEPARTMENT_HREF's /dashboard/research and /dashboard/insights — those two
// are confirmed-wrong deep-links (the real UI lives at /dashboard/research-agent,
// which itself isn't linked from anywhere else in the app). Worth fixing in
// masterBrainV2.ts too as a follow-up; not done here since that's a separate,
// already-shipped file this task didn't touch.
//
// 41 entries have a real `id` matching a tool name in masterBrainV2.ts's
// TOOLS array (manage_watch appears as two catalog entries — competitor vs
// topic watches — since it's one tool with meaningfully different use cases
// depending on its `kind` argument). The remaining 5 are real capabilities
// with no Master Chat tool at all (kind: "page") — included because a
// marketplace that only showed chat-callable tools would hide real,
// sometimes-premium capability. Pure account/settings surfaces (Billing,
// Integrations, Team, Approvals, Assets, etc.) are deliberately excluded —
// this is an AI-capability marketplace, not a sitemap.

import type { KillSwitchFeature } from "@/lib/featureFlags";

export type ToolKind = "chat" | "page" | "both";

export interface ToolCatalogEntry {
  // Matches a real masterBrainV2.ts tool name where one exists. For the 5
  // page-only extras this is a catalog-only identifier (not callable via
  // chat), noted per-entry below.
  id: string;
  label: string;
  description: string;
  department: string;
  kind: ToolKind;
  // Always populated — every real tool has a real deep-link (see header
  // comment for the 2 deliberate exceptions). For "chat" kind, this is a
  // secondary "open department" link; the card's primary click opens chat.
  route: string;
  // GatedFeatureKey from src/lib/plans.ts, or null if ungated (including
  // ungated-but-quantity-capped — see capResource).
  gateKey: string | null;
  // GenerationResource from src/lib/usage/generationLimits.ts, for tools
  // capped by a monthly quantity instead of a tier boolean. Not enforced by
  // the marketplace UI yet (Phase C) — stored now so that phase doesn't need
  // another pass through all 46 entries.
  capResource: string | null;
  // KillSwitchFeature from src/lib/featureFlags.ts — set when the tool
  // is switched off product-wide. Separate from gateKey because this
  // isn't about the customer's plan: a tool with a killSwitch is hidden
  // from the marketplace entirely rather than shown locked, since
  // there's nothing they could buy to unlock it.
  killSwitch?: KillSwitchFeature;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  // ─── Leads & CRM ─────────────────────────────────────────────────────────
  { id: "trigger_call", label: "AI Caller", description: "Places a live AI phone call to any lead with a number on file.", department: "Leads & CRM", kind: "both", route: "/dashboard/calls", gateKey: null, capResource: null },
  { id: "add_lead", label: "Lead Capture", description: "Add a new lead — name, phone, email — straight into your pipeline.", department: "Leads & CRM", kind: "both", route: "/dashboard/leads-hub", gateKey: null, capResource: null },
  { id: "assign_lead", label: "Lead Assignment", description: "Assign a lead to the right sales rep on your team.", department: "Leads & CRM", kind: "both", route: "/dashboard/leads-hub", gateKey: null, capResource: null },
  { id: "get_follow_up_reminders", label: "Follow-up Reminders", description: "Surfaces stale leads and today's booked appointments.", department: "Leads & CRM", kind: "chat", route: "/dashboard/leads-hub", gateKey: null, capResource: null },
  { id: "get_booking_link", label: "Booking Link", description: "Your shareable appointment-booking link, ready to send.", department: "Leads & CRM", kind: "both", route: "/dashboard/appointments", gateKey: null, capResource: null },

  // ─── Content Marketing ───────────────────────────────────────────────────
  { id: "generate_content", label: "Content Generator", description: "Instagram posts, carousels, blogs, hooks — 20 content types.", department: "Content Marketing", kind: "both", route: "/dashboard/content-marketing", gateKey: null, capResource: null },

  // ─── SEO ─────────────────────────────────────────────────────────────────
  { id: "generate_seo", label: "SEO Toolkit", description: "Meta tags, schema markup, local SEO, AEO visibility checks.", department: "SEO", kind: "both", route: "/dashboard/seo", gateKey: null, capResource: null },
  { id: "generate_seo_keywords", label: "SEO Keywords & Blog", description: "Keyword research, or a full SEO blog post on request.", department: "SEO", kind: "both", route: "/dashboard/seo", gateKey: null, capResource: null },

  // ─── Social Media ────────────────────────────────────────────────────────
  { id: "generate_social_management", label: "Social Management", description: "Reply suggestions, DM automation, viral trend spotting.", department: "Social Media", kind: "both", route: "/dashboard/social", gateKey: null, capResource: null },

  // ─── Email Marketing ─────────────────────────────────────────────────────
  { id: "generate_email", label: "Email Composer", description: "Subject, preview text and body — single sends or sequences.", department: "Email Marketing", kind: "both", route: "/dashboard/email", gateKey: null, capResource: null },
  { id: "send_email", label: "Send Email", description: "Sends a drafted email to a lead or contact immediately.", department: "Email Marketing", kind: "chat", route: "/dashboard/email", gateKey: null, capResource: null },

  // ─── WhatsApp Marketing ──────────────────────────────────────────────────
  { id: "generate_whatsapp", label: "WhatsApp Composer", description: "Single messages, chatbot flows, nurture sequences.", department: "WhatsApp Marketing", kind: "both", route: "/dashboard/whatsapp", gateKey: null, capResource: null },
  // Not a masterBrainV2 tool — real live auto-reply feature, page-only.
  { id: "whatsapp_automation", label: "WhatsApp Automation", description: "Live automated replies to incoming WhatsApp messages.", department: "WhatsApp Marketing", kind: "page", route: "/dashboard/settings/integrations", gateKey: "whatsappAutomation", capResource: null },

  // ─── Paid Ads ────────────────────────────────────────────────────────────
  { id: "generate_ad_plan", label: "Ad Plan Generator", description: "Campaign strategy grounded in your real spend and results.", department: "Paid Ads", kind: "both", route: "/dashboard/paid-ads", gateKey: null, capResource: null },
  { id: "create_product_ad", label: "Product Ad Creator", description: "Turns an uploaded product photo into a finished ad creative.", department: "Paid Ads", kind: "both", route: "/design-editor", gateKey: null, capResource: null },
  { id: "edit_canvas_design", label: "Design Editor", description: "Edit any existing ad creative or canvas design by instruction.", department: "Paid Ads", kind: "both", route: "/design-editor", gateKey: null, capResource: null },
  // Not a masterBrainV2 tool — real Meta ad launch, deliberately excluded from
  // chat by design (spends real money). Page-only.
  { id: "meta_ad_launch", label: "Meta Ads Manager", description: "Launch, monitor and manage live campaigns on Meta.", department: "Paid Ads", kind: "page", route: "/dashboard/ads/campaigns", gateKey: null, capResource: null },

  // ─── Video Marketing ─────────────────────────────────────────────────────
  { id: "generate_video_task", label: "Video Scripts & Ideas", description: "Reel scripts, video ideas, subtitles, B-roll suggestions.", department: "Video Marketing", kind: "both", route: "/dashboard/video-marketing", gateKey: null, capResource: null },
  { id: "publish_to_youtube", label: "YouTube Publisher", description: "Uploads your most recent ready video straight to YouTube.", department: "Video Marketing", kind: "both", route: "/dashboard/video-marketing", gateKey: null, capResource: null },
  // Not a masterBrainV2 tool — real Veo video / ElevenLabs voiceover
  // generation, Creative Studio, page-only.
  // Split from one "Video & Voiceover Studio" card into two. They share
  // a page but only video is switched off, and a single card would have
  // to either vanish (hiding working voiceover) or keep a name promising
  // video it no longer does. Two entries let each follow its own flag,
  // so re-enabling the switch restores the video card with no code edit.
  { id: "video_generation", label: "AI Video Studio", description: "Real AI video generation, ready to publish.", department: "Video Marketing", kind: "page", route: "/dashboard/creative-studio", gateKey: null, capResource: "video", killSwitch: "videoGeneration" },
  { id: "voiceover_generation", label: "Voiceover Studio", description: "AI voiceover for your scripts, reels and ads.", department: "Video Marketing", kind: "page", route: "/dashboard/creative-studio", gateKey: null, capResource: "voiceover_chars" },

  // ─── Competitor Intel ────────────────────────────────────────────────────
  { id: "research_competitor", label: "Competitor Research", description: "Live web research on a named competitor's moves.", department: "Competitor Intel", kind: "both", route: "/dashboard/competitor-intel", gateKey: "competitorIntel", capResource: null },
  { id: "manage_watch_competitor", label: "Competitor Watchlist", description: "Track a competitor and get notified when something changes.", department: "Competitor Intel", kind: "both", route: "/dashboard/competitor-intel", gateKey: "competitorIntel", capResource: null },

  // ─── Research Agent ──────────────────────────────────────────────────────
  // route deliberately not DEPARTMENT_HREF's value — see header comment.
  { id: "research_market", label: "Market Research", description: "Industry trends, market sizing, new opportunity spotting.", department: "Research Agent", kind: "chat", route: "/dashboard/research-agent", gateKey: null, capResource: null },
  { id: "get_customer_sentiment", label: "Customer Sentiment", description: "What your own leads are saying — themes, concerns, tone.", department: "Research Agent", kind: "chat", route: "/dashboard/research-agent", gateKey: null, capResource: null },
  { id: "manage_watch_topic", label: "Topic Watchlist", description: "Follow a topic and get daily news alerts on it.", department: "Research Agent", kind: "both", route: "/dashboard/research-agent", gateKey: null, capResource: null },

  // ─── Growth Advisor ──────────────────────────────────────────────────────
  { id: "get_growth_advice", label: "Growth Advisor", description: "Forecasts, opportunities, budget and expansion advice.", department: "Growth Advisor", kind: "both", route: "/dashboard/growth-advisor", gateKey: "growthAdvisor", capResource: null },

  // ─── CRO ─────────────────────────────────────────────────────────────────
  { id: "generate_cro_suggestions", label: "CRO Suggestions", description: "Landing page, CTA, form and UX improvement ideas.", department: "CRO", kind: "both", route: "/dashboard/cro", gateKey: "cro", capResource: null },
  { id: "update_landing_page", label: "Landing Page Editor", description: "Update your landing page's headline, offer or subheadline.", department: "CRO", kind: "both", route: "/dashboard/website-builder", gateKey: null, capResource: null },

  // ─── Influencer Marketing ────────────────────────────────────────────────
  { id: "generate_influencer_outreach", label: "Influencer Outreach", description: "Outreach message, search terms and collab ideas — ready to send.", department: "Influencer Marketing", kind: "both", route: "/dashboard/influencer-marketing", gateKey: "influencerMarketing", capResource: null },
  // Not a masterBrainV2 tool — real influencer relationship tracking, page-only.
  { id: "influencer_crm", label: "Influencer CRM", description: "Track influencer relationships and collabs in one place.", department: "Influencer Marketing", kind: "page", route: "/dashboard/influencer-marketing", gateKey: "influencerMarketing", capResource: null },

  // ─── Retargeting ─────────────────────────────────────────────────────────
  { id: "generate_retargeting_copy", label: "Retargeting Copy", description: "Copy for abandoned-cart, cold-lead and lapsed-buyer segments.", department: "Retargeting", kind: "both", route: "/dashboard/retargeting", gateKey: "retargeting", capResource: null },

  // ─── 3D Studio ───────────────────────────────────────────────────────────
  { id: "generate_3d_scene", label: "3D Studio", description: "Turns a text prompt into an interactive 3D product scene.", department: "3D Studio", kind: "both", route: "/dashboard/3d-studio", gateKey: "threeDStudio", capResource: null, killSwitch: "studio3d" },

  // ─── Brand Kit ───────────────────────────────────────────────────────────
  { id: "generate_brand_kit", label: "Brand Kit", description: "Colours, typography, tagline, mission and brand story.", department: "Brand Kit", kind: "both", route: "/dashboard/brand-building", gateKey: null, capResource: "brand_kit" },
  { id: "generate_logo", label: "Logo Generator", description: "A logo derived from your stored brand tone and colours.", department: "Brand Kit", kind: "both", route: "/dashboard/brand-building", gateKey: null, capResource: "image" },

  // ─── Graphic Design ──────────────────────────────────────────────────────
  { id: "generate_graphic", label: "Graphic Design", description: "On-brand ad creatives, thumbnails, posters — 13 formats.", department: "Graphic Design", kind: "both", route: "/dashboard/graphic-design", gateKey: null, capResource: "image" },

  // ─── Website Builder ─────────────────────────────────────────────────────
  { id: "build_website", label: "Website Builder", description: "Builds a multi-page website from a description of your business.", department: "Website Builder", kind: "both", route: "/dashboard/website-builder", gateKey: null, capResource: "website_build" },
  { id: "add_product", label: "Add Product", description: "Add a product with price, description and inventory count.", department: "Website Builder", kind: "both", route: "/dashboard/website-builder", gateKey: null, capResource: null },
  { id: "create_discount_code", label: "Discount Codes", description: "Create a live discount code for your storefront.", department: "Website Builder", kind: "both", route: "/dashboard/website-builder", gateKey: null, capResource: null },

  // ─── Marketing Strategy ──────────────────────────────────────────────────
  { id: "generate_marketing_strategy", label: "Marketing Strategy", description: "A SWOT-based positioning plan from your business context.", department: "Marketing Strategy", kind: "both", route: "/dashboard/strategy", gateKey: null, capResource: null },

  // ─── Analytics & Reporting ───────────────────────────────────────────────
  { id: "get_analytics_summary", label: "Analytics Summary", description: "Campaign totals — spend, leads, cost-per-lead — in one view.", department: "Analytics & Reporting", kind: "both", route: "/dashboard/analytics", gateKey: null, capResource: null },
  { id: "get_website_analytics", label: "Website Analytics", description: "Views, chat opens, form submits, conversion rate.", department: "Analytics & Reporting", kind: "both", route: "/dashboard/analytics", gateKey: null, capResource: null },
  // gateKey null reflects real (arguably buggy) current enforcement: the
  // schema has a businessReports plan_limits column, but it's not part of
  // the GatedFeatureKey union, so hasFeature() can never check it — every
  // plan gets this today regardless of tier. Flagged in the earlier audit,
  // not fixed here.
  { id: "get_report_links", label: "Reports", description: "Download or share a formatted business performance report.", department: "Analytics & Reporting", kind: "both", route: "/dashboard/reports", gateKey: null, capResource: null },

  // ─── Automation / Workflows ──────────────────────────────────────────────
  { id: "create_workflow", label: "Automation Workflows", description: "Multi-step workflows with delays, emails and custom tasks.", department: "Automation", kind: "both", route: "/dashboard/marketing-automation", gateKey: "marketingAutomationWorkflows", capResource: null },
  // route deliberately not DEPARTMENT_HREF's generic /dashboard/settings —
  // the real dedicated UI is the Autopilot command centre.
  { id: "set_automation_toggle", label: "Automation Settings", description: "Turn auto-reply, welcome emails and content autopilot on or off.", department: "Automation", kind: "both", route: "/dashboard/autopilot", gateKey: "marketingAutomationWorkflows", capResource: null },

  // ─── Business Memory ─────────────────────────────────────────────────────
  { id: "remember_insight", label: "Business Memory", description: "Save a durable fact about your business for future use.", department: "Business Memory", kind: "both", route: "/dashboard/business-memory", gateKey: null, capResource: null },

  // ─── Team / Task Delegation ──────────────────────────────────────────────
  { id: "assign_task", label: "Task Delegation", description: "Assign a task to a team member with a brief and deadline.", department: "Team", kind: "both", route: "/dashboard/tasks", gateKey: null, capResource: null },
];

export const TOOL_DEPARTMENTS: string[] = Array.from(new Set(TOOL_CATALOG.map((t) => t.department)));
