# HAWLAI PHASE 2.5 — INTELLIGENCE LAYER
## Audit first, then plan. No code in this document.

**Date:** 2026-10-09
**Baseline:** `main` @ `c433380` · `tsc` 0 · `vitest` 0 (213 files / 3228 tests)
**Position:** immediately after **Phase 2A** (the unattended auto-reply fix), before Phase 3.
**Scope of this document:** read-only audit of what already exists for A/B/C, then a plan. Nothing was modified.

---

## 0. The headline, before the detail

**(A) is ~70% built.** A ten-question Business Story interview already exists, with duplicate protection and verbatim preservation. A never-say list already exists as a real field. What is missing is narrower than it looks: **audience and USP as facts, the interview being part of onboarding, and the one rule the user actually asked for — no backstory without evidence.**

**(B) is ~60% built but never assembled.** Four of the six stages exist as working code. The two missing ones are **intent** and **angle**. The four that exist are wired inconsistently — which is already a recorded finding (F-Q1).

**(C) does not exist at all.** There is no eval harness, no golden set, no baseline comparison. One precedent worth copying: `scripts/materialClaimsDryRun.mjs`.

**One correction I owe you.** My forensic audit said model routing was flat with "no per-task table". That was wrong: `src/lib/aiTaskRouter.ts` has a 22-task complexity table and is wired into four agents. Partial, not absent. Recorded in §4.

---

# PART A — BUSINESS BRAIN

## A.1 What already exists (audited)

### The Business Story interview — already built, already enforced

`src/lib/business/businessStory.ts` · `STORY_CATEGORY = "business_story"` · 10 questions:

| key | asks about | maps to the user's ask |
|---|---|---|
| `origin` | how it started, and why this | **real story** ✓ |
| `first_customers` | who they were, how they found you | audience (partial) |
| `how_made` | the process start to finish | **USP** (partial — process) |
| `slow_part` | what takes longest and why you still do it | **USP** (partial — craft) |
| `materials` | materials, suppliers, why those | **USP** (partial — inputs) |
| `detail_noticed` | the small detail customers notice | **USP** (partial — the hook) |
| `customer_words` | what a customer actually said, verbatim | **real story** ✓ |
| `refuse` | what you refuse to do even though it's easier | **never-say** (partial — prose) |
| `how_you_talk` | how you describe it to a neighbour | **voice** ✓ |
| `mistaken` | what people get wrong | positioning |

Already working, verified in code:
- Chat tools `business_story` (reports progress from the database, not from memory) and `save_business_story`.
- `cleanStoryAnswer` validates; `sameAnswer` + `input.replace !== true` **refuses to silently overwrite** an existing answer.
- Stored in `business_knowledge` with `category = 'business_story'`, matched by `title`.
- Reaches every generator in full, never truncated (`formatFactsForCopy` — "the detail IS the point").
- `splitStories` withholds third-party private events from public copy.
- `usesOwnStory` + `retryWithStory` detect a draft that used none of it and **retry once**; `GENERIC_NOTE` tells the owner when the retry also failed.

### The never-say list — already a field, already checked, not enforced

`BrandVoiceProfile.vocabulary_preferences.avoid` (`agents/brandVoice.ts:17-20`), captured in onboarding at the `avoid_words` step, checked by `validateBrandVoiceCompliance` (`brandVoiceValidation.ts:46-53`).
**`withBrandVoiceCheck` is advisory only** — it attaches `_brandVoiceCheck` and never regenerates or strips (`brandVoiceValidation.ts:102-111`).

### Onboarding — exists, but captures the wrong grain

`src/components/dashboard/WelcomeChatCard.tsx`, 9 steps:
`intent → describe → business_model → formality → language → language_notes → personality → avoid_words → done`

The `describe` step asks, in one free-text box, *"what you sell, who your customers are, what makes you different"* — so audience and USP **are asked** and then **distilled into a brand-voice draft**, not stored as facts. **`STORY_QUESTIONS` is not referenced by onboarding at all.**

### Audience and USP as facts — absent

- `BusinessFacts` has **no** audience, USP, ideal-customer or never-say field (grep: no match).
- `brand_profiles.target_persona` **does** exist and is used by `adEngine`, `launchCampaign`, `metaTargeting`, `autopilotAgent` — but it is **not in `BusinessFacts`**, so no content, email, SEO or social prompt ever sees it.

## A.2 The gaps, precisely

