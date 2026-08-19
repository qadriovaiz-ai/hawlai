# Database Reference

87 tables across 127 migrations (`supabase/migrations/001` → `127`, no file numbered 046). This is a map, not a replacement for the migrations: it tells you which table does what and which file to open for exact columns/types. When the two disagree, the migration files are correct — this doc can drift, they can't.

## RLS patterns

**Pattern 1 — dominant (~75+ tables):** `dealership_id in (select id from dealerships where owner_id = auth.uid())`, established in `001_schema.sql`. Sometimes applied via a join through a parent table (e.g. `workflow_steps` → `workflows.dealership_id`) rather than a direct column. This is the default for every dealer-owned table unless noted otherwise below.

**Pattern 2 — team-member read, function-based (rare, one policy):** `public.is_active_team_member(target_dealership_id)`, defined in `117_fix_dealerships_team_read_recursion.sql`. Used only for the `dealerships_team_read` SELECT policy on `dealerships` itself. It replaced an inline-subquery version (migration 071) that caused infinite RLS recursion (Postgres 42P17) because `dealerships` and `team_members` policies each subqueried the other — wrapping the check in a `security definer` function breaks the cycle.

**Related function-based policies (distinct from Pattern 2 — don't conflate):**
- `public.is_admin_or_marketing_manager(target_dealership_id)` (071) — ORs with Pattern 1 on `leads`, and later `ad_creatives` (105).
- `public.is_assigned_sales_rep(lead_assigned_to)` (072) — scopes Sales-role members to just their assigned leads, on `leads` only.
- `team_members_self_read`: `user_id = auth.uid()` (070) — lets a just-invited member confirm their own row.

**Deviations:**
- `profiles.id = auth.uid()` on `profiles` itself.
- `owner_id = auth.uid()` direct, no subquery — `dealerships` (the anchor table) and `agency_branding` (keyed by `owner_id`, not `dealership_id`, since it's agency-scoped).
- `to authenticated using (true)` — `plan_limits` and `seasonal_events`: shared, non-secret, platform-wide reference data.
- **No RLS at all** — `marketing_knowledge` (explicitly global platform knowledge, not per-business data) and the usage-counter tables (`monthly_generation_usage`, `daily_generation_usage`; `daily_message_usage`/`calling_minutes_usage` do have a policy but it's owner-only per the fix below). These are trusted only because every write goes through a service-role client with an already-verified `dealershipId` — RLS doesn't enforce it, the caller does.

**Historical bug, fixed:** `ad_creatives`, `daily_message_usage`, and `calling_minutes_usage` originally scoped access via `profiles.dealership_id` instead of ownership. Since team-invite acceptance sets that column, any active team member — including the lowest-privilege `viewer` role — got read/write access, and removing a member didn't revoke it (`profiles.dealership_id` was never cleared on removal). Migration `105_fix_ad_creatives_overgrant.sql` fixed all three: usage/billing tables became strictly owner-only, `ad_creatives` moved to owner OR `is_admin_or_marketing_manager()`.

---

## A. Core Platform & Team

| Table | Purpose | File |
|---|---|---|
| `dealerships` | Tenant root — every other table hangs off `dealership_id`. Accumulates ~40 integration columns over time (`fb_*`, `google_ads_*`, `razorpay_*`, `shopify_*`, auto-* toggles, `approval_threshold`). | `001` |
| `profiles` | One row per `auth.users` id — `dealership_id`, `role`. Auto-created on signup via `handle_new_user()` trigger. | `001` |
| `team_members` | Owner-invited scoped roles. Deliberately does NOT touch the ~54 existing owner-only RLS policies elsewhere — team-facing pages do manual role checks in app code instead. | `070` |
| `tasks` | AI-assigned work-item inbox for team members (`assigned_to`, `department`, `context`). | `070` |
| `agency_branding` | White-label report branding, keyed by `owner_id` (one agency owner spans multiple dealerships). | `104` |

## B. Leads, CRM & Customer Ops

| Table | Purpose | File |
|---|---|---|
| `leads` | Core CRM record. Most heavily altered table in the schema — scoring, DND/consent, sales-rep assignment all layered on later. | `001` |
| `calls` | AI calling record — Vapi call id, transcript, and (since `120`) structured intent/sentiment/urgency. | `001`, `002` |
| `appointments` | `appointment_type` was car-dealership-specific until `038` genericized it (`test_ride`/`showroom_visit` → `meeting` default). | `001` |
| `lead_notes` | Free-text CRM notes per lead. | `015` |
| `lead_tasks` | Lead-specific to-dos — distinct from the team-wide `tasks` table (070). | `015` |
| `lead_touchpoints` | Multi-touch attribution, Phase A — one row per real touch via `visitor_id`. Full cross-channel attribution deliberately deferred. | `112` |
| `opportunities` | Shared push-feed (`type` + `reference_id` dedupe) other agents write into instead of each building its own alert system. | `010` |
| `complaints` | Complaint lifecycle (open → in_progress → resolved), distinct from escalations. | `123` |
| `refund_requests` | Request-only — a human must approve before Razorpay is actually called. | `124` |

## C. Ads, Campaigns & Attribution

| Table | Purpose | File |
|---|---|---|
| `ad_creatives` | The core Meta Ads object — creative, budget, Meta ids, status. See the RLS over-grant fix above (`105`). | `003`, extended `007`/`011`/`019`/`107` |
| `campaign_performance_history` | Daily performance snapshot so history survives independent of Meta API access. | `021` |
| `paid_ads_plans` | AI planning content (not live-launched) for platforms with no real integration — Google/LinkedIn/TikTok/Snapchat/Pinterest. | `034` |
| `retargeting_campaigns` | Segment-targeted ad copy (abandoned_cart / cold_lead / lapsed_buyer). | `087` |
| `campaign_groups` | Cross-channel orchestration, Phase A — groups existing assets under one named initiative. Named to avoid colliding with `ad_creatives`' own "campaign" meaning. | `114` |
| `campaign_group_assets` | Polymorphic membership (`asset_type` in ad_creative/workflow/social_post) — no real FK possible across three tables, validated app-side. | `114` |

## D. Approvals & Marketing Automation

| Table | Purpose | File |
|---|---|---|
| `pending_approvals` | Human Approval Layer — agent actions over a threshold write here instead of executing directly. `modified_details` (`127`) supports approve-with-modification. See note below — this table's core "pending" path sat effectively unused for a long stretch before P0 Section 11 (Aug 2026) wired real producers into it. | `006`, extended `127` |
| `workflows` | Dealer-configurable trigger→steps automation (Workflow Builder). | `040` |
| `workflow_steps` | Ordered steps per workflow. Only email is a real automated action — WhatsApp/SMS steps aren't wired (no paid API/gateway connected). | `040` |
| `workflow_step_runs` | Execution log, `unique(step_id, lead_id)`. | `040` |
| `auto_reply_log` | Log of automatic FB/IG DM & comment auto-replies (opt-in, off by default). | `033` |
| `email_automation_log` | Log for automatic welcome/follow-up emails (opt-in). | `037` |
| `content_autopilot_log` | Log of fully-automatic AI image+caption social posts. | `050`, extended `075` |
| `social_post_queue` | Approved Content Queue — pre-approve a batch of posts for autopilot to publish on schedule. | `091` |
| `automation_run_log` | Unified per-run history across all 13 daily cron subsystems (only 3 previously had any log, each shaped differently). | `126` |

## E. Content, Creative & Brand Studio

| Table | Purpose | File |
|---|---|---|
| `brand_profiles` | Tone/persona/messaging pillars so every agent generates consistent output. | `005`, extended `098` |
| `brand_kits` | Full brand identity (colors, typography, tagline, story, logo) — separate from `brand_profiles`' copy-tone focus. | `027` |
| `marketing_strategies` | Saved monthly budget/goal roadmap. | `016` |
| `deep_strategies` | Cached Full Strategic Analysis (avoids regenerating on every panel open). | `026` |
| `marketing_calendar` | Planning layer distinct from `ad_creatives`. Sat unused (read by no agent or cron) from creation until `108` wired seasonal events into it — see note below. | `009`, activated `108` |
| `content_pieces` | All 20 Content Marketing output types (posts, carousels, blogs, scripts, hooks, CTAs). | `028` |
| `graphic_designs` | Gallery index for all 13 Graphic Design types — actual image lives in Storage. | `029` |
| `video_marketing_pieces` | Text/planning video outputs (ideas, scripts, subtitles) — distinct from actual AI video generation. | `030` |
| `video_generations` | Async AI video job tracker (Veo). `operation_name` is soft-deprecated in favor of `task_id` since `065`, kept only for backward compat. | `017`, extended `065`/`076` |
| `canvas_designs` | Editable design document (element array w/ position/z-index) — distinct from `graphic_designs`' one-shot finished PNGs. | `073` |
| `three_d_scenes` | AI-authored self-contained Three.js HTML scenes, rendered in a sandboxed iframe. | `077` |

## F. Channel Toolkits — SEO, Social, Email, WhatsApp, Influencer/Affiliate

Most share one shape: `dealership_id, task_type, output jsonb` — generic AI-generation-result tables covering tasks not already handled by a real integration elsewhere.

| Table | Purpose | File |
|---|---|---|
| `seo_toolkit_items` | 8 SEO tasks (competitor keywords, internal linking, meta tags, schema, site speed, backlinks, local SEO, GBP). | `031` |
| `seo_pages` | Real lightweight topic/service SEO pages, multiple per dealership. | `045` |
| `social_management_items` | Reply suggestions, DM templates, growth strategy, viral trend detection. | `032` |
| `email_marketing_pieces` | Welcome/abandoned-cart/promo/newsletter/sequence content generation. | `036` |
| `email_sends` | Real open/click tracking via Resend webhooks. Gmail-sent emails are logged for volume only, never tracked. | `088` |
| `whatsapp_marketing_pieces` | 7 content tasks for the free click-to-send (wa.me) flow — not the paid Business API. | `039` |
| `whatsapp_verification_codes` | Short-lived OTP gating WhatsApp control of Master Chat. | `078` |
| `whatsapp_chat_sessions` | Rolling Master Chat conversation state keyed by phone number. | `078` |
| `influencers` | Collaboration-management CRM with dealer-entered ROI numbers (no attribution pixel). `discount_code` (`083`) adds real automatic ROI attribution. | `047`, extended `083` |
| `influencer_outreach_plans` | Persists AI outreach-plan output, which previously had no DB row at all. | `082` |
| `collab_listings` | Public "open collab" board postings. | `084` |
| `collab_applications` | Public, no-account applications against a listing. | `084` |
| `affiliates` | Ongoing commission relationships (vs. influencers' one-off collabs), reusing the discount-code attribution pattern. | `085` |

## G. Competitor Intel, Research, Growth & Reputation

| Table | Purpose | File |
|---|---|---|
| `competitor_intel_items` | Generated reports (social monitor, pricing compare, SEO comparison, content gap) via web search. | `042` |
| `competitor_watches` | Which competitors a dealer is actively monitoring. | `042` |
| `competitor_alerts` | Deduped daily-cron findings about watched competitors. | `042` |
| `research_items` | Industry trends, market research, opportunities (web-search grounded), sentiment (from real lead data). | `043` |
| `topic_watches` | Generic version of `competitor_watches` — watch any topic. | `043` |
| `topic_alerts` | Cron-detected news items for watched topics. | `043` |
| `growth_advisor_items` | Growth opportunities, revenue forecast, budget recommendations — reasons over real internal data. | `049` |
| `report_snapshots` | Point-in-time weekly/monthly stat snapshots (vs. live numbers elsewhere). | `048` |
| `google_reviews_snapshot` | Daily Google Places reputation snapshot, idempotent-by-day upsert. | `103` |
| `seasonal_events` | Platform-wide (not per-dealership) festival calendar — shared reference data, `select` open to all authenticated users. | `108` |

## H. CRO & Web Analytics

| Table | Purpose | File |
|---|---|---|
| `page_events` | Real visitor event tracking on the public landing page — inserted via service-role client from unauthenticated visitors. | `041`, extended `044`/`112`/`113` |
| `cro_items` | Landing-page CRO suggestions using real `landing_pages` content + real `page_events`. | `044` |
| `ab_tests` | Real headline/CTA A/B tests actually served to visitors. | `044` |

## I. Website Builder & Domains

| Table | Purpose | File |
|---|---|---|
| `landing_pages` | One public hosted landing page per dealership — rendered server-side with a service-role client (content is never sensitive). | `013`, extended `014`/`045` |
| `websites` | Genuine multi-page site builder, distinct from single-page `landing_pages` and standalone `seo_pages`. | `052`, extended `053`–`064` |
| `website_pages` | Ordered pages per site, section-block content. `is_fallback` (`097`) flags a real incident where placeholder text silently overwrote live content on API failure. | `052`, extended `063`/`097` |
| `domain_orders` | Registrar-agnostic custom domain purchase requests. | `055`, extended `059` |

## J. E-commerce / Storefront

| Table | Purpose | File |
|---|---|---|
| `products` | Real product catalog (previously AI-invented placeholder text). | `054` |
| `orders` | Real order capture — COD-only at creation, no fake payment-successful state. Razorpay fields only set after server-side signature verification. | `054`, extended `057`/`058`/`060` |
| `discount_codes` | Real coupons, always server-recomputed at order time. | `057` |
| `reviews` | Verified-purchase-only — looked up server-side from a real delivered order, never trusted from client. | `061` |
| `abandoned_carts` | Only written once the customer voluntarily typed contact info into checkout. No auto follow-up — dealer follows up manually. | `062` |

## K. Master Chat & AI Knowledge/Memory

| Table | Purpose | File |
|---|---|---|
| `chat_conversations` | Persistent Master Chat sidebar history. | `051` |
| `chat_messages` | Chat transcript. `artifacts` (`081`) persists tool-result cards across reloads; `feedback` (`092`) captures thumbs up/down. | `051`, extended `081`/`092` |
| `business_memory` | Durable cross-conversation learnings, pulled into every Master Chat turn. `related_entity_type/id` (`102`) links an insight back to its source lead/call/campaign. | `089`, extended `102` |
| `marketing_knowledge` | Global (platform-wide) RAG knowledge base — frameworks/case studies/playbooks via pgvector + Voyage embeddings. No RLS (explicitly shared, not private data). | `090`, extended `092`–`094` |
| `business_knowledge` | Per-dealership structured facts (hours, pricing, policies, FAQ) for the AI Communication Employee — deliberately simple/structured, not a vector store (assumes <100 rows/business). | `118` |

## L. Billing, Plans & Usage

| Table | Purpose | File |
|---|---|---|
| `api_usage_logs` | Exact per-call cost/usage log. Only instrumented on the highest-traffic call sites (Master Chat, calling webhook) at time of writing, not retrofitted everywhere. | `069`, extended `074` |
| `plan_limits` | One row per tier (free/basic/pro/max→agency), all numeric limits + feature flags — source of truth so the app reads limits from data, not code constants. Open-read RLS (non-secret pricing data). | `079`, extended `086`/`096`/`099`/`125` |
| `daily_message_usage` | Fast daily message-limit counter, separate from the full `api_usage_logs` audit trail. See RLS over-grant fix above. | `079` |
| `calling_minutes_usage` | Monthly AI-calling minutes + overage charge tracker. Same RLS fix history as `daily_message_usage`. | `079` |
| `monthly_generation_usage` | Generic monthly counters (image/video/voiceover/brand_kit/website_build), one `resource` discriminator column instead of 5 near-identical tables. No RLS — service-role only. | `100` |
| `daily_generation_usage` | Tighter daily cap for video + voiceover specifically (priciest per-unit resources), on top of the monthly cap. | `125` |

## M. Notifications

| Table | Purpose | File |
|---|---|---|
| `notifications` | In-app notification centre — a sink for alerts that already existed elsewhere but had no in-app home, not new detection logic. The `kind` CHECK constraint is extended in nearly every migration that adds a new alert type — see history below. | `106` |

`notifications.kind` history: `106` (`competitor_alert, topic_alert, campaign_auto_paused, hot_lead, approval_pending`) → `109` adds `customer_at_risk, lead_going_cold` → `110` adds `campaign_budget_warning, campaign_budget_overrun` → `115` adds `variant_draft_generated` → `121` adds `call_needs_follow_up` and **accidentally drops `variant_draft_generated`** (caught and fixed by `122`) → `122` restores it and adds `call_escalated` → `124` adds `refund_requested`.

---

## Notes worth knowing before touching these

- **`marketing_calendar`** existed from migration `009` but had nothing reading it — no agent, no cron — until `108` finally wired it up via `seasonal_event_id`, 99 migrations later. If you're touching seasonal/calendar code, `108` is where the real logic starts.
- **`pending_approvals` status='pending'**: as of migration `109`'s own audit, no code path ever inserted a row with `status='pending'` — the only insert site (autopilot auto-pause) inserted directly as `'approved'`. **This is now stale** — P0 Section 11 (Aug 2026: `38f6c65`, `dd1168c`) added real producers (`propose_campaign_budget_change`/`propose_campaign_targeting_change` via Master Chat, and blocked ad-activation attempts) that genuinely insert `'pending'` rows and route them through the Approvals queue. Left here as a reminder that a migration comment describing "what nothing does yet" can go stale — check current code, not old comments, before trusting a claim like this.
- **`video_generations.operation_name`** is soft-deprecated since `065` in favor of `task_id` — kept only for backward compatibility with pre-multi-model rows.
