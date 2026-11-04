// THE 59 CHAT TOOL SCHEMAS — moved here in S6/P3a, byte for byte.
//
// WHY THEY LIVE BESIDE THE REGISTRY. The architecture doc's §4.2 says
// it in a line: `masterBrainV2.ts` at five thousand lines "holds all 58
// tool schemas and their dispatch. The Action registry is where those
// schemas belong." This is that move, and nothing else: not one
// character of a schema changed, the order is identical, and
// masterBrainV2.ts re-exports `TOOLS` so every caller and all ten test
// files that import it are untouched.
//
// BYTE-IDENTITY IS LOAD-BEARING, NOT TIDINESS. `cachedTools()` marks
// the LAST entry with `cache_control: ephemeral`, which makes this
// array the Anthropic prompt-cache prefix — and a cache prefix must be
// byte-identical every request or the cache misses and every turn pays
// full price. So this file is data, in order, and
// tests/toolSchemas.test.ts carries a fingerprint of it: changing a
// schema is allowed and sometimes necessary, but it has to be a
// decision somebody took, not a side effect of moving code.
//
// WHAT IS NOT HERE: the dispatch. `executeTool` stays in
// masterBrainV2.ts, because what a tool DOES is not its definition —
// and P4's retirements are about the doing.
//
// AND WHAT THE REGISTRY MUST NOT DO: keep a second copy of these
// parameters. `businessBrain/toolRegistry.ts` has 18 entries with their
// own `parameters` maps, and four of them already disagree with the
// schema here — measured 2026-11-04: trigger_call says `leadId` where
// the tool takes `leadName`, send_email says `to` where it takes
// `recipient`, and two more are missing a field each. None is
// call-enabled, so none is a live fault today; all four are the reason
// P3b derives the registry's chat-tool parameters FROM this file. The
// direction matters: 24 of these schemas use an `enum`, which the
// registry's parameter shape cannot express at all, so the definition
// can only ever flow this way.

// The enum value lists these schemas constrain their choices with.
// Imported from the same modules masterBrainV2.ts imported them from,
// because inlining the literals would duplicate exactly the thing this
// move exists to stop duplicating.
//
// NOTE ON THE CLIENT BUNDLE: this pulls agent modules, as
// masterBrainV2.ts already did. No client component imports this file,
// and tests/clientBundleBoundary.test.ts is what will say so if one
// ever starts.
import { CONTENT_TYPES } from "@/lib/agents/contentMarketingAgent";
import { SEO_TASKS } from "@/lib/agents/seoToolkitAgent";
import { SOCIAL_TASKS } from "@/lib/agents/socialManagementAgent";
import { EMAIL_TASKS } from "@/lib/agents/emailMarketingAgent";
import { WHATSAPP_TASKS } from "@/lib/agents/whatsappMarketingAgent";
import { AD_PLATFORMS, AD_TASKS } from "@/lib/agents/paidAdsAgent";
import { VIDEO_TASKS } from "@/lib/agents/videoMarketingAgent";
import { COMPETITOR_TASKS } from "@/lib/agents/competitorIntelAgent";
import { CRO_TASKS } from "@/lib/agents/croAgentV2";
import { GRAPHIC_TYPES } from "@/lib/agents/graphicDesignAgent";