| # | Gap | Evidence |
|---|---|---|
| A-G1 | The story interview is **not part of onboarding** — reachable only if the owner asks in chat. Most businesses therefore have 0/10 answers, which is the real cause of generic copy. | `STORY_QUESTIONS` absent from `WelcomeChatCard.tsx` |
| A-G2 | **Audience** is not a fact. `target_persona` exists but is ads-only. | not in `BusinessFacts` |
| A-G3 | **USP** is not a fact. It is scattered across four story answers and one free-text onboarding box. | not in `BusinessFacts` |
| A-G4 | **Never-say is advisory.** The list exists and is checked; nothing acts on it. | `withBrandVoiceCheck` returns the output unchanged |
| A-G5 | **No rule prevents invented backstory.** This is the user's core ask and it is finding F-N1: no pattern family covers narrative or attributed speech, so "my grandmother taught me to pour wax" and "a customer told me it reminded her of her first home" pass every guard. | `claimCheck.ts` — no narrative rule |

## A.3 Plan for A

**A1 · The rule first, because it is the point: no backstory without evidence.**
A narrative-provenance layer in `src/lib/claims` (the natural home, next to `personalStories.ts`). For each sentence of customer-facing copy that asserts **history** (first person past, "we started", "years ago") or **attributed speech** ("a customer said", "people tell us"), require its distinctive content to trace to `ownerFacts`. Unmatched → withheld, with the owner told which sentence and why.
**Reuse:** `storyEcho.storyVocabulary` already computes the owner's own strong/ordinary word sets — the matching mechanism exists; this inverts it.
**The positive half of the same rule:** with no story on file, the generator is told to write **mood and situation** — a quiet room, a small flame, an evening — which needs no record. The precedent is exact: `imageBrief.NO_PRODUCT_DEPICTION_RULE` already says "draw none of the product; make type, colour, texture instead." Same shape, applied to prose.
**Risk to watch:** three existing `contentQuality` tests assert that *real* story detail must survive. A provenance rule that strips a true story is worse than the problem.

**A2 · Make the interview part of onboarding.**
Insert the 10 questions after `avoid_words` as a **skippable, resumable** block — `storyProgress` already reports "5 of 10 saved", so partial completion is already a supported state. Not a wall: the existing onboarding rule ("don't front-load a wall of questions") stays — ask two, offer "I'll ask the rest as we go", and let chat finish the set opportunistically.
**No migration needed.** `category = 'business_story'` already exists and is already allowed.

**A3 · Audience and USP as facts.**
Two new story-interview questions rather than two new systems:
- *"Who is this for — and who is it not for?"* → audience
- *"If someone compared you to the cheapest option, what would you want them to know?"* → USP

**Storage decision — my recommendation: no migration.** `business_knowledge.category` carries a live CHECK constraint allowing exactly `hours, pricing_note, policy, faq, general, business_story` (migration 189; no later migration touches it). Storing these as `business_story` rows with new **titles** needs no schema change, because `storyProgress` matches on `title`.
If you want them as first-class categories instead, that is a migration, and per your standing rule I will send SQL plus a verify query, **after** checking the live constraint with `pg_get_constraintdef` rather than trusting migration 189. **Say which you prefer; I have not written either.**

Then surface both in `formatFactsForCopy` so every generator sees them — including bringing `target_persona` into `BusinessFacts`, which closes A-G2 for content as well as ads.

**A4 · Enforce never-say.**
Promote `vocabulary_preferences.avoid` from advisory to a retry: on violation, one regeneration naming the violated words (the exact pattern `retryWithStory` already uses), then flag if the retry also violates. Reuses `validateBrandVoiceCompliance` as the detector.

**Explicitly not in A:** merging `business_memory` into `business_knowledge`; a new onboarding UI; replacing the brand-voice extraction.

---

# PART B — THE PIPELINE ABOVE MASTER CHAT

## B.1 Stage-by-stage audit

| Stage | Exists? | Where | Assessment |
|---|---|---|---|
| **intent** | **NO** | — | Claude tool-use over **58 tools / 53,466 chars** is the only router. `aiTaskRouter.classifyTask` classifies **known task keys**, not freeform text, and its own header explains that choice deliberately. |
| **context fetch** | **YES** | `getBusinessContext` | facts, memory(20), RAG(5), brand, team. Bounded by six independent magic numbers and **no token budget**. |
| **angle** | **NO** | — | The system prompt *instructs* it ("Diagnose before you generate… form a quick point of view") with **no code and no output**. An instruction with no artefact cannot be inspected, tested or reused across tool calls — which is why "connect pieces across departments" is unfollowable today. |
| **draft** | **YES** | 44 model-calling agents | — |
| **self-critique** | **YES, four of them** | see below | All four exist and work. None is universal. |
| **guard** | **YES** | `guardOrMark` → `claimCheck` → `platformRules` | Strongest stage. Phase 1 made it fail closed. |

### The four self-critique mechanisms that already exist

