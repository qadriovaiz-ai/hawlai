# PLAN — PHASE 3: CUSTOMER-FIRST COPY

**PLAN FIRST. No code written.** The one file created is
`docs/PRINCIPLES.md`, because you asked for it alongside this and it
documents decisions already made rather than changing behaviour.
Everything below is a proposal with the diff shape named.

**Baseline:** `main` @ `dc6296e` · tsc 0 · vitest 0 (219 files / 3311 tests) · build 0
**Goal:** copy that makes a stranger interested in the business's product.

---

## 0. One thing to decide before I start

**`docs/PRINCIPLES.md` says "link from CLAUDE.md" — there is no
CLAUDE.md in this repo.** There is `docs/DECISIONS.md` and
`docs/HAWLAI_CONTEXT.md`. Three options, your call:

1. Link it from `README.md` (most discoverable).
2. Create a `CLAUDE.md` at the root whose job is to point at the docs
   that matter — useful because an agent reads it automatically.
3. Leave it unlinked; it is findable at `docs/PRINCIPLES.md`.

I would do (2), because the reason to have principles is that the next
agent reads them without being told. One short file, no behaviour change.

---

## 1. What exists, measured — so we build the gap and not the whole thing

| Piece | State | Evidence |
|---|---|---|
| Specificity editor | **exists**, reaches 2 of 5 callers | `reviseForSpecificity` at `contentMarketingAgent.ts:316`; `revise: true` only in `api/content-marketing/generate:65` and `api/autopilot/content-queue:70` |
| Story-forcing | **exists, 5 call sites, 1 file** | `usesOwnStory` / `retryWithStory` / `GENERIC_NOTE` at `contentMarketingAgent.ts:17,212-220,258-267` |
| Story-forcing tests | **15 assertions, 2 files** | `tests/shortStaysSpecific.test.ts` (12), `tests/preferredLanguage.test.ts` (3) |
| Privacy gate | **exists, keep untouched** | `claims/personalStories.ts` → `splitStories` |
| Claims guard | exists, fail-closed | `claims/claimCheck.ts`, `claims/factsGate.ts` |
| Product facts | exists: name, price, description, stock, images, offers, shipping, links | `claims/businessFacts.ts` |
| **Audience / USP / objections / proof-quotes as facts** | **absent** | no field in `BusinessFacts`; `brand_profiles.target_persona` exists but is ads-only |
| Narrative provenance | **absent** | finding F-N1, no pattern covers story or attributed speech |
| Anti-generic openers | **absent** as a rule | the prompt has a worn-openings list; nothing enforces it |

So Phase 3 is four new things and three rewirings — not a rebuild.

---

## 2. The default copy structure (3.2)

```
customer's situation or want        ← from audience fact, or the owner's own words
   ↓
what the product does for it        ← from Product Fact Sheet only
   ↓
proof                              ← recorded only: a real quote, a counted number
   ↓
offer / price / delivery           ← from facts; absent if not on record
   ↓
one clear next step                ← platform-native
```

Platform-native stays where it already is: `departments/content.ts`
`instructions` per type plus `content/platformRules.ts`. No new module.

---

## 3. The Product Fact Sheet (3.1) — and the storage decision

**Recommendation: no migration.** Store as `business_knowledge` rows with
`category = 'business_story'` and new **titles**. That category is
already allowed by the live CHECK constraint (migration 189) and
`storyProgress` matches on `title`, so partial completion already works.

New titles, phrased as customer questions:

| Title | Asks |
|---|---|
| `Who it's for` | Who is this for — and who is it *not* for? |
| `Why not the cheapest` | If someone compared you to the cheapest option, what would you want them to know? |
| `The occasion` | When do people usually buy this? What's happening in their life? |
| `What's included` | What exactly does someone get — size, quantity, what's in the box? |
| `Delivery and returns` | How does it reach them, how long, and what if it's wrong? |
| `The three questions` | The three things customers ask before buying, and your real answers |
| `What a customer said` | *(exists already as `customer_words`)* |
| `Never say` | Anything you'd never want written about your business? |

`Never say` feeds `BrandVoiceProfile.vocabulary_preferences.avoid`,
which **already exists and is already checked** — see 3.4.

**If you want these as first-class `business_knowledge` categories
instead**, that is a migration. I would send SQL plus a verify query
*after* you run `pg_get_constraintdef` on the live constraint — I will
not trust migration 189. Say which and I will prepare it; I have not
written either.

---

## 4. The diff, file by file

