# HAWLAI AI QUALITY DIAGNOSIS

**Date:** 2026-10-08
**Scope:** read-only audit. No file was modified, no schema touched, no publishing path changed.
**Method:** code trace with line references, plus execution probes against the live guard where a claim needed proving rather than asserting.

---

## 0. Executive summary

Hawlai is **not** a thin wrapper around a model. It already has a canonical facts layer (`src/lib/claims/businessFacts.ts`), a claims guard (`src/lib/claims/claimCheck.ts`), semantic retrieval over a curated marketing knowledge base, anti-repetition memory, a specificity editor pass, and an approval-gated publish spine. Most of the machinery a reliable marketing employee needs exists.

The quality problems are not caused by missing machinery. They are caused by **the machinery not being reached on every path**, and by **fail-open defaults** when it cannot be reached. Three structural patterns explain almost every reported failure mode:

1. **The guard is per-tool, not per-surface.** Every protection lives inside a generator function. Anything that produces customer-facing words *outside* a guarded generator — the chat's own prose, Social Management, the website chat widget, influencer outreach — has no facts, no truth rules and no claim check.
2. **Fail-open on missing facts.** `facts == null` removes the truth rules from the prompt *and* skips the claims guard entirely, and nothing tells anyone. The system is least protected exactly when it knows least about the business.
3. **The best quality pass is not wired to the primary surface.** `reviseForSpecificity` — the "could a competitor publish this exact line?" editor — runs on two REST routes and **not** in chat, which is the product's main surface.

Add a fourth, cheaper but pervasive: **instruction dilution.** Every chat turn ships ~53 KB of tool schema for 58 tools plus a ~20 KB narrative system prompt before the user's message. The truth rules compete for attention with dozens of other imperatives.

---

## 1. The lifecycle as it actually runs

| Stage | Where | Verdict |
|---|---|---|
| User request | `src/app/api/chat/*` → `runMasterBrainChat` | OK |
| Intent detection | None. Claude tool-use over 58 tools is the only router | **Weak** (F-17) |
| Business context | `src/lib/businessBrain/getBusinessContext.ts:52` | OK |
| Product/store context | `gatherBusinessFactsSafely` inside the above | OK where passed, **not passed everywhere** (F-02, F-03) |
| Business Knowledge | `masterBrainV2.ts:4292` (`splitStories`) | OK, but **unfiltered dump** (F-12) |
| Brand voice | `masterBrainV2.ts:4270` `formatBrandVoiceSection` | OK; **check is advisory only** (F-11) |
| Retrieval (marketing KB) | `src/lib/knowledge/retrieveKnowledge.ts:24` | OK, **fails silently** (F-10) |
| Previous performance | **Nowhere.** `recentCopy` returns text, never results | **Missing** (F-13) |
| Tool selection | `masterBrainV2.ts:4410` `tools: cachedTools()` | **Weak** (F-17) |
| Research | `researchAgentV2`, `competitorIntelAgent` | Facts + provenance present, **not guarded** (F-09) |
| Model routing | `src/lib/models.ts:24` | **Flat** — 49 of 57 call sites are one tier (F-18) |
| Prompt construction | `masterBrainV2.ts:4370`, `contentMarketingAgent.ts:163` | **Fail-open** (F-01) |
| Generation | `callClaude` → `src/lib/ai/claude.ts:228` | **No temperature anywhere** (F-19) |
| Claim checking | `guardGenerated` inside each agent | **Per-tool only** (F-02) |
| Quality checking | `reviseForSpecificity` | **Not on the chat path** (F-04) |
| Artifact creation | `extractArtifact`, `masterBrainV2.ts:3594` | OK — same object as saved |
| Save | `saveGenerated`, `masterBrainV2.ts:842` | OK |
| Approval | `src/lib/chat/publishActions.ts` | OK (recently hardened) |
| Publish | `/api/social/post`, `publish/platforms/meta` | OK (recently hardened) |

---

## 2. Findings

### F-01 — `facts == null` silently removes the truth rules AND the claims guard

- **Severity:** Critical
- **Confirmed root cause**
- **Files:** `src/lib/agents/contentMarketingAgent.ts:163`, `:216`; `src/lib/agents/masterBrainV2.ts:4320-4322`
- **Functions:** `generateContent`, `runMasterBrainChat` (system prompt assembly)

**Evidence** — `contentMarketingAgent.ts:163`:
```ts
${brandContext}${groundingContext ?? ""}${facts ? `\n\n${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}\n` : ""}
```
and `:216`:
```ts
if (!facts) return { output: applyLinkRule(linkRuleFor, parsed).output, ...(revised ? { revised } : {}) };
```
The same pattern in the chat system prompt, `masterBrainV2.ts:4320`:
```ts
const storeFactsSection = storeFacts ? `...${COPY_TRUTH_RULES}...` : "";
```
`facts` is null whenever `gatherBusinessFactsSafely` throws (`businessFacts.ts:546-553` catches and returns `null`).

**Current behavior.** One transient database error during fact gathering produces copy generated with **no truth rules in the prompt**, returned with **no claims guard applied**, carrying **no `_claimsNote`** — indistinguishable from a fully checked draft. The chat loses every truth rule from its system prompt in the same event.