| Mechanism | File | What it does | Reach |
|---|---|---|---|
| `reviseForSpecificity` | `contentMarketingAgent.ts:316-345` | "could a competitor publish this exact line?" → cut or replace from facts | **2 of 5 callers** (F-Q1) |
| `usesOwnStory` + `retryWithStory` | `content/storyEcho.ts` | draft used none of the owner's story → **one retry**, then `GENERIC_NOTE` | content path only |
| `confidence_score` retry | `adEngine.ts:101-116` | model self-scores; below threshold → one retry on its own stated weakness | ads only; **a model's opinion as a gate** (F-07) |
| `withBrandVoiceCheck` | `brandVoiceValidation.ts:102` | voice violations | **advisory only** |

**So "self-critique" is not missing. It is unassembled, unevenly wired, and in one case gated on the model's own self-assessment.**

## B.2 Plan for B

**B1 · Make the angle a real artefact.**
One cheap call (`fast` tier) producing a small structured object before any draft: `{ audience, belief_now, one_obstacle, angle, proof_from_facts[], funnel_stage }` — every field either traceable to facts or explicitly null. It becomes part of `groundingContext`, so **every** tool in the turn shares one angle. This is what makes "a post, an ad and a landing page share one message" achievable instead of aspirational.
**Reuse:** `getBusinessContext` for inputs; `parseModelJson` for the read; `factsGate.truthBlock` for grounding.

**B2 · Assemble the pipeline as one callable, not a new orchestrator.**
A single `generateCopy()` wrapper that runs: `truthBlock` → angle → draft → self-critique → `guardOrMark`, and returns the provenance of each stage. Agents **opt out** explicitly rather than opting in — which closes F-16 (18 model-calling agents with no facts and no guard) by default rather than one file at a time.
**Do not** build a second orchestrator above `runMasterBrainChat`. The chat loop stays exactly as it is; what changes is what each *tool* calls.

**B3 · Intent, last and cheapest.**
A `fast`-tier classifier narrowing 58 tools to ~8, with the full catalogue as the fallback when confidence is low. Measurable against a labelled set — which is exactly what Part C produces, so **C must come before B3.**

**B4 · Replace the one self-assessment gate.**
`confidence_score` → the deterministic signals that already exist: did any line survive `reviseForSpecificity`'s test, claim-flag count, `usesOwnStory`. A model that writes generic copy also scores it 80.

**Order within B:** B1 (angle) → B2 (wrapper) → B4 (gate) → **C** → B3 (intent). B3 last because it is the only stage that needs a benchmark to prove it did not make routing worse.

---

# PART C — THE BENCHMARK

## C.1 Audit: nothing exists

- No eval harness, no golden prompt set, no baseline comparison, no scoring script.
- `tests/contentQuality.test.ts` (49 tests) tests **mechanisms** — `craftSection`, `recentCopy`, `storyProgress` — which is correct for a unit test and is not a quality measurement.
- **One precedent worth copying:** `scripts/materialClaimsDryRun.mjs` — an offline script, JSON in, JSON out, explicitly "these terms are NOT enabled", with a test pinning that they stay off until approved. That is the right shape: a harness that reports and changes nothing.

## C.2 Plan for C

**C1 · The 20 prompts.** Real `candle_by_qaaf` requests across the surfaces that matter: post, ad, email, SEO, strategy, price question, competitor, "why aren't my ads working". Including the ones that have already gone wrong — "MAKE POST AND WRITE A INSTAGRAM CAPTION FOR LAVENDER CANDLE" belongs in the set, because we know what bad looks like for it.

**C2 · Three arms, not two.**
1. **Baseline** — plain model, no facts, no guard, no story.
2. **Hawlai today** — at `c433380`.
3. **Hawlai with 2.5** — after A and B.

Two arms would tell us whether Hawlai beats a chatbot. Three tells us whether **2.5 was worth building**, which is the decision you are actually making.

**C3 · Blind scoring, with the scorers split.**

*Deterministic (no judge, run every commit):* claim flags · competitor-substitutability (does any line survive the `reviseForSpecificity` test) · owner-detail presence (`usesOwnStory`) · hook diversity across N generations · platform-convention compliance (`platformRules`) · invented-fact count against a fixture whose truth we control.

*Human blind (you, or you and one other):* which output would you actually publish? Shuffled, unlabelled, 1–5. This is the only scorer that can judge whether copy is *good* rather than *safe*, and it is the one that decides release.

**C4 · The release gate, stated as a number before we see results.**
Release when, on the blind set: Hawlai's "would publish" rate beats baseline by a margin you fix **in advance**, **and** invented-fact count is zero, **and** no deterministic scorer regressed against arm 2. Setting the bar after seeing the scores is how a benchmark becomes a press release.

