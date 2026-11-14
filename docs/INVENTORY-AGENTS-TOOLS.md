# Every agent file and every Master Chat tool

**Generated from the code on 14 November 2026**, not from memory: the
names and the one-line purposes are read out of the files themselves.
Regenerating it means re-running the walk, not re-reading the repo by
hand.

## Counts

| | |
|---|---|
| Agent files (`src/lib/agents/*.ts`) | **67** |
| ...of them unreachable (imported by nothing) | **0** |
| Master Chat tools (`toolSchemas.ts`) | **60** |
| ...of them with no `case` in `executeTool` | **0** |

Checked by resolving every `from "…"` and `import("…")` in `src/`,
including relative ones. **My first pass reported two orphans and was
wrong** — it matched only the `agents/<name>` form and missed
`./complianceValidation`. Corrected before this was written.

---

## The three "removed features" — none of them is removed

The ask named video generation and business story as removed. They are
not, and neither is the 3D Studio the same plan replaced on paper:

| Said to be gone | What is actually there |
|---|---|
| **Video generation (Veo)** | `src/app/api/creative/video/generate/route.ts`, `src/app/api/creative/video/[id]/status/route.ts`, `src/lib/agents/videoAgent.ts` ("Video Agent - Phase 4 (Veo)"), `src/lib/videoModels/veoDirectAdapter.ts`, and the Creative Studio page. All present |
| **3D Studio** | `src/app/dashboard/3d-studio/`, a nav entry in `src/lib/navTree.ts:170`, `threeDAgent.ts`, and the live chat tool `generate_3d_scene` |
| **Business story** | `business_story` is one of the six live `KNOWLEDGE_CATEGORIES` (`src/lib/knowledge/noteShape.ts:30`, migration 189), has an active consent gate in `src/lib/claims/personalStories.ts`, and **two live chat tools** |

The Canva work was described as *replacing* Veo video generation and
the 3D Studio. **That replacement was planned, not carried out** - both
still have routes, agents, pages and nav entries. Nothing here is dead
code; it is live code for features someone believed were gone, which is
a worse state than either.

---

## What is genuinely duplicated

**One real smell:** `growthAdvisorAgent` and `growthAdvisorV2` are both
imported by the **same route**, `src/app/api/growth-advisor/generate/route.ts`,
and both by `masterBrainV2`. Two advisors answering in one place is the
shape the V1/V2 pairs below avoid.

**One legacy V1 still reachable:** `croAgent` is imported only by
`src/app/api/cro/route.ts`. Chat and `/api/cro/generate` use
`croAgentV2`. The old route is the only thing keeping it alive.

**One agent with a single consumer:** `videoAgent` is imported only by
`src/lib/videoModels/veoDirectAdapter.ts` - the Veo path above.

**Not duplicates, though they read like it.** These pairs say so in
their own headers - the second covers what the first does not:

- `seoAgent` / `seoToolkitAgent` / `seoPageAgent`
- `contentAgent` / `contentMarketingAgent`
- `socialMediaAgent` / `socialManagementAgent`
- `strategyAgent` / `deepStrategyAgent`
- `analyticsAgent` / `businessIntelligenceAgent`
- `websiteAgent` (landing-page copy) / `websiteBuilderAgent` (the multi-page builder)
- `brandVoice` (the profile) / `brandVoiceValidation` (checking copy against it)

All three exports of `brandVoiceValidation` are used - checked one by
one, because "only reached from another agent" is not the same as dead.

---

## Agent files (67)

