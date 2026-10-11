# Phase 3.5 — `generateCopy()`: one door

**Status:** plan only. Nothing in this document is built. Verified
against the repo on 2026-10-11 by reading the files, not from memory.

---

## The problem in one paragraph

Every protection in this codebase lives inside **one** generator. The
Content Marketing agent has the customer-first check, the word cap, the
anti-generic check and the specificity editor. **No other path has any
of them.** Eleven paths have no claims check at all. This is the F-16
shape — the mistake behind the 8 October Facebook incident and the 11
October founder-story post — and I have now committed it three times
while fixing it: each new protection went into the generator I was
looking at, so every other generator started unguarded.

A guard that lives in a generator protects that generator. A guard that
lives in a door protects everything that comes through the door.

---

## 1. Every path that writes copy today

Read out of the files on 2026-10-11. "Claims" means the output is
actually checked, not that facts were put in the prompt.

### 1a. Paths the claims layer reaches

| Path | File | Claims | Provenance | Customer-first | Word cap | Anti-generic | Specificity |
|---|---|---|---|---|---|---|---|
| Master Chat → content | `masterBrainV2` → `contentMarketingAgent` | `guardOrMark` | yes | **yes** | **yes** | **yes** | **yes** |
| Content department | `agents/contentMarketingAgent.ts` | `guardOrMark` | yes | **yes** | **yes** | **yes** | **yes** |
| Autopilot (**unattended**) | `automation/contentAutopilot.ts` → `generateContent` | `guardOrMark` | yes | yes | yes | yes¹ | no¹ |
| Email department | `agents/emailMarketingAgent.ts` | `guardOrMark` | yes | no | no | no | no |
| WhatsApp | `agents/whatsappMarketingAgent.ts` | `guardOrMark` | yes | no | no | no | no |
| Social management | `agents/socialManagementAgent.ts` | `guardOrMark` | yes | no | no | no | no |
| Paid ads | `agents/paidAdsAgent.ts` | `guardOrMark` | yes | no | no | no | no |
| Retargeting | `agents/retargetingAgent.ts` | `guardOrMark` | yes | no | no | no | no |
| Ad engine | `lib/adEngine.ts` | `guardGenerated` | yes | no | no | no | no |
| SEO toolkit | `agents/seoToolkitAgent.ts` | `guardGenerated` | yes | no | no | no | no |
| Website builder | `agents/websiteBuilderAgent.ts` | `guardBlockTree` | yes | no | no | no | no |
| Brand kit | `agents/brandBuildingAgent.ts` | `guardDepartmentOutput` | yes | no | no | no | no |
| Chat's own prose | `lib/chat/replyClaims.ts` | `stripUnsupported` | yes | no | n/a | no | no |
| Chat widget / bot | `agents/chatbotAgent.ts` | `stripUnsupported` | yes | no | n/a | no | no |
| Social post read/write | `agents/socialMediaAgent.ts` | `stripUnsupported` | yes | no | no | no | no |
| Graphic design text | `lib/graphicDesign/generateDesign.ts` | `stripUnsupported` | yes | no | no | no | no |
| Page meta / page edits | `lib/pages/editPage.ts` | `stripUnsupported` | yes | no | no | no | no |
| Strategy calendar drafts | `lib/strategy/calendar/write.ts` | `findUnsupportedClaims` only² | **no**² | no | no | no | no |

¹ The unattended path is deliberately single-shot: no retry, and a
generic verdict makes it skip the run rather than post. That decision
stands and `generateCopy` must preserve it.

² `findUnsupportedClaims` reports; it does not strip, and it does not
run provenance. Counted as partial, not as covered.

### 1b. Paths that bypass the claims layer entirely

Eleven. Each one gathers facts and puts them in the prompt, and then
**nothing checks what came back**.

