# HAWLAI — COMPLETE AI FORENSIC AUDIT

**Date:** 2026-10-08
**Scope:** read-only. No source file, prompt, schema or migration was changed. No action that could publish, send, spend or modify external state was executed.
**Method:** import/caller tracing, per-case static analysis of `executeTool`, programmatic census of call sites. Every number below was measured by a command, not estimated. Claims I could not prove from static code are marked **UNKNOWN**.

**Two corrections to the earlier read-only audit (`HAWLAI-AI-QUALITY-DIAGNOSIS.md`) are recorded in §19 and §25 (F-13).** The earlier finding "past performance never reaches generation" was too strong: one path does receive it, and a prose-level learning loop exists that I had missed.

---

## 1. Executive summary

Hawlai is a **single-orchestrator, many-tool, one-gateway** system.

- **One model gateway.** All 57 Anthropic call sites in 44 files go through `callClaude` (`src/lib/ai/claude.ts:227`). There is no bypass — `grep` for `anthropic.com` outside that file returns nothing. This is the single most valuable architectural property in the codebase: retries, cost logging, failure classification and operator alerting are therefore universal.
- **One orchestrator.** `runMasterBrainChat` (`masterBrainV2.ts:4341`) is the only chat entry. It has **no intent-detection stage**: Claude tool-use over **58 tools / 53,466 characters of schema** is the entire router.
- **One canonical fact layer.** `BusinessFacts` (`businessFacts.ts`) is genuinely canonical — products, prices, offers, shipping, counts, story — consumed by the claim guard, image briefs and prompts alike.
- **A formal approval registry exists** (`src/lib/publish/types.ts`): 10 `ActionKey`s, `ALWAYS_REQUIRES_APPROVAL`, `ACTION_RISK`. It is well-designed and it **does not cover four chat tools that produce real external side effects** (§12).
- **The feedback loop is partially closed**, not open: numerically for ad planning, in prose for three outcome types, and **not at all per content piece** (§15).
- **67 agent files, 59 tool cases, 341 try/catch blocks, 96 silent `catch {}`, 227 `return null`.** The error surface is the least uniform part of the system (§16, §20).

The system's strength is that almost every guard carries the dated incident that caused it. Its weakness is that those guards are attached to *paths*, not to *surfaces* — so each new path starts unguarded by default.

---

## 2. Complete system map

```
BROWSER
 │  src/components/chat/MasterChatPage.tsx  ("use client")
 ▼
API            src/app/api/chat/* ───────────────────────────── 1 chat entry
 │             src/app/api/<dept>/generate/*  ───────────────── ~30 department entries
 │             src/app/api/public/chat        ───────────────── website widget (visitor)
 │             src/app/api/autopilot/*        ───────────────── unattended cron
 ▼
ORCHESTRATOR   runMasterBrainChat (masterBrainV2.ts:4341)
 │               └─ getContext → getBusinessContext (businessBrain/getBusinessContext.ts:52)
 │                    ├─ gatherBusinessFactsSafely  (canonical facts)
 │                    ├─ team_members               (roster)
 │                    └─ business_memory LIMIT 20   (long-term memory)
 │               └─ retrieveRelevantKnowledge       (Voyage embed → pgvector → rerank → top 5)
 │               └─ systemPrompt  = identity + brandVoice + memory + RAG + facts+rules
 │                                  + sound + channel policy + ~20 KB guidance
 │               └─ cachedTools()  = 58 tool schemas (~53 KB)
 ▼
MODEL          callClaude  → api.anthropic.com   (claude-sonnet-4-6, no temperature set)
 │             loop: for (iteration = 0; iteration < 6)
 ▼
TOOLS          executeTool (masterBrainV2.ts:914)  — 59 cases
 │               ├─ gate: kill switch → plan feature → monthly generation cap
 │               ├─ most cases call a department agent (its own callClaude)
 │               └─ result truncated to 4000 chars before returning to the model
 ▼
GUARDS         guardOrMark / guardGenerated / stripUnsupported      (claims)
               validateAdvertisingClaimCompliance                   (second pattern set)
               withBrandVoiceCheck                                  (advisory only)
               applyLinkRule / applyBioRule                         (platform)
               splitStories                                         (privacy)
 ▼
ARTIFACT       extractArtifact (masterBrainV2.ts:3651) → Artifact[]
 ▼
DATABASE       saveGenerated (masterBrainV2.ts:842) → <dept> table, status draft
 ▼
APPROVAL       PublishAction descriptor (chat/publishActions.ts) — inline card
               createPublishAction (publish/create.ts:168) — pending_approvals queue
 ▼
EXECUTION      publish/executor.ts → platforms/{meta,shopify,wordpress,woocommerce,…}
 ▼
EXTERNAL       graph.facebook.com (31 sites) · api.vapi.ai · gmail · youtube · googleads
 ▼
PERFORMANCE    getCampaignPerformanceState (analyticsAgent.ts:105-126) — a state machine
 ▼
MEMORY         business_memory ← outcomeInsights.ts (3 writers) → back into the prompt
```

---

## 3. Complete agent inventory

**67 files in `src/lib/agents/`.** Entry function and measured caller count (callers exclude the file itself). `callClaude` count is per file.

| Agent file | Entry function | Callers | AI calls | Facts | Truth rules | Claim guard |
|---|---|---:|---:|---|---|---|
| masterBrainV2 | `runMasterBrainChat` / `executeTool` | 0 / 0 (API-only) | 3 | yes | yes | 4 sites |
| contentMarketingAgent | `generateContent` | 5 | 3 | yes | yes | yes |
| paidAdsAgent | `generateAdPlan` | 7 | 1 | yes | yes | yes |
| adEngine (lib root) | `generateAdPlan` | — | 1 | yes | yes | yes (headline+body only) |
| emailMarketingAgent | `generateEmailContent` | 4 | 1 | yes | yes | yes |
| whatsappMarketingAgent | `generateWhatsappContent` | 2 | 1 | yes | yes | yes |
| socialMediaAgent | `generateSocialCaption` | 1 | 1 | yes | yes | yes |
| socialManagementAgent | `generateSocialTask` / `generateAutoReply` | 2 | 2 | yes¹ | yes¹ | yes¹ |
| retargetingAgent | `generateRetargetingCopy` | 2 | 1 | yes | yes | yes |
| seoToolkitAgent | `generateSeoTask` | 3 | 1 | yes | no | yes |
| chatbotAgent | `runSalesAgentTurn` | 1 | 1 | yes² | yes² | yes² |
| brandBuildingAgent | `generateBrandKit` | 2 | 1 | yes | yes | **no** |
| websiteBuilderAgent | `planWebsite` | 3 | 2 | yes | yes | **no** |
| competitorIntelAgent | `generateCompetitorIntel` | 2 | 1 | yes | yes | **no** |
| researchAgentV2 | `generateResearch` | 2 | 1 | yes | yes | **no** |
| graphicDesignAgent | `generateGraphic` | 4 | 0 (Gemini) | yes | n/a | n/a |
| croAgentV2 | `generateCroSuggestions` | 2 | 1 | own `CroFacts` | — | yes |
| **18 further agents calling a model with NO `BusinessFacts`** | | | | | | |
| aeoAgent, businessIntelligenceAgent, callScoringAgent, campaignEditAgent, contentAgent, creativeAgent, deepStrategyAgent, goalPlanningAgent, growthAdvisorAgent, growthAdvisorV2, influencerAgent, optimizationAgent, pitchDeckAgent, reportingAgent, retentionAgent, seoAgent, seoPageAgent, strategyAgent, threeDAgent, videoMarketingAgent, websiteAgent | | | 1–3 each | **no** | **no** | **no** |
| Non-model agents (DB/API only) | agencyBranding, analytics, autopilot, budgetAlert, campaignGroup, churn, coldLead, croAgent, gmail, leadScoring, opportunity, personas, platformSpendAlert, portfolio, reputation, seasonality, shopify, slack, touchpoint, vapiCall, video, voiceover, woocommerce, wordpress, youtube, brandKit, brandVoice, brandVoiceValidation, complianceValidation | | | | | | |

