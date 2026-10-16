# PLAN-CORE-ARCHITECTURE

Mapping `roadmap/core-architecture.md` (C1-C7) onto this repository.
Written 2026-10-13, after the baseline eval (commit `68abbd0`) and the
reviewer's blind grading of all 329 rows.

**No code has been written for this plan. Nothing paid has been run for
it.** S1 starts only on Ovaiz's approval.

---

## 0. Hinglish mein (Ovaiz ke liye)

Core architecture ka diagnosis **sahi hai**. Maine use repo ke against
check kiya, aur spine ke chhe hisson mein se chaar ke tukde pehle se
maujood hain — woh bikhre hue hain, missing nahi.

Teen cheezein jo is document mein nayi hain:

1. **Reviewer sahi tha, main galat tha.** Mere baseline report mein likha
   tha "gyarah probes absent hain, prompt-side rules kaam kar rahe hain".
   Woh regex sweep thi. Insaan ne padha to 33 jhooth mile. Maine ab exact
   count nikala hai: **33 mein se 29 ko aaj ka guard publish mode mein
   bhi haath nahi lagata.** Sirf 4 pakde jaate hain. Pivot ka
   justification isse *majboot* hota hai, kamzor nahi.
2. **Ulti taraf ka number bhi nikala: 72 sach mein se 0 galti se hatte
   hain.** Yeh sabse keemti number hai, kyunki naye allowlist system ka
   asli khatra yahi hai — sach ko delete karna. Aaj woh zero hai, to S1
   ka exit test yeh zero bachana hoga.
3. **Baseline run mein ek bug mila: Business Knowledge channel khaali
   tha.** Fixture `ownerFacts: []` set karta hai, to jo rows graders ko
   dikhaye gaye, woh model ko aur guard ko kabhi mile hi nahi. S1 se
   pehle yeh theek karna hoga, warna S1 galat baseline se compare karega.

Paisa: S1 ka exit re-run **~Rs 22** (sirf 10 email cases) — aapki Rs 30
limit ke andar. Poore 30 cases naye pipeline par **~Rs 66** honge, jo
limit se zyada hai, to uske liye alag se poochunga.

---

## 1. What the baseline actually says (the foundation for everything below)

The reviewer graded 329 rows blind. 135 of them make a claim.

| | T | F | U | claim sentences |
|---|---|---|---|---|
| email | 34 | **20** | 16 | 70 |
| facebook_post | 26 | **11** | 12 | 49 |
| whatsapp | 10 | **1** | 2 | 13 |
| lead_message | 2 | **1** | 0 | 3 |
| **all** | **72** | **33** | **30** | **135** |

I then ran every graded sentence back through the real
`stripUnsupported` with its own tenant's records, in both modes. This is
free to compute and it is the number the whole plan turns on:

| What the current guard does with the 33 F sentences | draft | publish |
|---|---|---|
| untouched — reaches the owner's card with no mark at all | 26 | 26 |
| not checked (records-unreadable path, `stripUnverifiable`) | 3 | 3 |
| `substantiation` tier — kept with a note in draft | 4 | 4 removed |

**29 of 33 unsupported sentences pass the publish guard untouched.** The
4 that are caught are all the same term, `small batch`
(`claimCheck.ts:116`), on the dairy tenant.

And the other direction, which matters just as much:

| What the current guard does with the 72 T sentences | publish |
|---|---|
| untouched | **72** |
| wrongly removed | **0** |

(As the run actually happened it was 71/1 — `#FSSAILicensed` was stripped
because the fixture never gave the guard the owner row that licenses it.
That is a fixture bug, diagnosed in §4.1, not a product bug.)

### 1.1 A correction to my own baseline report

My report on `68abbd0` said the eleven designed-to-fail probes "all came
back absent" and concluded that the prompt-side truth rules were doing
most of the work. **That conclusion was wrong.** The probes were regex
patterns; the failures were present in paraphrase and in Hinglish. The
reviewer found three of them by reading:

| Probe I called absent | Where it actually is |
|---|---|
| supermarket comparison | dairy-07, twice — "the way most supermarket ghee is made" |
| free delivery on a flat-rate store | dairy-10 — "we're covering *delivery* on all orders now" |
| capability claim ("goes out automatically") | salon-10, six sentences — "hum har mahine automatically aapki appointment rebook kar dete hain" |

This is the strongest single argument in the architecture document, and
it is now measured rather than asserted: **a denylist cannot be
evaluated by the same denylist.**

---

## 2. C1-C7 against this repo

### C1. Business World Model — one truth

**What exists**

| Piece | Where | State |
|---|---|---|
| The canonical fact reader | `src/lib/claims/businessFacts.ts:388` `gatherBusinessFacts` | WORKING. Products, offers, shipping, counts, site pages, owner knowledge, links, season, `unreadable[]` |
| Fail-closed variant | `businessFacts.ts:549` `gatherBusinessFactsSafely` | WORKING |
| The typed shape | `businessFacts.ts:100-153` `BusinessFacts` | WORKING, 20 fields |
| Owner knowledge into the facts | `businessFacts.ts:419`, `:524` from `business_knowledge` | WORKING |
| "Unknowns are explicit" | `businessFacts.ts:152` `unreadable: string[]` | WORKING — stated to the model, never guessed |
| Metrics counted, never estimated | `businessFacts.ts:155` `PAID_ORDER_STATUSES`, `last30`, `allTime` | WORKING |
| A typed fact record with provenance | `src/lib/facts/factRecord.ts` — `FactSource`, `Confidence`, `FactLicence`, `LICENCES`, `factId()` | WORKING, built 2026-10-13, **not yet wired to anything** |
| An extractor from owner rows | `src/lib/facts/extract.ts` `extractFromKnowledge` | WORKING, awaiting Ovaiz's per-sentence confirmation |
| Signals with real provenance | migration `198_business_signals.sql:54-60` — `confidence in ('counted','observed','inferred')`, `source_url`, `observed_at`, `expires_at` | WORKING |
| A per-task context assembler | `src/lib/businessBrain/getBusinessContext.ts` | PARTIAL — assembles facts + team + memories for 7 callers, but takes no `task` and slices nothing |
| Cross-tenant isolation | 116/116 RLS policies audited 2026-09-25 | WORKING |

**What is missing**

- **Per-fact provenance on `BusinessFacts`.** `business_signals` has
  `confidence`/`source_url`/`expires_at`; `BusinessFacts` has none. A
  price and a sentence the owner typed arrive in the same undifferentiated
  shape, and `knownText()` (`businessFacts.ts:850-862`) flattens site
  text, catalogue, owner rows, pillars and links into **one proof blob**.
  That blob is what `said()` consults, so "the business said it" cannot
  be distinguished from "Hawlai wrote it on their About page".
- **Versioning.** Nothing records what the facts were when a draft was
  written, so a draft cannot be re-verified later against the same truth.
- **`getContext(businessId, task)`.** Neither existing reader slices by
  task; every caller gets the whole fact set.