| Path | File | Reaches a customer as | Route |
|---|---|---|---|
| Lead message | `agents/contentAgent.ts` | a message sent to a lead | `api/leads/[id]/generate-message` |
| Blog post, keywords, page title | `agents/seoAgent.ts` | a published blog post | `api/seo/blog-post`, `api/seo/keywords` |
| SEO landing pages | `agents/seoPageAgent.ts` | published pages | `api/seo-pages` |
| Website copy | `agents/websiteAgent.ts` | the live site | `api/website/generate-copy` |
| Product descriptions, copy variations, video scripts | `agents/creativeAgent.ts` | product pages, ads, scripts | `api/creative/*` |
| Influencer outreach | `agents/influencerAgent.ts` | a message sent to a person | `api/influencer` |
| Retention messages | `agents/retentionAgent.ts` | a message sent to a customer | `api/retention/generate-message` |
| Video marketing copy | `agents/videoMarketingAgent.ts` | captions and scripts | `api/video-marketing/generate` |
| AEO answers | `agents/aeoAgent.ts` | published answers | `api/seo/toolkit` |
| Ad copy edits | `agents/campaignEditAgent.ts` | live ad platforms | `api/approvals/[id]` |
| CRO copy suggestions | `agents/croAgentV2.ts` | site copy the owner pastes | `api/cro/generate` |

**And a second F-01.** These eleven get their truth rules from
`factsPrompt()` in `businessFacts.ts`:

```ts
export function factsPrompt(f) {
  return f ? `\n\n${formatFactsForCopy(f)}\n\n${COPY_TRUTH_RULES}\n` : "";
}
```

That is the exact fail-open shape F-01 was about. `truthBlock()` was
written to fix it and always emits the rules; `factsPrompt()` was left
alone and still drops them when a records read fails. Eighteen files
call it. **Unverified** whether this has ever fired in production — the
cost log would not show it.

### 1c. What this table says

- **Claims and provenance are broad** — 18 paths, because they were
  moved into `stripUnsupported`, which everything funnels through.
- **Everything learnt since 8 October is narrow** — customer-first, the
  word cap, anti-generic and the specificity editor exist on **one**
  path out of 29.
- The eleven bypasses include four that **send or publish to a person**:
  lead messages, influencer outreach, retention messages, ad edits.

---

## 2. `generateCopy()` — the one door

New file: `src/lib/content/generateCopy.ts`.

### The input is records, and the story is separate

```ts
export type CopyRequest = {
  surface: CopySurface;        // "email" | "facebook_post" | ... , one per platform
  topic: string;               // what the owner typed, verbatim
  facts: BusinessFacts | null; // the records. null is a state, not an absence
  mode: ClaimsMode;            // "draft" | "publish"
  language?: string;
  recent?: string[];           // what has gone out lately, for repetition
  revise: boolean;             // false on every unattended path
  storyAllowed?: boolean;      // DEFAULT FALSE
};
```

`storyAllowed` is the thing I keep getting wrong, so it is a separate
field with a default of `false`. The owner's story is **not** an input
to ordinary copy. It becomes an input only when `askedForStory(topic)`
is true — "write our story", "hamari kahani" — and the only way to set
it is from what the owner typed. No generator may pass `true` on its
own; a test pins that.

### The output is one shape

```ts
export type CopyResult = {
  text: string;                 // the prose, already tightened and guarded
  fields: Record<string, string | string[]>;  // headline, subject, bullets — content keys only
  hashtags: string[];
  note: string | null;          // the ONE sentence the owner reads
  state: FactsState;            // FACTS_AVAILABLE | FACTS_UNAVAILABLE
  removed: string[];
  substantiation: string[];
  narrative: NarrativeFinding[];
  droppedSentences: number;
  publishable: boolean;         // false when an unattended path must skip
};
```

`publishable` is the field the unattended paths read. Today
`contentAutopilot` decides for itself whether a generic verdict means
skip; after this it asks.

### What runs inside, in order

Order matters and each step is justified by something that went wrong:

1. **Prompt assembly** — `truthBlock(facts)`, never `factsPrompt`. The
   truth rules are a static string and do not depend on a successful
   database read (F-01).
