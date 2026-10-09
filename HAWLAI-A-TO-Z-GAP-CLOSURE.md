# HAWLAI — A-TO-Z FORENSIC AUDIT GAP CLOSURE

**Date:** 2026-10-08
**Baseline:** branch `main`, HEAD `c433380`
**Scope:** read-only. No application code, test, config, prompt, migration or documentation was modified. No commit, push or deploy. No email, message, call, publish, spend, discount or automation activation. No secret value is reproduced anywhere in this report.
**Companion documents:** `HAWLAI-AI-QUALITY-DIAGNOSIS.md` (Phase 0), `HAWLAI-COMPLETE-AI-FORENSIC-AUDIT.md` (Phase 2 forensic). This document does not restate them; it tests them.

---

## 1. Baseline verification

| Check | Result |
|---|---|
| Branch / HEAD | `main` / `c433380` "Missing facts can no longer switch the whole safety layer off" |
| `c433380` is an ancestor of HEAD | **yes** (`git merge-base --is-ancestor` → 0) |
| Commits since the forensic audit baseline | **0** |
| Working tree | clean except two untracked audit `.md` files |
| Phase 1 artefacts present | `src/lib/claims/factsGate.ts` ✓ · `src/lib/chat/replyClaims.ts` ✓ · `tests/factsFailClosed.test.ts` ✓ |
| `npx tsc --noEmit` | **EXIT 0** |
| `npx vitest run` | **EXIT 0** — 213 files, 3228 tests passed |

**The forensic audit matches the current code.** Nothing has changed underneath it.

### 1.1 Count reconciliation — one error in the previous audit, corrected

| Metric | Forensic audit said | Re-measured now | Verdict |
|---|---|---|---|
| Anthropic call sites | 57 | **57** | confirmed |
| Files containing `callClaude` | 44 | **44** | confirmed |
| Agent files in `src/lib/agents` | 67 | **67** | confirmed |
| Tools declared in `TOOLS` | 58 | **58** | confirmed |
| `executeTool` cases | **59** | **58** | **CORRECTED — the audit was off by one** |
| `extractArtifact` cases | not stated | **56** | new |
| Tool schema size | 53,466 chars | 53,466 | confirmed |

**Cause of the off-by-one:** the earlier measurement used `re.split` on the case delimiter, which yields `n+1` segments for `n` delimiters. The corrected figure is **58 declared, 58 handled, 0 orphans in either direction** — which is a stronger result than the audit claimed, because it proves the tool surface is exactly closed:

```
declared but not handled: none
handled but not declared: none
handled but with NO extractArtifact case (i.e. no card):
  business_story, competitor_positioning     ← by design: both are conversational
```

**Explicitly not forced to match:** the "67 agent files" figure counts every file in `src/lib/agents`, including 29 that make no model call (integration clients, scorers, schedulers). The audit's inventory table says so; this is a naming artefact of the directory, not 67 AI agents. The number of files that actually invoke a model is **44** (the `callClaude` file count) plus 5 Gemini sites plus Vapi/ElevenLabs/Perplexity.

---

## 2. Reconciled system inventory

All figures measured at `c433380`.

| Layer | Count | Path / entry |
|---|---:|---|
| API route files | **273** | `src/app/api/**/route.ts` |
| — of which public (no session) | **17** | `src/app/api/public/**` |
| — of which webhooks | **5** | `src/app/api/webhooks/**` |
| Dashboard pages | **79** | `src/app/dashboard/**/page.tsx` |
| Public pages | **22** | `src/app/**/page.tsx` outside dashboard |
| Vercel cron entries | **2** | `vercel.json` |
| Migrations | **203 files**, 202 distinct numbers, range 001–207 | `supabase/migrations/` |
| — numbering gaps | **46, 172, 173, 174, 175** | plus one letter-suffixed `147b_billing_rls.sql` |
| Tables created by migration | **120** | — |
| Tables with RLS enabled | **120** | **exact match — every created table has RLS** |
| Agent files | 67 (44 model-calling) | `src/lib/agents/` |
| Master Brain tools | 58 declared = 58 handled | `masterBrainV2.ts` `TOOLS` / `executeTool` |
| Automation modules | 14 | `src/lib/automation/` |
| Test files / tests | 213 / 3228 | `tests/` |

**Migration gaps are a reconciliation item, not a defect:** five numbers are absent from the repo. Whether they were never used or exist only in production **cannot be determined from the repository** — and a known production drift already exists (prod lacks the `ad_creatives external_*` migration). → **G-1, unverified.**

---

## 3. End-to-end flow verification

Legend: **VC** verified in code · **VT** verified by test · **VR** verified in safe runtime · **INF** inferred, not verified · **NV** not verified · **NA** not applicable.

### 3.1 General Master Chat request
| Stage | Evidence | Status |
|---|---|---|
| route → `runMasterBrainChat` | `masterBrainV2.ts:4341` | VC |
| context assembly | `getBusinessContext` `businessBrain/getBusinessContext.ts:52` | VC + VT |
| prompt/model | `callClaude` `claude.ts:227`, 58 tools, loop `for (iteration<6)` | VC |
| tool calls | `executeTool` `:914`, sequential, try/catch → `{error}` | VC |
| guards | `checkedReply` = `fixReplyLinks` → `checkReplyClaims` | VC + **VT** (`factsFailClosed.test.ts` "THE WIRING") |
| artifact | `extractArtifact` `:3651` | VC + VT |
| approval | per-tool | VC |
| feedback | none from this turn | VC (absence) |
| **why that tool was chosen** | — | **NV — unobservable** |