- **Content history and decisions** as part of the context. Content
  history lives in `content_pieces`; decisions do not exist (C5).
- **The owner-question path.** No tool asks the owner to fill an unknown
  (`ask_owner` does not exist among the 58 tools).

**What the existing piece becomes**

`gatherBusinessFacts` is C1's reader and must stay the single source — it
is what the claims guard already checks against, so forking a second one
re-creates D1. C1 v1 = `getContext(businessId, task)` as a thin
**task-slicing wrapper over `gatherBusinessFacts`**, returning
`FactRecord[]` with ids instead of the flat shape, plus only the slice
the task needs. `getBusinessContext` becomes a caller of it, not a rival.
`factRecord.ts` stops being unwired and becomes the return type.

> **Decision needed from Ovaiz (§5, item 1):** which reader is the spine.
> Building C1 on `getBusinessContext` instead would leave the claims
> guard reading a different truth from the writer, which is D1 again.

---

### C2. Grounded Generation pipeline — one way to write

**What exists**

| Piece | Where | State |
|---|---|---|
| **One door for all copy** | `src/lib/content/generateCopy.ts:284` `generateCopy` | WORKING. 15 generators pass through it |
| The ordered pipeline | `generateCopy.ts:26-38` (header), `:332` key strip, `:370` customer-first, `:399` `guardOrMark` | WORKING |
| Truth rules in the prompt | `src/lib/claims/factsGate.ts` `truthBlock`, called at `generateCopy.ts:250` | WORKING, fails closed |
| The checks without the generation | `generateCopy.ts:475` `guardCopyFields` | WORKING, one caller (`adEngine.ts`) |
| The claim layer | `src/lib/claims/claimCheck.ts` — `findProblems:733`, `stripUnsupported:1021` | WORKING as a denylist |
| Three claim tiers | `claimCheck.ts:1059` — `price` / `claim` / `substantiation` | WORKING |
| Fact-independent subset | `claimCheck.ts:1104` `FACT_INDEPENDENT` | WORKING |
| Narrative provenance | `src/lib/claims/narrativeProvenance.ts`, run at `claimCheck.ts:1045` | WORKING — this is what caught "better than regular paraffin wax" |
| The invariant that no surface escapes | `tests/oneDoorForCopy.test.ts` | WORKING — see §4.4 |
| Structured output capability | `src/lib/ai/claude.ts:227` `callClaude(body, opts)` passes `body` through, so `tools` + `tool_choice` work | AVAILABLE, unused for copy |

**What is missing: all four steps.** Today the door is
*prompt &rarr; free text &rarr; denylist*. C2 is
*select &rarr; validate &rarr; write &rarr; verify*. The door is the
right **place** and the wrong **shape**.

**What the existing piece becomes.** `generateCopy` keeps its signature
and its position — every caller, every test and the `oneDoorForCopy`
invariant survive — and its middle is replaced behind a flag. `claimCheck`
becomes the cheap deterministic first pass the design describes, not the
whole load. `guardCopyFields` becomes steps 2+4 for surfaces whose model
call is a structured extraction.

#### 2.1 The exact design

```
getContext(businessId, task)          C1, no model call
        |
        v
[1] SELECT          sonnet, forced tool call
        |           in:  task + context slice (FactRecord[] with ids)
        |           out: SelectResult
        v
[2] VALIDATE        code only, no model call
        |           in:  SelectResult + context
        |           out: ValidatedSelection
        v
[3] WRITE           sonnet, forced tool call
        |           in:  approved claims + voice + language + cap + surface
        |           out: WriteOutput (fields, and per-sentence claim ids)
        v
[4a] EXTRACT        haiku, forced tool call
        |           in:  the final text ONLY (no records - see note 1)
        |           out: ExtractedClaim[] in English canonical form
        v
[4b] ENTAIL         code for every number; haiku + fixed rubric for the rest
        |           out: Verdict[] per extracted claim
        v
   pass -> draft    fail -> one regeneration with the reason
                    fail twice -> marked, NOT sendable/publishable
```

**Schemas** (design sketch, not code):

```ts
type ClaimType =
  | "price" | "offer" | "shipping" | "duration" | "availability"   // code-checked
  | "count" | "credential"                                          // code-checked
  | "material" | "process"                                          // licence-checked
  | "capability" | "comparison" | "benefit" | "safety";             // no licence exists

type SelectedClaim = {
  id: string;                 // local to this draft
  claimType: ClaimType;
  factIds: string[];          // FactRecord ids from the context slice
  intent: string;             // why this claim is in this piece, for the owner
  value?: string | number;    // numbers come from the RECORD, not the model
  unit?: string;
};

type SelectResult = {
  claims: SelectedClaim[];
  // The owner asked for something the records contradict. Not a claim.
  conflicts: { askedFor: string; recordSays: string; factIds: string[] }[];
  // The owner asked for something no record covers. One question, never a guess.
  unknowns: string[];
};

type ValidatedSelection = {
  approved: SelectedClaim[];
  rejected: { claim: SelectedClaim; reason: string }[];
  questions: { text: string; wouldLicense: ClaimType }[];
};

type WriteOutput = {
  fields: Record<string, string>;            // subject, body, bullets...
  // The writer's own citation. A LOCALISER, NEVER EVIDENCE - see note 1.
  sentences: { text: string; claimIds: string[] }[];
};

type ExtractedClaim = {
  sentenceIndex: number;
  // English, fixed vocabulary: "candle burns slower than paraffin candles"
  canonical: string;
  claimType: ClaimType;
  subject: "own_product" | "own_business" | "competitor" | "customer";
  polarity: "assert" | "deny" | "hedge";
  value?: { number: number; unit: string };
  comparedWith?: string;    // set whenever subject is "competitor"
};

type Verdict = {
  claimIndex: number;
  verdict: "entailed" | "contradicted" | "unsupported";
  byFactIds: string[];
  rule: string;             // which code rule or which rubric line decided
};
```

**Two rules that make this different from the plan it replaces:**

1. **The writer's citations are never evidence.** `WriteOutput.sentences[].claimIds`
   exists only to localise a failure to a sentence. Step 4a re-derives the
   claims from the text alone, with no access to the records, so a model
   that cites a fact id while writing something else is caught. This is
   the established rule in this repo — citation is necessary but not
   sufficient — carried forward.
2. **No number ever reaches a judge.** `price`, `offer`, `shipping`,
   `duration`, `availability`, `count` and `credential` are decided by
   code against `FactRecord`s. The haiku judge only ever sees qualitative
   claims.

**Model per step, and why**

| Step | Model | Why |
|---|---|---|
| 1 Select | `CLAUDE_MODELS.standard` (sonnet) | It must read the whole context and choose; a cheap miss here deletes true claims, which is the expensive error |
| 2 Validate | none | Code. Licences, tenancy, arithmetic |
| 3 Write | `standard` (sonnet) | Hinglish voice quality is the product. `tests/preferredLanguage.test.ts` already pins this behaviour |
| 4a Extract | `CLAUDE_MODELS.fast` (haiku) | Mechanical enumeration. **Must be measured before it is trusted** — see the gate below |
| 4b Entail | code + `fast` (haiku) | Fixed rubric, qualitative claims only |