### 4.1 `src/lib/claims/narrativeProvenance.ts` — NEW (~140 lines)
The rule you asked for: no backstory without evidence.

Detects, per sentence: first-person history (`we started`, `years ago`,
`I began`), attributed speech (`a customer told us`, `people say`,
`everyone asks`), and comparative superiority about alternatives.
Requires the sentence's distinctive content to trace to `ownerFacts`.

**Reuses** `storyEcho.storyVocabulary` — it already computes the owner's
strong/ordinary word sets; this inverts the question from "did it use
the story" to "is this story in the record".

Fixes the two known misses by generalising them rather than string-matching:
- *"If you're used to synthetic candles… something that performs"* →
  comparative superiority about an unnamed alternative
- *"fills the room slowly rather than hitting you at the door"* →
  same shape, performance claim with no record

### 4.2 `src/lib/claims/claimCheck.ts` — EDIT
Widen `CLAIM_TERMS` beyond one category's materials, as recorded in
`tests/multiTenantVocabulary.test.ts`'s allowlist reason:
`pure ghee`, `pure silk`, `pure cotton`, `organic`, `handmade`,
`100%`, `A grade`, `export quality`, `FSSAI`, `ISI`, `BIS`.
Grouped in `CLAIM_SYNONYMS` where equivalent, so recording one phrasing
licenses its forms.

**Risk:** every addition makes the guard stricter and may strip copy that
is currently fine.

**GATE (your correction, accepted):** `CLAIM_TERMS` is **not touched
until the dry-run output is in front of you.** `scripts/materialClaimsDryRun.mjs`
exists for exactly this and its own header says the proposed terms stay
off until approved — so 4.2 inherits that discipline rather than
quietly skipping it.

The dry run will cover **three businesses in three categories**:
`candle_by_qaaf`, plus one food/dairy fixture (`pure ghee`, `FSSAI`,
`A grade`) and one textile fixture (`pure silk`, `pure cotton`,
`export quality`) — because a claim list that only generalises past
candles on paper has not been shown to generalise.

**One limitation stated up front:** I cannot read the live database. The
`candle_by_qaaf` known-text fixture is **reconstructed from the repo's
own test fixtures and the recorded live captions**, not pulled from
production. That makes the result indicative, not a production
measurement, and the report will say so in those words. If you want a
real production run, the SQL that produces `candidates.json` is in the
report that accompanies the script and you would need to run it.

4.2 therefore moves **out of step 1** and becomes its own gated step
after you have read the output. The rest of step 1 (4.1 provenance) does
not depend on it.

### 4.3 `src/lib/content/antiGeneric.ts` — NEW (~130 lines)
Two enforced rules.

**Rule 1 — banned universal openers, in all three registers.**
An English-only list would have been a guard that only works on the
copy this business writes least. Hawlai's default register is Hinglish
(`language.ts`), so the Hinglish openers are the ones that will actually
appear.

| English | Hinglish | Hindi |
|---|---|---|
| Struggling with… | …ki tension? / …se pareshan? | …की समस्या? |
| Are you tired of… | Thak gaye ho… / Bore ho gaye… | थक गए हैं… |
| Look no further | Bas yahi chahiye tha / Aapki talash khatam | आपकी तलाश ख़त्म |
| In today's fast-paced world | Aaj ke time mein / Aaj ke zamane mein | आज के ज़माने में |
| Elevate your… | …ko upgrade karo / …ko next level pe | …को बेहतर बनाएं |
| Unlock the… | …ka raaz / …ka secret | …का राज़ |
| Imagine… | Socho zara… / Zara socho… | ज़रा सोचिए… |
| Say goodbye to… | …ko bye bolo | …को कहिए अलविदा |

**Language-aware, not language-blind:** the check runs the list for the
piece's own `normaliseLanguage(language)` register **plus English**,
because an English opener translated badly is still a worn opener and
Hinglish copy mixes English in freely. It does **not** run the Hindi
Devanagari list against a Hinglish piece — those are different scripts
and a cross-script match can only be a false positive.

Detected on the **first sentence only**. Mid-piece, "zara socho" is a
legitimate turn of phrase; as an opener it is the model reaching for the
same move every time. One retry with the opener named, then flagged.

**Rule 2 — at least one recorded specific.** The piece must contain a
product name, a price, an offer, a place, an occasion or an
owner-recorded detail. Zero → retry once → the note from 4.4.

Reuses the retry shape `retryWithStory` already proved, and
`looksHinglish` / `normaliseLanguage` from `content/language.ts` rather
than guessing the register.