**C5 · Honesty constraints I will hold myself to.**
- The baseline arm gets a fair prompt — a weak baseline proves nothing.
- Scores recorded per commit as a **ratchet**: a regression in any deterministic scorer fails CI. That is how you notice genericness returning without arguing about taste.
- If Hawlai loses, the report says Hawlai lost. The whole value of C is that it can return an answer we do not want.

**Safety:** the harness runs offline against fixtures, publishes nothing, sends nothing, spends nothing on ads. It does make real model calls, so it costs money — roughly 20 prompts × 3 arms × a few calls each. I will put the estimate in front of you before running it, using `costOfClaudeCallInr` rather than a guess.

---

# D. Dependencies, order and risk

```
Phase 2A (auto-reply fix)                    ← MUST land first; it is the open customer surface
   │
   ├─ A1 narrative provenance ─────┐          the rule: no backstory without evidence
   ├─ A2 interview in onboarding   │          supplies the evidence A1 needs
   ├─ A3 audience + USP as facts   ├─ A4 never-say enforced
   │                               │
   ▼                               ▼
B1 angle as an artefact ──► B2 generateCopy wrapper ──► B4 replace the self-score gate
   │
   ▼
C1-C4 benchmark (3 arms, blind) ──► B3 intent routing (needs C to prove it)
   │
   ▼
RELEASE GATE — only if Hawlai wins on the blind set
```

**A1 before A2 is deliberate.** If the interview lands first, every business suddenly has rich story facts and no rule governing invented ones — the window where fabrication is most likely and least visible.

**Three risks worth naming now.**
1. **A1 false positives.** A provenance rule that strips a *true* story is worse than the problem it fixes. Three existing tests already encode "real story must survive"; they are the floor, and I will treat a failure there as a stop, not a tuning problem.
2. **B1 cost.** One extra call per generation. The quote card pattern (`imageGenerateAction`) is the precedent for showing a price before spending, if it comes to that.
3. **C bias.** I should not be the only scorer of work I built. At minimum the outputs are shuffled and unlabelled; better, someone other than me scores them.

---

# E. What I did NOT do, and what I need from you

**Not done:** no code, no tests, no migration, no prompt change. `git status` shows only new `.md` files.

**Three decisions I need before building:**

1. **Storage for audience + USP** — new `business_story` titles (no migration, my recommendation) or new `business_knowledge` categories (a migration; I would send SQL plus a verify query after checking the **live** constraint, not migration 189)?
2. **The release margin for C4** — what blind-score gap counts as Hawlai winning? Pick it before we see any scores.
3. **Who scores the blind set** besides you, if anyone.

**One thing I'd push back on gently:** "Release only when Hawlai wins" is the right instinct, and it is also a gate that can be gamed by a weak baseline or a bar set after the fact. C4 and C5 exist to stop me doing that to you. Hold me to them.

---

## Plain-language summary

**Part A — the business brain.** Better news than expected: Hawlai *already* has a ten-question interview that asks how you started, how things are made, what a customer actually said, what you refuse to do, and how you talk. It works, it won't overwrite your answers, and every piece of writing already uses it. Two real problems. First, it only runs if you think to ask for it in chat — so most businesses have answered none of it, and that is the main reason copy reads generic. Second, and more serious: nothing stops Hawlai *inventing* a story. "My grandmother taught me to pour wax" passes every check today. The fix is the rule you asked for — a story needs evidence, and with no evidence Hawlai writes the mood of the evening instead of a past that never happened. We already do exactly this with pictures; this applies it to words. Your "never say these words" list also already exists — Hawlai just notes violations instead of fixing them.

**Part B — the pipeline.** Four of your six stages already exist as working code: context, draft, self-critique (four separate mechanisms) and the safety guard. Two are genuinely missing: deciding *what the request is* and deciding *the angle*. The angle one matters most — right now Hawlai is *told* to form a point of view but never writes it down, which is why a post, an ad and a landing page for the same push come out as three unrelated things. Make the angle a real written thing once, and everything in that conversation shares it.

**Part C — the benchmark.** This genuinely does not exist. I want three versions compared, not two: a plain chatbot, Hawlai today, and Hawlai after this work. Two would tell you Hawlai beats a chatbot. Three tells you whether this phase was worth paying for — which is the actual question. Scoring shuffled and unlabelled, and the pass mark fixed *before* we see any results, because I built the thing being tested and that is exactly how benchmarks get fudged. If Hawlai loses, the report will say so.

**The order matters in one specific way.** The anti-invention rule has to land *before* the interview goes into onboarding. Otherwise every business suddenly has a rich story and no rule about making one up — the worst possible moment.

**I need three answers from you:** where to store audience and USP (one way needs a database change, one doesn't — I'd avoid the change), what score gap counts as Hawlai winning, and whether anyone besides you will score the blind test.