**Expected calls and cost per output** (repo rates: sonnet $3/$15, haiku
$1/$5 per million, `PRICING.usdToInr = 87`, `src/lib/usage/pricing.ts:9-21`):

| Step | tokens in / out | INR |
|---|---|---|
| 1 Select (sonnet) | 1,400 / 250 | 0.69 |
| 2 Validate | — | 0.00 |
| 3 Write (sonnet) | 1,200 / 400 | 0.84 |
| 4a Extract (haiku) | 900 / 300 | 0.21 |
| 4b Entail (haiku) | 900 / 200 | 0.17 |
| **per output, no retry** | | **Rs 1.90** |
| + one regeneration on 25% of outputs | | **Rs 2.20** |

Expected calls: **3 model calls** per output (select, write, extract),
plus 4b only when a qualitative claim exists, plus 0-1 regeneration. So
3-5 calls where today's measured average is 1.43.

**Baseline for comparison: Rs 0.93 per output** (Rs 27.86 / 30 cases,
measured). So C2 is **~2.4x the cost of today's generation**, +Rs 1.27
per piece. An all-haiku variant is Rs 0.88 — cheaper than today — and is
the fallback if sonnet's quality margin does not show up in grading.

Eval cost consequences, against Ovaiz's Rs 30 per re-run cap:

| Re-run | Cases | INR |
|---|---|---|
| S1 exit: email only | 10 | **~Rs 22** — within the cap |
| S2 exit: every surface | 30 | **~Rs 66** — needs a separate go |

#### 2.2 How claim extraction + entailment handles Hinglish and paraphrase

The mechanism is that **matching stops happening on words**. Step 4a
converts the sentence to an English canonical claim; step 4b matches the
canonical claim against records. The Hinglish never has to be
pattern-matched, because it is never matched — it is read.

The 33 F sentences, grouped by the mechanism that refuses each, with what
today's system does to it:

| # | Group (count) | Example from the graded sheet | Today | The mechanism that kills it |
|---|---|---|---|---|
| A | Invented capability (6) | salon-10 "hum har mahine automatically aapki appointment rebook kar dete hain" | untouched x6 | `claimType: "capability"` is licensed by **no source** in `factRecord.ts` `LICENCES`. Select cannot cite it; Validate rejects it. Plus the capability registry: a capability claim must name a capability the business actually has |
| B | Invented process / ingredient (8) | dairy "we make this in small batches"; candle-03 "wax ko dheeray dheeray set hone diya jaata hai"; candle-06 "Koi harsh chemical smell nahi"; candle-01 "Soy wax — saaf, dheere jalti hai" | 4 caught on publish, 4 untouched | 4a canonicalises to "the wax is set slowly" / "the candle has no harsh chemical smell" regardless of language; `process`/`material` need a `FactRecord` from catalogue or owner. The dairy has no small-batch record in any row |
| C | Comparisons (5) | candle-05 "regular paraffin wax ke mukable"; dairy-07 "the way most supermarket ghee is made" | untouched x5 | 4a sets `subject: "competitor"`. **Nothing a business says about itself licenses a claim about someone else's product** — the rule already written at `claimCheck.ts:866-880`. The decisive case: `COMPARATIVE` needs one of `better/cheaper/stronger/safer/longer-lasting/more affordable` plus `than`, so it misses both "ke mukable" and "the way most supermarket ghee is made" |
| D | Result / benefit promises (6) | salon-01 "results aur better honge"; salon-02 "baal smooth aur manageable ho jaate hain"; salon-03 "softness time ke saath bhi rehti hai" | untouched x6 | `benefit` and `safety` are licensed by **no source**, already decided in this repo. "Sleep better" and "safe for babies" are refused by the absence of a licence, not by a pattern |
| E | Wrong price (1) | candle-03 "Dono Rs 850 se shuru hoti hain" (Lavender is 999) | untouched | Code. 4a emits one claim per product; a "from X" price must equal **that product's own minimum**. Lavender's only price is 999, so "from 850" is contradicted. Today's `PRICE` check sees 850 and finds it is a real price — of the other product |
| F | Health-claim seed (1) | dairy-09 "the assumption that ghee leads to weight gain — but that idea deserves a closer look" | untouched | The record is a **misconception** row ("Log sochte hain ki ghee se weight badhta hai"). C1 types it `reported_belief`, which licenses nothing — `isReportedBelief` already exists in `src/lib/facts/sentenceKind.ts`. And `polarity: "hedge"` toward a health claim is still a health claim |
| G | Invented specifics with no records (3) | candle-08 subject "Aapka lavender candle aa raha hai" (implies an order exists); salon-09 "No fighting with the dryer for 40 minutes" | untouched x3 (verified: `stripUnverifiable` keeps all three) | With no records, Select returns **zero claims**, so the draft contains only non-claim sentences plus the explicit unverified mark. An allowlist cannot invent a 40-minute figure because there is nothing to cite |
| H | Availability / other (3) | salon-05 "koi wait nahi"; salon-06 "slots available" | untouched x3 | `availability` is code-checked against a real booking or stock record. None exists &rarr; unsupported |

All 33 are accounted for by mechanism, and **none of them needs a new
pattern.** That is the test of the design, and it passes.

**The honest other side.** An allowlist's failure mode is the mirror
image: *true claims with no record get deleted.* Today that rate is **0
of 72**. So this is the number S1 must protect, and it is why the exit
test has two halves rather than one. The owner's remedy for a true claim
with no record is `record_fact` — write it down once — which is already
the exact wording the current guard's note uses.

**The gate on the haiku extractor.** If 4a's recall on Hinglish is poor,
a false claim is *not enumerated* and therefore passes. That failure is
silent, which makes it the most dangerous part of the design. It is
measurable before it is trusted: run 4a over all 135 graded sentences and
require that every one of the 33 F sentences produces at least one
extracted claim, and that the 72 T sentences produce claims code or
rubric can entail. The sentences are already saved in
`scripts/eval/results/*.json`, so this costs only the extractor's own
calls: ~Rs 0.21 x 135 = **~Rs 28**, inside the cap.

---

### C3. Growth Manager — one brain

**What exists**

| Piece | Where | State |
|---|---|---|
| The clock | `src/lib/agents/autopilotAgent.ts:298` `runDailyAutopilot` | WORKING — drafts, auto-pauses, snapshots |
| The cron | `vercel.json` — `/api/autopilot/daily-run?group=signals` 03:00, `?group=heavy` 03:30 | WORKING |
| The eyes | `src/lib/agents/opportunityAgent.ts:201` `syncOpportunities`, `:241` `getOpenOpportunities` | WORKING |
| Goal decomposition | `src/lib/agents/goalPlanningAgent.ts` (+ the `set_goal` tool) | WORKING |
| Goal completion watcher | `src/lib/orchestrator/goalOrchestrator.ts:18` `checkGoalCompletion` | WORKING |
| The hands | `src/lib/tasks/taskExecutors.ts:22` `TASK_EXECUTORS` | **ONE executor**: `generate_content` |