### 3.2 Content generation
`generateContent` `contentMarketingAgent.ts:157` → `truthBlock` → model → `parseModelJson` → `guardOrMark` → `applyLinkRule` → `applyBioRule` → `saveGenerated("content_pieces")`.
All stages **VC**; facts-null, guard, malformed-reply and note behaviour **VT** (`factsFailClosed.test.ts`, `claimsGuard.test.ts`, `captionClaims.test.ts`). `reviseForSpecificity` **VC absent on the chat caller**.

### 3.3 Customer-facing reply (chat prose)
`checkReplyClaims` `chat/replyClaims.ts` — quote masking, repair-before-judge ordering. **VC + VT** (6 tests, plus `chatReplyLinks.test.ts` which caught the ordering bug).

### 3.4 Website-chat visitor question
`api/public/chat/route.ts:41` → `runSalesAgentTurn` `chatbotAgent.ts` → `truthBlock(facts,"customer")` → reply stripped in `publish` mode → `fallback.reply` if emptied.
**VC + VT** — six tests including real price present, fabricated discount withheld, internal counts absent, private story absent. Route is on `PUBLIC_PATH_PREFIXES` (`/api/public/`) **by design** — a visitor has no account. **VC.**

### 3.5 SEO / blog workflow
**Two agents serve one intent.** `seoToolkitAgent.generateSeoTask` (facts ✓, guard ✓, 3 callers) and `seoAgent.generateBlogPost` (**no `BusinessFacts`, no guard**, 2 callers). Which runs depends on the entry point. **VC.** No test covers `seoAgent`'s output safety → **NV**.

### 3.6 Social post → approval → publish
`readDestinations` → `socialPublishAction` → owner press → `/api/social/post` → `expect_text` equality check → Graph → `readPostMessage` → `verified: match|differs|unreadable`.
**VC + VT** — 29 tests in `socialPostDestination.test.ts` plus 10 mutation checks recorded in commit `40768b3`. Instagram caption read-back is `"unchecked"` by documented decision → **NV against a live account.**

### 3.7 Ad: planning → approval → execution
`generateAdPlan` → `guardGenerated(headline, body)` → creative → `createPublishAction("launch_ad_campaign")` → `pending_approvals` → `publish/executor.ts` → `platforms/meta` → **all objects PAUSED** → second approval `activate_ad_campaign` → `effective_status` verified.
**VC**, and the execution gate is **VT** (`campaignSwitchTools.test.ts` asserts the row is left alone when Meta still reports `CAMPAIGN_PAUSED`). `image_scene_prompt` unguarded → **VC (defect)**.

### 3.8 Email workflow
Two paths. Chat `send_email` → `sendDealerEmail` **directly, no approval** (pre-checks: recipient on record, suppression list, subject check, link check, business address required) — **VC**. `emailAutomation.ts` (cron) → unattended send — **VC**. 5 test files reference `send_email`; none asserts an approval requirement → **NV for the gate** (there is none to assert).

### 3.9 WhatsApp workflow
`generateWhatsappContent` → guard → opt-out appended **in code after the guard** so it cannot be stripped. **No send capability exists anywhere in the repo.** `CHANNEL_POLICY_FOR_CHAT` is in the prompt to stop the chat claiming otherwise. **VC + VT.**

### 3.10 Customer-calling workflow
`trigger_call` → `leads` lookup (`ilike` name, limit 5, unique-match required) → phone present → `dnd_opt_out` honoured → `triggerVapiCall` → `api.vapi.ai/call`. **No approval.** **VC.** **Zero tests reference `trigger_call`** → **NV.**

### 3.11 Automation / scheduled task
`vercel.json` (2 crons) → `/api/autopilot/daily-run` → bearer check → `dailyRun` → `contentAutopilot` (refuses when facts are null, `claimsMode: "publish"`, `revise: true`) → `postPhotoToPage` → `readPostMessage`.
`/api/events/dispatch` → Supabase pg_cron every 2 min (migration 129).
**VC + VT** (`autopostHonesty.test.ts` 14 tests, `selfAuthenticatingRoutes.test.ts` 6 tests). Auth fails **open** when the cron secret is unset → **G-2**.

### 3.12 Analytics / performance feedback
`getCampaignPerformanceState` `analyticsAgent.ts:105-126` → `not_connected | no_data | error | ok` → `performanceContext` `masterBrainV2.ts:1533` → `paidAdsAgent.ts:66`. **VC.** Outcome → memory: `outcomeInsights.ts` 3 writers → `business_memory` → `memorySection` → `groundingContext`. **VC.** Content-piece outcome: **absent** — `orderLinkage.attribute` has no generator consumer. **VC (absence).**

---

## 4. Safety-gap closure — the execution boundary, now proven

The forensic audit asserted the approval spine was sound. **This is the evidence.**

### 4.1 Queue-based actions: the gate is real, doubled, and race-safe — VERIFIED IN CODE

`src/lib/publish/executor.ts`:

1. Re-reads `publish_actions` by id; refuses unless `status === "approved"` (`:130`).
2. **Independently re-reads the linked `pending_approvals` row** and requires `status === "approved"` (`:147-158`, `isClearedToExecute` `:61-73`). A forged `publish_actions.status` alone cannot execute.
3. **Claims with a conditional UPDATE as a mutex** (`:176-182`): `.eq("id", …).or("status.eq.approved, and(status.eq.executing, updated_at.lt.<ttl>)")`. Postgres serialises at row level, so **duplicate side effects from retries or concurrent workers are prevented**, with a stale-claim TTL for crash recovery.
4. Refusal is logged (`publishError("execute.refused", …)`) and the action marked failed.

**Authorization at the approve step** (`src/app/api/approvals/[id]/route.ts`): session required (`:70-71`); the approval's `dealership_id` is read server-side; the actor must be the `owner_id` **or** hold an active `team_members` row for that dealership (`:94-104`); `approval_threshold` governs the approver's authority. **Tenant authorization is enforced server-side, not in the UI.**

> **Can a caller bypass the UI?** For queue actions, **no** — the execution path requires an approved `pending_approvals` row that only an authorized actor for that tenant can create. **VERIFIED IN CODE.**

### 4.2 Inline-card actions: "approval" is a UI affordance, not an enforced gate — VERIFIED IN CODE

The chat's `PublishAction` cards POST directly to existing endpoints. Measured:

| Endpoint | Session auth | Approval record consulted | Idempotency |
|---|---|---|---|
| `/api/social/post` | ✓ 1 | **0** | no key; `expect_text` equality only |
| `/api/website-builder/publish` | ✓ 1 | **0** | none |
| `/api/email/send` | ✓ 1 | **0** | **none** |
| `/api/graphic-design/generate` | ✓ 2 | **0** | none |

**What this does and does not mean.** It is **not** a privilege-escalation vulnerability: each endpoint resolves `dealership_id` from the authenticated session, so the only person who can post to a Page is someone already authorized for that business. What it means is that the **approval is enforced by the browser**, not the server: an authenticated owner (or any script holding their session) can POST the body directly and publish without the confirmation step ever rendering. **Two approval mechanisms with materially different enforcement strength.** → **G-3, confirmed code characteristic, severity MEDIUM, not a vulnerability.**

**Duplicate side effects:** `/api/email/send` has no idempotency key and no approval record. A retried or double-submitted request sends the email twice. → **G-4, confirmed, severity MEDIUM.**

### 4.3 The five ungated actions — re-verified, with test coverage measured

| Action | Approval | `ActionKey` | Tests referencing it |
|---|---|---|---:|
| `send_email` | **none** | not registered | 5 files (none asserts a gate) |
| `trigger_call` | **none** | not registered | **0** |
| `publish_to_youtube` | **none** | not registered | **0** |
| `set_automation_toggle` | **none** | not registered | 1 |
| `create_discount_code` | **none** | **registered, `requiresApproval: true`, risk "high"** (`executionPolicy.ts:73`, `publish/types.ts:246`) | 1 |

All five **CONFIRMED**. Two now have a sharper status than the forensic audit gave them:
- `trigger_call` and `publish_to_youtube` have **zero test coverage of any kind**. The forensic audit said they were ungated; it did not say they were also untested. Both are irreversible.
- `create_discount_code` is the only one that **contradicts an existing policy the codebase itself declares**.

### 4.4 What happens when required data is missing — VERIFIED IN CODE + TEST

| Missing | Behaviour |
|---|---|
| Business facts | `FACTS_UNAVAILABLE`, truth rules retained, fact-independent guard runs, `_factsState` marks the output, `safeToAutoPublish` false. `contentAutopilot.ts:123` refuses to run. **VT** (11 tests) |
| Approval row | `isClearedToExecute` refuses, action marked failed, refusal logged. **VC** |
| Permissions | 401 / 403 before any read. **VC** |
| Meta token | `readDestinations` → `connected: false` → **no publish button exists**. **VT** |
| Phone / DND | `trigger_call` refuses before calling. **VC**, **untested** |
| `CRON_SECRET` unset | **check skipped, endpoint unprotected** (`events/dispatch` logs "currently unprotected"). **VC** → G-2 |
| `FACEBOOK_APP_SECRET` unset | **payloads rejected** — fails closed. **VC** |

The contrast between the last two rows is the single clearest illustration of the codebase's uneven fail direction: the same class of secret, two opposite defaults.

---

## 5. AI quality and business context verification