**Why it causes bad output.** This is the single largest correctness hole. Failure modes B, C, D, E all become unguarded simultaneously, and because `_claimsNote` is absent the owner reads the result as verified. It is also invisible in logs: `console.error` fires inside `gatherBusinessFactsSafely`, far from the generation.

**Recommended fix.** Fail closed. `COPY_TRUTH_RULES` is a static string with no dependency on facts — always include it. When `facts == null`, either refuse to generate customer-facing copy or return it with an explicit `_unverified` marker that the card and the chat must surface. Never return copy that is silently unguarded.

**Regression test.** Make `gatherBusinessFactsSafely` return null; assert (a) the prompt still contains `COPY_TRUTH_RULES`, (b) the output carries an unverified marker, (c) no publish action is offered. Mutation: remove the marker → test fails.

---

### F-02 — The chat's own prose is never claim-checked

- **Severity:** Critical
- **Confirmed root cause**
- **File:** `src/lib/agents/masterBrainV2.ts:4344-4347`, used at `:4431`
- **Function:** `checkedReply`

**Evidence:**
```ts
const checkedReply = (text: string): string => {
  const fix = fixReplyLinks(text, storeFacts);
  return `${fix.reply}${linkFixNote(fix) ?? ""}`;
};
```
`findUnsupportedClaims` and `stripUnsupported` appear in this file only at `:1336`, `:1343`, `:1682`, `:1685` — all inside *tool* cases. Never on the reply.

**Current behavior.** The reply prose is checked for **links only**. The model's own sentences about the business — benefits, customer reactions, founder history, "your soy wax burns cleaner than paraffin" written conversationally rather than through a tool — reach the owner unchecked.

**Why it causes bad output.** The system prompt tries to close this with a rule (*"Copy a customer will read goes through the tool, always — even one line"*, `:4370` guidelines). That is a prompt, not code. Failure modes B, C, D, E and L all survive here. The owner cannot tell guarded copy from unguarded, because both arrive in the same bubble.

**Recommended fix.** Run `findUnsupportedClaims` over the reply text and append the flags as a visible note, or strip and say so — the same treatment a tool output gets. Do not strip silently: chat prose is conversation, and removing a sentence mid-explanation reads as a bug. Flag-and-say is the right shape here.

**Regression test.** Stub the model to reply with each of the five live sentences from `tests/captionClaims.test.ts` as *prose* (no tool call); assert each is flagged in the returned reply. Mutation: bypass the check → test fails.

---

### F-03 — Social Management generates customer-facing copy with no facts and no guard

- **Severity:** Critical
- **Confirmed root cause**
- **File:** `src/lib/agents/socialManagementAgent.ts:143-185`
- **Function:** `generateSocialTask`

**Evidence.** The signature has no `facts` parameter:
```ts
export async function generateSocialTask(
  taskKey, dealershipName, businessCategory, inputText,
  brandProfile?, logContext?, recentPostsContext?, groundingContext?
)
```
`grep -c "guardGenerated\|factsPrompt\|COPY_TRUTH_RULES" socialManagementAgent.ts` → **0**. Called from chat at `masterBrainV2.ts:1466`, where `socialFacts` **is** in scope and is used only for the language setting.

**Current behavior.** Reply suggestions and DM templates — read by actual customers — are written with brand tone and `groundingContext` (brand voice, memories, owner knowledge, RAG) but **no products, no prices, no offers, no shipping, no truth rules**, and the output is never claim-checked.

**Why it causes bad output.** A DM reply cannot quote a price correctly because it was never given one, and nothing stops it inventing an offer. Failure modes B, E, F.

**Recommended fix.** Add `facts` to the signature, append `factsPrompt(facts)`, and wrap the return in `guardGenerated(..., "publish")` — `publish` because these go out to customers, often without review.

**Regression test.** Generate a `reply_suggestions` task with a fixture whose shipping is ₹60 flat and whose model reply says "free shipping"; assert the phrase is removed and `_claimsNote` is present.

---

### F-04 — The specificity editor does not run on the chat path

- **Severity:** High
- **Confirmed root cause**
- **Files:** `src/lib/agents/contentMarketingAgent.ts:209-213`, `:316-345`; `src/lib/agents/masterBrainV2.ts:991`
- **Function:** `reviseForSpecificity`, gated by `opts.revise`

**Evidence.** Only two callers pass it:
```
src/app/api/autopilot/content-queue/route.ts:70:      revise: true,
src/app/api/content-marketing/generate/route.ts:65:    { recent: ..., revise: true }
```
The chat call at `masterBrainV2.ts:991` passes `{ recent: await recentCopy(...) }` — **no `revise`**.

**Current behavior.** The editor pass whose entire job is *"could a competitor in the same line of work publish this exact line about themselves? If yes it is filler"* (`:332`) is skipped on the surface the owner actually uses. Chat returns the first draft.

**Why it causes bad output.** This is the most direct, confirmed cause of **failure mode A (generic marketing copy)** and contributes to **G (repeated generic hooks)**. The comment on the option says *"Pages where a human reviews; never the auto-publish path"* — but chat **is** a human-review path with an approval card, so the exclusion is an oversight, not a policy.

**Recommended fix.** Pass `revise: true` from chat. Cost is one extra `standard`-tier call per content generation; if that is unacceptable, gate it on content types that are customer-facing copy rather than on the caller.