**Test, per your correction:** `antiGeneric.test.ts` carries a Hinglish
case for every row of that table, an English case, a Devanagari case,
**and** the two negatives that matter — the same phrase mid-piece must
pass, and a Hindi opener must not fire on a Hinglish piece.

---

### 4.3a Does this actually cover the live incident? — traced, per your question

**The path the five live caption sentences took**, measured:

```
owner's sentence in chat
  -> masterBrainV2 tool `generate_content`            (:1017)
  -> generateContent(..., "draft", { recent })        (:1021)   <- NO revise: true
  -> composePost(result)                              (:4262)
  -> card text + /api/social/post payload
```

| Phase 3 piece | Covers this path? | Why |
|---|---|---|
| 4.1 narrative provenance | **Yes** | It runs where `guardOrMark` already runs, inside `generateContent`, so every caller gets it — the per-surface mistake (F-16) is not repeated |
| 4.3 anti-generic | **Yes** | Same place, inside `generateContent` |
| 4.4 always-run `reviseForSpecificity` | **Yes, and this is the one that was missing** | Line 1021 passes no `revise: true`. The specificity editor **never ran on the live caption.** The page path got it; the chat path, which is where the incident happened, did not |

**So: covered — but only because 4.4 closes F-Q1.** Without that one
change, two of the three new protections would run on the chat path and
the editor that already existed still would not. Worth saying plainly:
the specificity editor was built, tested, and then not wired to the
surface the owner actually uses.

#### The second path you asked about — chat writing caption prose itself

**It exists, and it is only partly covered.** If the model answers "write
me a caption" in its own reply instead of calling the tool, nothing in
`generateContent` runs.

What guards that prose today: `checkReplyClaims`
(`masterBrainV2.ts:4505`, Phase 1 / F-02). What it checks: unsupported
**claims** and unverifiable superlatives, withheld by sentence and
named. What it does **not** check: **genericness, and narrative
provenance.** So an invented founder anecdote typed straight into the
conversation passes today, and would still pass after 4.1 and 4.3 as
scoped.

Two honest options, and I am not going to pick for you:

- **(a) Extend `checkReplyClaims` to run provenance too** — small, same
  file, same withhold-and-name mechanism. Catches the invented anecdote
  in chat prose. Does **not** catch genericness, and should not: a
  conversational reply is allowed to be plain.