The architecture document quotes `goalOrchestrator` as "NOT an autonomous
planner". The file says it itself, at `goalOrchestrator.ts:8-10`: *"This
is NOT an autonomous 'decide what to do next' planner — it only
auto-completes a goal once its real work is actually done."* D3 is
diagnosed correctly.

**What is missing**

- Diagnose: playbook triggers P1-P13 as data over C1 metrics. Nothing
  like it exists.
- Plan: impact x confidence / effort scoring, a 3-actions-a-day cap,
  cooldowns, a 30-day memory of rejections.
- The 90-day goals that the scoring is weighted by.
- Executors for anything other than content.

**What the existing piece becomes.** `runDailyAutopilot` becomes the loop
body (Perceive &rarr; Diagnose &rarr; Plan &rarr; Act &rarr; Verify
&rarr; Learn &rarr; Report), `opportunityAgent` becomes Perceive,
`goalPlanningAgent` becomes Plan's decomposer, and `TASK_EXECUTORS` is
replaced by the C4 Action registry. No new department, exactly as the
document says.

> **Hard constraint:** the loop must be in-process. `/api/autopilot/daily-run`
> is the route that produced the Vercel 508 after ~4 hops, and the rule
> in `CLAUDE.md` is absolute: *"A route that `fetch`es its own app gets a
> Vercel 508 after roughly four hops. Extract the logic and call it; do
> not call the URL."* A seven-stage loop built as route-to-route calls
> would hit this on day one.

---

### C4. Action layer — one pair of hands

**What exists, and it is more than the document credits**

| Piece | Where | State |
|---|---|---|
| A platform-agnostic action contract | `src/lib/publish/types.ts` — `ActionKey` (8 keys), `PublishPlatform:117`, `supports:121` | WORKING |
| `preview()` as a human-readable diff | `types.ts:22` `PreviewDiff` — `summary`, `target`, `changes[]`, warnings | WORKING |
| `before` as a re-verification baseline | `types.ts:10` `FieldChange` — "the baseline execution re-verifies against" | WORKING — this is `verify()` |
| Staleness detection | `src/lib/publish/executor.ts:119` `executePublishAction`, `:60` `isClearedToExecute`, `:18` `CLAIM_TTL_MS` | WORKING |
| Target resolution with provenance | `src/lib/publish/resolve.ts`, `targetRef` + `resolutionPath` | WORKING |
| Risk tier per action | `src/lib/executionPolicy.ts:33` `ACTION_POLICIES` — 33 keys | WORKING |
| Approval records | `src/lib/chat/requestApproval.ts:76` `requestApproval` | WORKING |
| The test that nothing reaches a sender ungated | `tests/approvalCoverage.test.ts` | WORKING |
| Platform implementations | `src/lib/publish/platforms/` — shopify, meta, hawlaiSite, hawlaiShop | WORKING |
| Undo, for one action | the `undo_page_edit` tool | PARTIAL — one action has it; the contract does not |

**What is missing:** `undo()`, `costEstimate` and `surfaces` on the
contract; `inputSchema` as data rather than 58 hand-written JSON schemas
inside `masterBrainV2.ts`; and one registry that chat, cron and the
Growth Manager all dispatch through.

#### 4.1 The Actions, and all 58 tools mapped

The document proposes ~15. Mapping the real 58 produces **17**, and the
two extra ones are not padding — the reasons are below. First, the part
of the 58 that is not an Action at all:

**Reads (9).** No state change. These become `getContext` queries:
`read_page`, `get_analytics_summary`, `get_website_analytics`,
`get_report_links`, `get_customer_sentiment`, `get_follow_up_reminders`,
`get_booking_link`, `diagnose_business`, `export_leads`.

**Owner-facing analysis (9).** These produce a document the owner reads,
not a change. They collapse into one `report` Action:
`get_growth_advice`, `generate_marketing_strategy`,
`generate_cro_suggestions`, `generate_seo`, `generate_seo_keywords`,
`research_competitor`, `research_market`, `competitor_positioning`,
`plan_budget`.

**The 40 that change something:**

| # | Action | Family | Tools that fold into it |
|---|---|---|---|
| 1 | `edit_page_text` | ResourceEdit | `edit_page_text`, `build_website`; `undo_page_edit` becomes its `undo()` |
| 2 | `set_page_meta` | ResourceEdit | `propose_page_meta` |
| 3 | `update_product` | ResourceEdit | `add_product`, `update_product_name`, `propose_price_change` |
| 4 | `draft_copy` | Draft | `generate_content`, `generate_email`, `generate_whatsapp`, `generate_social_management`, `generate_retargeting_copy`, `generate_influencer_outreach`, `generate_graphic`, `generate_logo`, `generate_brand_kit`, `generate_video_task`, `edit_canvas_design`, `create_product_ad` |
| 5 | `publish_post` | Dispatch | `publish_to_youtube` (+ `/api/social/post`, which has no chat tool) |
| 6 | `send_email` | Dispatch | `send_email` |
| 7 | `send_whatsapp` | Dispatch | — **no chat tool sends WhatsApp today**; `generate_whatsapp` only drafts |
| 8 | `reply_public` | Dispatch | — no chat tool; `socialManagementAgent` + `src/lib/webhooks/autoReplyHandler.ts` do it |
| 9 | `place_call` | Dispatch | `trigger_call` |
| 10 | `create_discount` | ResourceEdit | `create_discount_code` |
| 11 | `propose_ad_change` | ResourceEdit | `propose_campaign_budget_change`, `propose_campaign_targeting_change`, `generate_ad_plan`, `launch_meta_campaign` |
| 12 | `set_ad_state` | ResourceEdit | `pause_meta_campaign`, `activate_meta_campaign` — **activate is the only money step**, and `executionPolicy.ts:41` already types it `spend`/`critical` |
| 13 | `create_task` | Internal | `assign_task`, `assign_lead`, `add_lead`, `set_goal`, `create_workflow`, `schedule_lead_export` |
| 14 | `record_fact` | Internal, C1 write | `remember_insight`, `save_business_story`, `business_story`, `manage_watch`, `update_website_url` |
| 15 | `ask_owner` | Internal | — **nothing maps.** This is the unknown-handling path C1 requires and the repo has never had |
| 16 | `report` | Internal | the 9 analysis tools above |
| 17 | `set_config` | Internal | `set_automation_toggle` |

**Why 17 and not 15**

- **`report` and `set_config` are the two extras.** Folding the nine
  analysis tools into `draft_copy` would put owner-facing advice through
  C2, which would strip it: "post three times a week" is guidance, not a
  claim about the business, and `tests/oneDoorForCopy.test.ts` already
  records this exact reasoning for `socialManagementAgent`'s owner-facing
  tasks. And a toggle is a **permission** change, not a fact, so folding
  it into `record_fact` would make "remember this" and "you may now post
  without me" the same audit record.