**Regression test.** Assert the chat path calls `reviseForSpecificity` for a social content type. Mutation: drop the flag → test fails.

---

### F-05 — A stripped ad body is replaced by a hardcoded generic line, and it spends money

- **Severity:** High
- **Confirmed root cause**
- **File:** `src/lib/adEngine.ts:61-72`
- **Function:** `generateAdPlan`

**Evidence:**
```ts
const checked = guardGenerated({ headline: plan.headline, body: plan.body }, facts, "draft") as any;
const name = facts.businessName;
return {
  ...plan,
  headline: String(checked.output.headline ?? "").trim() || name.slice(0, 40),
  body: String(checked.output.body ?? "").trim() || `Message ${name} to know more.`,
```

**Current behavior.** When the guard empties the body — i.e. exactly when the copy was *most* claim-heavy — the ad runs with `"Message Candle by Qaaf to know more."` Two further problems in the same function: `if (!facts) return plan` at `:63` leaves the plan **entirely unguarded**, and only `headline`/`body` are checked while `image_scene_prompt` (painted onto the creative) is not.

**Why it causes bad output.** Maximally generic copy on the one surface with a budget attached. Failure mode A, on the highest-stakes path.

**Recommended fix.** Do not substitute a template. If the guard empties the body, return a plan marked `_needsRewrite` with the removed claims, and let the approval card show the refusal instead of a weak ad. Guard `image_scene_prompt` too.

**Regression test.** Facts with ₹60 shipping, model body `"Free shipping, order now!"`; assert the returned plan is marked unusable and does **not** contain `"Message ... to know more"`.

---

### F-06 — Model-invented lead forecasts are presented as estimates

- **Severity:** High
- **Confirmed root cause**
- **Files:** `src/lib/adEngine.ts:89` (prompt), `:145-146` (fallback), `src/app/dashboard/ads/full-launch/page.tsx:398-399`

**Evidence.** The prompt asks the model for `estimated_leads_low` / `estimated_leads_high`; the fallback hardcodes `10` and `25`; the UI renders them with an arithmetic fallback (`budget * 30 / 250`). Nothing marks any of these as a guess. Contrast `score_reasoning`, which *does* disclose `"Generated via fallback template — not AI-scored."`

**Current behavior.** An owner deciding a budget sees a lead range with no provenance. This is the same class of defect the Health Score work already fixed in reporting (`src/lib/reports/healthScore.ts` returns `{scored:false, reason}` below a data floor) — the lesson was not carried to ads.

**Why it causes bad output.** Failure mode B, on a spending decision.

**Recommended fix.** Reuse the `healthScore` pattern: compute from this business's own historical cost-per-lead when there is enough data, otherwise return "not enough data" and render "—". Never a model's number.

**Regression test.** Zero historical orders → the plan carries no lead estimate and the card shows no range.

---

### F-07 — `confidence_score` is a model's opinion used as a quality gate

- **Severity:** Medium
- **Confirmed root cause**
- **File:** `src/lib/adEngine.ts:101-116`

**Evidence.** `AD_PLAN_RETRY_THRESHOLD` compares `first.confidence_score` — self-reported — and keeps whichever attempt scored itself higher. The code's own comment concedes *"a self-reported score is noisy enough that it isn't blindly trusted"*, then trusts it to pick the winner.

**Why it causes bad output.** A model that writes generic copy also scores it 80. The gate passes exactly the drafts it should catch. Failure mode A.

**Recommended fix.** Replace with a computed signal: the `reviseForSpecificity` test (does any line survive the competitor test), claim-flag count, and whether an owner-story detail is present (`usesOwnStory`). All three are deterministic and already exist.

**Regression test.** A draft containing only category-generic lines is rejected regardless of the self-score.

---

### F-08 — `generate_content` returns no `note`, so the chat invents the framing

- **Severity:** High
- **Confirmed root cause**
- **File:** `src/lib/agents/masterBrainV2.ts:987-1003`

**Evidence.** The `generate_graphic` case returns a long `note` instructing the model exactly what to say. The `generate_content` case returns `withBrandVoiceCheck(...)` with **no `note` field at all**.

**Current behavior.** The model narrates the result freely. The 8 Oct incident reply — *"Here's your post — graphic and caption, ready to go… Graphic saved to Graphic Design, caption saved to Content"* — is model-authored framing of a `draft` row.

**Why it causes bad output.** Failure modes J and K. The system prompt has a strong rule for this (*"Saved is not live, and only the tool can tell you which one happened"*, `:4370`) but it is only enforceable when the tool actually returns a `note` — and here it returns none, so there is nothing for the rule to bind to.

**Recommended fix.** Return a `note` from `generate_content` stating the content type, that a **draft** row was written, which page it is on, and that nothing is published. Same shape as the `generate_graphic` note.

**Regression test.** Assert the result carries a `note` containing "draft" and not "published"; assert `_savedId` presence matches the note's claim.

---

### F-09 — Facebook and Instagram are generated independently; there is no canonical post

- **Severity:** High
- **Confirmed root cause**
- **File:** `src/lib/departments/content.ts:19,23,24`