- **(b) Leave it, and rely on the system-prompt rule** ("copy a customer
  will read goes through the tool, always"). `replyClaims.ts`'s own
  header already says why that is weak: *"That is a prompt, not code."*

**My recommendation: (a), added to Phase 3 as item 4.10**, roughly 15
lines and one test. It is the same reasoning that justified F-02 in the
first place, and leaving a known hole open because a prompt asks nicely
is the thing that audit found. Say yes and I fold it in; say no and I
record it as a named open gap rather than letting it blur.

### 4.4 `src/lib/agents/contentMarketingAgent.ts` — EDIT (the big one)

This is the sub-item you asked to see spelled out. **It is an inversion,
not a deletion**, and the distinction is the whole design.

#### What exists today, verbatim

`contentMarketingAgent.ts:17`
```ts
import { usesOwnStory, storyForRetry, GENERIC_NOTE } from "@/lib/content/storyEcho";
```

`contentMarketingAgent.ts:212-220` — the gate:
```ts
let generic = false;
if (!usesOwnStory(parsed, facts, language)) {
  const retried = await retryWithStory(parsed, meta.label, meta.instructions, topic, facts, logContext, language);
  if (retried && usesOwnStory(retried, facts, language)) parsed = retried;
  else {
    if (retried) parsed = retried;
    generic = true;
  }
}
if (generic) parsed = { ...parsed, _storyNote: GENERIC_NOTE };
```

`contentMarketingAgent.ts:258` — `export async function retryWithStory(...)`,
whose prompt opens *"This draft uses nothing that belongs to this
business"* and hands the model the owner's story answers.

#### What each of the three becomes

| Today | After | Why |
|---|---|---|
| **`usesOwnStory`** — a **gate**: every piece that fails is retried | **a signal**, not a gate. Stays exported, stays tested, called in two places: (a) About-type content, where the story *is* the subject, so the gate is correct and stays; (b) **inverted** inside `narrativeProvenance` (4.1), which asks the opposite question — "is this story in the record?" instead of "did it use the story?" | The function is right. What was wrong was running it on every piece. A caption about a Diwali offer has no business carrying the founder's batch-ruining anecdote |
| **`retryWithStory`** — retries toward the story | **`retryForSpecificity`** in 4.3 — same mechanism, same JSON-shape-preserving edit-not-regenerate prompt, same "cut a generic line to make room" instruction. The target changes from *the owner's story* to *a recorded product specific*: what's included, the occasion, the price, the real customer quote | The retry machinery is good and was expensive to get right. Only the thing it retries **toward** was wrong |
| **`GENERIC_NOTE`** | **stays, reworded.** Today: *"Nothing from your story made it into this one."* After: names the missing **product** fact — *"This could be any business in your line of work. Add what's included, or the occasion people buy it for, and I can say it."* Paired with `_missingFact` (4.7) so the note names one concrete thing | The note's job — tell the owner rather than quietly ship — is right. Its content was asking for the wrong input |

#### The code after

```ts
// line 17
import { usesOwnStory, storyForRetry, GENERIC_NOTE } from "@/lib/content/storyEcho";
import { isGeneric, retryForSpecificity, genericNote } from "@/lib/content/antiGeneric";

// replacing 212-220
// A piece that any competitor could publish gets ONE retry toward a
// recorded SPECIFIC — not toward the owner's backstory. Until
// 2026-10-09 this retried toward the story, which put a founder's
// anecdote into captions no buyer had asked one about.
let generic = false;
const verdict = isGeneric(parsed, facts, language);
if (verdict.generic) {
  const retried = await retryForSpecificity(parsed, meta.label, meta.instructions, topic, facts, logContext, language);
  if (retried && !isGeneric(retried, facts, language).generic) parsed = retried;
  else {
    if (retried) parsed = retried;
    generic = true;
  }
}
if (generic) parsed = { ...parsed, _storyNote: genericNote(verdict.missing) };
```

**The control flow is byte-for-byte the same shape**: one retry, keep the
retry's answer even when it still fails, note the owner either way,
never retry a business that has nothing to retry toward. That is
deliberate — it is the part that six existing tests pin, and keeping the
shape is what lets those tests keep testing something real.

**Also in this file:** `reviseForSpecificity` is kept and **always run**
(closes F-Q1 — today only 2 of 5 callers pass `revise: true`), and
`craftSection` loses the story-first framing for the 3.2 structure.

#### `storyEcho.ts` is NOT deleted
`storyVocabulary` and `textOfOutput` are the base of 4.1, and
`usesOwnStory` still has the About-content job. Deleting a working
module to express a change of mind is how a codebase loses machinery it
later wants.

### 4.5 The other generators — EDIT, small
`reviseForSpecificity` + anti-generic on: `emailMarketingAgent`,
`whatsappMarketingAgent`, `socialMediaAgent`,
`socialManagementAgent` (customer-copy tasks only),
`retargetingAgent`, `paidAdsAgent`, `seoToolkitAgent`.
Seven one-to-three-line changes, not a wrapper. **The shared
`generateCopy()` wrapper is Phase 3.5, deliberately not here** — doing
both at once makes a regression unattributable.

### 4.6 `src/lib/claims/businessFacts.ts` — EDIT
`formatFactsForCopy` surfaces the new fact-sheet titles under a
**"What a buyer needs to know"** heading, and brings
`brand_profiles.target_persona` into `BusinessFacts` so content, email
and SEO see the audience that today only ads see.

### 4.7 Thin facts (3.5) — EDIT
When the sheet is thin, the generator does **not** invent. It writes from
occasion and situation only, and the result carries
`_missingFact: "burn time"` so the card can say *"Add burn time and I
can say it."* One concrete missing fact, named — not a lecture.

### 4.8 Interview (3.6) — EDIT
`WelcomeChatCard.tsx` gains a skippable, resumable block of **2 questions
at a time** after `avoid_words`, drawn from 3.3's customer-and-product
set. `storyProgress` already reports "5 of 10 saved", so partial state
is already supported. The 10 founder questions stay available and
optional; `how_made` and `materials` count as **product proof** only.

### 4.9 The `note` contract (F-X1) — EDIT
`generate_content` returns a `note` saying a **draft** was saved and
where, so the model stops inventing its own framing. This is the
smallest fix in the phase and it stops *"caption saved to Content —
ready to go"* on a draft row.

---

## 5. Tests

### A correction to my own earlier count

I told you "15 assertions change". **That was wrong, and wrong in the
direction that matters** — it overstated what you are approving. The real
number is **6 tests, in one `describe` block, in one file.**

The 15 `usesOwnStory` uses split into two kinds, and only one kind is
affected:

| | Count | Where | Changes? |
|---|---|---|---|
| **Unit** — calls `usesOwnStory(...)` directly | **11** | `shortStaysSpecific.test.ts:99-130`, `preferredLanguage.test.ts:173,175` | **No.** The function survives unchanged, so its tests survive unchanged |
| **Integration** — calls `generateContent` and asserts the retry | **6** | `shortStaysSpecific.test.ts:169-218`, the one `describe` block | **Yes.** These pin the gate, and the gate is what inverts |

### The 6 that change, before and after

Each keeps its intent and its name's promise. The subject moves from
*story* to *recorded specific*; the mechanism it asserts does not move.

| # | Today's assertion | After | Intent kept |
|---|---|---|---|
| 1 | `:172` retry prompt contains `"uses nothing that belongs to this business"` and `"poora batch kharab kiya tha"` (a story answer) and `"the same length"` and `"under 150 words"` | same four, with the story line replaced by **a recorded product specific** from the fact sheet. The length and format-rule assertions are **untouched** | the retry is an edit, not a regeneration, and it carries the format's own rules |
| 2 | `:184` a first draft that already uses the story → **no second call** | a first draft that already carries a specific → **no second call** | one retry costs money; don't retry what passed |
| 3 | `:191` still generic after the retry → `_storyNote === GENERIC_NOTE` | still generic after the retry → the note is present **and names a missing fact** (stronger than today) | the owner is told, not quietly shipped |
| 4 | `:198` the second real caption the owner got is retried too | same caption, same expectation | the two captions from the live incident stay as regression fixtures |
| 5 | `:205` a business with **no story** is never retried | a business with **no recorded specifics** is never retried | never fail a business for not having written something |
| 6 | `:212` a malformed retry is ignored and the owner told | unchanged except the note's wording | a bad second call must not silently replace a good first one |

**Nothing is deleted and no assertion is loosened.** #3 gets strictly
stronger. If any of the six cannot be rewritten without weakening it, I
stop and bring it to you rather than relaxing it — that is what happened
on 2026-09-14 with `emailPreview.test.ts`, and reverting was the right
call then.

### New
| File | Pins |
|---|---|
| `narrativeProvenance.test.ts` | invented anecdote withheld; invented customer quote withheld; the owner's **recorded** story passes untouched; the two known live misses caught |
| `antiGeneric.test.ts` | each banned opener caught; one retry then flag; a piece with zero recorded specifics flagged; honest copy untouched |
| `customerFirstStructure.test.ts` | a caption carries a benefit from facts **and** a next step; thin facts ask instead of inventing; `_missingFact` names one thing |
| `specificityEverywhere.test.ts` | all seven generators run the editor (the F-Q1 wiring, asserted by execution not grep) |

Mutation checks on each. **Floor:** if a provenance rule strips a *true*
recorded story, that is a stop, not a tuning problem.

---

## 6. Order within Phase 3, and why

1. **4.1 narrative provenance + 4.2 claim terms** — the rule first.
2. **4.8 interview** — supplies the evidence the rule needs.
3. **4.3 + 4.4 + 4.5** — anti-generic and the rewiring.
4. **4.6 + 4.7 + 4.9** — facts surfacing, thin-facts path, note contract.

**Why the rule before the interview:** if the interview lands first,
every business suddenly has rich story facts and no rule governing
invented ones — the exact window where fabrication is most likely and
least visible.

Four commits, each with real exit codes and mutation results.

---

## 7. Risks I am watching

1. **False positives in 4.1** — stripping a true story is worse than the
   problem. Three existing assertions already encode "a real detail must
   survive"; they are the floor.
2. **4.2 makes the guard stricter** — dry-run against real businesses
   before enabling, same discipline as the materials dry-run.
3. **Cost** — `reviseForSpecificity` on all seven generators is one extra
   `standard`-tier call per piece. ~₹0.50–1.50 each at current pricing;
   I will put the real figure from `costOfClaudeCallInr` in front of you
   before 4.5.
4. **Quality is unproven until Phase 4.** This phase cannot claim the
   copy got better. It can claim invented copy got harder. The benchmark
   is what decides, and the pass mark gets fixed before any score.

---

## 8. Not in Phase 3

The `generateCopy()` wrapper and the `angle` artefact (3.5) · intent
routing · per-piece performance (3.6) · the benchmark (4) · consent
(6) · any new department, tool or page.