- **Dispatch vs ResourceEdit is a real split, not tidiness.** See §4.2.

#### 4.2 Duplicate agents to retire

67 agent files. These are duplicated *jobs*, and each has only one or two
importing routes, so retiring one is a route consolidation rather than a
dead-code deletion:

| Keep | Retire | Evidence | Moves into |
|---|---|---|---|
| `croAgentV2.ts` | `croAgent.ts` | `/api/cro/route.ts` vs `/api/cro/generate/route.ts`; V2 already runs `findUnsupportedClaims` via `scrubCroOutput` | `report` |
| one growth advisor | `growthAdvisorAgent.ts` **or** `growthAdvisorV2.ts` | **both are imported by the same route**, `/api/growth-advisor/generate/route.ts` — the clearest duplicate in the repo | `report` |
| one SEO agent | two of `seoAgent.ts` / `seoPageAgent.ts` / `seoToolkitAgent.ts` | 4 + 1 + 1 importers across `/api/seo/*`; `seoToolkitAgent` is also one of the 4 remaining `MIGRATING` entries | `report` + `draft_copy` |
| `socialMediaAgent.ts` | `socialManagementAgent.ts`'s customer-facing half | 5 vs 2 importers; the management agent keeps `viral_trends`, which is owner research | `draft_copy` + `reply_public` |
| `contentMarketingAgent.ts` | `contentAgent.ts`'s copy half | 4 vs 1 importer; `contentAgent` is the lead message, already through the door | `draft_copy` |
| `videoMarketingAgent.ts` | `videoAgent.ts` | 1 vs 1; `videoAgent` is only reached via `veoDirectAdapter` | `draft_copy` |
| `websiteBuilderAgent.ts` | `websiteAgent.ts` | 4 vs 1 | `edit_page_text` |
| `deepStrategyAgent.ts` | `strategyAgent.ts` | 1 vs 1 | `report` |

Not a duplicate, but the largest consolidation target:
`masterBrainV2.ts` at **4,899 lines**, which holds all 58 tool schemas
and their dispatch. The Action registry is where those schemas belong.

---

### C5. Outcome memory and learning — one memory

**What exists**

| Piece | Where | State |
|---|---|---|
| A memory table | `business_memory` (migration 089, extended 102) | WORKING |
| Automatic outcome writes | `src/lib/businessMemory/outcomeInsights.ts:48`, `:73`, `:92` | WORKING — **three** kinds: lead status change, call completion, campaign auto-pause |
| Lead-scoped memory | `src/lib/businessMemory/getLeadMemory.ts` | WORKING |
| Memory into context | `getBusinessContext.ts:59` — the last 20 insights | WORKING |
| Attribution | migration `196` | WORKING |
| Signals with expiry | migration `198` | WORKING |

> **Small correction to the architecture document.** D5 says "Only lead
> outcomes write to `business_memory`". Three outcome kinds write to it,
> at `outcomeInsights.ts:48`, `:73` and `:92`. The conclusion is
> unchanged — they are free-text insights, not Decision/Outcome records
> with an expected effect and a check date — but the diagnosis should read
> "no decision records", not "only lead outcomes".

**What is missing:** Decision records (what / why / expected effect /
measure / check date), Outcome records measured at the check date, and
preference pairs from owner edits. Nothing records *why* a draft was
written, so nothing can learn from it being rejected.

**What the existing piece becomes.** `business_memory` stays the
free-text layer; Decisions and Outcomes become new typed tables with
evidence ids pointing at `FactRecord`s and `business_signals`.
`outcomeInsights.ts` becomes the writer of Outcome rows rather than
prose.

---

### C6. Policy and autonomy — one rulebook

**What exists**

| Piece | Where | State |
|---|---|---|
| Risk tier per action | `executionPolicy.ts:33` `ACTION_POLICIES`, 33 keys, `riskLevel` + `requiresApproval` | WORKING |
| Toggle risk | `executionPolicy.ts:170` `AUTOMATION_TOGGLES`, 6 toggles | WORKING |
| Approval creation | `requestApproval.ts:76` | WORKING |
| Coverage test | `tests/approvalCoverage.test.ts` | WORKING |
| Spend is always human | `executionPolicy.ts:41` `activate_ad_campaign` = `spend` / `critical` / `requiresApproval: true` | WORKING |
| Switching OFF is never gated | `CLAUDE.md` rule 6 — "the safe direction must not be the slow one" | WORKING |
| Kill switches | `src/lib/featureFlags.ts` `KillSwitchFeature` | WORKING |

**What is missing:** autonomy **levels** (L0/L1/L2) per action per
business; promotion from measured data; automatic demotion when an
unsupported claim reaches the public; per-channel daily caps.

**What the existing piece becomes.** `ACTION_POLICIES` gains a level per
business, read from a table rather than a constant. The
`requiresApproval` boolean becomes `level === "L2" ? "auto" : "approve"`,
with spend pinned to L0 by a test that cannot be satisfied any other way.

---

### C7. Quality system as a gate — one test bench

**What exists**

| Piece | Where | State |
|---|---|---|
| Offline eval | `scripts/eval/` + `vitest.eval.config.mts` (commit `68abbd0`) | WORKING — 30 cases, 3 tenants, 4 surfaces, real surfaces, real model |
| Cost metering from the API's own usage | `scripts/eval/harness.ts:81` `meterFetch` | WORKING |
| Budget ceiling | `harness.ts:30` `BUDGET_INR = 500`; ledger `scripts/eval/spend.json` | WORKING |
| Human grading, two blind scorers | `harness.ts` `gradingSheet` + `tests/evalGradingSheet.test.ts` | WORKING |
| Free sheet regeneration | `scripts/eval/regrade.eval.ts` | WORKING |
| A graded baseline | reviewer: 72 T / 33 F / 30 U of 135 | **DONE** |
| "No surface writes copy outside the door" | `tests/oneDoorForCopy.test.ts` | WORKING — see §4.4 |
| 4,049 tests, 260 files | `npx vitest run` | WORKING |

**What is missing:** the eval as a **gate** — nothing currently blocks a
change that raises the unsupported-claim rate; online monitoring of live
outputs; judge calibration; and Ovaiz's own grading sheet, still
unfilled.

**What the existing piece becomes.** The harness gains a
`--compare <baseline.json>` mode that fails on regression, and that
becomes S1's exit test rather than a human reading two sheets side by
side.

---

## 3. Migration S1-S7, sized

Sizes assume this repo's standing rules: real exit codes, a mutation
check per guard, no weakened tests, and SQL pasted in chat for Ovaiz to
run by hand.