**Evidence.** `instagram_post`, `facebook_post` and `threads_post` are three separate `CONTENT_TYPES` keys, each with its own `instructions`. A request for "a post for Instagram and Facebook" produces two independent `generate_content` tool calls, two model calls, two unrelated texts. `grep -rn "canonical" src/lib` returns only a comment in `platformRules.ts` about facts.

**Current behavior.** Two different messages for one campaign moment, each claim-checked separately, each saved as a separate `content_pieces` row, with no link between them.

**Why it causes bad output.** Failure modes H and I. It also directly contradicts the system prompt's own instruction (*"A content piece, an ad, and a landing page for the same push should share one message and one offer, not be generated in isolation"*, `:4370`) — the architecture makes that instruction unfollowable.

**Recommended fix.** Introduce one canonical **message** artifact (angle, proof, offer, CTA, story detail used) generated once, then cheap per-platform *adaptations* that reshape length, hashtags and link convention without re-deciding the message. The existing per-type `instructions` strings become adaptation rules rather than generation prompts. This does not touch the publishing pipeline — it changes what feeds it.

**Regression test.** Request both platforms in one turn; assert one canonical message id, two adaptations referencing it, and that the core claim set is identical across both.

---

### F-10 — Retrieval failures are silent, and the reply does not know it was uninformed

- **Severity:** Medium
- **Confirmed root cause**
- **File:** `src/lib/knowledge/retrieveKnowledge.ts:30-34`

**Evidence:**
```ts
const embedResult = await embedText(query, "query");
if ("error" in embedResult) {
  console.error("[knowledge-retrieval] query embedding failed:", embedResult.error);
  return [];
}
```
`masterBrainV2.ts:4299` then renders nothing: `relevantKnowledge.length > 0 ? ... : ""`.

**Current behavior.** When Voyage is unconfigured or erroring, the "Relevant marketing knowledge" section disappears. The model is not told that retrieval ran and failed, so it answers from parametric knowledge with the same confidence.

**Why it causes bad output.** Failure modes A and L — the reply reads as informed by Hawlai's playbooks when nothing was retrieved.

**Recommended fix.** Distinguish "nothing relevant" from "retrieval failed", and put the failure in the prompt as a constraint ("the marketing knowledge base could not be read this turn; do not imply you consulted it").

**Regression test.** Force an embedding error; assert the system prompt contains the failure notice.

---

### F-11 — The brand-voice check is advisory and never acts

- **Severity:** Medium
- **Confirmed root cause**
- **File:** `src/lib/agents/brandVoiceValidation.ts:102-111`

**Evidence:**
```ts
if (check.compliant) return output;
return { ...output, _brandVoiceCheck: check };
```
Surfaced as `artifact.brandVoiceFlags` (`masterBrainV2.ts:4465`) and nothing else. No regeneration, no correction.

**Why it causes bad output.** A voice violation becomes a badge on a card the owner must act on themselves. Failure mode A persists through a check that detected it.