| Property | Status | Evidence |
|---|---|---|
| Correct facts reach the model | **VC + VT** | `truthBlock`, `formatFactsForCopy(audience)`; 32 tests |
| Unsupported claims rejected or withheld | **VC + VT** | `guardOrMark`, `stripUnsupported`; `captionClaims` pins 5 real live sentences |
| Facts-null fails safe | **VC + VT** | `factsGate.ts`; 11 tests; 14 mutations caught |
| Retrieval failure fails safe | **PARTIAL** | returns `[]`; indistinguishable from "nothing relevant" → F-R1 stands |
| Prompts/outputs validated consistently | **NO** | `parseModelJson` is consistent; **no tool output is validated against a schema** |
| Provenance where required | **PARTIAL** | `_source`/`_edited` for website blocks only; `_sources`/`_unverified`/`_provider` for research; nothing elsewhere |
| Brand voice preserved | **VC**, advisory only | `withBrandVoiceCheck` flags, never regenerates |
| Duplicate/contradictory content across channels | **CONFIRMED POSSIBLE** | `instagram_post` and `facebook_post` are independent generations; no canonical message |
| Performance influences later output | **PARTIAL — see §8** | ads: yes (numeric); all generators: yes (prose, via `business_memory`); per content piece: **no** |
| Memory scoped to the right business | **VC** | every `business_memory` read/write carries `dealership_id`; `getLeadMemory` additionally scopes by `related_entity_id` |
| Model/tool/malformed failures handled | **VC + VT** | typed `AiFailure`; `malformedToolError` at 13 sites; `{error}` + `logAuditEvent` |

### 5.1 The one material new finding — U1 is resolved, and it is worse than "unknown"

The forensic audit listed `socialManagementAgent.generateAutoReply` as **U1, unprovable statically**. It is now resolved by reading `socialManagementAgent.ts:35-140` and `src/lib/webhooks/autoReplyHandler.ts`.

**What it is.** The auto-reply for every inbound Instagram/Facebook DM and every public comment. Its own code comment: *"This fires on every inbound DM and comment with nobody reviewing it."* Reachable when `dm_auto_reply_enabled` / `comment_auto_reply_enabled` is on (`autoReplyHandler.ts:105,133,182`), which `set_automation_toggle` can switch on from one chat sentence.

**What it has:**
- a hand-rolled `productCatalog` string — real names, prices, stock, booking links (`:72-74`)
- `knowledgeFacts` — **every row, raw** (`:76-78`)
- brand tone + language rule (`:63-66`)
- per-sender `pastInsights` from `getLeadMemory`
- usage logging (added 2026-09-27)

**What it does not have:**
- **no `BusinessFacts`** — a parallel catalogue formatter instead (duplication family D5)
- **no `COPY_TRUTH_RULES`**
- **no claims guard** — `return parsed.reply ?? null` (`:~133`) goes straight to `sendDmReply` / `sendInstagramDmReply` / `sendCommentReply`
- **no `splitStories`** — so the private customer story that `formatFactsForCopy` and (since `c433380`) the website widget both withhold **can be repeated to a stranger in a DM or a public comment reply**

**Test coverage:** 2 files touch it. `aiFailureRest.test.ts:140-143` asserts null on failure and pass-through on success. `chatAddService.test.ts:116` asserts the service catalogue shape. **Neither asserts a truth rule, a claim guard or the story gate.**

**Classification: CONFIRMED DEFECT, CRITICAL.** It is the highest-frequency customer-facing model call in the product, it is fully unattended, it is the last customer-facing surface still missing the layer Phase 1 added to the widget, and it can leak a private third-party story publicly. → **G-5.**

---

## 6. Security and data isolation

**Confirmed sound (code evidence):**

| Control | Evidence |
|---|---|
| Tenant isolation in chat tools | no tool reads a business id from model input — `grep` for `input.dealershipId|businessId|accountId` in `masterBrainV2.ts` returns nothing; all queries use `ctx.id` from the session |
| RLS coverage | **120 tables created, 120 with RLS enabled — exact match** |
| Approval authorization | owner **or** active team member of that dealership, server-side (`approvals/[id]/route.ts:94-104`) |
| Execution gate | double-checked + row-level mutex (§4.1) |
| Webhook authenticity | `verifyMetaSignature` HMAC-SHA256 on both Meta webhook routes, **fails closed** when the app secret is unset |
| Email recipients | must already be a lead, customer or team member of that business |
| Unpublish scoping | `post_id` must be prefixed with this business's own `pageId`, else 403 |
| Client bundle boundary | import-graph test covers `supabase/service.ts` and `crypto/secretCrypto.ts`; passing |
| Secrets at rest | OAuth tokens encrypted (`crypto/secretCrypto.ts`); single read path `readMetaPageToken` |
| Public surface | 17 public API routes, all under `/api/public/` or an explicitly reasoned prefix |

**Confirmed code characteristics needing a decision (not exploits):**

- **G-2 · cron auth fails open.** `/api/events/dispatch` skips its bearer check when the secret is unset and logs *"currently unprotected"*; `/api/autopilot/daily-run` has the same shape. **Whether the secret is set in production is an environment value I must not read and cannot verify.** Severity depends entirely on that. **UNVERIFIED severity, CONFIRMED pattern.**
- **G-6 · cron secret accepted in the query string.** `daily-run` accepts `querySecret === cronSecret` as an alternative to the header. Secrets in URLs reach access logs, proxies and referrers. **CONFIRMED, MEDIUM.**
- **G-7 · service role inside chat tools.** `createServiceClient` appears **17 times** inside `executeTool`. The service role bypasses RLS, so each of those queries depends on its own `.eq("dealership_id", ctx.id)`. Static reading shows they all have it; the safety rests on code discipline rather than the database. **CONFIRMED characteristic, MEDIUM — no defect found.**
- **G-8 · customer PII unredacted in prompts.** Lead names and phone numbers reach call-script and auto-reply prompts. No redaction layer exists. No leak path found. **CONFIRMED absence of a boundary, MEDIUM.**
- **G-9 · rate limits.** No per-tenant rate limiting was found on `/api/public/chat` — the one unauthenticated model-invoking endpoint. Every call costs money. I found no limiter; I cannot prove none exists at the platform edge. **UNVERIFIED.**