¹ as of `c433380` (Phase 1), customer-copy tasks only. ² as of `c433380`.
Agents with 0 external callers (`seasonalityAgent`, `shopifyAgent`, `masterBrainV2`'s exports) are **reached from API routes**, not dead — `masterBrainV2` is imported by `src/app/api/chat/*`. **Rule 1 observed: nothing is assumed dead.**

---

## 4. Complete tool inventory (59 cases)

Measured per case from the `executeTool` switch body: DB writes = `insert|update|upsert|delete`, reads = `select`, api = `fetch|metaPost`, model = nested generator call, approval = `createPublishAction|pending_approvals|needsApproval`.

### Classification

**A. Read-only (12)** — `read_page`, `business_story`, `competitor_positioning`, `export_leads`, `get_analytics_summary`, `get_customer_sentiment`, `get_follow_up_reminders`, `get_website_analytics`, `diagnose_business`, `plan_budget`, `generate_seo_keywords`(+2 reads), `get_growth_advice`

**B. Generate (no persistence of its own)** — `generate_content`, `generate_email`, `generate_whatsapp`, `generate_graphic`, `generate_cro_suggestions`, `generate_influencer_outreach`, `generate_video_task`, `generate_social_management`, `generate_retargeting_copy`, `research_competitor`, `research_market`, `build_website`
> `generate_content` reports **0 direct writes** because its save happens one line later in the case via `saveGenerated`. Counted under C in practice.

**C. Save (writes a draft row)** — `generate_brand_kit`(1), `generate_logo`(1), `generate_marketing_strategy`(1), `generate_3d_scene`(3), `edit_canvas_design`(1), `create_product_ad`(1), `save_business_story`(2), `remember_insight`(1), `get_report_links`(1), `get_booking_link`(1), `schedule_lead_export`(1), `manage_watch`(1)

**D. Modify business state** — `add_product`(1), `add_lead`(1), `assign_lead`(1), `assign_task`(1), `set_goal`(1), `create_workflow`(2), `update_website_url`(1), `edit_page_text`(1), `set_automation_toggle`(1)

**E. External side effect** — `launch_meta_campaign`(2 API), `activate_meta_campaign`, `pause_meta_campaign`, `publish_to_youtube`, `trigger_call`, `send_email`

**F. Financial / spend** — `activate_meta_campaign` (**the only action that starts spend**), `launch_meta_campaign` (creates real objects, all PAUSED), `propose_campaign_budget_change`, `create_discount_code` (a real price concession)

**G. Publish** — `publish_to_youtube`, `edit_page_text` / `propose_page_meta` / `undo_page_edit` (live site), `launch_meta_campaign`

**H. Customer communication** — `send_email`, `trigger_call`, `generate_social_management` (reply suggestions / DM templates reach customers once used)

**I. Destructive / high-risk** — `set_automation_toggle` (turns on auto-posting, auto-email, auto-calling with no review), `create_discount_code`, `trigger_call`

### Approval coverage (measured)

| Tool | Gate found in code | In `ALWAYS_REQUIRES_APPROVAL`? |
|---|---|---|
| `propose_price_change` | 15 approval references | yes (`update_product_price`, critical) |
| `propose_campaign_targeting_change` | 6 | — (queued to Approvals) |
| `propose_page_meta` | 6 | yes (`update_page_meta`) |
| `edit_page_text` / `undo_page_edit` | 4 each | yes (`update_page_text`) |
| `launch_meta_campaign` | 7 | yes (`launch_ad_campaign`, high) |
| `activate_meta_campaign` | via `switchMetaCampaign` | yes (`activate_ad_campaign`, **critical**) |
| `pause_meta_campaign` | via `switchMetaCampaign` | no — **deliberate and defensible** (stopping spend is safe) |
| **`send_email`** | **none** — calls `sendDealerEmail` directly | **not an ActionKey at all** |
| **`trigger_call`** | **none** — calls `triggerVapiCall` directly | **not an ActionKey at all** |
| **`publish_to_youtube`** | **none** — uploads directly | **not an ActionKey at all** |
| **`set_automation_toggle`** | **none** — updates `dealerships` directly | **not an ActionKey at all** |
| **`create_discount_code`** | **none** — inserts into `discount_codes` directly | **yes, `create_discount_code` is listed, risk "high"** |

The last five are **F-A1 … F-A5** in §25.

---

## 5. Complete model inventory

`src/lib/models.ts:17-26` — three tiers, no fallback model, no per-task table:

| Tier | Model id | Call sites |
|---|---|---:|
| `fast` | `claude-haiku-4-5-20251001` | 2 |
| `standard` | `claude-sonnet-4-6` | **49** |
| `premium` | `claude-opus-4-8` | 6 |

Non-Anthropic:
- **Gemini 2.5 Flash Image** — 5 sites: `adEngine.ts` ×2, `graphicDesignAgent.ts`, `brandKitAgent.ts`, `api/ads/generate-creative/route.ts`
- **Gemini (video)** — `videoAgent.ts`
- **Vapi** — `api.vapi.ai/call`, `api.vapi.ai/assistant` (outbound voice)
- **ElevenLabs** — `voiceoverAgent.ts:26`
- **Perplexity** — `src/lib/research/perplexityClient.ts` (`api.perplexity.ai`)
- **Voyage** — `voyageClient.ts` (embeddings), `rerankClient.ts` (reranking)
- **Meta Graph** — 31 sites

**No `temperature`, `top_p` or `top_k` is set on any model call in the repository.** `grep -rn "temperature" src/lib` returns only `lead_temperature` columns and call-scoring fields. Every generation runs at the provider default.

---

## 6. Complete AI call inventory — the 24-field schema

Rendered in full for the four highest-consequence calls; the remaining 53 follow one of these four shapes and are summarised in §22/§24.

### 6.1 Chat orchestrator
`masterBrainV2.ts:4487` · fn `runMasterBrainChat` · caller `src/app/api/chat/*`
model `getModel("standard")` → sonnet-4-6; selection = hardcoded tier, no condition · system prompt = assembled in-function (identity + brandVoice + memory + RAG + facts + rules + sound + channel + ~20 KB guidance) · user prompt = `history.slice(-10)` + message · tools = all 58 · facts ✓ · products ✓ · knowledge ✓ (RAG top-5) · brand voice ✓ · memory ✓ (20) · performance ✗ · output = free text + tool_use blocks · validation: none on shape · claim check ✓ (as of `c433380`, `checkReplyClaims` after link repair) · quality check ✗ · fallback = `aiFailureMessage(kind)` · error: `{ok:false, failure}` typed · customer-facing: **no** (owner only) · can trigger action **yes** (via tools) · saved: messages persisted by the route · approval: per-tool

### 6.2 Content generation
`contentMarketingAgent.ts:157` · fn `generateContent` · callers: chat `:1021`, `api/content-marketing/generate`, `api/autopilot/content-queue`, `contentAutopilot` ×2
model standard · prompt assembled in-function · tools none · facts ✓ · knowledge ✓ (via `groundingContext`) · brand voice ✓ · memory ✓ (via `groundingContext`) · performance ✗ · recent copy ✓ (anti-repetition, 5) · output JSON via `parseModelJson` · validation ✓ tolerant parse · claim check ✓ `guardOrMark` · quality check **conditional** — `reviseForSpecificity` only when `opts.revise`, passed by 2 of 5 callers · fallback `{text: aiFailureMessage}` + `_cause`/`_detail` · **customer-facing: yes** · action: no · saved ✓ draft · approval ✓ before publish

### 6.3 Website chat widget
`chatbotAgent.ts:~105` · fn `runSalesAgentTurn` · caller `api/public/chat/route.ts:41`
model standard, max_tokens 500 · system prompt in-function · tools none · facts ✓ (`audience: "customer"`, as of `c433380`) · knowledge ✓ (owner rows, `splitStories`-gated) · brand voice partial (tone only) · memory ✗ · performance ✗ · output JSON `{reply, leadCapture, suggestBooking}` · claim check ✓ withheld in `publish` mode · quality ✗ · fallback = a fixed hand-off sentence · **customer-facing: yes, to a visitor, with no human in the loop** · action: creates a lead row via the route · approval: none (correct — it is a conversation)

### 6.4 Ad plan
`adEngine.ts:~27` (`draftAdPlan`) · fn `generateAdPlan` · callers `masterBrainV2` `launch_meta_campaign`, `api/ads/*`
model standard · facts ✓ via `factsPrompt` · performance ✓ **(the one path that gets it)** · claim check ✓ `guardGenerated` on `headline`+`body` only · **`image_scene_prompt` is not guarded** and is painted onto the creative · self-scores `confidence_score`, acted on at `adEngine.ts:101-116` · fallback = a hardcoded template plan with `estimated_leads_low: 10, estimated_leads_high: 25` · **customer-facing: yes (a public ad)** · spends: on activation · approval ✓ `launch_ad_campaign` + `activate_ad_campaign`

---

## 7. Master Brain complete trace

```
USER MESSAGE  (string, from src/app/api/chat/*)
 │
 ├─ NO NORMALISATION. The message is used verbatim as the embedding query
 │  and as the final user turn. No trimming, no language detect, no PII scrub.
 │
 ├─ NO INTENT DETECTION STAGE. ← architectural fact, not an omission in my search
 │
 ▼ getContext(supabase, dealershipId)                      masterBrainV2.ts:117
   └─ getBusinessContext                        businessBrain/getBusinessContext.ts:52
      ├─ gatherBusinessFactsSafely → BusinessFacts | null  (try/catch → null)
      ├─ team_members WHERE status='active'
      └─ business_memory ORDER BY created_at DESC LIMIT 20
      └─ IF facts === null: a SECOND reduced read (dealerships, brand_profiles,
         knowledge) so identity survives — `facts: null` propagates upward
 ▼ PROMPT ASSEMBLY (lines 4355-4487)
   brandVoiceSection   formatBrandVoiceSection(ctx.brandVoice, tone, language)
   memorySection       20 memories, bulleted, unfiltered
   businessFactsSection splitStories(ctx.knowledgeFacts) → usable rows, FULL DUMP
   knowledgeSection    await retrieveRelevantKnowledge(supabase, message) → top 5
   storeFactsSection   truthBlock(storeFacts)  ← unconditional as of c433380
   soundSection        language + tone rule
   channelPolicySection CHANNEL_POLICY_FOR_CHAT
   + ~20 KB of guidance (senior-marketer framing, 20 numbered guidelines)
   groundingContext = brandVoice + memory + businessFacts + knowledge
                      ← threaded into every tool
 ▼ messages = [...history.slice(-10), {role:"user", content:message}]
 ▼ LOOP  for (iteration = 0; iteration < 6)                           :4489
   ├─ callClaude({model: standard, max_tokens: 4096, system, tools: cachedTools(), messages})
   │    attempts default 2 (claude.ts:229), retry on retryable + retry-after honoured
   ├─ IF !result.ok → return {reply: aiFailureMessage(kind)}        ← EXIT 1
   ├─ blocks = data.content; toolUse = blocks.filter(type==="tool_use")
   ├─ IF toolUse.length === 0
   │    text = concat text blocks
   │    → checkedReply(text) = fixReplyLinks → checkReplyClaims     ← EXIT 2 (normal)
   │    → attachTurnImages(artifacts)
   ├─ messages.push({role:"assistant", content: blocks})
   ├─ FOR EACH toolUse block (sequential, not parallel)
   │    ├─ executeTool(...)  in try/catch → {error: err.message}
   │    ├─ IF result.error → logAuditEvent(tool_call_failed)
   │    ├─ extractArtifact(name, input, result)
   │    ├─ attach brandVoiceFlags / storyNote / complianceFlags
   │    └─ toolResults.push(JSON.stringify(result).slice(0, 4000))   ← TRUNCATION
   └─ messages.push({role:"user", content: toolResults})
 ▼ LOOP EXHAUSTED (6 iterations) → canned "that took a lot of steps"  ← EXIT 3
```

### Branch answers

| Question | Answer (measured) |
|---|---|
| Model calls per request | **1–6 orchestrator calls**, plus 1–4 per tool invoked (`get_growth_advice` alone contains 4 nested generator calls). A 3-tool turn can exceed 10 model calls. |
| Tools exposed | 58, every turn, unconditionally. `cachedTools()` (`:798`) adds prompt caching; it does not filter. |
| Multiple tools per turn | Yes — `toolUseBlocks` is iterated. |
| Tools calling a model | Yes, most do. |
| Tools calling other tools | **No.** No `executeTool` case re-enters `executeTool`. `switchMetaCampaign` is a shared helper, not a tool call. |
| Model sees previous tool output | Yes — appended as a `tool_result` user turn, **truncated to 4000 chars**. `_emailPreview` is stripped by a replacer. |
| History | `history.slice(-10)`, raw strings, no summarisation. |
| Context limiting | Only: history 10, memories 20, RAG 5, owner facts `slice(0,12)` inside `formatFactsForCopy`, tool result 4000 chars. **No token budget is computed anywhere.** |
| Tool throws | caught → `{error}` → audit log → fed back as conversation. The loop continues. |
| Retrieval fails | `retrieveRelevantKnowledge` returns `[]` (`retrieveKnowledge.ts:30-34`), section omitted, **model is not told**. |
| Facts fail | `facts: null`. As of `c433380` the truth rules survive and the fact-independent guard runs; before that the whole layer vanished. |
| Malformed model output | `parseModelJson` tolerant parse → `_fallback` + `_cause`/`_detail`; `malformedToolError` (`:903`) converts it to `{error}` at 13 sites. |
| Model hallucinates | Caught only if the hallucination matches a pattern in `claimCheck`. A fabricated **narrative** (founder anecdote, customer quote) matches nothing — see F-N1. |
| Tool returns bad data | **Not validated.** No tool output schema is checked against a contract; `extractArtifact` reads fields defensively with `??`. |

---

## 8. Context architecture (Part 5 map)

| Context source | Origin | Fetched | Reaches chat | Reaches generators | Filtered | Retrieved | Dumped | Trust | Stale risk |
|---|---|---|---|---|---|---|---|---|---|
| Business name / category / city | `dealerships` | per turn | ✓ | ✓ | — | — | ✓ | owner-entered | low |
| Products, prices, stock | `products` | per turn (facts) | ✓ | ✓ | active only | — | ✓ | owner-entered | **yes** (no TTL) |
| Offers | `discount_codes` | per turn | ✓ | ✓ | active | — | ✓ | owner | yes |
| Shipping | `websites` | per turn | ✓ | ✓ | — | — | ✓ | owner | yes |
| Store / product / booking links | `websites`, `products` | per turn | ✓ | ✓ | published only | — | ✓ | derived | low |
| Contact details | **none stored** | — | — | — | — | — | — | — | — |
| Brand voice | `brand_profiles.brand_voice` | per turn | ✓ | ✓ | — | — | ✓ | owner / extracted | yes |
| Business story | `business_knowledge` cat=story | per turn | ✓ | ✓ | **`splitStories`** | — | ✓ full | owner | yes |
| Owner knowledge (other) | `business_knowledge` | per turn | ✓ | ✓ | `slice(0,12)`, 200 chars | **no** | ✓ | owner | yes |
| Marketing knowledge | `marketing_knowledge` | per turn | ✓ | ✓ | similarity > 0.4 | **yes** (embed+rerank) | — | curated | low |
| Long-term memory | `business_memory` | per turn | ✓ | ✓ | LIMIT 20 recency | **no** | ✓ | mixed¹ | yes |
| Lead memory | `business_memory` by lead | on demand | — | call path | by lead | — | ✓ | mixed | yes |
| Conversation memory | request body | per turn | ✓ last 10 | ✗ | count only | — | ✓ | user | n/a |
| Recent content (anti-repeat) | `content_pieces` | per call | ✗ | content paths | LIMIT 5 | — | ✓ | model-generated | low |
| Campaign performance | Meta via `analyticsAgent` | on demand | summary tool | **ads only** | state machine | — | ✓ | platform | yes |
| Order / lead counts | `orders`, `leads` | per turn | ✓ (owner) | ✓ (owner) | `countsAsLead`, `is_test`, `merged_into_lead_id` | — | ✓ | derived | low |
| Reviews / ratings | **none** | — | stated absent | stated absent | — | — | — | — | — |
| Competitor data | `competitor_intel_items` | on demand | tool | ✗ | — | — | ✓ | **model+web** | yes |
| Search data | `search_queries` (GSC) | on demand | SEO tool | SEO | top N | — | ✓ | platform | yes |
| Team roster | `team_members` | per turn | ✓ | ✗ | active | — | ✓ | owner | low |
| Past ads / content | dept tables | on demand | tool | partial | — | — | ✓ | model-generated | low |
| User preferences | `brand_profiles.preferred_language` etc. | per turn | ✓ | ✓ | — | — | ✓ | owner | low |

¹ `business_memory` mixes three provenances with no distinction in the prompt: owner-entered rows, LLM-written rows (`remember_insight`), and auto-written outcome rows (`outcomeInsights.ts`, `source: "auto_analytics"`). The prompt presents all 20 as "real, durable observations". **F-M1.**

---

## 9. Business Facts / truth architecture

**1. What counts as a verified fact.** Anything in `BusinessFacts`, which is assembled from the business's own rows, plus anything appearing in `knownText(f)` — the concatenation of site pages, product names/descriptions, offer labels, owner facts, brand pillars, links and brand description (`businessFacts.ts:758-771`).

**2–5. Storage / creation / update / override.** Postgres tables owned by the business; created and updated by the owner through the dashboard; **overridden by nobody** — there is no admin override path. One documented subtlety: the business's **own site** counts as evidence via `knownText`, which caused the 3 Oct 2026 self-justifying loop; the fix was `content_source` on `website_pages` plus making comparisons unsuppressible.

**6. Facts missing.** As of `c433380`: `factsState` → `FACTS_UNAVAILABLE`; truth rules retained; `stripUnverifiable` runs the fact-independent subset; prices/offers reported as `unverifiable`; `_factsState` marks the output; `safeToAutoPublish` returns false. `contentAutopilot.ts:123` refuses to run at all. **Before `c433380` the entire layer silently disappeared.**

**7. Facts conflict.** **UNKNOWN / not handled.** Nothing reconciles a contradiction between two sources (e.g. a product described as ₹550 whose site page says ₹600). `knownText` is a flat bag — whichever string matches first suppresses the flag. **F-T1.**

**8. Facts stale.** No TTL, no `fetched_at`, no staleness signal anywhere in `BusinessFacts`. A price changed in Shopify but not synced reads as verified. **F-T2.**

**9. Model output conflicts with facts.** The guard wins: `stripUnsupported` removes the sentence (or flags a price in `draft` mode) and `claimsNote` tells the owner.

**10–13. Protected vs not.** See §24. Protected: content, email, whatsapp, social caption, social management (customer tasks), retargeting, paid ads copy, SEO toolkit, the chat's prose, the widget, ad headline/body. **Not protected:** brand kit, website builder pages, competitor intel, research, 18 factless agents, `image_scene_prompt`, and every artifact `summary` string built by `genericSummary` (`:3365`).

### The truth pipeline

```
owner rows ─► gatherBusinessFacts ─► BusinessFacts ──┬─► formatFactsForCopy(audience) ─► PROMPT
                      │ throws → null                │
                      ▼                              └─► knownText ─► said() ─► suppression
            factsState = FACTS_UNAVAILABLE                                │
                      │                                                   ▼
                      ▼                      findProblems: patterns + CLAIM_TERMS + links
            FACTS_UNAVAILABLE_BRIEF + rules                               │
                      │                             ┌───────────────┬─────┴──────┐
                      ▼                             ▼               ▼            ▼
            stripUnverifiable (subset)        strip sentence   price warn    always() —
                                                                             comparisons,
                                                                             unsuppressible
                                                      │
                                                      ▼
                                     claimsNote / unverifiedNote ─► card + chat
```

---

## 10. Claim system — three independent implementations

| System | File | Scope | Suppressible by facts | Acts |
|---|---|---|---|---|
| **Canonical** | `claims/claimCheck.ts` (870 lines) | 20+ pattern families, `CLAIM_TERMS`, `CLAIM_SYNONYMS`, `wordForms`, links, prices | mostly yes; comparisons never | **strips** |
| **Compliance** | `agents/complianceValidation.ts:42-63` | 8 regexes (no.1, best in India, clinically proven, 100%, scientifically proven, guaranteed results, award-winning, doctor recommended) | **no facts at all** | **flags only** |
| **Narrative** | `reports/narrativeCheck.ts` | report prose: `VERDICT`, `BLOCKED`, `BENCHMARK`, `VIEWS_AS_PEOPLE`, `COUNTS`, `RUPEES` | against `BusinessNumbers` | **drops + notes** |

All three are applied to chat artifacts (`masterBrainV2.ts:4581`) — compliance flags land on the card next to a claims note from a different engine. Overlap is real: "guaranteed results" matches both `claimCheck.GUARANTEE` and `complianceValidation`. **F-D1.**

---

## 11. Knowledge / retrieval architecture

```
message (raw, unmodified)
 ▼ embedText(query, "query")                       knowledge/voyageClient.ts:18
   └─ error → console.error + return []  ───────────────► SECTION OMITTED, MODEL NOT TOLD
 ▼ supabase.rpc("match_marketing_knowledge", …)    retrieveKnowledge.ts:46
   └─ ivfflat pgvector, lists=100                  migration 090
   └─ filter similarity > 0.4
 ▼ keyword search (second arm)                     merged, vector-first
 ▼ rerank(query, candidates)                       knowledge/rerankClient.ts:20
   └─ null → fall back to vector order             (documented)
 ▼ ordered.slice(0, matchCount=5)
 ▼ "## Relevant marketing knowledge for this request" → system prompt + groundingContext
```

- **Only consumer:** `masterBrainV2.ts:4383`. No department route retrieves; they receive it second-hand via `groundingContext`.
- **Retrieval failure is indistinguishable from "nothing relevant"** — both produce `[]` and an empty string. **F-R1.**
- **Dumped, not retrieved:** owner `business_knowledge` (every usable row, `slice(0,12)` at 200 chars inside `formatFactsForCopy`, but **unbounded** in the chat's `businessFactsSection`), `business_memory` (20), recent copy (5), team roster, catalogue.

---

## 12. Memory architecture

| Memory | Table | Writers | Readers | When read | Filter | Expiry | Enters prompt as |
|---|---|---|---|---|---|---|---|
| Long-term business | `business_memory` | `api/business-memory`, chat `remember_insight`, **`outcomeInsights.ts` ×3** | `getBusinessContext` | every turn | LIMIT 20 recency | **none** (falls out of the window) | "What you've learned about this business over time" |
| Lead memory | `business_memory` | same | `getLeadMemory` | call path | by lead | none | call script context |
| Conversation | request body | client | chat | every turn | last 10 | n/a | message array |
| Anti-repetition | `content_pieces` | `saveGenerated` | `recentCopy` | content gen | LIMIT 5 | none | "don't repeat these" |
| Recent posts | `social_post_queue` | post path | `generate_social_management` | social gen | LIMIT 10 | none | "actually posted recently" |
| Performance | Meta API | — | `getCampaignPerformanceState` | ads/analytics | state machine | live | "Real performance from campaigns already run" |

**Can Hawlai learn from marketing outcomes?** **Partially, and more than the earlier audit credited.**

`src/lib/businessMemory/outcomeInsights.ts` writes `business_memory` rows automatically from three resolved outcomes:
- `recordLeadOutcomeInsight` — on lead → converted / not_interested (`api/leads/[id]`, `api/team/my-leads/[id]`)
- `recordCallOutcomeInsight` — on call completion (`api/webhooks/vapi`)
- `recordCampaignPauseInsight` — on campaign auto-pause (`autopilotAgent`)

Those rows reach the chat's system prompt **and every generator**, because `memorySection` is part of `groundingContext`.

What is **not** closed: there is no per-content-piece outcome. `marketing_pieces` + `orderLinkage.attribute` can attribute revenue to a piece, and the only consumers are `analyticsAgent`, `businessFacts` (`countsAsLead`), `businessNumbers`, `strategy/diagnosis` — **no generator**. So Hawlai can learn "lead X converted from Meta" but never "caption B outsold caption A". **F-P1.**

---

## 13. Prompt architecture

| Call | System prompt | User prompt | Facts | Rules | Tools | Approx size |
|---|---|---|---|---|---|---|
| Chat orchestrator | assembled, ~20 KB guidance + dynamic sections | history(10) + message | ✓ | ✓ | 58 (~53 KB) | **~75–100 KB/turn** |
| Content | none (all in user turn) | one template | ✓ | ✓ | — | ~4–8 KB |
| Widget | assembled | history(6) + message | ✓ customer | ✓ | — | ~3–6 KB |
| Ad plan | none | one template | ✓ | ✓ | — | ~3–5 KB |
| Specificity editor | none | draft + facts + rules | ✓ | ✓ | — | ~4–8 KB |

**Duplicated instructions.** "Never invent a contact detail" appears in `COPY_TRUTH_RULES` **and** verbatim as a chat guideline. "A generated image is never a real product's photo" appears in the chat prompt, in the `generate_graphic` tool description, **and** in code (`imageBrief.NO_PRODUCT_DEPICTION_RULE`). Three statements of one rule, two of them unenforceable.

**Conflicting instructions.** The chat prompt says *"Copy a customer will read goes through the tool, always — even one line"* while also saying *"Be conversational"* and *"have opinions"*. The model resolves this by writing copy-shaped prose, which is exactly what F-02 had to guard. A prompt cannot adjudicate its own contradiction.

**Instruction dilution — measured.** 58 tool descriptions (53,466 chars) + ~20 KB guidance + facts + 20 memories + 5 RAG entries + unbounded owner knowledge, all before the user's first word. The truth rules sit in the middle of that.

**Authoritative vs overridable.** Only code is authoritative: `claimCheck`, `applyLinkRule`/`applyBioRule`, `imageBrief`, `splitStories`, `ALWAYS_REQUIRES_APPROVAL`, `isFeatureEnabled`. Everything expressed only as prompt text is advisory — and the 8 Oct incident is the proof: the tool description forbade standing in for a product photo while `heroSubjectLine` instructed the opposite in code, and the code won.

---

## 14. Model routing

| Task class | Tier used | Routing condition | Fallback | Assessment |
|---|---|---|---|---|
| Chat orchestration | standard | hardcoded | none | reasonable |
| Content / email / whatsapp / social / ads copy | standard | hardcoded | none | reasonable |
| Brand kit | **premium** | hardcoded | none | reasonable |
| Deep strategy | **premium** | hardcoded (documented carve-out) | none | reasonable |
| Call scoring | `fast` | hardcoded | none | reasonable |
| Classification / extraction / JSON shaping | **standard** | hardcoded | none | **over-provisioned** |
| Strategy, positioning, diagnosis | **standard** | hardcoded | none | **under-provisioned** |

Flat: 49/57 sites on one tier. `models.ts` states the flatness is deliberate ("pure refactor… does NOT add plan-tier-based routing"). There is **no fallback model**: if Anthropic is down, `isPlatformOutage` fires `alertOperator` and the user gets an honest failure message.

---

## 15. Artifact pipeline, and whether versions diverge

```
model text ─► parseModelJson ─► guardOrMark ─► applyLinkRule ─► applyBioRule
                   │                                                 │
                   │ fail → _fallback + _cause/_detail               ▼
                   │        → malformedToolError → {error}      output object
                   ▼                                                 │
              no artifact                      ┌──────────────┬──────┴──────┐
                                               ▼              ▼             ▼
                                    saveGenerated()   extractArtifact()  tool_result
                                    (<dept> table,    (Artifact for      (model, 4000
                                     status draft)     the card)          char cap)
```

**Measured answer: `artifact == saved == shown` on the content path.** The same `output` object is handed to `saveGenerated` (`:1024`) and to `extractArtifact` (`:4556`). The publish payload is derived from the card's own state, and `expect_text` makes the endpoint refuse a mismatch.

**Four genuine divergences:**
1. **Chat prose vs artifact.** The model's narration is a separate generation. `generate_content` returns **no `note` field**, so the framing is model-invented. This is where "caption saved to Content / ready to go" came from. **F-X1.**
2. **Tool result vs artifact.** The model sees a 4000-char truncation; the card holds the whole object. The model can summarise a piece it only partly saw. **F-X2.**
3. **Artifact `summary` vs content.** `genericSummary` (`:3365`) builds a display string separately from the guarded body; it is not re-checked. **F-X3.**
4. **Ad creative vs ad copy.** `headline`/`body` are guarded; `image_scene_prompt` (painted onto the image) is not. **F-X4.**

---

## 16. Approval pipeline

Two parallel mechanisms:

**(a) Inline card** — `src/lib/chat/publishActions.ts` returns a `PublishAction` descriptor `{target, label, confirm, endpoint, method, payload, done, discard?}`. The card posts to an **existing** endpoint; no chat-only publish route exists. Used by: website publish, social post, email send, image generation.

**(b) Queue** — `createPublishAction` (`publish/create.ts:168`) → `getActionPolicy` (`executionPolicy.ts`) → `pending_approvals`; executed by `publish/executor.ts` through a platform adapter. Governs 10 `ActionKey`s with `ALWAYS_REQUIRES_APPROVAL` and `ACTION_RISK`.

**Paths where AI causes an external side effect with no approval** (all reachable from one chat sentence):

| Tool | Effect | Pre-conditions in code |
|---|---|---|
| `send_email` | real email to a lead/customer/team member | recipient must exist on record, suppression list, subject check, link check, business address required |
| `trigger_call` | **outbound phone call** via Vapi | lead exists, unique name match, phone present, `dnd_opt_out` honoured |
| `publish_to_youtube` | **public video** on the business's channel | token present, a `ready` video exists |
| `set_automation_toggle` | turns on auto-posting / auto-email / **auto-calling new leads** | none — only a prompt rule |
| `create_discount_code` | live redeemable discount | format + uniqueness only; **contradicts `ALWAYS_REQUIRES_APPROVAL`** |

`pause_meta_campaign` is also unapproved and that is correct — stopping spend is the safe direction.

---

## 17. Meta / social publishing spine

```
generate_content ─► guardOrMark ─► content_pieces (draft)
                         │
                         ▼ readDestinations (chat/destinations.ts)
                    fb_page_id + readMetaPageToken + ONE Graph call
                    getConnectedInstagramAccountId → unknown = NOT connected
                         ▼
                    socialPublishAction (chat/publishActions.ts)
                    label names the Page · payload carries caption + expect_text
                    + destination + destination_name + image_source
                    no connection → null → CannotPublishStrip (copy only)
                         ▼ owner presses, second confirmation names the destination
                    POST /api/social/post
                    ├─ expect_text ≠ caption → 400, NOTHING posted
                    ├─ destination==="instagram" → IG resolved FIRST; no IG → 400, Page untouched
                    ├─ markTrackedLinks (Facebook copy only)
                    ├─ postPhotoToPage | postTextToPage
                    ├─ readPostMessage → verified: match | differs | unreadable | scheduled
                    └─ records _imageUrl/_imageSource on the piece's own output
                         ▼
                    POST /api/social/unpublish
                    ├─ post id must start with `${pageId}_`  → else 403
                    ├─ deletePostFromPage
                    └─ checkPostPresence → gone | present | unknown
```

**Divergence between approved and published content: closed, with one caveat.** `composePost` is the single composer for card and payload; `expect_text` is compared server-side; the post is read back. The caveat: the Instagram branch does **not** read its caption back (`verified: "unchecked"`, documented in-code as deliberate because the path has never run against a live account). **UNKNOWN until exercised live.**

---

## 18. Ads pipeline, and what is fact vs guess

```
prompt ─► draftAdPlan (adEngine.ts) ─► {headline, body, daily_budget, car_type,
          targeting_city, background_style, image_scene_prompt, confidence_score,
          score_reasoning, estimated_leads_low, estimated_leads_high}
 ├─ self-score < threshold → ONE retry informed by its own stated weakness
 ├─ guardGenerated(headline, body) ─► emptied → HARDCODED "Message {name} to know more."
 ├─ creative: buildCreativeFromPhoto | buildCreativeWithoutPhoto (Gemini)
 ├─ getAdAccountLimits → clampBudgetToMinimum
 ▼ createPublishAction("launch_ad_campaign")  → approval (high)
 ▼ executor → platforms/meta → campaign + ad set + ad, ALL PAUSED
 ▼ createPublishAction("activate_ad_campaign") → approval (critical) → effective_status verified
```

| Value | Classification |
|---|---|
| product name, price, shipping, store link, city (when the owner set it) | **VERIFIED FACT** |
| past campaign spend / leads / revenue | **HISTORICAL DATA** (state machine distinguishes unreadable from none) |
| `daily_budget` | **MODEL RECOMMENDATION**, then clamped to the account's real minimum |
| `targeting_city` | **MODEL EXTRACTION** — null is explicitly correct; the "else Lucknow" default was removed |
| `estimated_leads_low/high` | **MODEL ESTIMATE presented without provenance**; fallback hardcodes 10/25 |
| `confidence_score` / `score_reasoning` | **MODEL SELF-ASSESSMENT used as a quality gate** |
| `background_style`, `image_scene_prompt` | **MODEL ASSUMPTION**, unguarded |

---

## 19. Performance / feedback loop

**Data that exists:** spend, leads, revenue, impressions, campaign `effective_status` (Meta, via `analyticsAgent`); orders and their linkage to campaigns/leads (`orderLinkage.ts` — `attribute`, `revenueByCampaign`, `conversionOf`, `countsAsLead`); GSC queries; call outcomes; lead status.

**Does it return to the AI?**

| Path | Returns? | Where | Form |
|---|---|---|---|
| Ad planning | **YES** | `masterBrainV2.ts:1533-1539` → `paidAdsAgent.ts:66` | numeric, per campaign, with "could not be read" distinguished from "none" |
| Every generator (prose) | **YES, partially** | `outcomeInsights.ts` → `business_memory` → `memorySection` → `groundingContext` | sentences, from 3 outcome types |
| Growth advice / optimisation / strategy | **YES** | `getCampaignPerformanceState` consumers | numeric |
| **Content, social, email, whatsapp, SEO, influencer — per piece** | **NO** | — | — |

> **Correction to the earlier audit.** `HAWLAI-AI-QUALITY-DIAGNOSIS.md` F-13 said "past performance never reaches generation". That was wrong on two counts: ad planning receives it numerically, and `business_memory` carries auto-written outcome insights into every generator. The accurate finding is narrower and is restated as **F-P1**: no *per-content-piece* outcome exists, so the system cannot learn which caption worked.

```
CREATE ─► PUBLISH ─► MEASURE ─────────────────► LEARN ─────► NEXT GENERATION
content    ✓ post    ✗ no per-piece metric      ✗            ✗   ← BREAK
ads        ✓ launch  ✓ spend/leads/revenue      ✓ prompt     ✓
leads      ✓         ✓ status                   ✓ memory     ✓ (prose)
calls      ✓         ✓ transcript+score         ✓ memory     ✓ (prose)
```

**The break is exactly at MEASURE for content.** `marketing_pieces` gives every published piece an identity and `markTrackedLinks` puts that identity on the link — the plumbing is laid. Nothing reads it back into a prompt.

---

## 20. Error / fallback architecture

**Census:** 341 `catch` · **96 silent `catch {}`** · 28 `return []` · **227 `return null`** · 127 `_fallback` references · 72 `_aiFailure` references.

| Condition | Becomes | Distinguishable from "nothing"? |
|---|---|---|
| Facts unavailable | `null` → `FACTS_UNAVAILABLE` + marked output | **yes** (since `c433380`) |
| Retrieval unavailable | `[]`, section omitted | **no** — F-R1 |
| DB read fails | mostly `null` / `[]` | varies by call site |
| Meta API unavailable | `state: "not_connected" \| "error"` | **yes** — the best pattern in the codebase |
| Model unavailable | typed `AiFailure` + operator alert | **yes** |
| Malformed model output | `_fallback` + `_cause`/`_detail` → `{error}` | **yes** (since `c433380`) |
| Tool failure | `{error}` + `logAuditEvent` | yes |
| Missing product | catalogue line says so explicitly | yes |
| Missing brand voice | generic fallback profile, "never empty" | **no** — a derived profile is indistinguishable from a real one |
| Post read-back | `match \| differs \| unreadable` | yes |
| Post presence after delete | `gone \| present \| unknown` | yes |

Only three modules use the explicit state machine (`analyticsAgent`, `dashboardData`, `dataState`). The other ~90% of error paths collapse to `null`/`[]`. **F-E1.**

---

## 21. Customer-facing surface audit

| Surface | Reaches | Facts | Claim guard | Brand | Quality | Approval | Human review |
|---|---|---|---|---|---|---|---|
| Social post (chat) | public | ✓ | ✓ | ✓ | ✗ | ✓ card | ✓ |
| Social post (autopilot) | public | ✓ refuses if null | ✓ `publish` | ✓ | ✓ `revise` | ✗ | **✗ unattended** |
| Reply suggestions / DM templates | customer | ✓¹ | ✓¹ | ✓ | ✗ | ✗ | ✓ (owner sends) |
| DM / comment auto-reply | customer | **UNKNOWN** — `generateAutoReply`, separate path | ? | ? | ✗ | ✗ | **✗ when toggle on** |
| Website widget | visitor | ✓¹ | ✓¹ withheld | partial | ✗ | ✗ | **✗ none** |
| Marketing email (chat `send_email`) | customer | ✓ | ✓ | ✓ | ✗ | **✗** | ✗ |
| Email automation (cron) | customer | ✓ | via generator | ✓ | ✓ | ✗ | **✗ unattended** |
| WhatsApp copy | customer | ✓ | ✓ + opt-out appended in code | ✓ | ✗ | ✓ (owner sends) | ✓ |
| Outbound call | customer | call script context | ✗ | ✗ | ✗ | **✗** | ✗ |
| Meta ad (copy) | public | ✓ | ✓ headline+body | ✓ | self-score | ✓✓ | ✓ |
| Meta ad (creative) | public | ✓ via `imageBrief` | ✗ prompt unguarded | colours | ✗ | ✓ | ✓ |
| Website pages (builder) | public | ✓ | **✗ no guard** | ✓ | ✗ | ✓ publish flag | ✓ |
| Page text / meta (chat) | public | ✓ | ✓ | ✓ | ✗ | ✓ + read-back | ✓ |
| SEO page / blog | public | partial | `seoToolkit` yes, `seoAgent`/`seoPageAgent` **no facts** | ✓ | ✗ | ✓ | ✓ |
| YouTube video | public | ✗ | ✗ | ✗ | ✗ | **✗** | ✗ |
| Influencer outreach | partner | **✗** | **✗** | ✓ | ✗ | ✗ | ✓ |
| Chat prose | owner | ✓ | ✓ (since `c433380`) | ✓ | ✗ | n/a | n/a |

¹ since `c433380`. **`generateAutoReply` is the one customer-facing path I could not fully trace statically — marked UNKNOWN, see §36.**

---

## 22. Security / trust boundaries

**Good, and verified:**
- **Tenant isolation in chat tools:** `grep` for `input.dealershipId|businessId|accountId` in `masterBrainV2.ts` returns **nothing**. Every query uses `ctx.id`, resolved server-side from the session. A model cannot name another business.
- **RLS:** 92 migrations enable it; **120 distinct tables** have RLS enabled.
- **Client bundle boundary:** `tests/clientBundleBoundary.test.ts` walks the import graph for `supabase/service.ts` and `crypto/secretCrypto.ts`; passing.
- **Secrets:** OAuth tokens encrypted at rest (`crypto/secretCrypto.ts`, `oauthSecrets.ts`); `readMetaPageToken` is the single read path.
- **Email recipients** must already be a lead, customer or team member of this business.
- **Unpublish** verifies `post_id` is prefixed with this business's own `pageId`.

**Worth noting (not proven exploitable):**
- `createServiceClient` is used **17 times inside `executeTool`**. The service role bypasses RLS, so every one of those queries depends on its own `.eq("dealership_id", ctx.id)` being correct. Static reading shows they are; the safety rests on code discipline rather than the database.
- `ad-creatives` is a public-read bucket holding every business's files. No code lists folders (the library endpoint builds from owned rows), so there is no current leak path — but the bucket's shape is one careless listing away from one.
- Customer PII (name, phone) enters prompts on the call and CRM paths. No redaction layer exists. **F-S1.**

---

## 23. Duplicate / fragmented systems

| # | What | Where | Canonical | Behaviour differs? |
|---|---|---|---|---|
| D1 | Claim detection | `claimCheck.ts` · `complianceValidation.ts` · `narrativeCheck.ts` | `claimCheck` | **yes** — compliance has no facts and only flags |
| D2 | Ad plan generation | `adEngine.generateAdPlan` · `paidAdsAgent.generateAdPlan` | neither; different jobs, same name | **yes** — different prompts, different guards |
| D3 | Discount creation | chat `create_discount_code` (direct insert) · `ActionKey "create_discount_code"` (approval) | the registry | **yes** — approval vs none |
| D4 | JSON extraction | `ai/modelJson.parseModelJson` · `ai/claude.jsonFromText` | `parseModelJson` | **yes** — `jsonFromText` is the greedy pattern that was replaced |
| D5 | Facts formatting | `formatFactsForCopy` · `chatbotAgent.formatKnowledgeFacts` · `callScriptAgent`'s own formatter | `formatFactsForCopy` | yes — different subsets |
| D6 | Social agents | `socialMediaAgent` (captions) · `socialManagementAgent` (tasks) | both, by scope | names invite confusion |
| D7 | Growth advisor | `growthAdvisorAgent` · `growthAdvisorV2` | V2 | both live; V1 has 5 callers |
| D8 | CRO | `croAgent` · `croAgentV2` | V2 | both live |
| D9 | Model routing | `models.ts` tiers · `deepStrategyAgent`'s documented carve-out | `models.ts` | minor |
| D10 | Brand voice formatting | `brandVoice.formatBrandVoiceSection` called from `masterBrainV2` **and** inside `formatFactsForCopy` | one function, two insertion points | **duplicated in the prompt** |

---

## 24. Who-knows-what matrix

| Agent / tool | Facts | Product | Knowledge | Brand | Memory | Performance | Claim guard | Approval | Side effect |
|---|---|---|---|---|---|---|---|---|---|
| Master chat (orchestrator) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ prose | per-tool | via tools |
| generate_content | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | no |
| generate_email | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ card | no |
| generate_whatsapp | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | owner sends | no |
| generate_social_management | ✓¹ | ✓¹ | ✓ | ✓ | ✓ | ✗ | ✓¹ customer tasks | ✗ | no |
| generate_ad_plan | ✓ | ✓ | ✓ | ✓ | ✓ | **✓** | ✓ copy only | ✓✓ | spend |
| launch_meta_campaign | ✓ | ✓ | ✓ | ✓ | ✓ | partial | ✓ copy only | ✓✓ | **real objects** |
| activate_meta_campaign | — | — | — | — | — | ✓ verify | n/a | ✓ critical | **spend** |
| generate_graphic | ✓ | ✓ | ✗ | colours | ✗ | ✗ | prompt stripped | ✓ cost card | paid call |
| generate_seo | ✓ | ✓ | ✓ | ✓ | ✓ | GSC | ✓ toolkit | ✓ | no |
| generate_cro_suggestions | `CroFacts` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | no |
| research_market / research_competitor | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | **✗** | ✗ | web calls |
| generate_brand_kit | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | **✗** | ✗ | saves |
| build_website | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | **✗** | ✓ publish | no |
| generate_influencer_outreach | **✗** | ✗ | ✓ | ✓ | ✓ | ✗ | **✗** | ✗ | no |
| generate_video_task | **✗** | ✗ | ✓ | ✓ | ✓ | ✗ | **✗** | ✗ | no |
| Website widget | ✓¹ customer | ✓¹ | ✓ gated | tone | ✗ | ✗ | ✓¹ | ✗ | creates lead |
| contentAutopilot | ✓ refuses if null | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ `publish` | ✗ | **publishes** |
| emailAutomation | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | via generator | ✗ | **sends** |
| send_email | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | **✗** | **sends** |
| trigger_call | script ctx | ✗ | ✓ | ✗ | lead memory | ✗ | **✗** | **✗** | **calls** |
| publish_to_youtube | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✗** | **✗** | **publishes** |
| set_automation_toggle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | **✗** | **enables autosend** |
| create_discount_code | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | **✗ (policy says yes)** | **live discount** |
| 18 factless agents | **✗** | **✗** | ✓ grounding | partial | ✓ | ✗ | **✗** | varies | varies |

¹ since `c433380`.

---

## 25. Who-can-do-what matrix

| Agent / tool | Read DB | Write DB | Call API | Generate copy | Publish | Spend | Message customer | Modify business |
|---|---|---|---|---|---|---|---|---|
| Master chat | ✓ | via tools | via tools | ✓ | via tools | via tools | via tools | via tools |
| generate_* (12 tools) | ✓ | draft | model | ✓ | ✗ | image only | ✗ | ✗ |
| propose_* (4 tools) | ✓ | approval row | ✗ | ✓ | after approval | after approval | ✗ | after approval |
| launch_meta_campaign | ✓ | ✓ | **Meta** | ✓ | paused objects | on activation | ✗ | ad account |
| activate / pause | ✓ | ✓ | **Meta** | ✗ | ✓ | **✓ / stops** | ✗ | campaign state |
| send_email | ✓ | ✓ log | **SMTP/Gmail** | ✗ | ✗ | ✗ | **✓** | ✗ |
| trigger_call | ✓ | ✓ log | **Vapi** | script | ✗ | call minutes | **✓** | ✗ |
| publish_to_youtube | ✓ | ✓ | **YouTube** | ✗ | **✓** | ✗ | ✗ | ✗ |
| set_automation_toggle | ✗ | ✓ | ✗ | ✗ | enables | enables | enables | **✓** |
| create_discount_code | ✓ | ✓ | ✗ | ✗ | ✗ | **effectively** | ✗ | **✓ pricing** |
| add_product / add_lead / assign_* / set_goal / create_workflow / update_website_url | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| edit_page_text / propose_page_meta / undo_page_edit | ✓ | ✓ | fetch read-back | ✓ | **✓ live site** | ✗ | ✗ | ✓ |
| contentAutopilot (cron) | ✓ | ✓ | **Meta** | ✓ | **✓ unattended** | ✗ | **✓ public** | ✗ |
| emailAutomation (cron) | ✓ | ✓ | **SMTP** | ✓ | ✗ | ✗ | **✓ unattended** | ✗ |
| Website widget | ✓ | lead row | ✗ | ✓ | ✗ | ✗ | **✓ visitor** | ✗ |

---

## 26. Quality pipeline matrix

| Surface | Facts | Retrieval | Brand | Performance | Claim guard | Provenance | Specificity | Quality gate | Approval |
|---|---|---|---|---|---|---|---|---|---|
| Social post (chat) | YES | YES | YES | **NO** | YES | PARTIAL¹ | **NO**² | NO | YES |
| Social post (autopilot) | YES | NO | YES | **NO** | YES | PARTIAL | YES | NO | **NO** |
| Content page | YES | YES | YES | **NO** | YES | PARTIAL | YES | NO | YES |
| Email (chat) | YES | YES | YES | **NO** | YES | PARTIAL | **NO** | NO | **NO** |
| WhatsApp | YES | YES | YES | **NO** | YES | PARTIAL | **NO** | NO | owner sends |
| Reply suggestions / DM | YES¹ | YES | YES | **NO** | YES¹ | **NO** | **NO** | NO | **NO** |
| Website widget | YES¹ | YES | PARTIAL | **NO** | YES¹ | **NO** | **NO** | NO | **NO** |
| Ad copy | YES | YES | YES | **YES** | PARTIAL³ | PARTIAL | **NO** | self-score | YES |
| Ad creative | YES | NO | PARTIAL | **NO** | **NO**⁴ | YES⁵ | **NO** | NO | YES |
| Website builder pages | YES | YES | YES | **NO** | **NO** | PARTIAL | **NO** | NO | publish flag |
| SEO toolkit | YES | YES | YES | GSC | YES | PARTIAL | **NO** | NO | YES |
| SEO blog (`seoAgent`) | **NO** | NO | YES | NO | **NO** | **NO** | **NO** | NO | YES |
| Influencer outreach | **NO** | YES | YES | NO | **NO** | **NO** | **NO** | NO | **NO** |
| Chat prose | YES | YES | YES | NO | YES | **NO** | **NO** | NO | n/a |
| YouTube publish | **NO** | NO | NO | NO | **NO** | **NO** | n/a | NO | **NO** |

¹ `_source`/`_edited` provenance exists for **website blocks only** (`pages/provenance.ts`); no other artifact records who wrote which field. ² `reviseForSpecificity` is passed by `api/content-marketing/generate` and `api/autopilot/content-queue` only. ³ headline+body. ⁴ `image_scene_prompt` unguarded. ⁵ `imageBrief` forbids depicting a product with no photo.

---

## 27. Findings

### CRITICAL

**F-A1 · MISSING SAFETY · `set_automation_toggle`**
`masterBrainV2.ts` case `set_automation_toggle` (741 chars) · evidence: `supabase.from("dealerships").update({[field]: !!input.enabled})`, `fieldMap` includes `content_autopilot`, `welcome_email`, `follow_up_email`, `auto_call_new_leads`.
**Current:** one chat sentence turns on unattended public posting, unattended email sending, or automatic outbound calling of every new lead. The only safeguard is a system-prompt line ("Only call it when the person explicitly says to turn something on/off by name"). Not an `ActionKey`; not in `ALWAYS_REQUIRES_APPROVAL`.
**Expected:** an approval card naming what will go out unattended and to whom.
**Why it matters:** it is the only tool that converts *all other* approval gates into no-ops — after it, content publishes and emails send with no human.
**Risk:** high / reversible but wide. **Test:** enabling any autosend toggle requires an approval record; a prompt-only instruction cannot reach the write.

**F-A2 · MISSING SAFETY · `trigger_call`**
Evidence: `const result = await triggerVapiCall(supabase, lead)` with no approval. Pre-checks: lead exists, unique match, phone present, `dnd_opt_out`.
**Current:** a real phone call to a named customer from one chat sentence. **Expected:** approval, or at minimum the inline confirm card the social post has. **Risk:** high, irreversible — a placed call cannot be unplaced. **Test:** no Vapi call without an approval record.

**F-A3 · MISSING SAFETY · `send_email`**
Evidence: `sendDealerEmail(supabase, ctx.id, toEmail, input.subject, input.body)`. Guards are strong (recipient on record, suppression, subject check, link check, address required) but there is **no owner approval**, while `emailSendAction` in `chat/publishActions.ts` exists and is used elsewhere.
**Current:** chat sends a real email directly. **Expected:** reuse `emailSendAction` — the card already exists. **Risk:** high, irreversible. **Test:** the tool returns a descriptor, not a send receipt.

**F-T2 · DATA · facts have no freshness**
`businessFacts.ts` — no `fetched_at`, no TTL, no staleness flag anywhere in `BusinessFacts`.
**Current:** a price changed in a connected store but not synced is presented to every generator as a VERIFIED FACT, and the claim guard will *defend* it. **Why it matters:** the guard's authority is only as good as the data's freshness, and nothing tells either the model or the owner how old it is. **Risk:** wrong price in a public ad, with the guard asserting it is correct. **Test:** facts older than N minutes are labelled, and a stale price is reported as unverified rather than verified.

### HIGH

**F-A4 · MISSING SAFETY · `create_discount_code` contradicts the approval registry**
`ALWAYS_REQUIRES_APPROVAL` (`publish/types.ts:246`) and `executionPolicy.ts:73` (`requiresApproval: true`, risk "high") both govern `create_discount_code`; the chat tool inserts directly and replies *"Code X is live now — customers can use it at checkout immediately."* **Expected:** one path, one policy. **Risk:** real margin given away without review.

**F-A5 · MISSING SAFETY · `publish_to_youtube`**
Publishes a video publicly with no approval and no claim check on title/description. Not an `ActionKey`.

**F-N1 · MISSING SAFETY · no narrative-provenance check**
`claimCheck.ts` patterns cover counts, ratings, offers, superlatives, comparisons, health, links, contacts. **Nothing detects a fabricated story.** "My grandmother taught me to pour wax on winter evenings" and "one customer said it reminded her of her first home" match no rule. `usesOwnStory` measures whether the *real* story was used and scores an invented one as a success.
**Why it matters:** an invented customer quote is a fabricated testimonial — the highest-liability output in the product. **Test:** an invented anecdote and an invented quote are flagged; the owner's recorded story passes untouched (three existing `contentQuality` tests encode that second half).

**F-X1 · ARCHITECTURAL GAP · `generate_content` returns no `note`**
`masterBrainV2.ts:1018-1031`. `generate_graphic` returns a long `note` instructing the model exactly what to say; `generate_content` returns none. The chat prompt's rule *"when a result carries a `note`, that note is the truth"* has nothing to bind to, so the framing is model-invented. Source of "caption saved to Content / ready to go" on a `draft` row.

**F-P1 · MISSING FEEDBACK · no per-content-piece outcome**
`marketing_pieces` + `markTrackedLinks` + `orderLinkage.attribute` can attribute revenue to a piece. Consumers: `analyticsAgent`, `businessFacts`, `businessNumbers`, `strategy/diagnosis` — **no generator**. The system can learn "lead X converted" but never "caption B outsold caption A".

**F-Q1 · QUALITY · `reviseForSpecificity` reaches 2 of 5 content callers**
Passed by `api/content-marketing/generate` and `api/autopilot/content-queue`; **not** by `masterBrainV2.ts:1021`, the primary surface.

**F-17 · ROUTING · 58 tools, 53,466 chars of schema, no intent stage**
Measured. Overlapping descriptions (`generate_content` / `generate_social_management` / `generate_ad_plan` all plausibly answer "write me a post") plus ~75–100 KB of instruction before the user's first word.

**F-E1 · OBSERVABILITY · 96 silent `catch {}` and 227 `return null`**
Only `analyticsAgent`, `dashboardData` and `dataState` use the explicit `not_connected | no_data | error | ok` state machine. Everywhere else "failed" and "empty" are the same value.

**F-X4 · MISSING SAFETY · `image_scene_prompt` is unguarded**
`adEngine.generateAdPlan` guards `headline` and `body` only. The scene prompt is painted onto a public ad creative by Gemini.

**F-S1 · DATA · customer PII enters prompts unredacted**
Lead names and phone numbers reach call-script and CRM prompts. No redaction layer exists. No evidence of leakage; the absence of a boundary is the finding.

### MEDIUM

**F-T1 · DATA · no fact conflict resolution.** `knownText` is a flat bag; first match suppresses. Two sources disagreeing produce an arbitrary winner.
**F-R1 · OBSERVABILITY · retrieval failure == no results.** `retrieveKnowledge.ts:30-34` returns `[]` for both; the section vanishes and the model is not told.
**F-M1 · DATA · `business_memory` mixes three provenances.** Owner-entered, LLM-written (`remember_insight`) and auto-written (`outcomeInsights`) rows are presented identically as "real, durable observations".
**F-D1 · DUPLICATION · three claim engines.** `claimCheck` strips, `complianceValidation` flags with no facts, `narrativeCheck` drops. Overlapping rules; "guaranteed results" matches two.
**F-D4 · DUPLICATION · two JSON extractors.** `jsonFromText` (`claude.ts:291`) is the greedy pattern `parseModelJson` was written to replace, still exported and callable.
**F-X2 · ARCHITECTURAL GAP · 4000-char tool-result truncation.** The model narrates a result it may have seen only part of; the card holds the whole object.
**F-X3 · QUALITY · artifact `summary` not re-checked.** `genericSummary` (`:3365`) builds display text separately from the guarded body.
**F-18 · ROUTING · flat model routing.** 49/57 on one tier; strategy under-provisioned, extraction over-provisioned.
**F-19 · ROUTING · no generation parameters.** No `temperature`/`top_p`/`top_k` anywhere.
**F-C1 · MISSING CONTEXT · no token budget.** Context is bounded by six independent magic numbers (10, 20, 5, 12, 5, 4000) and no total.
**F-16 · ARCHITECTURAL GAP · facts/guard are opt-in per agent.** 18 model-calling agents have neither. A new agent is unguarded by default and nothing fails.
**F-U1 · MISSING SAFETY · `generateAutoReply` untraced.** `socialManagementAgent.generateAutoReply` has 2 callers and reaches customers when the DM/comment toggle is on. I could not establish statically whether it receives facts or a guard — see §36.

### LOW

**F-D6/D7/D8 · DUPLICATION ·** `growthAdvisorAgent`/`V2` and `croAgent`/`V2` both live; `socialMediaAgent`/`socialManagementAgent` names invite confusion.
**F-D10 · DUPLICATION ·** `formatBrandVoiceSection` is inserted into the chat prompt twice — directly and again inside `formatFactsForCopy`.
**F-L1 · OBSERVABILITY ·** `logAuditEvent` fires for tool *failures* only; successful side effects (a sent email, a placed call) leave no audit row beyond their own tables.

---

## 28. Root-cause analysis

Four causes explain nearly every finding:

1. **Guards are attached to paths, not surfaces.** Every protection lives inside one generator. 18 agents never got one; each new agent starts unguarded and nothing fails. → F-16, F-N1, F-X4, the whole right-hand side of §26.
2. **Two systems describe the same action.** A formal `ActionKey` registry with risk levels exists *and* chat tools act directly. Where they overlap they disagree (F-A4); where the registry is silent, nothing gates (F-A1/A2/A3/A5).
3. **Measurement stops at publish for content.** The identity plumbing is laid (`marketing_pieces`, `markTrackedLinks`) and nothing reads it back, so quality cannot improve from evidence. → F-P1, and indirectly the genericness complaint.
4. **Prompt is doing work only code can do.** 58 tool schemas and ~20 KB of guidance carry rules that are not enforced anywhere else. The 8 Oct incident is the proof case: the tool description forbade standing in for a product photo while `heroSubjectLine` instructed the opposite in code — and the code won. → F-17, F-A1, the dilution findings.

---

## 29. Ten user journey traces

Entry for all chat traces: `src/app/api/chat/*` → `runMasterBrainChat` (`masterBrainV2.ts:4341`) → `getContext` → prompt assembly → `callClaude` (sonnet, 58 tools).

**1. "Make a Facebook and Instagram post for my lavender candle."**
Model selects `generate_content` **twice** (`facebook_post`, `instagram_post`) — two independent generations, no shared message. Each: `factsFor` → `generateContent` → `truthBlock` → model → `parseModelJson` → `guardOrMark` → `applyLinkRule` → `applyBioRule` → `saveGenerated("content_pieces")` → `readDestinations` → `extractArtifact` → `socialPublishAction` or `cannotPublish`. **No `revise` pass** (F-Q1). Instagram card needs an image; the chooser (`ImageChooser`) offers upload / own photos / AI quote. Publish → `/api/social/post` → `expect_text` check → Graph → `readPostMessage`. Performance: none returns.

**2. "Create a Meta ad for my product."**
`launch_meta_campaign` (29 spend references, 7 approval references, 2 Graph calls). Reads `dealerships` for `fb_page_id`, `fb_ad_account_id`, `fb_min_daily_budget`, `fb_currency`, `fb_account_status`; `getAdAccountLimits` → `isAccountUsable` → `clampBudgetToMinimum`; `generateAdPlan` (facts + performance) → `guardGenerated(headline, body)`; creative via `buildCreativeFromPhoto`/`buildCreativeWithoutPhoto`; `createPublishAction("launch_ad_campaign")` → approval (high) → `publish/executor` → `platforms/meta` → **all objects PAUSED**. Spend requires a second approval (`activate_ad_campaign`, critical).

**3. "Make an ad from my website URL."**
`businessIntelligenceAgent.analyzeWebsite` (**no `BusinessFacts`** — 1 caller, model call) → then the trace in (2). The URL's content becomes model context with no provenance marking; nothing distinguishes "read from the page" from "inferred". **UNKNOWN** whether the fetched page is claim-checked before it feeds ad copy.

**4. "How much does my product cost?"**
Two possible paths. (a) Chat answers from `storeFactsSection` — the catalogue is already in the system prompt, so no tool is needed; `checkReplyClaims` then checks the reply, and a price is flagged only if it contradicts the facts. (b) A visitor asks the same on the **website widget** → `api/public/chat` → `runSalesAgentTurn` with `truthBlock(facts, "customer")` → reply stripped in `publish` mode → `fallback.reply` if emptied. Confirmed by test in `tests/factsFailClosed.test.ts`.

**5. "Give me a marketing strategy for this month."**
`generate_marketing_strategy` (1 write, 1 read, 1 model) → `strategyAgent.generateMarketingStrategy` — **no `BusinessFacts`**, 1 caller. Then `narrativeCheck` applies on the report path, not here. Saved to `marketing_strategies`. On the **standard** tier (F-18: a judgement-heavy task on the mid tier).

**6. "Find my competitors."**
`research_competitor` → `competitorIntelAgent.generateCompetitorIntel` (facts ✓, truth rules ✓, **no guard**) → web search → `checkCitations` (`competitors/citationCheck.ts`) → `_sources`, `_unverified`, `_provider` travel on the result and the chat prompt instructs relaying them. Saved to `competitor_intel_items`. `POSITIONING_ENABLED` gates the positioning extension.

**7. "Write an SEO article."**
Two agents share the intent: `seoToolkitAgent.generateSeoTask` (facts ✓, guard ✓, 3 callers) and `seoAgent.generateBlogPost` (**no facts, no guard**, 2 callers). Which one runs depends on the tool the model picks (`generate_seo` routes to the toolkit; the blog path is reached from the SEO department page). **Same user intent, two different protection levels.**

**8. "Send a WhatsApp message to my leads."**
`generate_whatsapp` → `whatsappMarketingAgent` (facts ✓, guard ✓, opt-out appended **in code** after the guard so it cannot be stripped). **No send capability exists** — WhatsApp is copy-only; the owner sends manually. `CHANNEL_POLICY_FOR_CHAT` is in the prompt to stop the chat claiming otherwise.

**9. "Create an Instagram post and publish it."**
As (1), then: `socialPublishAction` returns `null` unless `readDestinations().instagram.connected` — which requires `fb_page_id` + a token + a live `getConnectedInstagramAccountId` answer. Unknown counts as **not** connected. With no image the route refuses before posting (400, Page untouched). With an image: IG resolved first, `postPhotoToInstagram`, `verified: "unchecked"` (IG caption not read back — §17 caveat).

**10. "Why are my ads not working?"**
`get_analytics_summary` (4 spend references) and/or `get_growth_advice` (**4 nested model calls**, 18 spend references) → `getCampaignPerformanceState` → `not_connected | no_data | error | ok`. `narrativeCheck.narrativeProblems` + `VERDICT_FLOOR {leads:30, orders:10}` suppress a verdict below the floor; `computeHealthScore` returns `{scored:false, reason}` below `SCORE_FLOOR {leads:10, orders:3}`. `droppedNote` tells the owner what was removed. **The best-instrumented path in the system.**

---

## 30. Recommended target architecture

Smallest realistic shape, with the existing component for each stage. Nothing new is invented where something already exists.

| Stage | Reuse | Gap to build |
|---|---|---|
| INTENT | — | thin `fast`-tier classifier narrowing 58 tools to ~8, full catalogue as fallback |
| CONTEXT ASSEMBLER | `getBusinessContext` | a token budget; retrieve owner knowledge instead of dumping |
| FACTS + PRODUCT | `BusinessFacts`, `formatFactsForCopy(audience)` | `fetched_at` + staleness label (F-T2) |
| BRAND | `brandVoice.formatBrandVoiceSection` | insert once, not twice (F-D10) |
| KNOWLEDGE | `retrieveRelevantKnowledge` | distinguish failure from empty (F-R1) |
| MEMORY | `business_memory`, `outcomeInsights` | label provenance (F-M1) |
| PERFORMANCE | `getCampaignPerformanceState`, `orderLinkage` | `performanceContext()` for content, from plumbing that already exists (F-P1) |
| PLAN / ANGLE | the chat prompt's "diagnose before you generate" | make it a real step with an output, not an instruction |
| CANONICAL MESSAGE | — | one message decided once; `CONTENT_TYPES.instructions` become adaptation rules |
| PLATFORM ADAPTATION | `platformRules` (`applyLinkRule`, `applyBioRule`, `linksWork`) | reuse as-is |
| CLAIM / TRUTH CHECK | `claimCheck`, `factsGate.guardOrMark` | fold `complianceValidation` in (F-D1) |
| PROVENANCE | `pages/provenance.ts` (`_source`/`_edited`), `personalStories` | extend to all artifacts; add narrative provenance (F-N1) |
| SPECIFICITY | `reviseForSpecificity` | wire to all callers (F-Q1) |
| QUALITY | `usesOwnStory`, `narrativeCheck`, `computeHealthScore` | a deterministic scorer ratchet |
| ARTIFACT | `extractArtifact` | a `note` contract per tool (F-X1) |
| SAVE | `saveGenerated` | — |
| APPROVAL | `ActionKey`, `ALWAYS_REQUIRES_APPROVAL`, `createPublishAction`, `PublishAction` | admit the 5 ungated tools (F-A1…A5) |
| EXECUTION | `publish/executor`, `platforms/*` | **do not touch** |
| OBSERVATION | `readPostMessage`, `checkPostPresence`, `effective_status` verify | extend the pattern |
| PERFORMANCE → MEMORY | `outcomeInsights` | add a content-outcome writer |

---

## 31. Recommended implementation order

1. **Close the five ungated side effects** (F-A1, A2, A3, A5, A4). Highest consequence, smallest diff, no architecture needed — `emailSendAction` and `createPublishAction` both already exist.
2. **Facts freshness** (F-T2). The guard's authority depends on it.
3. **`note` contract + narrative provenance** (F-X1, F-N1). Both are "the owner is told the truth about what happened and what was invented".
4. **Content performance loop** (F-P1) and **`revise` everywhere** (F-Q1). The quality pair.
5. **Architecture:** shared copy wrapper (F-16) → canonical message → intent routing (F-17) → task-class model/temperature (F-18, F-19) → fold the duplicate claim engines (F-D1).

---

## 32. Files that should NOT be touched

- `src/app/api/social/post/route.ts`, `src/app/api/social/unpublish/route.ts`, `src/lib/chat/destinations.ts`, `src/lib/chat/socialPost.ts`, `src/lib/chat/publishActions.ts`, `src/lib/chat/postConfirm.ts` — the publishing spine, hardened after the 8 Oct incident, with destination preflight, `expect_text` refusal and read-back.
- `src/lib/publish/platforms/meta.ts`, `src/lib/publish/executor.ts`, `src/lib/publish/create.ts`, `src/lib/executionPolicy.ts` — the approval spine. **Add action keys to the registry; do not restructure it.**
- `src/lib/claims/personalStories.ts` — the private-story gate.
- `src/lib/crypto/secretCrypto.ts`, `src/lib/crypto/oauthSecrets.ts`, `src/lib/supabase/service.ts` — server-only, bundle-boundary enforced.
- `src/lib/ai/claude.ts` — the single gateway. Changing it changes every call in the repo.
- `supabase/migrations/*` — nothing in this audit requires a schema change.

## 33. Files needing future change

`masterBrainV2.ts` (F-A1…A5, F-X1, F-X2, F-17) · `claimCheck.ts` (F-N1, F-D1) · `businessFacts.ts` (F-T1, F-T2) · `adEngine.ts` (F-X4) · `models.ts` + `claude.ts` call sites (F-18, F-19) · `retrieveKnowledge.ts` (F-R1) · the 18 factless agents (F-16) · `socialManagementAgent.generateAutoReply` (F-U1) · new: `performanceContext.ts`, canonical-message module.

## 34. Tests that need to exist

1. `approvalCoverage.test.ts` — **every** tool with an external side effect maps to an `ActionKey`, enumerated from `executeTool` by static analysis so a new tool fails the test by default.
2. `factsFreshness.test.ts` — a stale price is labelled, not defended.
3. `narrativeProvenance.test.ts` — invented anecdote and invented customer quote flagged; the real story survives.
4. `copyWrapperBoundary.test.ts` — import-graph test, modelled on `clientBundleBoundary.test.ts`: every customer-facing copy agent routes through the guarded wrapper.
5. `performanceContext.test.ts` — winners reach the prompt; no data says so explicitly.
6. `toolNoteContract.test.ts` — every generating tool returns a `note` that states draft vs live.
7. `canonicalMessage.test.ts` — one message, N adaptations, identical claim set.
8. `autoReplyGuard.test.ts` — resolves F-U1 by execution rather than inference.

---

## 35. The final question

> **"If a user sends one simple request to Hawlai, can we trace every single step that request takes until the final answer/action?"**

**Statically: YES for the path, NO for the choices. At runtime: NO.**

The complete trace of "Make an Instagram post for my lavender candle" is reconstructible from code — §29 trace 1 names every file and function, and the Phase 1 tests exercise it end to end. Every branch, guard and exit is in §7.

What **cannot** be traced:

1. **Why the model chose that tool.** No intent stage, no logged routing decision. With 58 options, tool selection is unobservable and unreproducible.
2. **What the prompt actually contained.** Assembled per turn from seven dynamic sections. Nothing persists it. Two turns one second apart can differ and nobody can diff them.
3. **Which tokens the model saw.** No token count is computed; tool results are truncated at 4000 chars with no record of what was cut.
4. **Whether retrieval contributed.** `[]` on failure and `[]` on no-match are the same value (F-R1).
5. **Whether a successful side effect happened.** `logAuditEvent` fires on tool *failure* only. A sent email or a placed call leaves no audit row beyond its own table (F-L1).
6. **How many model calls a turn made.** Cost is logged per call to `api_usage_logs` with an `operation` string, but nothing ties the calls of one turn together — no trace id, no span.
7. **Whether a guard fired.** `claimsNote` appears in the artifact when something was stripped; nothing records that a guard ran and found nothing, so "clean" and "never checked" look identical in the data.
8. **`generateAutoReply`'s protections** (F-U1) — the one customer-facing path I could not resolve from static reading.

**The single highest-value observability change:** one `turn_id` threaded from `runMasterBrainChat` through `callClaude`'s `logContext`, `executeTool`, `saveGenerated` and `logAuditEvent`. Every table involved already exists; nothing new needs storing except the id.

---

## 36. Unknowns — not provable from static analysis

| # | Unknown | Why unprovable |
|---|---|---|
| U1 | `socialManagementAgent.generateAutoReply` — facts? guard? | A second entry point in the same file; its two callers are automation paths I did not execute. **Resolve before trusting the DM auto-reply toggle.** |
| U2 | Instagram publish path end to end | In-code comment states it has never run against a live account; `verified: "unchecked"` is deliberate. |
| U3 | Whether `marketing_knowledge` is populated in production | Row count is runtime state. RAG may be returning `[]` for reasons unrelated to code. |
| U4 | Whether `businessIntelligenceAgent.analyzeWebsite` output is claim-checked before feeding ad copy | Requires executing the URL→ad path. |
| U5 | Real token count per turn | No instrumentation; the ~75–100 KB figure is a character count, not tokens. |
| U6 | Live RLS policies vs repo migrations | Documented drift exists (prod lacks migration 140). Only a live query settles it. |
| U7 | Whether the 4 code-ready-but-inactive ad platforms behave as written | No credentials; never exercised. |
| U8 | Whether any of the 96 silent `catch {}` blocks is currently swallowing a real error in production | Needs logs, not code. |

---

### Appendix — what is already right

Recorded so it does not get "fixed":

- **One model gateway**, no bypass. Retries, cost logging, failure classification and operator alerting are therefore universal.
- **Tenant isolation in chat tools:** no tool trusts a business id from the model. Verified by grep.
- **Comparisons are unsuppressible** (`claimCheck.ts:~499`) — a business's own words can never license a claim about a competitor.
- **`undefined` ≠ zero**, consistently where it was addressed: `readPostMessage`, `checkPostPresence`, `computeHealthScore`, the impression guard, `getCampaignPerformanceState`.
- **Approval before every irreversible *publishing* action**, with the destination named, the price named, and the result read back.
- **The code explains itself.** Nearly every guard carries the dated incident that caused it. That is the only reason this audit could cite causes rather than guess at them.