**Recommended fix.** On violation, retry once with the violations named (the pattern `storyEcho`'s retry already uses at `contentMarketingAgent.ts:206-212`), then flag if the retry also fails.

**Regression test.** A profile banning exclamation marks plus a model reply full of them → assert exactly one retry, and a flag only if the retry also violates.

---

### F-12 — Business Knowledge is dumped, not retrieved

- **Severity:** Medium
- **Hypothesis** (confirmed mechanism, unmeasured impact)
- **File:** `src/lib/agents/masterBrainV2.ts:4291-4293`

**Evidence:**
```ts
const businessFactsSection = ctx.knowledgeFacts.length > 0
  ? `...${usableFacts.map((f) => `- ${f.title}: ${f.content}`).join("\n")}...`
```
Every usable row, every turn, in full. Contrast the curated marketing KB at `:4297`, which *is* semantically retrieved and capped at 5.

**Why it causes bad output.** For a business with a complete Business Story plus policies and FAQs this is thousands of tokens, most irrelevant to the turn, pushing the truth rules and the user's message further from the model's attention. It is also why the private-story leak needed a dedicated gate (`splitStories`) — the dump reached every generator.

**Recommended fix.** Retrieve the owner's own facts the same way the marketing KB is retrieved: embed the rows, select the top N for this request, always pin the Business Story summary. Keep `splitStories` exactly as it is.

**Regression test.** 40 knowledge rows, a request about shipping; assert the shipping row is present and that the section is bounded.

---

### F-13 — Past performance never reaches generation

- **Severity:** High
- **Confirmed root cause (absence)**
- **Files:** `src/lib/content/recentCopy.ts:34`; no counterpart anywhere

**Evidence.** `recentCopy` selects `output, created_at` from `content_pieces` — the *words* of the last five pieces, for anti-repetition. `grep "impressions\|ctr\|engagement"` across `contentMarketingAgent.ts` and `src/lib/content/*` returns nothing. `src/lib/analytics/orderLinkage.ts` can attribute revenue to a campaign, and no generator reads it.

**Current behavior.** The system knows which post sold something and never tells the writer. Every piece is written as if it were the first.

**Why it causes bad output.** This is the difference between a chatbot and an employee. Failure modes A and G: with no signal about what worked, the model reverts to the highest-prior-probability structure every time — which is the generic one.

**Recommended fix.** A `performanceContext(dealershipId)` helper returning the two or three best-performing pieces with their measured outcome (via `orderLinkage`), plus the worst, injected into every copy prompt as "what has actually worked for this business". Honest when there is no data: say so rather than inventing a pattern.

**Regression test.** Two pieces, one with attributed orders; assert the winner's text appears in the prompt labelled as having worked, and that a business with no data gets an explicit "no performance data yet" line rather than silence.

---

### F-14 — `_claimsNote` implies the rest of the copy is verified

- **Severity:** High
- **Confirmed root cause**
- **File:** `src/lib/claims/claimCheck.ts:741-745`

**Evidence:**
```ts
return `Hawlai removed ${n === 1 ? "a line" : "lines"} that made ${...} it couldn't verify from your store data (...)`;
```
The arithmetic is honest. The **implicature** is not: the note is the only signal the owner gets, and its presence reads as "the remaining copy passed".

**Current behavior.** Item 4 of the Facebook-post work proved five unverified claims could survive in one caption while this note was absent entirely. The inverse is equally available: one claim removed, the note shown, four undetected claims left in.

**Why it causes bad output.** Failure mode M exactly. It converts a *detector* into an implied *guarantee*, and a false guarantee is worse than none because it stops the owner reading critically.

**Recommended fix.** Reword to scope the claim to what was checked — the guard detects known claim patterns, not all untruths — and name the rule family that fired. Add a standing line that the owner remains responsible for the copy.

**Regression test.** Assert the note does not contain language implying the remainder is verified; assert it names the detector.

---

### F-15 — The website chat widget talks to customers with no product facts

- **Severity:** High
- **Confirmed root cause**
- **File:** `src/lib/agents/chatbotAgent.ts:49-51`, `:97`

**Evidence.** The only facts it formats are owner-entered knowledge rows (`formatKnowledgeFacts`). `grep "formatFactsForCopy\|products"` returns only a prompt line at `:97`: *"don't invent products/features that weren't mentioned"*. No `BusinessFacts`, no truth rules, no guard.

**Current behavior.** A real customer asking "how much is the lavender candle?" is answered by a model that was never given the price, under a prompt asking it not to guess.

**Why it causes bad output.** Failure modes B, E, F — on the surface with the least human review of any in the product. The widget's answers reach customers with nobody in between.

**Recommended fix.** Pass `ctx.facts` (already on the context object it builds) through `formatFactsForCopy`, add `COPY_TRUTH_RULES`, and guard the reply with `findUnsupportedClaims` in flag-and-withhold mode.

**Regression test.** Ask the widget for a price with a product fixture; assert the real price appears and that a fabricated discount is withheld.

---

### F-16 — Influencer outreach and several other copy agents have no facts layer

- **Severity:** Medium
- **Confirmed root cause**
- **Files:** `src/lib/agents/influencerAgent.ts`, `videoMarketingAgent.ts`, `seoPageAgent.ts`, `pitchDeckAgent.ts`, `creativeAgent.ts`, `contentAgent.ts`

**Evidence.** A sweep of `src/lib/agents/*.ts` for files that call `callClaude` but never mention `BusinessFacts` returns **24 agents**. Of those, the six above produce customer- or partner-facing copy. (The rest are scoring, analysis or planning, where the gap matters less.)

**Why it causes bad output.** Each is an independent path to the same failure modes B/E/F. The pattern is the root cause, not any one file: a new agent gets no facts and no guard **by default**, and nothing fails when it doesn't.

**Recommended fix.** Invert the default. A shared `generateCopy()` wrapper that takes facts, appends the rules, calls the model, and guards the result — so an agent opts *out* explicitly rather than in. Then migrate the six.

**Regression test.** A repo-level test asserting every agent that produces customer-facing copy routes through the wrapper — the same shape as `tests/clientBundleBoundary.test.ts`, which already enforces an architectural rule by walking the import graph.

---

### F-17 — 58 tools and ~53 KB of schema in every turn

- **Severity:** High
- **Confirmed measurement; impact is a hypothesis**
- **File:** `src/lib/agents/masterBrainV2.ts:124` (`TOOLS`), used at `:4410`

**Evidence.** Measured: **58 tools**, **53,466 characters** in the `TOOLS` block. The system prompt adds roughly 20 KB of narrative guidance. Both precede the user's message on every turn.

**Current behavior.** There is no intent classification step; tool-use over the full catalogue is the only router.

**Why it causes bad output.** Two mechanisms. (a) **Routing** — with 58 similar-sounding options, selection is driven by description salience rather than fit; `generate_content` vs `generate_social_management` vs `generate_ad_plan` overlap heavily for "write me a post". (b) **Dilution** — the truth rules and the facts sit inside ~75 KB of competing instruction, and instruction-following degrades with instruction count. Failure modes A and L.

**Recommended fix.** A cheap first-pass intent classifier (`fast` tier) narrowing to 5–10 tools for the turn, then the normal tool-use call. Keep the full catalogue as the fallback when classification is unsure. This is additive and touches no publishing path.

**Regression test.** For a set of labelled requests, assert the expected tool is in the narrowed set — and that an ambiguous request falls back to the full catalogue rather than guessing.

---

### F-18 — Model routing is flat

- **Severity:** Medium
- **Confirmed root cause**
- **File:** `src/lib/models.ts:17-26`

**Evidence.** `getModel("standard")` at **49** call sites; `premium` at 6; `fast` at 2. The file's own header says it *"deliberately does NOT add plan-tier-based routing"* and was a pure refactor.

**Current behavior.** Strategy, positioning and brand work run on the same tier as a hashtag list; cheap extraction also runs there.

**Why it causes bad output.** The judgement-heavy tasks that most need headroom don't get it, which shows up as shallow strategy. Cost is also spent on extraction that `fast` would do identically.

**Recommended fix.** Route by task class, not by caller: `premium` for strategy/positioning/diagnosis, `standard` for copy, `fast` for extraction/classification/scoring. One table in this file.

**Regression test.** Assert the tier chosen for each task class; mutation on the table fails it.

---

### F-19 — No generation parameters are ever set

- **Severity:** Medium
- **Confirmed root cause**
- **File:** `src/lib/ai/claude.ts:228`

**Evidence:**
```ts
const request = { model: getModel("standard"), ...body };
```
`grep -rn "temperature" src/lib` returns only `lead_temperature` columns and call-scoring fields. **No `temperature`, `top_p` or `top_k` is set on any Anthropic call in the codebase.**

**Current behavior.** Everything runs at the API default. Structured extraction (which wants determinism) and creative copy (which wants variance) get identical sampling.

**Why it causes bad output.** Contributes to G (repeated hooks) and to JSON-parse failures that `parseModelJson` then has to salvage. It is a contributing factor, not a primary cause — the primary causes of genericness are F-04 and F-13.

**Recommended fix.** Set it per task class alongside F-18: low for extraction and JSON, higher for copy. One place, same table.

**Regression test.** Assert the request body carries the expected temperature per task class.

---

### F-20 — Invented stories and reviews are blocked by prompt, then by pattern, with a real gap between

- **Severity:** High
- **Hypothesis, partially confirmed**
- **Files:** `src/lib/claims/businessFacts.ts:737-746` (`COPY_TRUTH_RULES`), `src/lib/claims/claimCheck.ts:67-99` (`CLAIM_TERMS`), `:248+` (patterns)

**Evidence.** The rules forbid invented counts, ratings, years, offers, superlatives, health claims, links and contact details — and the guard enforces those categories with patterns. There is **no detector for a fabricated narrative**: a founder anecdote, a customer's remark, a workshop scene. `usesOwnStory` (`src/lib/content/storyEcho.ts`) measures whether the owner's *real* story was used, and flags `GENERIC_NOTE` when it wasn't — but a draft that invents a story scores as *using* one.

**Current behavior.** "My grandmother taught me to pour wax on winter evenings in Lucknow" passes every pattern in the guard. So does "one customer told me it reminded her of her first home."

**Why it causes bad output.** Failure modes C and D, which are also the highest-liability outputs in the product — an invented customer quote is a fabricated testimonial.

**Recommended fix.** A narrative-provenance check rather than a pattern: first-person history and attributed-speech constructions are only allowed when the sentence's distinctive content traces back to `ownerFacts` (the mechanism `usesOwnStory` already uses, inverted). Unmatched → flag as "this reads as a story we have no record of". Related: `src/lib/claims/personalStories.ts` already reasons about third-party-plus-private-event, which is the nearest existing machinery.

**Regression test.** An invented founder anecdote and an invented customer quote are both flagged; the owner's **real** recorded story passes untouched. This second half matters — three existing tests in `tests/contentQuality.test.ts` encode that real stories must survive.

---

### F-21 — Fact checking runs before artifact creation on guarded paths, and not at all on unguarded ones

- **Severity:** Informational (answers audit item 10)
- **Confirmed**

Order on the content path: `generateContent` → `guardGenerated` (`contentMarketingAgent.ts:221`) → `saveGenerated` (`masterBrainV2.ts:993`) → `extractArtifact` (`:4453`). So checking **precedes** both save and artifact creation, and the saved row, the artifact and the card all carry the same guarded object — audit item 16 is clean. The chat's *prose* about that artifact is a separate generation (F-02, F-08), which is where J originates.

---

### F-22 — `_fallback` results are saved and shown as content

- **Severity:** Medium
- **Confirmed root cause**
- **File:** `src/lib/agents/masterBrainV2.ts:992`

**Evidence:**
```ts
const savedId = _fallback ? null : await saveGenerated(...);
```
Good: a fallback is not saved. But the fallback **output** is still returned to the model as the tool result, and the fallback is `{ text: aiFailureMessage("bad_request") }` — a sentence, not copy. The model then has to notice it isn't copy.

**Why it causes bad output.** Failure mode L: the reply can present an error string as a deliverable, or narrate a success that didn't happen. The system prompt has a strong rule about relaying failures verbatim (`:4320` block) and `_aiFailure` *is* returned as `{ error }` at `:990` — so the common path is handled. The gap is `_fallback` **without** `_aiFailure` (a malformed-JSON reply, `:188`).

**Recommended fix.** Return `{ error }` for every `_fallback`, not only for `_aiFailure`.

**Regression test.** Stub a malformed model reply; assert the tool result is an `error` and no artifact is created.

---

## 3. Top 10 confirmed root causes

1. **F-01** — `facts == null` removes the truth rules *and* the claims guard, silently. (Critical)
2. **F-02** — the chat's own prose is link-checked only, never claim-checked. (Critical)
3. **F-03** — Social Management writes customer-facing copy with no facts and no guard. (Critical)
4. **F-04** — the specificity editor is not wired to the chat path. (High)
5. **F-13** — past performance never reaches any generation prompt. (High)
6. **F-09** — no canonical message; every platform is an independent generation. (High)
7. **F-08** — `generate_content` returns no `note`, so the model invents the save/publish framing. (High)
8. **F-05** — a guard-emptied ad body is replaced by a hardcoded generic line that then spends budget. (High)
9. **F-17** — 58 tools / ~53 KB of schema per turn degrades routing and dilutes the rules. (High)
10. **F-15** — the website widget answers customers without product facts. (High)

Runners-up worth naming: **F-20** (no narrative-provenance check — highest liability), **F-14** (the note implies verification), **F-06** (invented lead forecasts).

---

## 4. Top 5 architectural changes

1. **Make the guard a surface property, not a tool property.** One `generateCopy()` wrapper that owns facts + rules + guard, with an explicit opt-out. Removes F-01, F-03, F-15, F-16 as a class, and makes the next agent safe by default.
2. **Fail closed.** No facts → no unmarked customer-facing copy, and the static truth rules are never conditional on dynamic data.
3. **One canonical message, many adaptations.** Decide the angle/proof/offer once; adapt per platform. Fixes F-09, halves duplicate generation, and makes the system prompt's own cross-department instruction achievable.
4. **Close the feedback loop.** `performanceContext()` into every copy prompt, from `orderLinkage`. This is what turns the product from a generator into an employee.
5. **Route the turn before routing the tools.** Cheap intent classification narrowing 58 tools to ~8, plus task-class model/temperature routing in one table.

---

## 5. Recommended AI generation pipeline

```
request
  → intent class (fast tier, cheap, falls back to full catalogue when unsure)
  → context assembly   [facts | owner knowledge (retrieved) | brand voice | performance | marketing KB]
  → canonical message decision  (premium tier for strategy-shaped asks)
  → per-platform adaptation      (standard tier)
  → claim guard (fail closed)
  → specificity editor           (always, not per-caller)
  → narrative provenance check
  → artifact == saved == shown == payload
  → approval card (destination named, price named, read-back promised)
  → publish (unchanged)
  → outcome recorded → feeds step 3 next time
```

Every stage after "context assembly" must be able to say *why* it changed something, and the card must show it.

---

## 6. Recommended context/retrieval pipeline

- **Always pinned:** business identity, products with prices and photo presence, live offers, shipping, brand voice, Business Story summary.
- **Retrieved per request:** owner knowledge rows (embed + top-N, not a dump), marketing KB (as today), the 2–3 best- and worst-performing past pieces with measured outcomes.
- **Explicitly stated when absent:** facts unreadable, retrieval failed, no performance data yet. Absence must be a *sentence in the prompt*, never an empty string.
- **Never in context:** anything `splitStories` withholds. That gate stays exactly as it is.

---

## 7. Recommended claim verification architecture

Three layers, and the third is the one that is missing:

1. **Pattern layer** (exists) — counts, ratings, offers, superlatives, comparisons, health, links, contacts. Keep; it is well-tested and the comparison rules are correctly unsuppressible.
2. **Term layer** (exists) — `CLAIM_TERMS` + `CLAIM_SYNONYMS` + `wordForms`. Keep. Its weakness is coverage of surface forms, which item 4 showed; the synonym-group mechanism is the right answer and should be extended rather than replaced.
3. **Provenance layer** (missing) — for every *sentence* of customer-facing copy, can its distinctive content be traced to a fact, a knowledge row, or the owner's own words? Unmatched sentences that assert experience, narrative or benefit get flagged. This is the only layer that catches C, D, E and the long tail of F-20.

Plus two cross-cutting rules: **fail closed** when facts are unavailable, and **scope the note** to what was actually checked (F-14).

---

## 8. Recommended marketing quality evaluation architecture

There is no quality harness today. `tests/contentQuality.test.ts` (49 cases) tests the *mechanisms* — `craftSection`, `recentCopy`, story progress — not output quality, which is correct for a unit test and insufficient as an eval.

Proposed, offline and cheap:

- **A golden set** of ~30 real requests across departments, with fixtures for three business shapes: rich facts, thin facts, services-only.
- **Deterministic scorers**, no model-as-judge for pass/fail: claim-flag count; competitor-substitutability (does any line survive `reviseForSpecificity`'s test); owner-detail presence (`usesOwnStory`); hook-diversity across N generations; platform-convention compliance (`platformRules`); provenance coverage once layer 3 exists.
- **A ratchet**, not a gate: scores recorded per commit, and a regression in any scorer fails CI. That is how you notice genericness returning without arguing about taste.

---

## 9. Files to change first

| Order | File | Change |
|---|---|---|
| 1 | `src/lib/agents/contentMarketingAgent.ts` | fail closed (F-01); always truth rules |
| 2 | `src/lib/agents/masterBrainV2.ts` | claim-check the reply (F-02); `revise: true` (F-04); `note` for `generate_content` (F-08); pass facts to Social (F-03) |
| 3 | `src/lib/agents/socialManagementAgent.ts` | facts + rules + guard (F-03) |
| 4 | `src/lib/claims/claimCheck.ts` | scope `claimsNote` (F-14); provenance layer (F-20) |
| 5 | `src/lib/adEngine.ts` | no template substitution (F-05); honest forecasts (F-06); drop self-score gate (F-07) |
| 6 | `src/lib/agents/chatbotAgent.ts` | facts + rules + guard (F-15) |
| 7 | *new* `src/lib/content/performanceContext.ts` | the feedback loop (F-13) |
| 8 | `src/lib/models.ts` + `src/lib/ai/claude.ts` | task-class model and temperature (F-18, F-19) |
| 9 | *new* canonical-message module | (F-09) |
| 10 | `src/lib/knowledge/retrieveKnowledge.ts` | distinguish failure from emptiness (F-10) |

---

## 10. Files that should NOT be touched

- `src/app/api/social/post/route.ts`, `src/app/api/social/unpublish/route.ts`, `src/lib/chat/destinations.ts`, `src/lib/chat/socialPost.ts`, `src/lib/chat/publishActions.ts` — the publishing spine, hardened this week after a live incident, with read-back and destination resolution. Changing what *feeds* it is in scope; changing it is not.
- `src/lib/publish/platforms/meta.ts` and the `launch/activate/pause` paths — approval-gated, live-verified.
- `src/lib/claims/personalStories.ts` — the private-story gate. Extend around it, never relax it.
- `src/lib/crypto/secretCrypto.ts`, `src/lib/crypto/oauthSecrets.ts`, `src/lib/supabase/service.ts` — server-only, bundle-boundary enforced.
- Any `supabase/migrations/*` — no schema change is needed for anything in this report. The one place that looked like it needed a column (recording a post's image source) was solved on existing `jsonb`.
- `src/lib/content/platformRules.ts` link direction and `src/lib/claims/claimCheck.ts` comparison rules — recently fixed with mutation coverage; extend, don't rewrite.

---

## 11. Regression test plan

**Per finding** (named above). Each needs a mutation check — disable the fix, confirm the test fails. The repo's existing convention.

**New suites:**

1. `factsUnavailable.test.ts` — the fail-closed matrix: for every generator, `facts == null` produces either a refusal or a marked-unverified output, never unmarked copy. This is the highest-value suite in the plan.
2. `chatProseClaims.test.ts` — the five live sentences as *prose*, not tool output.
3. `copyWrapperBoundary.test.ts` — import-graph test: every customer-facing copy agent routes through the wrapper. Model on `tests/clientBundleBoundary.test.ts`.
4. `canonicalMessage.test.ts` — one message, two platform adaptations, identical claim set.
5. `performanceContext.test.ts` — winners reach the prompt; no data says so explicitly.
6. `narrativeProvenance.test.ts` — invented anecdote and invented customer quote flagged; the owner's real story survives.
7. `qualityGolden.test.ts` — the scorer ratchet from §8.

**Existing suites that must stay green unchanged** — they encode decisions that are easy to break while fixing the above: `tests/captionClaims.test.ts`, `tests/claimsGuard.test.ts`, `tests/contentQuality.test.ts`, `tests/autopostHonesty.test.ts`, `tests/socialPostDestination.test.ts`, `tests/productDepiction.test.ts`, `tests/clientBundleBoundary.test.ts`.

---

## 12. Priority order

**Phase 1 — stop the unguarded paths (correctness).**
F-01 fail closed → F-02 chat prose → F-03 Social Management → F-15 widget → F-22 fallback as error.
*Why first:* each is a live route by which an unverified claim reaches a customer today. Small, independently testable, no architectural dependency.

**Phase 2 — stop the generic output (the actual complaint).**
F-04 revise on chat → F-13 performance context → F-05/F-06/F-07 the ad path → F-11 brand-voice retry.
*Why second:* F-04 is one argument and probably the largest single quality gain available. F-13 is the structural one.

**Phase 3 — honesty of the reporting.**
F-08 the `note` → F-14 note scope → F-10 retrieval failure.
*Why third:* these change what the owner is *told*, which matters most once the underlying output is sound.

**Phase 4 — architecture.**
F-16 the wrapper → F-09 canonical message → F-17 intent routing → F-18/F-19 task-class routing → F-12 knowledge retrieval → F-20 provenance layer.
*Why last:* highest value per unit of risk comes after Phases 1–3 have removed the acute holes, and the wrapper (F-16) is much safer to introduce once the per-path fixes have established what it must do.

---

## Appendix — what is already right

Recorded so none of it gets "fixed" by mistake:

- **The canonical facts layer.** One source for products, prices, offers, shipping, counts, consumed by the guard, image briefs and prompts alike.
- **Comparisons are unsuppressible.** `claimCheck.ts:499-503` — a business's own words can never license a claim about a competitor. This was learned from a live self-justifying loop and is correct.
- **`undefined` ≠ zero**, throughout. `readPostMessage`, `checkPostPresence`, `healthScore`, the impression guard. Unknown is reported as unknown.
- **Artifact == saved == shown == payload** on the content path.
- **Approval before every irreversible action**, with the destination named and the text read back.
- **The code explains itself.** Nearly every guard carries the incident that caused it, with a date. That is why this audit could be specific; keep writing them that way.