| Step | Size | Riskiest part | Exit test, exactly as the design states it |
|---|---|---|---|
| **S1** C1 `getContext` v1 + C2 full pipeline, behind a flag, EMAIL only | **M** | **Select's recall.** Under-selection deletes true claims, and today's false-positive rate is 0 of 72 — the one number that can only get worse. Second: the fixture bug in §4.1 must be fixed first, or S1 compares against a baseline run with a limb tied | *"Re-run the 13 Oct eval on email cases: unsupported claims 0 by reviewer grading; wrongly-removed not worse; cost per email measured"* |
| **S2** C2 on every customer-facing surface | **L** | **Haiku's extraction recall on Hinglish.** A claim that is not enumerated is never judged, and that failure is silent. Gate it on the 135 graded sentences before widening | *"Full eval: 33 F -> 0; judge agreement with human labels measured and reported"* |
| **S3** C4 Actions for site edits + C6 levels (L0/L1) | **M** | **`undo()` for page text.** `publish/types.ts:74-79` records that `website_pages` IS what `/site/{slug}` renders — there is no draft layer, so an approved edit is public the moment it saves. Undo must restore a stored previous version, which means storing one | *"Approve in UI -> change live -> verify -> undo works, on candle_by_qaaf"* |
| **S4** C3 Growth Manager v1 + daily report | **L** | **Self-calls.** A seven-stage loop built as route-to-route calls hits the Vercel 508 at ~4 hops, and `/api/autopilot/daily-run` is the exact route that did it before | *"Daily email arrives with only counted numbers; each suggestion cites evidence and the goal it serves"* |
| **S5** C5 outcome records + results job; 90-day strategy; monthly review | **M** | **The 28-day wait is unfalsifiable until it elapses.** Nothing can be verified live for a month, so the check-date job needs its own test with a frozen clock | *"After 28 days, each executed action has an outcome row"* |
| **S6** Remaining tools into Actions; retire duplicate agents; autopilot through C2+C6 | **L** | **Retiring an agent whose route is still live.** Each duplicate has one or two importing routes (§4.2), so each retirement is a production route change, not a deletion | *"Tool count falls; no surface writes copy outside C2 (test that greps for direct model calls in customer-copy paths)"* — the second half already exists, see §4.4 |
| **S7** Autonomy promotion from data; experiments; local/GBP and AI-visibility | **M** | **Promotion to L2.** Demotion must be automatic and must fire on the first unsupported claim reaching the public, which means C7's online monitor has to exist first | *"Promotion and demotion both tested; spend never auto (test)"* |

---

## 4. What is wrong for this repo, with evidence

### 4.1 The baseline was measured with the Business Knowledge channel disconnected

`scripts/eval/fixtures.ts` sets `ownerFacts: [] as any` on all three
fixtures, and `runCase` passes only `facts` to the generators
(`scripts/eval/surfaces.ts:33,38,43`). In the real product
`gatherBusinessFacts` fills `ownerFacts` from `business_knowledge`
(`businessFacts.ts:419`, `:524`), `knownText` reads it
(`businessFacts.ts:855`), and `factsPrompt` splits it into story and
facts (`:715`, `:763`).

So in the baseline run the owner rows reached **neither the model nor the
guard** — while the grading sheet showed them to the graders, because the
sheet builds its records block from `extractFromKnowledge(fixture.rows)`
(`harness.ts:140`). Both scorers judged against records the generator
never had.

Three consequences:

1. The one apparent false positive, `#FSSAILicensed` on dairy-06, is a
   fixture bug. With `ownerFacts` populated the guard licenses it from
   "FSSAI licence 11223344556677" and the false-positive rate is **0 of
   72**. I verified this by re-running the triage both ways.
2. The reviewer's cross-tenant-bleed hypothesis for the dairy's "small
   batches" is **disproved**. `small batch` appears in no dairy fixture
   data at all; it appears in the candle fixture's row c5 and in
   `claimCheck.ts:116` / `readings.ts:150` as a term. Since the dairy's
   own rows never reached the prompt either, there was nothing to bleed —
   it is a category cliché straight from the model, which is D1 exactly
   as diagnosed, and the right conclusion for the plan.
3. **S1 must fix the fixture before it measures anything.**

### 4.2 One `Action` type conflates two things this repo deliberately separates

The design's Action is `{ preview, execute, verify, undo, riskTier, ... }`
for every capability. This repo splits them on purpose. `CLAUDE.md`:
*"`src/lib/publish/` edits to a resource on a platform (previewDiff,
targetRef, staleness). **NOT for one-shot sends**"*. And
`publish/types.ts:10-14` defines `FieldChange.before` as *"the baseline
execution re-verifies against"*.

A sent email has no `before`, cannot be re-read from the platform, and
cannot be undone. Migration 208 already models it the other way — rows
are **claims written before the send**, and `handoff_state: null` means
SENT. One Action type with an `undo()` that eight of the seventeen
actions must stub out is a contract that lies.

**Recommendation:** one envelope, two families.

| | `ResourceEdit` | `Dispatch` |
|---|---|---|
| has | `preview()` with before/after, `execute()`, `verify()` by re-read, `undo()` | `preview()` of the exact payload, `execute()` with an idempotency key, `verify()` of acceptance |
| examples | page text, meta, product, discount, ad budget, ad state | email, WhatsApp, post, public reply, call |
| undo | real | **none** — the honest answer, surfaced to the owner before approval |

Actions 13-17 are a third family, `Internal`, with no platform at all.

### 4.3 "~15 Actions replace 58 tools" and "tool count falls" measure the wrong thing

Of the 58, **9 are reads and 9 are owner-facing analysis** (§4.1 of the
mapping above) — they change nothing, so they are not Actions and their
count will not fall into the 15. Only 40 change state. A target of "the
tool count falls" can be met by deleting reads, which costs capability
and buys no safety.

**Recommendation:** replace S6's first clause with *"nothing that changes
state is reachable except through an Action"* — testable, and it is the
property that actually matters.

### 4.4 S6's exit test already exists

The design describes S6's test as *"a test that greps for direct model
calls in customer-copy paths"*. That is
[tests/oneDoorForCopy.test.ts](tests/oneDoorForCopy.test.ts), live since
2026-10-11. It walks `src/`, finds every `callClaude(` caller, and
requires each one to be through the door, on the one-entry `CHECKS_ONLY`
list, on `MIGRATING` with a date and a reason, or on `NOT_COPY` with a
reason — and a file that migrates **fails the suite until its entry is
deleted**, so the backlog can only shrink.

Four `MIGRATING` entries remain: `seoToolkitAgent.ts` (two
customer-facing tasks), `websiteBuilderAgent.ts`, `brandBuildingAgent.ts`
and `chatbotAgent.ts` — the last two deferred by Ovaiz.

So S6 is not a new test; it is four entries plus the Action work. Worth
re-sizing: the hard part of S6 is retiring agents, not proving the door.

### 4.5 The "33 F -> 0" target does not say which mode, and this repo has two

Every eval case ran in `draft` mode (`surfaces.ts:33,38,43`). In draft
mode `substantiation` problems are **kept with a note** by design
(`claimCheck.ts:1059-1066`), because deleting a truthful owner's "pure
cotton" from their own draft tells them their product is a lie. That is
why 4 of the 33 F sentences show as kept in draft and removed on publish.

A target of "33 F -> 0" with no mode named can be met by making draft
mode strict — which deletes true claims from the owner's screen and
undoes a decision this repo made deliberately.