**No unauthorized access was attempted and no destructive test was run.**

---

## 7. Evidence and test matrix

| Finding / capability | File · function | Expected | Code evidence | Test evidence | Runtime | Status | Severity | Remaining verification | Safest way |
|---|---|---|---|---|---|---|---|---|---|
| Single model gateway | `ai/claude.ts:227` `callClaude` | all Anthropic traffic one path | `grep anthropic.com` outside file = 0 | — | — | **VC** | — | none | — |
| Execution re-checks approval | `publish/executor.ts:130-158` | refuse unless both rows approved | double read + `isClearedToExecute` | `campaignSwitchTools.test.ts` | — | **VC+VT** | — | none | — |
| No duplicate execution | `publish/executor.ts:176-182` | one worker only | conditional UPDATE mutex | — | — | **VC** | — | concurrency test | two parallel calls against a local DB |
| Approve-step authz | `approvals/[id]/route.ts:94-104` | owner or team member | server-side check | — | — | **VC** | — | negative test | call PATCH as a non-member in test |
| `send_email` ungated | `masterBrainV2` case | approval before a real send | `sendDealerEmail` direct | 5 files, none asserts a gate | — | **CONFIRMED** | **HIGH** | none | — |
| `send_email` not idempotent | `api/email/send` | one send per intent | no key, no approval row | — | — | **CONFIRMED** | MEDIUM | none | — |
| `trigger_call` ungated | `masterBrainV2` case | approval before a call | `triggerVapiCall` direct | **0 tests** | — | **CONFIRMED** | **HIGH** | none | — |
| `publish_to_youtube` ungated | `masterBrainV2` case | approval before public video | direct upload | **0 tests** | — | **CONFIRMED** | **HIGH** | none | — |
| `set_automation_toggle` ungated | `masterBrainV2` case | approval before unattended sending | direct `dealerships` update | 1 file | — | **CONFIRMED** | **CRITICAL** | none | — |
| `create_discount_code` contradicts policy | case vs `executionPolicy.ts:73` | one policy | direct insert; registry says `requiresApproval: true` | 1 file | — | **CONFIRMED** | **HIGH** | none | — |
| **Auto-reply: no truth rules / guard / story gate** | `socialManagementAgent.ts:35-140`; `webhooks/autoReplyHandler.ts:156,200` | facts + rules + guard, story withheld | no `COPY_TRUTH_RULES`, no guard, raw `knowledgeFacts` | 2 files, neither asserts safety | — | **CONFIRMED** | **CRITICAL** | none | — |
| Facts fail closed | `claims/factsGate.ts` | rules kept, guard runs, marked | `guardOrMark` | **11 tests, 14 mutations** | — | **VC+VT** | — | none | — |
| Chat prose claim-checked | `chat/replyClaims.ts` | claims caught, prose kept | `checkReplyClaims` | **8 tests incl. wiring** | — | **VC+VT** | — | none | — |
| Widget uses real facts | `chatbotAgent.ts` | real price, discount withheld | `truthBlock(facts,"customer")` | **6 tests** | — | **VC+VT** | — | none | — |
| Social publish divergence closed | `chat/socialPost.ts`, `api/social/post` | card text == published | `composePost`, `expect_text` | **29 tests, 10 mutations** | — | **VC+VT** | — | live IG | owner posts once on a test Page |
| IG caption read-back | `api/social/post` | verify published caption | `verified:"unchecked"` by decision | — | — | **NV** | LOW | live run | one real IG post |
| RLS on every table | migrations | all tables protected | **120 = 120** | — | — | **VC** | — | live schema | `pg_policies` query by owner |
| Repo migrations == prod | `supabase/migrations` | identical | 5 numbering gaps; known prod drift | — | — | **UNVERIFIED** | UNKNOWN | compare | owner runs a schema diff |
| Cron auth fails open | `events/dispatch:19-26` | fail closed | `if (cronSecret) {…} else warn` | `selfAuthenticatingRoutes` (reachability only) | — | **CONFIRMED pattern** | **UNVERIFIED** | is the secret set? | owner checks the env var exists (do not print it) |
| Webhook auth fails closed | `webhooks/metaSignature.ts:50-78` | reject when unverifiable | rejects when secret unset | — | — | **VC** | — | none | — |
| `image_scene_prompt` unguarded | `adEngine.generateAdPlan` | guard the painted text | only headline+body guarded | — | — | **CONFIRMED** | **HIGH** | none | — |
| No tool output schema validation | `executeTool`, `extractArtifact` | validate tool results | defensive `??` only | — | — | **CONFIRMED** | MEDIUM | none | — |
| Per-piece content performance | `orderLinkage.attribute` | feed later generations | no generator consumer | — | — | **CONFIRMED absence** | **HIGH** | none | — |
| Public chat rate limit | `api/public/chat` | per-tenant limit | none found | — | — | **UNVERIFIED** | UNKNOWN | edge config | owner checks platform WAF/limits |

### Highest-priority missing tests