export const TOOLS = [
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
    description: `Generate SEO content/guidance — DRAFTS, saved to the SEO Toolkit page. None of this changes the live website: meta_tags in particular writes a suggested title and description for the owner to copy into Website Builder, it does not set what Google reads. Report what the result's note says and never tell the person their site is updated. Valid taskType values: ${SEO_TASKS.map((t) => t.key).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        taskType: { type: "string", enum: SEO_TASKS.map((t) => t.key) },
        exactText: {
          type: "string",
          description:
            "The person's OWN wording, when they have given you a line and asked for it to be used — paste it here exactly as they typed it, including the town, the product name and the call to action. It is used unchanged. Never retype it from memory, never tidy it, and never leave it out because you think it needs shortening.",
        },
      },
      required: ["taskType"],
    },
  },
  {
    name: "propose_page_meta",
    description:
      "Set the search title and/or meta description of one page on the business's OWN Hawlai website — the two lines a stranger reads in a Google result, and what WhatsApp shows in a link preview. USE THIS when they want their meta tags actually applied, not drafted: generate_seo only writes a suggestion to the SEO Toolkit and changes nothing public. It shows a preview with Approve / Edit / Reject buttons INLINE IN THE CHAT and nothing on the site changes until they approve. NEVER tell them to go to Website Builder to paste it in — the decision is already in front of them. After approval Hawlai fetches the live page and reads the rendered title and description back, and only says it is live when they match. If they gave you their own wording, pass it exactly as they typed it; if it is longer than Google shows, the card warns and saves it whole — never shorten it yourself.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "string", description: "Which page — the slug, e.g. \"home\", \"about\", \"products\". Defaults to the homepage. If unsure which they mean, the tool returns the list to choose from." },
        title: { type: "string", description: "The <title> for that page — what shows in the browser tab and as the blue line in a search result. When you write it yourself, keep it under 60 characters, because Google cuts it off there. Omit to leave it as it is." },
        metaDescription: { type: "string", description: "The description under the title in a search result. When you write it yourself, keep it WITHIN 160 characters — Google truncates around 155-160, and a sentence that ends mid-word in a search result is worse than a shorter one. Omit to leave it as it is." },
        shareImageUrl: {
          type: "string",
          description:
            "A picture for the link preview when this page is sent on WhatsApp or posted to Facebook (og:image). ONLY a URL the person gave you, or one already on a product in their catalogue — never a generated image. A drawn picture of a real product is not that product, and a link preview is exactly where someone decides whether to trust it. If they have no photo, say so and ask them to upload one in Website Builder.",
        },
        writtenByOwner: {
          type: "array",
          items: { type: "string", enum: ["title", "metaDescription"] },
          description:
            "Which of these the person typed themselves, word for word. Their own wording is saved exactly as written — never shortened, never claim-checked away — and the card warns them if it says something their Business Story doesn't back up. Anything you wrote yourself must NOT be listed here: that goes through the claims check like every other piece of copy Hawlai writes.",
        },
      },
      required: [],
    },
  },
  {
    name: "read_page",
    description:
      "Read what one page of the business's OWN Hawlai website says RIGHT NOW — every heading, paragraph and button, each with the block id that identifies it. ALWAYS call this before changing any wording on a page: edit_page_text needs a block id, and the ids only come from here. Call it too whenever they refer to something on their site — \"ye line hata do\", \"isko chhota karo\", \"about page pe kya likha hai\" — instead of answering from memory or from an earlier message, because Website Builder may have changed it since. It reads only; nothing changes and nothing needs approving. If the page isn't there it returns the list of pages that are — show that rather than guessing which one they meant.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "string", description: "Which page — the slug, e.g. \"home\", \"about\", \"contact\", or its menu title. Defaults to the homepage." },
      },
      required: [],
    },
  },
  {
    name: "edit_page_text",
    description:
      "Change the words ON one page of the business's own Hawlai website — a heading, a paragraph or a button label — addressed by the block id read_page gave you. CALL read_page FIRST, always: without the real current text you would be replacing a line you have not seen. It shows an approval card with the exact before → after for every line and nothing changes until they approve; after approval Hawlai fetches the live page and reads the new wording back, and only says it is live when it is really being served. This does NOT touch the search title or meta description — that is propose_page_meta, and it must stay that way. It cannot add, remove or reorder sections, or add a page: say so plainly and point at Website Builder rather than attempting it another way. On a shop or product page it changes ordinary headings, paragraphs and button labels like anywhere else, but refuses the blocks that show catalogue data — product names, prices, descriptions, stock — and points at the catalogue tools, because those words belong to the product rows. It also refuses any line that would put a price or an unsold product's name on the page. On a legal page (privacy, terms, refunds) it still works but the card warns that legal wording is changing — never quietly drop a sentence from one.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "string", description: "Which page — the slug or menu title read_page reported. Defaults to the homepage." },
        edits: {
          type: "array",
          description: "One entry per line you are changing. Change only lines the person actually asked about.",
          items: {
            type: "object",
            properties: {
              blockId: { type: "string", description: "The block id from read_page. Never invent one, and never reuse an id from an earlier conversation — re-read the page." },
              prop: { type: "string", enum: ["text", "heading", "html", "label"], description: "Which part of that block, exactly as read_page reported it: \"text\" or \"heading\" for a heading, \"html\" for a paragraph, \"label\" for a button." },
              text: { type: "string", description: "The new wording. Plain text, or the markdown subset the site renders (**bold**, *italic*, [text](url)). NEVER HTML tags — the prop is called html for historical reasons and anything tag-like is printed to the visitor literally." },
              writtenByOwner: {
                type: "boolean",
                description: "True ONLY when the person dictated these exact words. Their wording is then saved verbatim — never shortened, never claim-checked away — and it becomes something Hawlai may treat as a fact about the business afterwards. Anything you wrote yourself, including a draft they then approved, must be false: approving a draft is approving its publication, not vouching for it.",
              },
            },
            required: ["blockId", "prop", "text"],
          },
        },
      },
      required: ["edits"],
    },
  },
  {
    name: "undo_page_edit",
    description:
      "Put a page's wording — or its search title and description — back to what it was before the last chat edit. USE THIS when they say \"undo that\", \"wapas kar do\", \"purana wala better tha\" about words on their website. It replays the exact previous text recorded on the edit that changed it, so nothing is regenerated and nothing is guessed. It shows an approval card like any other edit and changes nothing until they approve. It can only undo an edit made through chat — a change made in Website Builder has no record here, and a second undo does not go two steps back.",
    input_schema: {
      type: "object",
      properties: {
        edit_id: {
          type: "string",
          description:
            "The action_id of the edit to put back. PREFER THIS whenever you have it — every edit you make returns one, so when they say \"undo that\" about an edit from this conversation, pass that edit's action_id rather than a page name. Without it I fall back to the most recent chat edit on the page, which can be the wrong one if there were two.",
        },
        page: { type: "string", description: "Which page, if they named one and you have no edit_id. Omit to undo the most recent chat edit on any page." },
        what: {
          type: "string",
          enum: ["text", "search_listing"],
          description:
            "Which KIND of change to put back: \"text\" for words on the page, \"search_listing\" for the search title or description. Pass it when they made that clear. If you pass neither this nor edit_id and both kinds are in range, I will come back asking which — relay that question instead of choosing for them.",
        },
      },
      required: [],
    },
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
    description: `Generate a PLANNING document (not a live launch) for a non-Meta ad platform. Valid platform values: ${AD_PLATFORMS.map((p) => p.key).join(", ")}. Valid taskType values: ${AD_TASKS.map((t) => t.key).join(", ")}. For Meta/Facebook ad launches use launch_meta_campaign instead — that one actually creates the campaign (paused, with an approval card in the chat). NEVER tell the person to go to Ads Manager or a Paid Ads page for a Meta launch.`,
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
    description: "Generate a deep marketing strategy: SWOT analysis, target personas, quarterly/annual plan, market gap analysis. Use when the person wants an overall strategy or business plan. For 'where should I focus' or 'what's not working', use diagnose_business first — it's built from their real numbers.",
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
    description: `Propose an AI image and QUOTE ITS COST. This does NOT generate anything: it returns a card with a button the person presses to spend the money, so never say the image is ready, never describe what it looks like, and never use markdown image syntax after calling it. Good for an ad creative, social graphic, banner, poster or backdrop. Valid designType values: ${GRAPHIC_TYPES.map((t) => t.key).join(", ")}. NEVER use this to stand in for a photograph of a REAL product the business sells — a generated picture of their product is not their product, and putting it on a storefront listing or an ad for that product misrepresents what the customer is buying. For a real product, use the photo already in their catalogue, or ask them to upload one; if there is no photo, the image is made WITHOUT the product in it and you must say so.`,
    input_schema: { type: "object", properties: { designType: { type: "string", enum: GRAPHIC_TYPES.map((t) => t.key) }, prompt: { type: "string", description: "What the image should depict" } }, required: ["designType"] },
  },
  {
    name: "get_customer_sentiment",
    description: "Analyze real sentiment themes from the business's own lead qualification notes (not web search) — what's making leads hot vs cold, common objections. Needs at least a few leads with notes to work.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_workflow",
    description: "Create a real automated multi-step workflow (Marketing Automation). Trigger is 'new_lead', 'appointment_booked', or 'lead_converted'. Steps are an ordered list, each with a delayDays (days after trigger to fire) and an actionType — either send an email (emailTaskType or custom subject/body) or queue the AI to generate a piece of content (contentType + contentTopic). The workflow is created DISABLED by default — tell the person to enable it on the Marketing Automation page when ready, unless they explicitly say to turn it on now, in which case pass enableNow=true.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        triggerType: { type: "string", enum: ["new_lead", "appointment_booked", "lead_converted"] },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              delayDays: { type: "number" },
              actionType: { type: "string", enum: ["send_email", "queue_content"], description: "send_email sends an email step (existing behavior). queue_content queues the AI to generate a piece of content instead — the only other real action today, WhatsApp/SMS aren't connected." },
              emailTaskType: { type: "string", description: `Only for actionType 'send_email'. One of: ${EMAIL_TASKS.map((t) => t.key).join(", ")}, or 'custom'` },
              customSubject: { type: "string" },
              customBody: { type: "string" },
              contentType: { type: "string", description: "Only for actionType 'queue_content'. One of: instagram_post, facebook_post, linkedin_post, blog_post, email_newsletter" },
              contentTopic: { type: "string", description: "Only for actionType 'queue_content'. The specific topic to generate content about." },
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
    name: "propose_campaign_budget_change",
    description: "Request a daily-budget change on an already-launched ad campaign. This never changes the budget directly — it sends the request to the Approvals queue for the person (or whoever holds approval authority) to review. Use when the person asks to raise/lower/change a specific campaign's budget.",
    input_schema: {
      type: "object",
      properties: {
        campaign_description: { type: "string", description: "How the person referred to the campaign, e.g. 'the Swift ad' or 'my Diwali campaign' — used to match it against their real launched campaigns" },
        change_request: { type: "string", description: "What they want changed, in their own words, e.g. 'increase it to 3000' or 'double the budget'" },
      },
      required: ["campaign_description", "change_request"],
    },
  },
  {
    name: "propose_campaign_targeting_change",
    description: "Request an audience-targeting change (age range / gender) on an already-launched ad campaign. This never changes targeting directly — it sends the request to the Approvals queue for review. Use when the person asks to narrow/change who a specific campaign targets.",
    input_schema: {
      type: "object",
      properties: {
        campaign_description: { type: "string", description: "How the person referred to the campaign, e.g. 'the Swift ad' or 'my Diwali campaign' — used to match it against their real launched campaigns" },
        change_request: { type: "string", description: "What they want changed, in their own words, e.g. 'only show it to men 25-34'" },
      },
      required: ["campaign_description", "change_request"],
    },
  },
  {
    // Named propose_* to match propose_campaign_budget_change: the
    // prefix already means "this goes to Approvals, it does not
    // happen now", and the person reading the tool list should not
    // have to learn a second convention.
    name: "propose_price_change",
    description:
      "Request a change to one product — its price, name or description. Looks in the business's OWN Hawlai storefront first (where most businesses sell), then a connected Shopify store, which supports price only. Ask for ONE field per call: each change gets its own approval card. Nothing changes until the owner approves. When confirming, ALWAYS state the store's currency (returned as store_currency) BEFORE the amounts, e.g. \"Your store's currency is USD ($). Change X from $749.95 to $799.00?\" — the merchant must never see a price without knowing its currency. This NEVER changes the price directly — it resolves which product is meant and shows a preview with Approve / Edit / Reject buttons INLINE IN THE CHAT. The person decides right there on that card. NEVER tell them to open a page, visit Approvals, or go anywhere else to confirm; the decision is already in front of them. If the product name is ambiguous the tool returns candidates instead of guessing; show them to the person and call this again with the variant_id they choose.",
    input_schema: {
      type: "object",
      properties: {
        product_description: {
          type: "string",
          description: "How the person referred to the product, in their own words, e.g. 'the blue kurta' or 'the large size shirt'",
        },
        new_name: {
          type: "string",
          description: "A new public product name, if renaming is what they asked for. Works on the business's own Hawlai storefront only.",
        },
        new_description: {
          type: "string",
          description: "New public product description text, if that is what they asked to change. Works on the business's own Hawlai storefront only.",
        },
        new_price: {
          type: "string",
          description: "The price they want, as a plain number without a currency symbol, e.g. '999'",
        },
        variant_id: {
          type: "string",
          description:
            "Only on a FOLLOW-UP call, after this tool returned candidates and the person picked one. Pass that candidate's variant_id exactly as given. Never invent one.",
        },
      },
      required: ["product_description", "new_price"],
    },
  },
  {
    // Named launch_* rather than propose_* because it genuinely
    // creates something — but nothing SPENDS. Every object is created
    // paused; activation is a separate, separately-gated step.
    name: "launch_meta_campaign",
    description:
      "Create a Facebook/Instagram ad campaign in the connected Meta ad account. USE THIS whenever someone asks to run, launch, start or set up an ad or campaign on Facebook, Instagram or Meta — you CAN do this, end to end, right here. It writes the ad copy and builds the creative around the REAL product photo from their connected store whenever there is one — pass product_description with the product they mentioned so it can find it, and if it's ambiguous the tool returns candidates to choose from rather than guessing. Only when no store is connected, the product has no photo, or they ask for a generated image does it fall back to an AI-generated backdrop, and the preview says which was used. It shows a preview with Approve / Edit / Reject buttons INLINE IN THE CHAT. The person decides right there on that card. NEVER tell them to open Ads Manager, a Paid Ads page, or anywhere else — the decision is already in front of them. Nothing is created on Meta until they approve, and everything is created PAUSED, so approving still spends nothing; activating is a separate step they take afterwards. If they name a daily budget, pass it; if it is below their ad account's minimum it is raised automatically and the preview says so.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What they want to advertise, in their own words, e.g. 'diwali sale on mithai boxes', 'new saree collection', 'weekend coaching batch'",
        },
        daily_budget: {
          type: "string",
          description: "Daily budget in rupees if they named one, as a plain number without a symbol, e.g. '100'",
        },
        product_description: {
          type: "string",
          description:
            "Which product the ad is for, in their own words, e.g. 'the lavender candle', 'kaju katli box', 'weekend coaching batch'. Used to pull the REAL product photo from their store. Pass this whenever they name or imply a product — an ad with the actual product photo is worth far more than a generated one.",
        },
        variant_id: {
          type: "string",
          description:
            "Only on a FOLLOW-UP call, after this tool returned product candidates and the person picked one. Pass that candidate's variant_id exactly as given. Never invent one.",
        },
        use_generated_image: {
          type: "boolean",
          description:
            "Only when the person has explicitly said to use a generated/AI image rather than a product photo, or has said they have no product photo. Never set this to avoid asking them.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "activate_meta_campaign",
    description:
      "Turn ON a paused Meta (Facebook/Instagram) campaign so it starts delivering and spending. USE THIS when someone asks to activate, start, go live, run, resume or switch on a campaign — you CAN do this from chat. ALWAYS call it to find out whether a campaign is running: it reads Meta live. NEVER tell someone a campaign is already live from a campaign list, performance numbers, the dashboard or an earlier message — those hold the last RECORDED status, which can be wrong. It shows an approval card with Approve / Reject buttons INLINE IN THE CHAT and nothing spends until they approve. It switches on the campaign, ad set and ad, then confirms with Meta that the ad is genuinely delivering before saying it worked. NEVER say the go-live switch is only on Meta's platform, and NEVER send them to Ads Manager to turn a campaign on. If it's unclear which campaign they mean, the tool returns a numbered list — show it and call again with the campaign_id they pick.",
    input_schema: {
      type: "object",
      properties: {
        campaign_description: { type: "string", description: "Which campaign, in their words, e.g. 'the Diwali gift box ad'" },
        campaign_id: { type: "string", description: "Only on a FOLLOW-UP call, after a numbered list was shown and they picked one. Pass that campaign_id exactly. Never invent one." },
      },
      required: [],
    },
  },
  {
    name: "pause_meta_campaign",
    description:
      "Pause a running Meta campaign IMMEDIATELY, stopping spend. USE THIS when someone asks to pause, stop, turn off, halt or kill an ad. No approval card — stopping spend is reversible and must never wait on a click. It pauses the campaign, ad set and ad, then confirms with Meta that delivery has actually stopped. If the result has confirmed: false, Meta ACCEPTED the pause and only the read-back failed — say the pause was sent and suggest checking Ads Manager; never call it a network failure or say it didn't work. NEVER send them to Ads Manager for this. If it's unclear which campaign they mean, the tool returns a numbered list — show it and call again with the campaign_id they pick.",
    input_schema: {
      type: "object",
      properties: {
        campaign_description: { type: "string", description: "Which campaign, in their words" },
        campaign_id: { type: "string", description: "Only on a FOLLOW-UP call, after a numbered list was shown. Pass it exactly. Never invent one." },
      },
      required: [],
    },
  },
  {
    name: "update_website_url",
    description:
      "Save the business's website address to their settings. USE THIS when someone tells you their website in chat — you CAN save it for them, and there is no reason to send them to a settings page for one field. Two steps, deliberately: call it with just the url to see what will change, tell the person exactly what it will be set to and what it is now, and only call again with confirmed=true once they say yes. Never set confirmed on the first call. The saved address is what ads fall back to when there is no specific product page, so a typo here quietly sends ad traffic to a domain that does not exist — which is why it is confirmed rather than written silently.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The website address exactly as they gave it. A bare domain like 'mithaiwala.in' is fine.",
        },
        confirmed: {
          type: "boolean",
          description: "Only true on the SECOND call, after the person has seen the change and agreed to it in the chat.",
        },
      },
      required: ["url"],
    },
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
    description: "Publish a ready, already-generated video to the business's connected YouTube channel — this makes it publicly live on YouTube immediately. Only use this on a clear, explicit request (\"publish this to YouTube\", \"upload that product video\"). If no video is specified, uses the most recently generated ready video.",
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
    name: "set_goal",
    description: "Turn a high-level goal into a DRAFT plan — decomposes it into 2-5 concrete tasks (a mix of tasks assigned to team members and tasks the AI will execute itself later) and saves it as a draft for the person to review. Nothing is actually created yet — they confirm it at Tasks before any real task/assignment exists. Use when the person states an ambition or target rather than a single specific action (e.g. 'grow leads 20% this quarter', 'get our brand more visible before Diwali') — not for a single concrete request another tool already handles directly.",
    input_schema: {
      type: "object",
      properties: {
        goalText: { type: "string", description: "The goal, in the person's own words." },
      },
      required: ["goalText"],
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
    name: "export_leads",
    description: "Export this business's leads as a CSV the owner downloads straight from the chat. Use whenever they ask to export, download or get a spreadsheet/CSV/Excel of their leads — never tell them to find an export in the dashboard. Only the owner or an admin can export. Every lead is included (do-not-contact and unsubscribed ones are flagged in their own columns), narrowed only by the filters given.",
    input_schema: {
      type: "object",
      properties: {
        temperature: { type: "string", enum: ["hot", "warm", "cold"], description: "Only leads of this temperature." },
        status: { type: "string", description: "Only leads in this status, e.g. new, called, converted." },
        source: { type: "string", description: "Only leads from this source, e.g. csv_upload, meta_lead_ad, website." },
        from: { type: "string", description: "Only leads created on or after this date, YYYY-MM-DD (India time)." },
        to: { type: "string", description: "Only leads created on or before this date, YYYY-MM-DD (India time)." },
        hasEmail: { type: "boolean", description: "Only leads that have an email address." },
      },
    },
  },
  {
    name: "schedule_lead_export",
    description: "Turn the recurring leads export on, off, or change how often — e.g. \"send me my leads CSV every week\", \"monthly\", \"stop the leads export\". It emails the business owner's login email a sign-in download link for the full lead list (never the file, never any other address) every Monday or on the 1st at 8:30 AM IST. Only the owner or an admin can change it.",
    input_schema: {
      type: "object",
      properties: {
        frequency: { type: "string", enum: ["weekly", "monthly", "off"] },
      },
      required: ["frequency"],
    },
  },
  {
    name: "send_email",
    description: "Send a real email right now to a specific recipient — a team member (by name or email), or a lead or customer already on record (by email). Hawlai only emails people who gave this business their email: an address that isn't a lead, customer or team member is refused, and so is anyone who unsubscribed. Only use this when the person clearly wants it actually SENT, not just drafted (e.g. \"email Priya about the launch\", \"send a follow-up to this lead\") — for drafting content to review first, use generate_email instead.",
    input_schema: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "An email address, or a team member's name/email to look up." },
        subject: { type: "string" },
        body: { type: "string", description: "The full email as plain text, in the business's tone of voice. Always required — it's the plain-text version too." },
        headline: { type: "string", description: "For a lead or customer: a short headline (under 60 characters) for the visual email. Give headline + intro to send the branded visual email with the product photo and a button; leave them out for a plain personal note." },
        intro: { type: "string", description: "For the visual email: 1–2 short sentences." },
        bullets: { type: "array", items: { type: "string" }, description: "For the visual email: up to 3 short points, only if they help." },
        ctaLabel: { type: "string", description: "For the visual email: 2–4 words for the button. Never write a link anywhere — Hawlai adds the real one." },
        product: { type: "string", description: "For the visual email: the exact name of the product it features, or leave out." },
      },
      required: ["recipient", "subject", "body"],
    },
  },
  {
    name: "add_product",
    description: "Add a real product OR SERVICE to the business's catalogue (Website Builder's Products tab / live storefront). Any business can list both — a sweet shop can run a tasting, a salon can sell products, a coaching centre can sell a workbook. Use kind \"product\" for something customers buy (\"add a kaju katli box at 599 rupees\") and kind \"service\" for something customers book — a session, class, workshop, consultation or appointment (\"add a weekend coaching batch, ₹800, 90 minutes\"). Never refuse a service or add it as a product instead. This is not a mockup or suggestion — it's saved and will genuinely appear on their live site once published.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["product", "service"], description: "product = bought (and maybe shipped); service = booked. Defaults to product." },
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        category: { type: "string" },
        inventoryCount: { type: "number", description: "Products only: stock count, if the person mentions one. Omit for unlimited/untracked stock. Never set for a service." },
        durationMinutes: { type: "number", description: "Services only: how long it lasts in whole minutes (90 for \"1.5 hours\"), if the person says." },
        bookingUrl: { type: "string", description: "Services only: a full https:// booking link, ONLY if the person gives one. Never invent one — without it, customers are sent to the business's booking page." },
      },
      required: ["name", "price"],
    },
  },
  {
    name: "diagnose_business",
    description: "Where this business is actually losing people, from its own last 90 days: the funnel from site visit to customer with the weakest step named, lead sources ranked by conversion (not volume), customers at risk, and paid-ad cost per lead — every number counted by Hawlai, not estimated. Then channel advice tied to those numbers. Use when the person asks where to focus, what's not working, why sales are low, or which channel to put money into. Quote only the numbers this returns; where it says data is too thin, say so instead of advising.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "plan_budget",
    description:
      "Ways to divide a marketing budget the person has named, with the reason each channel is in the split. Use when they say how much they have to spend or ask where to put money (\"₹50,000 hai, kya karun\"). IMPORTANT, and say it in your own words when you report this: these are splits, NOT forecasts. A number of leads appears only where Hawlai worked it out from this business's own measured cost per lead, and that figure is named — everywhere else the result says which number nobody knows yet, and you must pass that on rather than filling it in. Never add a projection, a revenue figure or an ROI of your own, and never quote a cost per lead the result doesn't give you. When it returns no scenarios, say why it couldn't and what to fix first.",
    input_schema: {
      type: "object",
      properties: { budgetInr: { type: "number", description: "The amount in rupees the person said they have to spend." } },
      required: ["budgetInr"],
    },
  },
  {
    name: "competitor_positioning",
    description: "How this business is positioned against what its competitors say in public — their own words with links, counted theme by theme (price, materials, delivery, expertise… depending on how the business makes money), which ground is crowded, which is open, and angles the business can own with its own facts. Use when the person asks how they're different from competitors, what competitors say, or how to stand out. Returns the latest comparison run on the Strategy page; quote only its counts and quotes.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "business_story",
    description: "Start or continue the owner's Business Story — the one-time set of questions whose answers make this business's copy impossible to write about anyone else (how it started, how the work is actually done, materials, what a customer said, what they refuse to do). Call this when the person asks to do their business story, asks why their content reads generic, or when copy they're unhappy with has no specifics to draw on. Returns what's saved, what's still open, and the exact next question — read from the database. Ask ONE question at a time, the one in `next`, and save each answer with save_business_story before asking another. Never ask a question that isn't in `next`, never re-ask a saved one, and never say the story is complete unless a tool result says complete: true.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "save_business_story",
    description: "Save one Business Story answer, in the owner's own words. Save what they actually said — tidy the grammar, never add facts, never make it sound like marketing. Saved as Business Knowledge, so copy may state it as true. If this tool returns an error, STOP: tell the person plainly that this answer was not saved and why, and do not ask the next question until a save succeeds. There is no batch save and nothing is held for later — an unsaved answer is simply lost. Call this in the SAME turn the owner answers — never acknowledge an answer without saving it. The result says, from the database, how many are saved and which question is next: ask exactly that one. Only when it says complete: true is the story done.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Which question this answers — the `next.key` you asked." },
        answer: { type: "string", description: "The owner's answer in their own words, a sentence or several. Don't summarise into an adjective." },
        replace: { type: "boolean", description: "Only when the owner asked to CHANGE an answer they already gave. Without it, a question that already has a different saved answer is refused." },
      },
      required: ["key", "answer"],
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
