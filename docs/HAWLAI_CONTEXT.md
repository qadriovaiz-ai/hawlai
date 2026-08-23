# Hawlai — Complete Context Document

> **Purpose of this document:** a standalone, self-contained explanation of what Hawlai is and how it is built, written so another AI (ChatGPT, Claude, Gemini, etc.) can understand the product and its architecture without access to the codebase. High-level but thorough; deliberately light on code.
>
> **Accuracy note:** every number in this document was verified against the codebase at the time of writing (2026-08-23) rather than recalled. Where something is incomplete, blocked, or untested, it says so explicitly — this document is meant to be trustworthy context, not a pitch.

---

## 1. Product Overview

### What Hawlai is

Hawlai is an **AI marketing employee** for small and medium businesses in India. The core idea, and the architectural rule the whole system is organized around, is:

> Hawlai is **not** a suite of 40+ marketing tools. It is **one AI employee** that understands a request, plans the work, picks the right tools, executes, and reports back.

The customer buys an outcome, not API access. They type "research my competitors" or "launch an ad for our new product" in plain language, and the system decides internally what needs to happen — which department, which tool, which AI model, how deep to research, whether a human needs to approve it.

The tools all exist and are individually reachable through a dashboard, but the primary interface is conversational.

### Who it is for

Indian SMBs — car dealerships (the original vertical, still visible in some naming like `dealerships` as the tenant table), retail shops, service businesses, Instagram sellers, real-estate agents, and marketing agencies managing several client businesses at once.

The product is designed around Indian market realities: pricing in INR, WhatsApp as a primary channel, GST/DPDP compliance considerations, and telecom regulations (DLT registration) that gate AI phone calling.

### Business model

SaaS subscription with usage-based overage. Five tiers:

| Plan | Price/month | Positioning |
|---|---|---|
| **Free** | ₹0 | Try it on a real business, no card |
| **Basic** | ₹1,999 | Single-location day-to-day operations |
| **Growth** | ₹3,999 | Higher volume, WhatsApp automation, reports |
| **Pro** | ₹14,999 | Adds the intelligence layer — automation, research, growth advisory |
| **Agency** | ₹49,999 | Multi-business management, fully unlocked |

Plan limits live in a **database table (`plan_limits`), not in code**, so pricing and caps change without a deploy.

**What each tier gates** falls into three categories:
1. **Boolean features** — WhatsApp automation, Competitor Intel, 3D Studio, multi-business, etc.
2. **Volume caps** — AI messages/day, images/videos/voiceover per month (plus per-day caps on the two most expensive), research credits/month.
3. **Included calling minutes** — 0 / 30 / 100 / 750 / 2,000 by tier.

**Calling overage pricing rule (important):** the customer is charged `actual_provider_cost + fixed_margin_per_minute` — never a hardcoded sell price. If the underlying cost changes, the customer price moves with it. The margin is ₹2/min on Free/Basic/Growth/Pro and ₹0.50/min on Agency (a deliberate volume discount).