1. **`approvalCoverage.test.ts`** — enumerate `executeTool` cases statically; every case with an external side effect must map to a registered `ActionKey`. A new tool then fails the test **by default**. This one test prevents the entire G-5/A1–A5 class from recurring.
2. **`autoReplyGuard.test.ts`** — the auto-reply withholds a fabricated discount and never repeats a private story.
3. **`triggerCall.test.ts` / `youtubePublish.test.ts`** — any coverage at all; both are currently at zero and irreversible.
4. **`executorConcurrency.test.ts`** — two parallel `execute` calls produce one side effect.
5. **`approvalAuthz.test.ts`** — a non-member's PATCH is refused.
6. **`toolOutputContract.test.ts`** — each generating tool returns the fields `extractArtifact` reads.

---

## 8. Reconciliation of the forensic audit

| Finding | Label | Evidence |
|---|---|---|
| F-A1 `set_automation_toggle` ungated | **CONFIRMED** | direct `dealerships` update; no `ActionKey`; prompt-only safeguard |
| F-A2 `trigger_call` ungated | **CONFIRMED, worse** | also **0 tests** |
| F-A3 `send_email` ungated | **CONFIRMED, worse** | also **no idempotency** → duplicate sends |
| F-A4 `create_discount_code` contradicts the registry | **CONFIRMED** | `executionPolicy.ts:73` `requiresApproval: true` vs direct insert |
| F-A5 `publish_to_youtube` ungated | **CONFIRMED, worse** | also **0 tests** |
| F-T2 facts have no freshness | **CONFIRMED** | no `fetched_at`/TTL in `BusinessFacts` |
| F-N1 no narrative provenance | **CONFIRMED** | no pattern family covers story or attributed speech |
| F-X1 `generate_content` returns no `note` | **CONFIRMED** | case `:1018-1031` |
| F-P1 no per-piece content outcome | **CONFIRMED** | `orderLinkage.attribute` consumers: `analyticsAgent`, `businessFacts`, `businessNumbers`, `strategy/diagnosis` — no generator |
| F-Q1 `revise` on 2 of 5 callers | **CONFIRMED** | `grep "revise: true"` → 2 routes |
| F-17 58 tools / 53,466 chars | **CONFIRMED** | re-measured identical |
| F-E1 96 silent `catch {}`, 227 `return null` | **CONFIRMED** | re-measured identical |
| F-X4 `image_scene_prompt` unguarded | **CONFIRMED** | `guardGenerated({headline, body})` only |
| F-S1 PII unredacted | **CONFIRMED** | no redaction layer exists |
| F-T1 no fact conflict resolution | **CONFIRMED** | `knownText` is a flat bag |
| F-R1 retrieval failure == empty | **CONFIRMED** | `retrieveKnowledge.ts:30-34` |
| F-M1 memory mixes three provenances | **CONFIRMED** | `source: "auto_analytics"` exists in data, **not surfaced in the prompt** |
| F-D1 three claim engines | **CONFIRMED** | `claimCheck`, `complianceValidation`, `narrativeCheck` |
| F-D4 two JSON extractors | **CONFIRMED** | `jsonFromText` still exported `claude.ts:291` |
| F-X2 4000-char truncation | **CONFIRMED** | `.slice(0, 4000)` |
| F-16 facts/guard opt-in per agent | **CONFIRMED** | 18 model-calling agents with no `BusinessFacts` |
| F-18 flat routing | **CONFIRMED** | 49/57 on one tier |
| F-19 no generation parameters | **CONFIRMED** | no `temperature` anywhere |
| F-C1 no token budget | **CONFIRMED** | six independent magic numbers, no total |
| **F-U1 `generateAutoReply` unknown** | **RESOLVED → CRITICAL DEFECT** | §5.1 — worse than "unknown": no rules, no guard, no story gate, unattended |
| **"59 tool cases"** | **CORRECTED to 58** | off-by-one in the earlier measurement |
| "Approval before every irreversible publishing action" | **PARTIALLY CONFIRMED** | true for the **queue**; inline cards are a UI affordance only (§4.2) |
| "Tenant isolation holds" | **CONFIRMED and strengthened** | plus 120/120 RLS and server-side approve authz |
| U2 Instagram path | **still UNVERIFIED** | needs one live post |
| U3 `marketing_knowledge` populated | **still UNVERIFIED** | runtime state |
| U4 website→ad claim checking | **still UNVERIFIED** | needs the URL→ad path executed |
| U5 real token count | **still UNVERIFIED** | no instrumentation |
| U6 repo vs prod schema | **still UNVERIFIED, now quantified** | 5 numbering gaps + known drift |
| U7 inactive ad platforms | **still UNVERIFIED** | no credentials |
| U8 silent catches in production | **still UNVERIFIED** | needs logs |

**Nothing was NOT REPRODUCED. Nothing was CONTRADICTED. One finding was corrected, one upgraded from unknown to critical, one qualified.**

---

## 9. Deliverables

### A. Known with strong evidence (code + passing tests + mutation checks)
Single model gateway with no bypass · the execution gate (double-checked, mutex-protected) · server-side approve authorization · facts fail-closed · chat prose claim-checked · widget uses real customer-safe facts · social publish divergence closed with read-back · webhook signature verification failing closed · tenant isolation in chat tools · 120/120 RLS in the repo · WhatsApp has no send capability.