2. **Customer-first brief + word cap** — stated as a number in the
   prompt, not a range inside a sentence of prose. "80–150 words,
   community-toned" produced a 224-word post.
3. **The model call** — through `lib/ai/claude.ts`, never the SDK.
4. **Internal-key strip** — `contentKeys.isContentKey`. A key the model
   invented for its own bookkeeping reached a live caption on
   11 October; an allowlist by shape is the only thing that holds.
5. **Claims**, through `guardOrMark` → `stripUnsupported`, with the
   **comparative and performance rules enabled** (section 2a).
6. **Provenance** — already inside `stripUnsupported`, so it comes free.
7. **Anti-generic**, and on `revise: true` one retry.
8. **Customer-first measure + tighten** — and the price and link lines
   are never cut (already built, see section 5).
9. **The note contract** — one sentence, one priority order, below.

### 2a. The comparative and performance rules, enabled here

You approved these. They move from `scripts/comparativeDryRun.mjs` into
`claimCheck.ts` as part of building this door, not as a separate commit:

- `separates X from Y` / `sets it apart from`
- a pejorative **attributed** to the rival ("cheap synthetic
  alternatives") — the mirror of the existing negated form
- `unlike most/other PRODUCTS` (product nouns only after
  most/other/the, never bare — "unlike anything you've smelled" is
  flourish)
- `most/other X don't`
- a spelled-out duration ("twenty minutes")
- a performance duration ("the scent lasts")

Dry run, 3 businesses, 17 lines: **9 of 9 problem lines flagged, 0 false
positives.** Recorded durations survive — "40 hour burn", "24 ghante",
"eleven years".

### 2b. The note contract

Today four different notes can be set and the last writer wins. The
contract:

1. a claims strip (something was **removed**) — most urgent, it changed
   the copy
2. a safety or vulnerable-group claim
3. shape: too long, or story-dominant
4. substantiation: kept, and here is how to make it sayable
5. genericness

One note. If two apply, the higher one is said and the lower is
dropped — saying both reads as noise and the owner stops reading. The
key stays `_storyNote`, because the chat card and
`GeneratedOutputPanel` both read that name and renaming it would
silently stop the owner seeing any of this.

---

## 3. Migration order, and the invariant

**Email first**, as you asked.

| # | Surface | Why this order |
|---|---|---|
| 1 | **Email** | has claims already, so the delta is the new measures; and the send is gated by an approval, so a mistake is caught by a person |
| 2 | Facebook / Instagram | where both live incidents happened |
| 3 | WhatsApp, social management | same shape as 2, already have claims |
| 4 | Paid ads, retargeting, ad engine, ad edits | money, but short copy |
| 5 | SEO (blog, pages, toolkit, AEO) | long-form, needs its own cap decision |
| 6 | Website builder, website copy, CRO | block trees, a different output shape |
| 7 | **The four that send to a person**: lead message, influencer, retention, autopilot | last, because each needs its own execution test against a real send path, and these are the four with no claims check at all today |

Each step: an **execution test** that drives the real path end to end
(not a source grep), plus mutation checks, plus `tsc` / `vitest` /
`next build` exit codes pasted.

### The invariant test

`tests/oneDoorForCopy.test.ts`. It fails when a new generator writes
customer-facing copy outside `generateCopy`.

- it reads the import graph for every file under `src/lib/agents/`,
  `src/lib/chat/`, `src/lib/automation/` and `src/app/api/` that calls
  `callClaude`,
- and asserts each one either imports `generateCopy` **or** appears in a
  dated allowlist with a reason,
- using `code()` so a comment cannot satisfy it (rule 8),
- and the allowlist **shrinks only**: an entry whose file now imports
  `generateCopy` fails the suite until the entry is deleted, the same
  way `sourceGrepDiscipline.test.ts` works.

The allowlist starts with every path not yet migrated and ends empty.
That makes the backlog visible instead of rotting, and it is what makes
this phase finishable rather than a permanent "mostly done".

**What the invariant does not catch:** a path that imports
`generateCopy` and then also calls the model directly for a second
piece of text. Stated as a known limit, not a protection.

---

## 4. Health / benefit rules — dry run

`scripts/benefitClaimsDryRun.mjs`. **Not enabled.** Shown here because
you asked to see it before deciding.

**Why a new class, not a widening.** `HEALTH` exists in `claimCheck.ts`
and it is strict, but it needs a medical verb or a named condition:

| line | existing HEALTH rule |
|---|---|
| "Relieves stress" | **caught** |
| "Sleep better" | missed |
| "Wake up refreshed" | missed |
| "Helps you relax" | missed |
| "Good for the skin" | missed |

Five proposed rules: sleep/rest, mood/calm/focus, body/skin/digestion,
therapeutic framing, and safe-for-a-vulnerable-group.

**Result, 3 businesses, 18 lines: 10 of 10 problem lines flagged, 0
missed, 0 false positives.**

```
FLAG  "Light it an hour before bed and sleep better."   sleep / rest effect
FLAG  "It helps you relax after a long day."            mood / calm / focus
FLAG  "Aromatherapy for your evenings, a stress buster" therapeutic framing
FLAG  "Non-toxic and safe for babies."                  vulnerable group (claim)
FLAG  "Bilona ghee aids digestion and supports immunity." body / digestion
keep  "Soy wax, 40 hour burn. 550."
keep  "It smells of lavender and a little vanilla."     a smell is not an effect
keep  "Har candle 24 ghante set hoti hai."
keep  "Churned by hand, the way it has always been done."
keep  "Paraben free, as printed on the label."
```

The first draft of the body rule missed "Good for **the** skin" for
want of one word. That is what the dry run is for, and it is why these
go in front of you before they go live.

**Tier: `substantiation`** — kept in a draft with a note saying how to
make it sayable, stripped on publish. A benefit the owner has actually
recorded is theirs to say.

**One exception I want to argue for: the vulnerable-group rule as
`claim`, strict in both modes.** "Safe for babies", "non-toxic",
"hypoallergenic" on an untested product is the one claim in this set
that can hurt somebody, and a draft is one click from a customer. Your
call; I will not enable either tier without your word.

---

## 5. Already built, not yet committed

The price-and-link protection you asked for is written and green, and it
will land with the first commit of this phase rather than on its own:

- `carriesTheOffer()` — a sentence holding a price, a percentage off, a
  URL, a domain, "link in bio" or "order on …" is **never cut**, even
  when keeping it leaves the piece over the cap
- a specification is **not** a price: "40 hour burn" and "24 ghante"
  stay cuttable, or tightening would stop working
- when the offer keeps it over the cap, the note says so rather than
  claiming "it is one long sentence"

9 new tests. Mutation checks were interrupted and will be re-run before
the commit.

---

## 6. What could go wrong

| Risk | What I will do |
|---|---|
| One door, 29 callers: a bug in `generateCopy` breaks everything at once | migrate one surface per commit, each with its own execution test; the door is additive until a surface is switched over |
| The 11 unguarded paths start failing loudly once guarded | that is the point, but it will look like a regression to you. Each migration commit will say what the guard now strips on that surface |
| Long-form (blog, SEO pages) has no sensible word cap | surfaces without a cap entry get none; a cap of zero is not the same as no cap |
| A surface needs a note the contract has no slot for | the contract gets a new slot in the same commit, never a second note |
| `factsPrompt`'s fail-open | fixed as part of step 1, with a test that the truth rules survive a null facts read |

---

## 7. What I need from you

1. **Go / no-go on this plan.**
2. **The health/benefit tier**: `substantiation` for all five, or
   `claim` for the vulnerable-group rule as I have argued.
3. Confirmation that **email first** is still right given that step 7
   (the four that send to a person) is the set with no claims check at
   all today — I have put them last because they need the most careful
   tests, but they are also the ones currently least protected. Say the
   word and I will move them to step 2.