**Recommendation:** state the metric as three numbers.

| Metric | Today (reviewer-graded) | Target |
|---|---|---|
| Unsupported claims that reach **publish** | 29 of 33 pass | 0 |
| Unsupported claims in a **draft** with no mark | 29 of 33 | 0 — marked, not necessarily deleted |
| True claims wrongly removed on publish | 0 of 72 | 0 |

### 4.6 Two candidate spines for C1, and picking the wrong one re-forks the truth

C1 says one function, `getContext(businessId, task)`. The repo has two
candidates: `gatherBusinessFacts` (`businessFacts.ts:388`), which the
claims guard already checks against, and `getBusinessContext`
(`businessBrain/getBusinessContext.ts`), which 7 callers use and whose
own header records that it already delegates its facts to the former.
Building C1 on the second would leave the writer and the guard reading
different truths — D1 again, one layer up.

### 4.7 C1's provenance already exists, in the wrong table

`business_signals` (migration `198:54-60`) carries
`confidence in ('counted','observed','inferred')`, `source_url`,
`observed_at` and `expires_at`. `BusinessFacts` carries none of it, and
`knownText` (`businessFacts.ts:850`) flattens everything into one proof
blob. So `said()` cannot tell "the owner wrote this" from "Hawlai wrote
this on their About page" — and the only gate currently deciding whether
Hawlai-written page text counts as evidence is a single boolean,
`claims_reviewed_at` (`businessFacts.ts:448`).

This is the highest-value piece of C1, and it is an **extension of 198's
vocabulary to `FactRecord`**, not an invention.

### 4.8 The cost cap and the full-surface re-run collide

Ovaiz's cap is Rs 30 per eval re-run. S1's email-only re-run is ~Rs 22
and fits. S2's 30-case re-run of the new pipeline is **~Rs 66** and does
not. Flagged now so the order of work is his decision rather than a
surprise at the end of S2.

### 4.9 Two bugs the grading found that are not architecture

Both are real, both need a test, neither waits for the spine:

1. **The extractor's "X nahi" capture takes the verb.** The salon row
   "ammonia wale products use nahi karte" produced
   `material.use = false` instead of `material.ammonia = false` — visible
   in the reviewer's own records block. Test to write: that sentence must
   yield `material.ammonia = false`. `MATERIAL_SHAPES` in
   `src/lib/facts/readings.ts` needs a stopword for auxiliary verbs.
2. **"Starting from" prices are unchecked.** candle-03 "Dono Rs 850 se
   shuru hoti hain" passes because 850 is a real price — of the other
   product. Rule: a "from X" price must equal the minimum price of the
   product it is attached to.

### 4.10 One thing the architecture cannot decide, and Ovaiz must

salon-08: the brand language is Hinglish, the owner's prompt said
English, the output was Hinglish. The reviewer correctly refused to grade
it. **Which wins, the setting or the ask?** This is a product decision,
not a bug, and C2's Write step needs the answer as an input.

---

## 4a. Decisions taken (16 October 2026)

All six items from §5 are settled. Recorded here because a plan whose
open questions are answered somewhere else is a plan nobody can read.

| # | Decision |
|---|---|
| 1 | **C1's spine is `gatherBusinessFacts`.** `getContext` is a thin task-slicing wrapper over it, and `contextFromFacts` does the shaping so the door never reads the facts twice. A test asserts getContext reads no table of its own |
| 2 | **The metric is three numbers**, as in §4.5: unsupported claims reaching publish = 0; unsupported claims in a draft with no mark = 0 (marked, not necessarily deleted); true claims wrongly removed on publish = 0. S2 cannot be passed by making drafts stricter |
| 3 | **The nine FACT rows move to `general`**, once the founder has confirmed the slug with a read query. It is no longer a blocker: after S1-2 a row's protection does not depend on its category, so the SQL is safe to run in either order and changes nothing functionally — it only makes the label honest |
| 4 | **The owner's ask for one piece beats the setting**, for language. salon-08: brand Hinglish, the owner typed "in english", the output was Hinglish. `languageAskedFor` reads an explicit instruction only — "post about our english classes" is a subject, not an instruction |
| 5 | **ONE HUMAN GRADER.** Ovaiz is not grading; the reviewer's sheet is the grading of record. So there is no inter-grader agreement number, and there will not be one. That is a real limit on every claim made from this data: a single grader's reading of 135 sentences is the baseline, and nothing independently confirms it. Where a verdict is arguable, it is the reviewer's verdict |
| 6 | **Budget:** the extractor gate and the S1 exit re-run are approved. The full 30-case re-run (~Rs 66) needs its own go. Gate actually spent Rs 51.51 across four runs |

## 4b. The scope rule, and S1's verdict (16 October 2026)

> **RETRACTED THE SAME DAY. S1 DOES NOT PASS.** The reviewer graded all
> 123 sentences and found **13 unsupported claims sitting in drafts with
> no mark**. The table further down this section reported that number as
> 0, and it was mine to get right: I printed the pipeline's own account
> of itself as a result, having written two paragraphs below it saying
> that a pipeline cannot be the witness for its own defence. Saying the
> limit out loud is not the same as respecting it.
>
> The scope rule in this section stands — the founder's correction was
> right and it is in force. The VERDICT does not. See §4c.

Email is on the fact-bound pipeline behind `FACT_BOUND_COPY=1`, which
remains blank.

### The rule

> A claim about ONE named product or service must be cited to a record
> about THAT product or service. A business-level general statement does
> not support it — **however true the general statement is.**

The founder set this on 16 October 2026, reversing his own earlier
reading, and the reversal is worth recording because I had it wrong too.
The S1 exit run removed *"This product contains no ammonia"* twice. The
only record was `material.ammonia = false`, from the owner's row
*"Ammonia wale products use nahi karte"*. I reported those two removals
as true claims wrongly removed, which would have failed S1.

He corrected it: the judge was right. A business that says it does not
use ammonia-based products may still use one product for the keratin and
another for a colour service; nothing on record says which. The practice
is recorded; the item's composition is not.

It runs in both directions: a fact about one item does not support a
claim about all of them either.

### Where it is enforced

| Moment | Where |
|---|---|
| Select must not pick such a claim | `selectClaims.ts` rule 9 — and it must report an unknown instead, asking the owner to record it against the item |
| The judge must not entail it | `verifyClaims.ts` rubric rule 7 |
| The grader must not mark it T | the grading sheet's header: *general business fact → specific product claim* is **U or F, never T** |

All three are pinned by `tests/scopeRule.test.ts`, because the rule
lives in prompts and a prompt rule deletes silently.

### What it cost, and what paid for it

Applied with nothing but business-level rows, this rule would also have
refused *"the lavender candle is soy wax"* — true, recorded, and
graded T four times in the baseline. So the catalogue's `description`
column is now a record: `product.<key>.description`, holding "Soy wax,
40 hour burn" against the Lavender candle. That is exactly the
product-level evidence the rule asks for, and it was sitting unused in a
column the whole time.