### B. Supported only by static inspection (no test asserts it)
`trigger_call` and `publish_to_youtube` behaviour · `set_automation_toggle` effects · `seoAgent`/`seoPageAgent` safety · the 18 factless agents · `image_scene_prompt` · the 17 service-role queries inside `executeTool` · PII handling · migration-to-production parity.

### C. Proven by tests
213 files / 3228 tests, all passing at `c433380`. Directly relevant: `factsFailClosed` (32), `socialPostDestination` (29), `claimsGuard` (50), `contentQuality` (49), `captionClaims` (18), `autopostHonesty` (14), `productDepiction` (11), `postPresence` (9), `clientBundleBoundary` (4), `selfAuthenticatingRoutes` (6), `campaignSwitchTools`.

### D. Verified in safe runtime
`tsc --noEmit` EXIT 0 · `vitest run` EXIT 0 (all network stubbed; no external call made). **No production runtime verification was performed or attempted.**

### E. Unknown, and why
Eight items in §8 (U2–U8 plus G-1). All require either a live account, a production environment value, platform logs, or an action with an external side effect — every one of which is outside the read-only boundary. Plus **G-9** (rate limiting) and the **severity** of G-2, which depends on an env var I must not read.

### F. Confirmed vs suspected

**CONFIRMED DEFECTS (code evidence, no runtime needed)**
1. **G-5 / F-U1 — auto-reply has no truth rules, no claim guard, no private-story gate. CRITICAL.**
2. **F-A1 `set_automation_toggle` ungated. CRITICAL** — it disables every other gate.
3. F-A2 `trigger_call` ungated and untested. **HIGH**
4. F-A3 `send_email` ungated and non-idempotent. **HIGH**
5. F-A5 `publish_to_youtube` ungated and untested. **HIGH**
6. F-A4 `create_discount_code` contradicts the policy registry. **HIGH**
7. F-T2 facts have no freshness; the guard defends stale data. **CRITICAL**
8. F-N1 no narrative provenance — invented testimonials pass. **HIGH**
9. F-X4 `image_scene_prompt` unguarded on public creatives. **HIGH**
10. F-P1 no per-piece content outcome. **HIGH**
11. F-X1 / F-Q1 / F-R1 / F-M1 / F-D1 / F-D4 / F-X2 / F-C1 / F-18 / F-19. **MEDIUM**
12. G-3 inline-card approval is browser-enforced; G-4 no email idempotency; G-6 secret in query string; G-7 service role breadth; G-8 PII. **MEDIUM**

**SUSPECTED, NOT CONFIRMED**
- G-2 cron fail-open — pattern confirmed, **severity unknown** until the env var's presence is checked.
- G-1 repo/prod schema divergence — gaps quantified, impact unknown.
- G-9 absence of rate limiting on the one public model endpoint.
- U4 whether website-derived text is claim-checked before feeding ad copy.

### G. Reconciled architecture map

```
                 ┌──────── 79 dashboard pages · 22 public pages ────────┐
                 ▼                                                      ▼
   273 API routes (17 public · 5 webhooks · 2 cron)        /api/public/chat (unauth, by design)
                 │                                                      │
                 ▼                                                      ▼
      runMasterBrainChat ── getBusinessContext ──┐          runSalesAgentTurn
      (58 tools, ≤6 iterations)                  │          (facts "customer", guard, story gate)
                 │                      facts · memory(20) · RAG(5) · brand
                 ▼
      executeTool (58 cases) ─► 44 model-calling agents ─► callClaude (ONE gateway)
                 │                                             │ 3 tiers, no fallback, no temperature
                 ├─ guards: guardOrMark · claimCheck · platformRules · splitStories · imageBrief
                 ├─ extractArtifact (56 cases) ─► saveGenerated ─► 120 RLS tables
                 │
                 ├─ QUEUE PATH ──► createPublishAction ─► pending_approvals
                 │                     ▲ authz: owner|team, server-side
                 │                     ▼
                 │                 executor (status + approval re-checked, row mutex)
                 │                     ▼  platforms/{meta,shopify,wordpress,woocommerce}
                 │
                 ├─ INLINE-CARD PATH ──► existing endpoint directly   ◄── G-3: browser-enforced
                 │
                 └─ UNGATED PATH ──► send_email · trigger_call · publish_to_youtube
                                     set_automation_toggle · create_discount_code   ◄── CONFIRMED
                 ┌──────────────────────────────────────────────────┐
   WEBHOOKS ─────┤ metaSignature HMAC (fails CLOSED) ──► autoReplyHandler
                 └──────────────────────────────────┬───────────────┘
                                                    ▼
                                      generateAutoReply  ◄── G-5 CRITICAL
                                      (catalogue yes · rules no · guard no · story gate no)
                                                    ▼
                                          sendDmReply / sendCommentReply → customer

   PERFORMANCE: Meta ─► getCampaignPerformanceState ─► ads prompt (numeric) ✓
                outcomes ─► outcomeInsights ─► business_memory ─► all generators (prose) ✓
                content piece ─► orderLinkage.attribute ─► ✗ NO CONSUMER
```

### H. Remaining-evidence plan (prioritized, all safe)