**Payment collection is currently manual.** Hawlai has no merchant account of its own wired up — the "Upgrade" button opens WhatsApp to arrange it by hand. There is invoice *record-keeping* infrastructure, but no automated recurring charging. (The Razorpay integration that exists in the codebase is a *different thing entirely*: it's per-customer-business, so **their** storefront customers can pay **them**.)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15.5 (App Router, React Server Components, Server Actions) |
| **UI** | React 18.3, TypeScript 5, Tailwind CSS 3.4 |
| **Database / Auth / Storage** | Supabase (PostgreSQL, Row-Level Security, Auth, Storage buckets) |
| **Primary AI** | Anthropic Claude — called via **raw `fetch` to the Messages API**, not the official SDK |
| **Voice AI** | Vapi (AI phone calls — assistant config, telephony, STT/TTS) |
| **Image generation** | Google Gemini (2.5 Flash Image) |
| **Video generation** | Google Veo 3.1, with a Runway adapter as an alternative |
| **Text-to-speech** | ElevenLabs |
| **Web research** | Claude's own built-in `web_search` tool; Perplexity Sonar for deeper research (built, not yet activated) |
| **Email** | Resend (transactional), Gmail API (per-business sending) |
| **Payments** | Razorpay (per-business storefronts only) |
| **Charts** | Recharts |
| **Canvas editor** | Fabric.js |
| **Document generation** | PDFKit (PDF), PptxGenJS (PowerPoint) |
| **Drag & drop** | dnd-kit |
| **Icons** | Lucide |
| **Hosting** | Vercel (including Vercel Cron for scheduled jobs) |

**Notable stack characteristics:**
- **100% serverless.** No long-running processes, no persistent connections. This constraint drove several architectural decisions (see the Event Bus in §3).
- **Claude models are used in three tiers** — Haiku (fast/cheap, high-frequency tasks), Sonnet (default), Opus (rare, high-stakes reasoning, plan-gated).
- **All AI provider calls happen server-side.** No API key is ever exposed to the browser.

---

## 3. Architecture Overview

### 3.1 Master Chat — the front door

`masterBrainV2.ts` is the central conversational agent. It holds **44 tools** (verified count) that Claude can call. A user's message goes to Claude with the full tool schema; Claude decides which tools to invoke, in what order, and synthesizes a reply.

Key properties:
- Tools are **many small explicit tools** rather than few parameterized ones — this lets Claude's own tool-selection do the classification instead of a second parsing step.
- Every tool result is rendered as a **typed artifact card** in the chat (keyword lists, drafts, metrics, variants, SWOT analyses render differently by shape).
- Tools are **plan-gated** — Master Chat checks feature access before exposing/executing a gated tool.
- Results deep-link to the relevant department page, so a chat result is never a dead end.

### 3.2 Departments — the dashboard surface

**23 departments** exist as real dashboard pages (verified from the tool catalog): Content Marketing, SEO, Social Media, Email Marketing, WhatsApp Marketing, Paid Ads, Graphic Design, Video Marketing, 3D Studio, Website Builder, Brand Kit, Leads & CRM, Competitor Intel, Research Agent, Growth Advisor, CRO, Marketing Strategy, Influencer Marketing, Retargeting, Analytics & Reporting, Automation, Business Memory, Team.

Every department is usable directly *and* callable through Master Chat. The department page and the chat tool call the **same underlying agent function** — there is no duplicated logic between them.

### 3.3 Business Brain — shared context

`getBusinessContext()` is a single unified assembler that returns everything the AI knows about a business: name, category, city, tone of voice, knowledge facts, brand voice, team, and memories. Optionally scoped to a specific lead.

It is used by Master Chat, live phone calls, DM auto-replies, and website chat — so **every AI surface has the same understanding of the business**. Before this was unified, each surface fetched a different, inconsistent subset.

### 3.4 Memory system

Two layers:
- **`business_memory`** — dealership-wide facts and insights the AI has learned or been told.
- **`getLeadMemory()`** — per-lead history, so a follow-up call or message can reference what actually happened with *that person* before.

Memory is injected into prompts through `getBusinessContext`, not fetched separately at each call site.

### 3.5 Event Bus

A **Postgres outbox pattern**, not a message broker:
- `event_queue` table holds pending events.
- `pg_cron` fires every 2 minutes, calling a dispatch API route via `pg_net`.
- `eventHandlers.ts` maps event types to subscriber functions.

**Why this design:** LISTEN/NOTIFY and Supabase Realtime both require a persistent connection, which a 100%-serverless app doesn't have. The same cron schedule also drains the task queue, so no second scheduler was needed.

### 3.6 Task Queue

`agent_tasks` — work the AI should do *later*, separate from the human `tasks` table. (These were kept separate deliberately: `tasks.assigned_to = null` already meant "AI does this now," which would have collided with "queued for later.")

Executors are registered in a plain object registry. Failed tasks retry up to 3 times with a 5-minute backoff, then are marked failed.

### 3.7 Orchestrator & Goals

A **Goal → Plan → Task** system:
- A user sets a goal in natural language.
- `goalPlanningAgent` decomposes it into concrete tasks (human tasks and AI tasks).
- **Crucially, it drafts only.** Goals are created in `draft` status with `proposed_tasks` stored as JSON. Nothing becomes a real task until a human explicitly confirms.
- The Orchestrator is **reactive, not autonomous** — it watches for goal-linked task completion/failure via the Event Bus and updates goal state. It does not independently decide to do new work.

### 3.8 AI Routing layers

Two separate routers, both deliberately configuration-driven rather than AI-driven:

- **AI Task Router** — classifies a known task identity as SIMPLE / NORMAL / COMPLEX / CRITICAL and maps that to a model tier. Classification is by *task identity*, not by running an LLM call to classify the request — since almost every call site already knows exactly what task it's performing.
- **Research Router** — classifies a research request as QUICK / STANDARD / COMPLEX / DEEP and picks a provider. QUICK/STANDARD use Claude's own web search (no extra provider cost); COMPLEX/DEEP would use Perplexity.

### 3.9 Agent Personas

Three personas — **Sales, Support, Receptionist** — each with its own goals and (on phone calls) its own tool allowlist. A business owner assigns which persona handles which channel (outbound calls, inbound calls, DMs, website chat).

This is **configuration, not AI-chosen routing**. No intent classifier picks the persona, because a misroute (a complaint handled by a sales persona) would be a real failure. Defaults reproduce the system's prior behavior exactly.

### 3.10 Permission, Approval & Audit

- **Execution Policy** — a registry classifying every sensitive action by risk and type.
- **Approval Authority** — role + a configurable ₹ threshold determine who can approve what.
- **Approval Center** — blocked actions become real queued requests rather than dead-ending in a 403.
- **Audit Log** — an append-only record of approvals, AI call actions, auto-pauses, data exports/erasures.

**The load-bearing safety rule across the whole system:** launching an ad campaign creates it **PAUSED** on every platform. Activation — the only step that actually spends money — is a separate, approval-gated action.

---

## 4. Feature Inventory

### AI Phone Calling (Vapi)
- Outbound calls to leads, inbound call handling.
- **7 live-call tools** the AI can use mid-conversation: `check_availability`, `create_appointment`, `update_lead`, `check_order_status`, `escalate_to_human`, `log_complaint`, `request_refund`.
- Post-call: automatic transcript scoring into hot/warm/cold with a reason, call summaries, follow-up detection.
- Persona-driven prompts and per-persona tool scoping (the Sales persona has no refund capability).
- **Inbound calling is code-complete but dormant** pending DLT telecom registration in India.

### Advertising
- **Meta (Facebook/Instagram)** — fully live and proven: AI-generated ad plan, creative image generation, two-phase preview → launch, campaign performance snapshots, budget alerts, auto-pause on poor performance, creative variant testing.
- **Google Ads** — Search (keyword-targeted) and Display formats. AI-suggested but dealer-editable keywords.
- **Pinterest, Snapchat, LinkedIn** — full connect + launch + activation flows.
- All platforms share one generic schema and the same approval gate.

### Content & Creative
- Content Marketing (blog posts, captions, calendars), SEO (keywords, pages, blog posts, AEO/answer-engine optimization), Social Media management, Email Marketing, WhatsApp Marketing.
- Graphic Design with a full canvas editor (Fabric.js), AI image generation.
- Video Marketing with AI video generation, YouTube publishing.
- 3D Studio — Claude writes real WebGL scenes.
- Brand Kit generation (logo, palette, voice).

### Website Builder & E-commerce
- Block-based drag-and-drop site builder (Shopify-style), landing pages, multi-page sites, custom domains.
- Full storefront: product catalog, cart, checkout, orders, discount codes, shipping, Razorpay payments.

### Leads & CRM
- Lead pipeline with AI scoring, temperature, qualification reasoning.
- Appointments, retention/churn detection, cold-lead detection, complaints, refund requests.
- **Cross-channel identity resolution** — a DM and a phone call from the same person are linked into one lead. Exact phone match auto-merges (recorded in the audit log); ambiguous matches always require human confirmation.

### Intelligence & Research
- Competitor Intel (social monitoring, pricing comparison, SEO comparison, content gaps, new-product alerts).
- Research Agent (industry trends, market research, opportunities, customer sentiment from real lead data).
- Growth Advisor, CRO suggestions, Marketing Strategy, Business Insights.

### Automation
- **Automation Command Center** (`/dashboard/autopilot`) — every automation toggle in one place.
- Daily cron running 13+ subsystems per business with uniform run logging.
- Marketing automation workflows, email automation sequences, content autopilot, seasonal campaign prep.

### Analytics
- Lead scoring distribution, source breakdown, monthly trends, campaign performance.
- **Multi-touch attribution** — first-touch / last-touch / linear models shown side by side (they genuinely disagree; which to trust depends on sales-cycle length).
- **LTV & cohort analysis** — with an honesty rule: below a 5% repeat-purchase rate the UI relabels it "Average customer value" and explains that one-off-purchase businesses aren't underperforming.
- Website analytics, growth metrics.

### Agency Features
- Portfolio view across all managed businesses with combined totals (blended ROAS = total revenue ÷ total spend, never an average of ratios).
- Cross-business team management (person × business grid).
- Agency billing report — real per-client AI cost.
- **Per-client usage caps** — an agency can cap a client *below* their plan (never above).
- White-label report branding.

### Tool Marketplace
A browsable catalog of **46 entries** — every AI capability with its department, description, and deep link. Includes 5 page-only capabilities that have no chat tool, because a marketplace showing only chat-callable tools would hide real capability.

### Security & Compliance
- Two-factor authentication (TOTP, via Supabase Auth MFA).
- SSO (built, inactive — see §9).
- **Data export & erasure** for customer data-subject requests (India's DPDP Act). Erasure deletes communication content outright while retaining financial records de-linked, since transaction records must legally be kept.
- Audit log, RLS on essentially every table.

---

## 5. Master Development Specification — Summary

A 37-section architecture document implemented across four priority tiers. **All four are complete.**

**P0 — Must-fix.** Cost governance (generation caps, closing an uncapped image-generation bypass), Automation Command Center consolidation, permission/execution policy, Approval Center, database documentation, immutable audit log.

**P1 — Core Intelligence.** Central Orchestrator, Memory system, Context Engine, Event Bus, Automation Engine 2.0, Goal→Plan→Task, Task/Work Queue, Execution Observability, Retry/Recovery. Research found this genuinely greenfield — no routing layer, pub/sub, or task queue existed before.

**P2 — Genuinely Agentic.** Model Router, Sandbox Mode (draft-then-confirm for goals), AI Evaluation Center, Self-Evaluation, Cross-Channel Identity, Business Outcome Engine, Strategy→Execution Loop.

> **The defining constraint of P2:** every piece was scoped to *"AI suggests, human approves."* **Zero new fully-autonomous action was added anywhere in P2.** Self-evaluation improves what a human reviews; it never skips the review.

**P3 — Scale.** DM/chat context unification, per-lead personalization, RLS hardening, agency switching fix, Sales/Support/Receptionist personas, 4 additional ad platforms, agency controls, advanced analytics, enterprise security.

---

## 6. Usage / Pricing / Cost-Control — Summary

A separate 30-section specification covering subscription tiers, usage metering, AI routing, research routing, calling usage, overage billing, and cost control. **Phases 1–3 complete; Phase 4 is 4-of-5 complete with one piece legally blocked.**

**Phase 1** — Centralized plan config (added the Growth tier, repriced Pro and Agency), Research Router, AI Task Router, Vapi usage tracking verification.

**Phase 2** — Research Credits (an internal billing abstraction computed from *real provider cost*, never a fixed token count), Cost Engine with a `provider_costs` configuration table, extended admin cost dashboard.

**Phase 3** — UsageGuard (a single facade over four pre-existing enforcement mechanisms), research-credit enforcement, provider failover, and a platform-wide daily spend alert.

**Phase 4** — Invoice/billing record-keeping, per-client usage caps, department spend visibility, predictive cost monitoring, margin optimization findings.

### Customer-facing principles enforced throughout
- **Never expose provider names** to customers. They see "AI Employee," "Web Intelligence," "Deep Research" — not "Claude," "Perplexity," or "Gemini."
- **Never show real provider cost** to a customer. They see credits, tasks, and minutes remaining. Real cost is admin-only.
- **Say "Included minutes," never "Free minutes."** Those minutes are paid for as part of the subscription.

### What remains blocked
**GST / tax on invoices.** Every invoice currently shows ₹0 tax with a visible banner explaining why. Twelve specific questions are with a chartered accountant covering GST registration and rate, buyer GSTIN capture, SAC code, CGST+SGST vs IGST determination, mandated invoice numbering, e-invoicing thresholds, overage tax treatment, continuous-supply timing, multi-entity consolidation, credit notes, and reverse-charge liability on foreign AI vendors.

This was deliberately **not guessed**. The invoice schema was built so the tax step slots in without reshaping anything.

---

## 7. Database Schema Overview

**~90 tables across 148 migrations**, all in PostgreSQL via Supabase.

### Tenancy model
`dealerships` is the tenant root — nearly every table hangs off `dealership_id`. (The name is a legacy of the original car-dealership vertical; it means "business.") One user can own multiple businesses (the Agency model).

### Table groups

| Group | Representative tables | Purpose |
|---|---|---|
| **Core & Team** | `dealerships`, `profiles`, `team_members`, `tasks`, `agency_branding` | Tenancy, auth, roles, agency white-labeling |
| **Leads & CRM** | `leads`, `calls`, `appointments`, `lead_notes`, `complaints`, `refund_requests`, `lead_touchpoints` | Customer records and interaction history |
| **Ads & Attribution** | `ad_creatives`, `campaign_performance_history`, `lead_touchpoints` | Multi-platform campaigns, daily performance snapshots |
| **Approvals & Automation** | `pending_approvals`, `audit_log`, `workflows`, `workflow_steps`, `automation_run_log` | Human-in-the-loop gating and scheduled work |
| **Content & Creative** | `content_pieces`, `graphic_designs`, `video_generations`, `brand_profiles` | Generated assets |
| **Channels** | SEO, social, email, WhatsApp, influencer, affiliate toolkit tables | Per-channel content and config |
| **Intelligence** | `competitor_intel_items`, `research_items`, `topic_watches`, `business_memory` | Research outputs and learned facts |
| **Website & Commerce** | website builder tables, `products`, `orders`, `discount_codes` | Storefront and site building |
| **AI Infrastructure** | `event_queue`, `agent_tasks`, `goals`, `agent_persona_settings`, `business_memory` | Orchestration, queueing, personas |
| **Billing & Usage** | `plan_limits`, `api_usage_logs`, `daily_message_usage`, `calling_minutes_usage`, `monthly_generation_usage`, `research_credits_usage`, `provider_costs`, `invoices`, `billing_profiles`, `billing_events`, `client_limit_overrides`, `platform_settings` | Metering, cost tracking, invoicing |
| **Notifications** | `notifications` | Proactive alerts with deduplication |

### Row-Level Security
The dominant pattern (~75+ tables) is ownership-based:
`dealership_id in (select id from dealerships where owner_id = auth.uid())`

Deliberate deviations: shared reference data (`plan_limits`, `seasonal_events`) is readable by any authenticated user; global platform knowledge (`marketing_knowledge`) has no RLS; a few tables use `security definer` helper functions to avoid RLS recursion between `dealerships` and `team_members`.

**Two historical RLS bugs, both found and fixed**, are documented in the schema reference — worth knowing because they illustrate the failure mode: scoping access via `profiles.dealership_id` instead of ownership accidentally granted every team member (including the lowest-privilege `viewer`) access to billing and ad tables, and removing a member didn't revoke it.

---

## 8. Key Architectural Decisions

These are judgment calls made during development, recorded because a decision only visible in a diff isn't actually disclosed.

**Ads: gate activation, not launch.** Launching always creates a campaign PAUSED — no money moves. So the approval gate sits on *activation*, the actual spend trigger. "Anyone can draft, only authority can spend."

**Approval threshold uses daily budget.** A ₹500/day campaign and a ₹500 one-time spend read as the same "amount" today, though one recurs indefinitely. A known imprecision, logged rather than hidden.

**Blocked actions become queued requests.** A blocked activation doesn't dead-end in a 403 — it becomes a real request in the Approvals queue so whoever holds authority can act on it.

**Re-authorize against modified amounts.** If an approver raises a requested budget while approving, authority is re-checked against the *new* number — otherwise someone could get unauthorized spend approved by "modifying" a lower request upward.

**Event Bus over a message broker.** LISTEN/NOTIFY and Realtime need persistent connections a serverless app doesn't have. A Postgres outbox + cron was the honest fit.

**Separate AI task queue from human tasks.** `tasks.assigned_to = null` already meant "AI does this now"; reusing it for "queued for later" would have collided.

**Personas are configuration, not AI routing.** A misrouted complaint is a real failure, so persona assignment stays a human decision.

**Model routing by task identity, not live classification.** Running an LLM call to classify which model to use would itself be the "don't blindly use expensive models" problem the router exists to solve.

**Margin findings are rule-based, not AI-generated.** An LLM asked to "suggest margin optimizations" produces generic advice that reads as insightful and says nothing specific. Rules over precise data produce checkable findings.

**Overrides can only tighten, never loosen.** An agency capping a client below their plan is a legitimate control; letting overrides *raise* limits would be a back door around pricing.

**Show uncertainty rather than fake precision.** The spend projection returns *no number at all* under 3 days of data — not a caveated one. Below a 5% repeat rate, "LTV" is relabeled "average order value." Invoices show ₹0 tax with an explanation rather than a guessed 18%.

**Financial records are retained through data erasure.** A customer erasure deletes their communication history outright but retains order and refund records de-linked, because transaction records must legally be kept.

---

## 9. Current Status

### Fully live and working
- Master Chat with 44 tools, all 23 department pages
- Meta (Facebook/Instagram) advertising — the one proven, end-to-end ad path
- Outbound AI calling via Vapi
- Website builder, storefront, e-commerce, Razorpay for customer storefronts
- Leads/CRM, appointments, complaints, refunds
- All automation, approvals, audit logging
- All analytics including multi-touch attribution, LTV, cohorts
- Agency portfolio, team, billing, per-client caps
- Two-factor authentication
- Data export and erasure
- Usage metering, cost tracking, admin cost dashboard, spend alerts, projections, margin findings

### Code-complete but awaiting credentials or approval

| Feature | Blocked on |
|---|---|
| **Google Ads** launch | `GOOGLE_ADS_DEVELOPER_TOKEN` with Basic Access (OAuth already works) |
| **Pinterest Ads** | Register a Pinterest app → standard (non-trial) API access → client ID/secret |
| **Snapchat Ads** | Register a Snap app → Marketing API access → client ID/secret |
| **LinkedIn Ads** | Marketing Developer Platform approval (strictest of the four) + a company page |
| **Perplexity research** (COMPLEX/DEEP) | `PERPLEXITY_API_KEY` — currently falls back to Claude's own web search |
| **SSO** | A paid Supabase plan with SSO enabled + a registered identity provider |
| **Inbound AI calling** | DLT telecom registration (India) |
| **GST/tax on invoices** | Chartered accountant answers to 12 specific questions |

> **Important honesty note about the ad platforms:** Meta is the only advertising platform that has actually launched a real campaign. Google, Pinterest, Snapchat, and LinkedIn are structurally complete — every route builds and typechecks, and all follow the same PAUSED-then-approval-gated pattern — but **not one line of their API code has run against a live account.** They were built from each platform's published API documentation without sandbox access. First real launch on each will likely surface field-level corrections (required parameters, enum values, format constraints). That is normal for integrations written this way, not a sign something is broken.

### Not built (deliberately)
- **Automated recurring billing** — no merchant account; upgrades are arranged manually via WhatsApp.
- **Credit notes** — correcting a settled invoice is itself an open compliance question.
- **Per-department usage caps** — would duplicate the resource caps that already exist on a less cost-relevant axis. Department spend *visibility* was built instead.
- **Per-request CostGuard** — every expensive operation is already hard-capped before execution; a platform-wide daily spend alert was built instead, since aggregate runaway spend is what per-request caps structurally cannot catch.
- **TikTok Ads** — banned in India since 2020; no value for this customer base.

### Known limitations
- The platform spend alert reports the **previous complete day** (~24h latency), acceptable because per-request caps bound single-day damage.
- Admin revenue for past months reflects *today's* plan assignments, not what was actually billed — automated billing history would fix this.
- `provider_costs` is a durable configuration record; the hot-path cost functions use in-code constants kept manually in sync (a deliberate choice — prices change rarely, and a DB round-trip on every AI call isn't worth it).

---

## Quick Reference

- **Tenant table:** `dealerships` (means "business" — legacy name)
- **Master Chat tools:** 44
- **Live-call tools:** 7
- **Departments:** 23
- **Tool marketplace entries:** 46
- **Database tables:** ~90 across 148 migrations
- **Plan tiers:** Free / Basic / Growth / Pro / Agency (₹0 / ₹1,999 / ₹3,999 / ₹14,999 / ₹49,999)
- **Core rule:** one AI employee, not 40 tools — the customer buys the outcome
- **Core safety rule:** ads launch PAUSED; activation is separately approval-gated