| # | File | Purpose, from its own header | Lines |
|---|---|---|---|
| 1 | `aeoAgent` | AEO/GEO Agent - Answer Engine Optimization check, the 9th SEO task. | 184 |
| 2 | `agencyBrandingAgent` | Agency white-labelling for client-facing reports - master audit | 73 |
| 3 | `analyticsAgent` | Analytics Agent - Phase 1 basic version | 403 |
| 4 | `autopilotAgent` | Autopilot Agent - daily prep, never auto-execute | 360 |
| 5 | `brandBuildingAgent` | Brand Building Agent | 169 |
| 6 | `brandKitAgent` | Brand Kit Agent - Phase 4 | 131 |
| 7 | `brandVoice` | Brand Voice Profile - Phase 3 | 131 |
| 8 | `brandVoiceValidation` | Brand Voice consistency validation - Phase 3, Task 4 | 112 |
| 9 | `budgetAlertAgent` | Campaign budget-overrun alerts - master audit Part B, Phase 2. | 88 |
| 10 | `businessIntelligenceAgent` | Business Intelligence Agent - Phase 1 | 197 |
| 11 | `callScoringAgent` | Post-call lead scoring - the authoritative score. | 111 |
| 12 | `callScriptAgent` | Builds a genuinely business-specific calling script - real | 181 |
| 13 | `campaignEditAgent` | Campaign Edit Agent - conversational campaign editing | 209 |
| 14 | `campaignGroupAgent` | Cross-channel orchestration, Phase A (master audit deferred Item 3 | 122 |
| 15 | `chatbotAgent` | AI Sales Agent - upgraded from the original FAQ-only chatbot. | 230 |
| 16 | `churnAgent` | Churn/at-risk detection - master audit Part B. | 98 |
| 17 | `coldLeadAgent` | Cold-lead detection - master audit Part B. | 52 |
| 18 | `competitorIntelAgent` | Competitor Intelligence Agent - Competitor Ads tracking already | 235 |
| 19 | `complianceValidation` | Advertising-claim compliance validation - master audit Part C1.1 | 78 |
| 20 | `contentAgent` | Content Agent - Phase 1 expansion | 184 |
| 21 | `contentMarketingAgent` | Content Marketing Agent - covers all 20 tasks in one flexible | 499 |
| 22 | `creativeAgent` | Creative Agent - Phase 1 expansion | 282 |
| 23 | `croAgent` | CRO Agent (Conversion Rate Optimization) - the Page Health Check | 99 |
| 24 | `croAgentV2` | Website CRO suggestions, built from the real live site and checked | 89 |
| 25 | `deepStrategyAgent` | Deep Strategy Agent - completes the Marketing Strategy department | 167 |
| 26 | `emailMarketingAgent` | Email Marketing Agent - covers 7 of the 9 requested tasks as | 147 |
| 27 | `gmailAgent` | Gmail Agent - real email sending via the dealer's own Gmail | 130 |
| 28 | `goalPlanningAgent` | Goal Planning Agent - P1 Wave 4 (8a) | 104 |
| 29 | `graphicDesignAgent` | Graphic Design Agent - covers all 13 tasks (ad creatives, Instagram | 87 |
| 30 | `growthAdvisorAgent` | CEO Growth Advisor Agent | 155 |
| 31 | `growthAdvisorV2` | AI Growth Advisor. | 184 |
| 32 | `influencerAgent` | Influencer Outreach Agent | 78 |
| 33 | `leadScoringAgent` | AI-Intelligence Pillar 3 - predicted lead conversion score. | 108 |
| 34 | `masterBrainV2` | Master Brain V2 - tool-calling conversational orchestrator. | 4585 |
| 35 | `opportunityAgent` | Opportunity Agent - "push, not pull" | 317 |
| 36 | `optimizationAgent` | Optimization Agent - Phase 2 basic version | 120 |
| 37 | `paidAdsAgent` | Paid Advertising Planning Agent - for the 5 platforms without a | 148 |
| 38 | `personas` | Agent Personas - Multi-Agent Workforce, P3 piece 5 | 123 |
| 39 | `pitchDeckAgent` | Pitch Deck Builder - Phase 2a (master audit "looks advanced | 201 |
| 40 | `platformSpendAlertAgent` | Platform-wide daily spend alert - Usage/Pricing/Cost-Control spec | 116 |
| 41 | `portfolioAgent` | Agency portfolio / cross-client overview - master audit Part E1. | 190 |
| 42 | `reportingAgent` | Reporting Agent | 227 |
| 43 | `reputationAgent` | Reputation/external review monitoring - master audit Part D2. | 68 |
| 44 | `researchAgentV2` | AI Research Agent. | 250 |
| 45 | `retargetingAgent` | Retargeting Ad Copy Agent | 147 |
| 46 | `retentionAgent` | Customer Retention Agent - Phase 3 basic version | 98 |
| 47 | `seasonalityAgent` | Seasonality operationalization - master audit Part D. | 157 |
| 48 | `seoAgent` | SEO Agent - Phase 2 basic version | 438 |
| 49 | `seoPageAgent` | Generates standalone SEO content pages - distinct from the single | 63 |
| 50 | `seoToolkitAgent` | SEO Toolkit Agent - covers the tasks not already handled by | 248 |
| 51 | `shopifyAgent` | Shopify Agent - merchant's own Custom App token, no OAuth approval | 111 |
| 52 | `slackAgent` | Slack Agent - free, self-serve, no approval process | 26 |
| 53 | `socialManagementAgent` | Social Media Management Agent - covers the tasks not already | 450 |
| 54 | `socialMediaAgent` | Social Media Agent - Phase 2 basic version | 342 |
| 55 | `strategyAgent` | Marketing Strategy Agent - Phase 2 | 131 |
| 56 | `threeDAgent` | Real interactive 3D generation - Opus writes a complete, self- | 67 |
| 57 | `touchpointAgent` | Multi-touch attribution, Phase A (see migrations 112 + 113). | 119 |
| 58 | `vapiCallAgent` | Shared core of "trigger an AI call for this lead" - used by both the | 208 |
| 59 | `videoAgent` | Video Agent - Phase 4 (Veo) | 66 |
| 60 | `videoMarketingAgent` | Video Marketing Agent - covers the text/planning side of the 11 | 81 |
| 61 | `voiceoverAgent` | Voiceover Agent - Phase 4 (ElevenLabs) | 55 |
| 62 | `websiteAgent` | Website Agent - basic landing page copy | 111 |
| 63 | `websiteBuilderAgent` | Website Builder Agent - generates a complete multi-page website: | 659 |
| 64 | `whatsappMarketingAgent` | live - see note below), Follow-ups, Order Updates, Promotions, Cart | 148 |
| 65 | `woocommerceAgent` | WooCommerce Agent - REST API keys generated in the store's own | 53 |
| 66 | `wordpressAgent` | WordPress Agent - Application Passwords, no approval process | 56 |
| 67 | `youtubeAgent` | YouTube publishing - token refresh (access tokens expire hourly | 86 |

---

## Master Chat tools (60)

Every one has a `case` in `executeTool` - there are no registered tools
that cannot run.

| # | Tool | What it does |
|---|---|---|
| 1 | `generate_brand_kit` | Generate the business's brand identity kit: colors, typography, tagline, mission, vision, brand story, socia |
| 2 | `generate_logo` | Generate an actual AI logo image for the business and save it to the Brand Voice / Brand Building page. |
| 3 | `build_website` | Build a REAL, live-rendering multi-page website (Home, About, Contact, Products/Services, etc - pages and th |
| 4 | `generate_content` | Generate a marketing content piece. |
| 5 | `generate_seo` | Generate SEO content/guidance - DRAFTS, saved to the SEO Toolkit page. |
| 6 | `propose_page_meta` | Set the search title and/or meta description of one page on the business's OWN Hawlai website - the two line |
| 7 | `read_page` | Read what one page of the business's OWN Hawlai website says RIGHT NOW - every heading, paragraph and button |
| 8 | `edit_page_text` | Change the words ON one page of the business's own Hawlai website - a heading, a paragraph or a button label |
| 9 | `undo_page_edit` | Put a page's wording - or its search title and description - back to what it was before the last chat edit. |
| 10 | `generate_social_management` | Generate social media management content (not a post - replies, growth strategy, trends). |
| 11 | `generate_email` | Generate email marketing content. |
| 12 | `generate_whatsapp` | Generate WhatsApp marketing message content (drafts only - sending is always manual/tap-to-send, never autom |
| 13 | `generate_ad_plan` | Generate a PLANNING document (not a live launch) for a non-Meta ad platform. |
| 14 | `generate_video_task` | Generate video marketing planning content (scripts, ideas, captions - not actual video generation, point the |
| 15 | `research_competitor` | Research a named competitor using real web search. |
| 16 | `research_market` | Research using real web search. |
| 17 | `generate_cro_suggestions` | Suggestions to improve the landing page's conversion rate, grounded in its real content and real visitor ana |
| 18 | `remember_insight` | Save a durable, reusable observation about this business for future conversations - a real pattern worth rem |
| 19 | `get_growth_advice` | Get real-data-grounded growth advice. |
| 20 | `generate_influencer_outreach` | Find influencer search terms and draft an outreach DM + email for a product/service/collaboration idea. |
| 21 | `generate_retargeting_copy` | Write retargeting/win-back ad copy for a real audience segment - people who abandoned their cart, went cold |
| 22 | `get_analytics_summary` | Get the business's real current campaign performance numbers (spend, leads, revenue, cost per lead) - use wh |
| 23 | `generate_marketing_strategy` | Generate a deep marketing strategy: SWOT analysis, target personas, quarterly/annual plan, market gap analys |
| 24 | `generate_seo_keywords` | Original keyword research + content ideas for a topic (separate from the SEO Toolkit tasks - this is the cla |
| 25 | `generate_graphic` | Propose an AI image and QUOTE ITS COST. |
| 26 | `get_customer_sentiment` | Analyze real sentiment themes from the business's own lead qualification notes (not web search) - what's mak |
| 27 | `create_workflow` | Create a real automated multi-step workflow (Marketing Automation). |
| 28 | `manage_watch` | Add something to the daily-monitored watch list - a named competitor (for New Product Alerts) or any general |
| 29 | `set_automation_toggle` | Turn a real automation ON or OFF. |
| 30 | `propose_campaign_budget_change` | Request a daily-budget change on an already-launched ad campaign. |
| 31 | `propose_campaign_targeting_change` | Request an audience-targeting change (age range / gender) on an already-launched ad campaign. |
| 32 | `propose_price_change` | Request a change to one product - its price, name or description. |
| 33 | `launch_meta_campaign` | Create a Facebook/Instagram ad campaign in the connected Meta ad account. |
| 34 | `activate_meta_campaign` | Turn ON a paused Meta (Facebook/Instagram) campaign so it starts delivering and spending. |
| 35 | `pause_meta_campaign` | Pause a running Meta campaign IMMEDIATELY, stopping spend. |
| 36 | `update_website_url` | Save the business's website address to their settings. |
| 37 | `get_follow_up_reminders` | Get real leads that need attention right now - stuck 2+ days with no follow-up, and today's scheduled appoin |
| 38 | `get_booking_link` | Get (or create, if none exists yet) the public meeting-booking link leads can use to book a slot themselves. |
| 39 | `get_website_analytics` | Get real website visitor analytics for the last 30 days - page views, chat opens, leads captured, engagement |
| 40 | `generate_3d_scene` | Generate a REAL, interactive 3D scene (actual WebGL/Three.js code the person can drag to rotate and zoom) fr |
| 41 | `publish_to_youtube` | Publish a ready, already-generated video to the business's connected YouTube channel - this makes it publicl |
| 42 | `create_product_ad` | Automatically create a complete, ready-to-download ad creative using a real product photo already uploaded - |
| 43 | `edit_canvas_design` | Make an edit to an existing canvas design (the advanced design editor with text/shapes/images) using a plain |
| 44 | `assign_task` | Assign a piece of work to a specific team member instead of generating it yourself. |
| 45 | `set_goal` | Turn a high-level goal into a DRAFT plan - decomposes it into 2-5 concrete tasks (a mix of tasks assigned to |
| 46 | `assign_lead` | Assign a specific existing lead to a Sales team member so it shows up in their Task Inbox as one of their le |
| 47 | `add_lead` | Manually add a new lead to the CRM. |
| 48 | `trigger_call` | Place a real, live AI phone call to a specific existing lead right now via the calling assistant. |
| 49 | `export_leads` | Export this business's leads as a CSV the owner downloads straight from the chat. |
| 50 | `schedule_lead_export` | Turn the recurring leads export on, off, or change how often - e.g. |
| 51 | `send_email` | Send a real email right now to a specific recipient - a team member (by name or email), or a lead or custome |
| 52 | `add_product` | Add a real product OR SERVICE to the business's catalogue (Website Builder's Products tab / live storefront) |
| 53 | `diagnose_business` | Where this business is actually losing people, from its own last 90 days: the funnel from site visit to cust |
| 54 | `plan_budget` | Ways to divide a marketing budget the person has named, with the reason each channel is in the split. |
| 55 | `competitor_positioning` | How this business is positioned against what its competitors say in public - their own words with links, cou |
| 56 | `business_story` | Start or continue the owner's Business Story - the one-time set of questions whose answers make this busines |
| 57 | `save_business_story` | Save one Business Story answer, in the owner's own words. |
| 58 | `create_discount_code` | Create a real discount/coupon code customers can actually use at checkout on the business's store, e.g. |
| 59 | `get_report_links` | Get download links for a PDF report and a PowerPoint presentation of current performance, plus the client-sh |
| 60 | `get_growth_report` | Build the growth report NOW and show it: what the agent found on the site and the catalogue, what it suggest |

---

## What this inventory does not tell you

A file being imported is not a feature being used. Nothing here was
exercised against a real business - no agent in this list has run for a
paying customer, because there is not one yet. "Reachable" is the
strongest claim the code can support, and it is the one made above.