1. **Confirm `CRON_SECRET` is set in production** — resolves G-2's severity. The owner checks the variable *exists*; its value is never printed.
2. **Schema diff repo vs production** — resolves G-1 and the 5 numbering gaps. Read-only `information_schema` / `pg_policies` query run by the owner.
3. **Check for a platform-level rate limit on `/api/public/chat`** — resolves G-9.
4. **One live Instagram post from a test Page** — resolves U2 and the read-back gap. The only item needing a real side effect; the owner's call, on a throwaway Page.
5. **Confirm `marketing_knowledge` has rows** — resolves U3; one `count(*)`.
6. **Trace the website→ad path once in a safe environment** — resolves U4.

### I. Implementation plan (NOT implemented)

**Phase 2A — close the unattended customer surface (highest consequence, smallest diff)**
1. `generateAutoReply`: accept `BusinessFacts`, append `COPY_TRUTH_RULES`, guard the reply in `publish` mode, apply `splitStories`. Every component already exists and is already used by the widget — this is the same change `c433380` made, applied to the one surface it missed.
2. Add `autoReplyGuard.test.ts`.

**Phase 2B — admit the five ungated actions into the registry that already exists**
3. Register `send_email`, `trigger_call`, `publish_to_youtube`, `set_automation_toggle` as `ActionKey`s; route `create_discount_code` through the policy that already governs it. `emailSendAction` and `createPublishAction` both already exist.
4. Add `approvalCoverage.test.ts` — the static enumeration test that makes this class non-recurring.
5. Add an idempotency key to `/api/email/send`.

**Phase 2C — truth integrity**
6. `fetched_at` + staleness label on `BusinessFacts`; a stale price reported as unverified rather than defended.
7. Guard `image_scene_prompt`.
8. Narrative-provenance layer.

**Phase 2D — quality and feedback**
9. `revise: true` on the chat caller.
10. `performanceContext()` for content, from the `marketing_pieces`/`orderLinkage` plumbing that already exists.
11. A `note` contract per generating tool.

**Phase 2E — architecture**
12. Shared guarded copy wrapper (closes the 18-agent class by default) → canonical message → intent routing → task-class model/temperature → fold the duplicate claim engines.

**Cross-cutting, do first if anything:** one `turn_id` threaded through `callClaude`'s `logContext`, `executeTool`, `saveGenerated` and `logAuditEvent`. Every table already exists. Without it, none of the above can be verified in production.

### J. Verdict

**Is the system sufficiently understood to begin controlled fixes? YES — for Phases 2A and 2B. NO for anything that touches production behaviour broadly.**

Justification: 2A and 2B are confirmed defects with exact file and function evidence, they reuse components that already exist and are already tested on an adjacent surface, and they are covered by a full suite that is green at the baseline. No unknown gates them.

**What must be verified before anything else:** (1) that `CRON_SECRET` is set in production, and (2) the repo-vs-production schema diff. Both are read-only, both take minutes, and both bound the blast radius of every later change.

**This audit is not complete.** Material paths remain unverified: the live Instagram publish, production schema parity, rate limiting on the public endpoint, and the real behaviour of 18 factless agents. Static analysis cannot close those.

---

## Plain-language summary for a founder

**What we now know for certain.** Hawlai's spine is sound. Every AI call goes through one door, so cost, retries and failures are handled the same way everywhere. Nobody can get at another business's data through the chat — we checked, and all 120 database tables have protection switched on. The ad-approval system is genuinely strong: it checks twice before spending and it cannot be tricked into spending twice. The work from the last two weeks holds up — 3,228 automated tests pass, including the ones that stop the Facebook-post incident recurring.

**The one thing that genuinely worries me.** When a customer sends your business a DM or comments on a post, Hawlai can reply automatically with nobody reading it first. That reply knows your real prices — good — but it has **none** of the safety checks everything else has. It can promise a discount that does not exist, and it can repeat a private story a customer once told you — including the one about the hospital — to a complete stranger, in public. This is the same hole we closed on your website chat last week; we simply missed this one surface. It is the most-used AI feature in the product and the least protected. Fixing it is a small change using parts that already exist.

**The second thing.** Five actions can happen from a single sentence in chat with no "are you sure": sending a real email, **placing a real phone call to a customer**, publishing a video to YouTube, creating a live discount code, and — worst — switching on the automatic posting and emailing that then runs with nobody watching. Two of those five have no tests at all. Your system already has a proper approval mechanism; these five just were never added to it.

**One correction I owe you.** My earlier report said Hawlai never learns from results. That was too harsh. It does learn in two real ways: ad budget advice uses your actual past spend and leads, and when a lead converts or a call finishes, Hawlai writes a note to itself that every future piece of writing can see. What it genuinely cannot do is tell which *post* worked — the measuring stops at publishing. The wiring for that already exists and nothing reads it.

**What I still cannot tell you.** Whether one background security setting is switched on in production (I must not read your environment variables — you can check it exists in a few seconds). Whether your live database exactly matches the code's expectations — we already know it drifted once. And whether Instagram posting works end to end, which needs one real post on a throwaway page.

**The single best next step.** Fix the auto-reply. It is the only place where a customer is talking to Hawlai with no human and no safety net, it can expose someone's private story publicly, and the fix reuses code that is already written and already tested next door. Everything else can wait a week; that one cannot.