### The three numbers

| Metric | Baseline (email) | Run 3, as I reported it | Run 3, graded |
|---|---|---|---|
| Unsupported claims reaching publish | 20 of 70 | 0 | not yet separated from the row below |
| Unsupported claims in a draft with no mark | 20 of 70 | 0 | **13** |
| True claims wrongly removed | 0 of 34 | 0 | **0** — confirmed by the reviewer |

The middle column was the pipeline reporting on itself: every claim the
verifier could not trace WAS removed and named, which is true and is not
the metric. The metric is whether an unsupported claim survived all four
steps, and 13 did.

Cost: **Rs 2.73 per email** against a baseline of Rs 0.93 — 2.9x, and
within the 2.4x the plan estimated once the retry is counted. Four model
calls an email: select, write, extract, judge.

**What this does NOT say.** Numbers 1 and 2 are the pipeline's own
account of itself: every claim it judged unsupported was removed and
named. Whether an unsupported claim SURVIVED all four steps is the
reviewer's to grade, on the sheet in `scripts/eval/results/`. The
pipeline cannot be the witness for its own defence, and that limit
belongs here next to the numbers.

## 4c. Why S1 failed, and the fix plan (16 October 2026)

No paid run until the founder approves this section.

### The root cause is one sentence, and it was already written down

The recall gate measured the extractor against **the 135 sentences of
the 13 October baseline** — copy written by the OLD prompt. The new
pipeline's own output has never been through the gate. §6 of this
document says it:

> *"Whether that holds on copy the baseline never produced is unknown."*

It was flagged, and then not acted on. Select → Write produces a
different *shape* of sentence from the old free-text prompt, and the
gate's recall on that shape is unmeasured. Two failure classes follow.

### Class A — a vague benefit riding on a true fact

The extractor enumerates the factual claim in the sentence and misses
the second clause. Every one of these has a TRUE, recorded fact in it,
which is exactly why the vague half travels:

| Case | Sentence | True part | Rode along |
|---|---|---|---|
| candle-05 | "Fragrance sirf 65 celsius pe dala jata hai — kyunki quality mein koi shortcuts nahi" | 65 celsius is recorded | "koi shortcuts nahi" |
| salon-05 | "Keratin treatment sirf Rs 3500 mein — budget-friendly, results real" | Rs 3500 is in the catalogue | "budget-friendly, results real" |
| candle-05 | "Yahan har cheez thodi slowly, thodi carefully banti hai — aur wahi fark dikhta hai" | the process steps are recorded | "wahi fark dikhta hai" |
| dairy-07 | "Pure desi ghee, made in Indore, ready for your kitchen" | the ghee and the city | "Pure" |

The joins are a dash, `kyunki`, `aur`, `isliye`. The baseline's
sentences rarely had this shape, because the old prompt wrote longer
free prose; the new Write step produces tight sentences built around an
approved fact, with the flourish bolted on.

### Class B — the records-unreadable case never entered the pipeline at all

candle-08 produced invented specifics: a **20-minute** figure twice, a
**2-hour** first-burn instruction, "har pour haath se kiya gaya hai",
a scent description, and "candle zyada der chalti hai". It is the case
built to catch exactly this.

The cause is one condition I wrote:

```ts
return process.env.FACT_BOUND_COPY === "1" && req.factBound === true && Boolean(req.facts);
```

`Boolean(req.facts)` sends the no-records case down the OLD path. It is
backwards: a business whose records cannot be read is precisely when the
pipeline matters most. Its `note=NO` in the run log and its single model
call were the evidence, sitting in the output the whole time, and I read
the case as having passed.

### The fix, in four parts

| # | Fix | Why this one |
|---|---|---|
| 1 | **Drop `Boolean(req.facts)`.** With no records, Select is skipped (there is nothing to select from) and the Write step runs with ZERO approved claims — the "NO FACT WAS APPROVED FOR THIS PIECE … Do not fill the gap" branch that already exists. Extract and verify still run, so anything factual that slips in is removed | Class B, and it reuses what is built rather than adding a path |
| 2 | **The extractor becomes clause-aware.** A sentence joined by a dash, `kyunki`, `aur`, `isliye`, `matlab` or a comma may carry two claims, and a vague quality clause riding on a true fact is its own claim — *the true half does not vouch for it* | Class A, at the only place that can hold forever: the verifier must catch whatever any future prompt produces |
| 3 | **The Write step is told not to write them.** It already says "state nothing factual that is not in the list"; the model plainly does not read "results real" as a factual claim, so the shape is named | Cheap insurance. Not the real fix — a prompt change downstream would re-open it, which is why 2 exists |
| 4 | **The gate runs on the NEW pipeline's output.** A second gate over the 123 sentences of the S1 run, with the reviewer's 13 as the known-missed set, so recall on new text becomes a number instead of an assumption | The root cause. Without this, fixes 2 and 3 are untested against the thing that broke |

### Order, and what it costs

1. Fixes 1-3 with tests and mutation checks. **Free.**
2. Fix 4's gate on the saved 123 sentences. **~Rs 15**, no new copy generated.
3. Only if the gate shows acceptable recall: a fourth S1 exit run. **~Rs 25.**

Nothing paid runs before the founder approves. Running total so far
**Rs 161.61 of Rs 500**; all three steps together would reach about
**Rs 202**.

### What I need from the founder

The **13 sentences, with their case ids**. They are the known-missed set
fix 4 measures against, and I will not guess them from the output — the
four in Class A above are my own reading of the run, not his grading,
and the two lists may differ.

## 5. What is needed from Ovaiz before S1

1. **C1's spine:** `gatherBusinessFacts` as the single reader, with
   `getContext` as a task-slicing wrapper over it (§4.6). Recommended.
2. **The metric, stated as three numbers** (§4.5) so S2 cannot be passed
   by making drafts stricter.
3. **The per-sentence classification table** from the earlier step — still
   unconfirmed, and C1 cannot type `reported_belief` without it. Nothing
   has moved out of `business_story`.
4. **The language decision** in §4.10.
5. **Ovaiz's own grading sheet**, still unfilled
   (`scripts/eval/results/baseline-2026-10-13T05-11-56-100Z-grade-ovaiz.md`).
   Agreement between two graders is what says the 33 is reliable.
6. **Budget acknowledgement:** S1's exit re-run ~Rs 22 (within the cap);
   the extractor-recall gate ~Rs 28 (within the cap); S2's full re-run
   ~Rs 66 (needs a separate go).

Running total so far: **Rs 27.86 of Rs 500.**

---

## 6. What this plan does not claim

- Nothing here is verified live. Every number is from the graded
  baseline, from the repo, or computed from `src/lib/usage/pricing.ts`.
- The cost model is an estimate with stated token assumptions, not a
  measurement. The baseline's own estimate was 4x its actual, in the
  safe direction.
- Whether a haiku extractor can read Hinglish well enough is **unknown**
  and is the biggest open risk in the design. It is measurable for ~Rs 28
  before anything depends on it, and that measurement should be the first
  thing S1 does.
