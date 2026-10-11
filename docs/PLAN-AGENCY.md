# PLAN-AGENCY — the autonomous marketing agency

**Status: plan only. No code written. Awaiting founder approval.**
Repo `main` at `832ca3e`. Everything below was verified by reading the
files named, on 2026-10-11. Anything not verified says so.

> **One missing input.** The direction note refers to
> `docs/Hawlai-autonomous-agency-plan.md` as "I will attach it". It is
> **not in the repo and was not attached** — `ls docs/` shows
> DATABASE, DECISIONS, HAWLAI_CONTEXT, LIVE-CHECK-3.5, PLAN-PHASE-3.5,
> PRINCIPLES, UX_TRANSFORMATION_AUDIT and this file. Sections C–F below
> are therefore designed from the direction note and the code, not from
> that document. **If it contains decisions that differ from this, this
> document is wrong and should be re-read against it before any code.**

---

## A) Step 0 audit — the business story, every place it is used

**Founder decision being applied:** no story intake, no story text in
customer copy; copy comes from product and business facts only.

### A.0 — The one thing to read first

There is an ordering constraint, and it is the most important finding in
this section.

**Anti-generic detection currently gets most of its vocabulary from the
story rows.** `storyEcho.storyVocabulary()` builds the "words only this
business could say" set, and it reads story rows at
`src/lib/content/storyEcho.ts:93`, `:110`, `:143`, `:179`.
`antiGeneric.ts:266` then asks `hasStory` before it will judge a piece
generic at all.

So if the story is deleted **before** the Facts extractor (section C)
lands, the result is not neutral: the specificity check loses its
evidence, more copy reads as generic, and the retry has less to retry
toward. **Section C is a prerequisite for section A's deletions, not a
follow-up.** Recommended order: build C, point `storyVocabulary` at the
extracted facts, then delete.

### A.1 — Delete (no production callers today)

| What | Where | Evidence it is already dead |
|---|---|---|
| `usesOwnStory`, `storyForRetry`, `GENERIC_NOTE` | `src/lib/content/storyEcho.ts:166,177,184` | Only callers are `tests/preferredLanguage.test.ts`, `tests/shortStaysSpecific.test.ts`. `contentMarketingAgent.ts:18` states this in a comment and the comment is accurate |

### A.2 — Delete (live, and the direction note removes their reason to exist)

| # | What | Where | Note |
|---|---|---|---|
| 1 | **The story block in the generation prompt** | `src/lib/claims/businessFacts.ts:712-725` | **The single highest-value deletion.** It injects the story in full, untruncated, into every public-copy generator under the words *"use these specifics; they are what makes this business different"*. This instruction is the direct cause of the 11 October founder-story post |
| 2 | Chat intake tools | `masterBrainV2.ts:734` (`business_story`), `:739` (`save_business_story`), handler `:3346-3371` | Removing the tool definitions stops the chat from ever starting an intake |
| 3 | Question set and progress helpers | `businessStory.ts:35` `STORY_QUESTIONS`, `:98` `storyQuestion`, `:105` `storyProgress`, `:137` `storyStatus`, `:151` `sameAnswer`, `:157` `cleanStoryAnswer` | Dead once (2) goes |
| 4 | Story facts for retargeting | `src/lib/retargeting/messages.ts:47` | Returns story rows for retargeting copy |
| 5 | `business_story` from the category picker | `src/components/settings/KnowledgeBaseView.tsx:13` | Removes it as a **choice**; see A.3 for why the label must survive |
| 6 | `askedForStory` as a live branch | `customerFirst.ts:99`; consumed at `generateCopy.ts` (`req.storyAllowed ?? askedForStory(req.topic)`) | Under the new rule there is no request that makes the story the subject. `storyAllowed` becomes a hard `false` |

**Keep `STORY_CATEGORY` itself** (`businessStory.ts:33`). It is the
string `"business_story"`, and A.3 needs it to recognise and exclude
rows that already exist.

### A.3 — Must stay as defensive code

The rows do not disappear because the intake does, and an owner can
still type a story into Business Knowledge, the brand description, or
their own website. Every item here guards against text that arrives by
a route the intake never controlled.

| What | Where | Why it must stay |
|---|---|---|
| `personalStories` — `splitStories`, `withheldNote`, `needsConsent` | `src/lib/claims/personalStories.ts`; consumers `businessFacts.ts:722`, `api/business-knowledge/route.ts`, `KnowledgeBaseView.tsx:5`, `chatbotAgent`, `socialManagementAgent` | A customer's private situation can still arrive in a `general` or `faq` row. The dated case in `businessFacts.ts:714-721` is a real customer whose husband was in an accident. `tests/customerStoryConsent.test.ts` pins it. **Deleting this would be the worst mistake available in this phase** |
| `narrativeProvenance` (whole module) | `src/lib/claims/narrativeProvenance.ts`, called inside `stripUnsupported` | It asks "is this backstory on the record?". With intake gone, **nothing licenses a story, so this gets stricter by itself** — which is exactly the founder's intent. It is also what catches a story the model invents to fill the gap |
| `ownerVoice.OWNER_VOICE` | `src/lib/content/ownerVoice.ts` | One shared list, used by both `narrativeProvenance` and `customerFirst`. The file's header records what happened when they were two lists |
| `customerFirst` — word caps, `tightenToCap`, `carriesTheOffer`, `customerFirstNote` | `src/lib/content/customerFirst.ts` | Length, tightening and never-cut-the-price are unrelated to the story and were live-verified work. The `story_dominant` measure becomes mostly redundant once provenance strips unlicensed stories, but **keep it**: it is the only check that measures *proportion* rather than *truth* |
| `storyEcho` — `textOfOutput`, `COMMON`, `storyVocabulary`, `ORDINARY_MATCHES_NEEDED`, `ordinaryMatchesNeeded` | `storyEcho.ts:150,46,91,130,140` | `textOfOutput` is used by `customerFirst` and `antiGeneric` and is not story-specific. `storyVocabulary` **stays but changes source** — see A.0 |
| Rendering of existing `business_story` rows | `KnowledgeBaseView.tsx` | An owner must still be able to see and delete what they already wrote. Hiding the rows would look like data loss |

### A.4 — Migrations

**None. Not even a reversible one, for step 0.**

The cleanest change is code-only: stop reading `category =
'business_story'`. The rows stay, untouched and visible, and the whole
step reverts by restoring one block in `businessFacts.ts`.

If you later want them out of the evidence set permanently, the
smallest safe step is `update business_knowledge set is_active = false
where category = 'business_story'` — reversible, no row deleted. **Not
recommended now**: it is irreversible in practice if an owner then
edits a row, and it buys nothing that ignoring the category does not.

### A.5 — What the owner will notice

- The chat stops offering the Business Story interview.
- Copy stops containing first-person history. **This is the point.**
- More pieces will be flagged generic until section C lands, because
  product facts are a thinner vocabulary than a story (A.0).
- Existing story rows stay visible under Business Knowledge, and stop
  affecting copy.

---

## B) Step 1b — why "free shipping" passed

**Status: CONFIRMED by reading code. The surface did not matter.**

The rule works. I extracted the live regex and executed it:
`FREE_SHIPPING` matches "Free shipping on every order." and "Order
today and get free shipping." The check is at
`src/lib/claims/claimCheck.ts:771`:

```ts
const freeShipping = text.match(FREE_SHIPPING);
if (freeShipping && !said(freeShipping[0])) { … }
```

Three candidate explanations, and two are ruled out:

- **Not draft-mode leniency.** It pushes through `reasons.push(...)`,
  which is tier `claim` — strict in both draft and publish.
- **Not a surface bypass.** Both named paths (Master Chat → Generate
  Email, and the content-marketing Facebook post) now run through
  `generateCopy` → `guardOrMark` → `stripUnsupported`.
- **It was licensed by `said()`.** This is the answer.

### B.1 — The licence source, exactly

`said(phrase)` is `knownText(f).includes(normalise(phrase))`, and
`knownText` (`businessFacts.ts`) concatenates the live site's headings,
paragraphs, buttons and meta descriptions, product names and
descriptions, offer labels, owner facts, pillars and the brand
description into **one undifferentiated proof blob**. "Free shipping"
anywhere in any of those licenses it everywhere.

### B.2 — And yes: Hawlai's own site text can license a claim (F-2)

`src/lib/claims/businessFacts.ts:445-450`:

```ts
const reviewed = Boolean(dealership?.claims_reviewed_at);
pages = rows.map((p) => ({
  …
  ...blocksText(reviewed ? ownerWritten(p.sections) : p.sections),
```

**Hawlai-generated page text is excluded from the evidence set only
once `dealerships.claims_reviewed_at` is set.** Until then, `p.sections`
goes in whole — including every line `websiteBuilderAgent` wrote. The
comment immediately above it says so plainly: *"an invented line became
the proof that approved the same line everywhere else."*

`claims_reviewed_at` is written in exactly one place:
`POST /api/seo/claims-review` (`route.ts:97`), i.e. only when the owner
finishes the claims-review list. Column added in migration 207.

**So the most likely chain, end to end:**

1. The website builder wrote "free shipping" onto a page (it had no
   output guard until Phase 3.5 step 7, and the builder is still one of
   the four surfaces outside the door).
2. `claims_reviewed_at` is null for this business, so that page text is
   evidence.
3. `said("free shipping")` is true.
4. Every surface — email, caption, anything — may now state it.

**Two queries settle it.** Read-only, for you to run:

```sql
select claims_reviewed_at from dealerships where dealership_name ilike '%qaaf%';
```

```sql
select p.slug, p.sections::text ilike '%free shipping%' as mentions_free_shipping
from website_pages p
join websites w on w.id = p.website_id
join dealerships d on d.id = w.dealership_id
where d.dealership_name ilike '%qaaf%';
```

If `claims_reviewed_at` is null **and** any page mentions it, the
diagnosis is confirmed with no ambiguity left.

### B.3 — What follows

A regex cannot fix this; the rule already fired. The fix is the
evidence model: **a fact must carry where it came from, and
machine-written text must never be proof.** That is section C, and B is
the strongest argument for doing C before anything else.

Interim mitigation, one line, available immediately: invert the default
at `businessFacts.ts:445` so generated text is excluded **unless**
review is complete. The existing comment explains why it was written the
other way round — before review, excluding text the owner has never been
shown would silently strip copy they cannot put back. **That reasoning
applies to the SITE, not to the EVIDENCE SET.** Keeping the page text on
the page while refusing to treat it as proof satisfies both.

---

## C) The Facts extractor

### C.1 — The problem it solves

`BusinessFacts` (`businessFacts.ts:97-150`) has **no provenance of any
kind**: no `source`, no `confidence`, no `asOf`. A catalogue row, a
sentence the owner typed, and a sentence Hawlai wrote on their website
are all equally "verified". Section B is what that costs.

### C.2 — The shape

One record type, and the vocabulary is **already in the repo** —
`src/lib/signals/signals.ts:26` defines `counted | observed |
inferred`. Reuse it; do not invent a second scale.

```
FactRecord {
  key         "shipping.free" | "product.lavender.burn_hours" | "policy.returns"
  value       string | number | boolean | null        (null = unknown, explicitly)
  unit        "hours" | "inr" | null
  source      "catalogue" | "shipping_config" | "owner_stated"
              | "site_owner_written" | "site_schema_org" | "measured"
  sourceRef   table+id, or page slug + block id, or URL
  confidence  "counted" | "observed" | "inferred"
  observedAt  timestamp
  expiresAt   timestamp | null
}
```

### C.3 — Sources, and what each may license

| Source | Reads from | Confidence | May license a customer-facing claim? |
|---|---|---|---|
| `catalogue` | `products` (`CATALOG_COLUMNS`, `businessFacts.ts:~160`) | counted | **Yes** |
| `shipping_config` | the store's shipping mode/rate/threshold, via `computeShippingAmount` — the same function checkout uses | counted | **Yes** |
| `measured` | `page_events`, `orders`, `leads` | counted | **Yes**, for numbers only |
| `owner_stated` | `business_knowledge` rows | observed | **Flag, do not authorise.** Tier `substantiation`: kept in a draft with "write this on your product and I can say it" |
| `site_owner_written` | page props where `ownerWritten()` keeps them (`businessFacts.ts:300`) | observed | Yes, with the owner named as the source |
| `site_schema_org` | JSON-LD on the live site | observed | Yes — it is a machine-readable statement the business publishes |
| **Hawlai-generated page text** | anything `ownerWritten()` drops | — | **Never. Not a source at all.** |

### C.4 — Rules

1. **Unknown stays unknown.** `BusinessFacts.unreadable: string[]`
   already exists (`:148`) and `FACTS_UNAVAILABLE_BRIEF` already tells
   the model "nothing here can be checked". Extend, don't replace.
2. **One factual question, at most, and only when a key fact is
   missing.** Key facts = price, shipping, and the composition or
   duration claim the copy wants to make. The question is asked once,
   recorded as `owner_stated`, and **never asked again whatever the
   answer** — including "I don't know", which is itself recorded.
3. **`knownText` is retired as a single blob.** `said(phrase)` becomes
   `licensedBy(phrase)` returning the `FactRecord` that licenses it, or
   null. A claim with no licensing record cannot pass, and the note can
   finally say *which* record would make it sayable.
4. **Freshness.** A price older than its `expiresAt` is `unknown`, not
   true. `signals.ts` already has per-source expiry to copy.

### C.5 — How it is tested

- A Hawlai-written site sentence must not license a claim — the exact
  B.2 case, as an execution test.
- An `owner_stated` "free shipping" must come back `substantiation`
  tier, not authoritative.
- A `shipping_config` free-above-₹X store may say it **with** the
  threshold, and not without — `claimCheck.ts:779-785` already encodes
  this; the extractor must not lose it.
- Mutation: strip `source` from a record and the licence test must fail.

---

## D) Eval harness, and the sentence-support verifier

### D.1 — Why the harness comes first

There is **no real-model evaluation anywhere**: of 254 test files, 77
stub `fetch`, 6 mock the client, and one merely mentions
`ANTHROPIC_API_KEY`. Every claim rule is tested against fixtures I
wrote — which is precisely how four dry runs each missed a category the
next one found (service durations, "after two days", "cheap candles").

**Without the harness there is no way to know whether the verifier in
D.3 helps or how much honest copy it destroys.** It is the measuring
instrument, and it must exist before the thing it measures.

### D.2 — The harness

- **Fixtures:** 3 businesses (products / services / food), each with
  complete facts, sparse facts, and unreadable facts.
- **Cases:** ~30, covering the nine scenarios in the earlier audit —
  including Hindi/English/Hinglish, a capability claim, a disconnected
  integration, and a tenant-isolation probe.
- **Metrics, per run:** unsupported claims in final output; exact
  price/offer/date errors; wrong capability claims; correct
  "unknown" handling; **honest sentences wrongly removed** (the cost
  side, and the one that decides whether the verifier ships); tenant
  leakage; approval bypass; latency; INR cost.
- **Thresholds, proposed:** unsupported claims **0** on publish-mode
  output; wrong capability claims **0**; over-removal **under 5%**;
  everything else recorded as a baseline before any target is set.
- **Cost control:** runs only behind an explicit flag, never in CI by
  default, with the per-run INR printed before it starts. **This needs
  your approval: it spends real model money.**
- **Honest limit:** passing 30 cases does not mean zero production
  failures. It means the rate is measured instead of assumed.

### D.3 — The sentence-support verifier (allowlist)

A sentence-level pass over copy, **in addition to** the lexical layer:

1. Split into sentences (`pieces()` already exists and handles URLs and
   emoji-as-full-stop — `claimCheck.ts:765`).
2. Classify: does this sentence **assert something checkable**? A
   number, a superlative, a comparison, an effect on the reader, a
   capability claim, a policy. Description and feeling are not claims
   and are skipped — *not every creative sentence needs a citation*.
3. For each checkable sentence, ask for a verdict against the
   `FactRecord` set: `supported` (with the licensing record quoted) /
   `unsupported` / `unknown`.
4. Return verdicts into the **existing three tiers** (`price`, `claim`,
   `substantiation` — `claimCheck.ts:499`), so every downstream note,
   card and test keeps working.
5. Partially supported sentences: **rewrite to drop only the
   unsupported clause**, keeping the rest. `siteClaimsReview.withoutSentence`
   (`:400`) already removes one sentence from one field without
   mangling markup — the same approach, one clause finer.
6. **Re-verify after every transformation** — retry, tighten, subject
   fix, hashtag append. Today `generateCopy` re-measures shape after a
   retry but the claims pass runs once, last.

### D.4 — The 1a regexes are a stopgap, and here is their expiry

The three cheap fixes (widen `ATTRIBUTED_PEJORATIVE` to product nouns,
add `after` to `SPELLED_DURATION`, add a capability-claim rule) ship
now because they are a day's work and the live post is already wrong.

They are **explicitly temporary**, and the condition is written down:
once D.3 beats the lexical layer on D.2's eval set — same or fewer
unsupported claims, no more over-removal — **the narrow rules are
deleted**, not kept "just in case". A duplicated guard is how
`ownerVoice.ts` came to exist; two lists that drift are worse than one.

Until then they stay, with a comment naming this document and the
condition.

---

## E) The Daily Owner Report

### E.1 — Reuse, don't build

The scheduling plumbing exists and is proven:
`src/lib/leads/scheduledExport.ts:66` `runScheduledLeadExport` — first
in the `signals` cron group precisely because *"it's the one that
reaches a person"* (`cronGroups.ts:36`). It already has
`ownerEmail(owner_id)`, `isExportDue(frequency, lastSentAt, today)`, a
`lead_export_log` table and a per-business frequency column.

**It is the only recurring owner email in the product, and it sends a
lead CSV — not a digest.** The digest copies its shape.

### E.2 — Grounding, which also already exists

`src/lib/reports/narrativeCheck.ts` provides `allowedNumbers()`,
`narrativeProblems()`, `keepConsistent()` and `describeNumbersForPrompt()`.
Its **only consumer today is `growthAdvisorAgent.ts:127-135`** — the
on-demand growth report.

So: *the one report whose numbers are verified is the one that isn't
scheduled, and the two that are scheduled (`reportSnapshot.ts`, weekly
and monthly) are saved to a table and never number-checked.* The digest
closes both halves at once.

**Rule: every number in the digest comes from `allowedNumbers()`.** A
sentence containing a number that is not in that set is dropped, not
reworded.

### E.3 — Content, four sections, nothing else

1. **Yesterday, counted** — visitors (`page_events`), leads, orders,
   spend. Each with `Loaded<T>` state (`dataState.ts:34`) so
   "not connected" never renders as 0.
2. **What Hawlai did** — from `content_autopilot_log`, the approvals
   table and the daily-run summary. Only completed rows. **Never a
   pending row described as done** — this is the capability-claim rule
   from 1a, applied to the report.
3. **Waiting for you** — open `pending_approvals`, oldest first, with
   the one-click link.
4. **Next** — the planner's up-to-three actions (section F). Before the
   planner exists, this section is omitted rather than filled with
   something vaguer.

### E.4 — Safety

- Off by default; opt-in per business, like the lead export.
- Goes to the owner's own address via `ownerEmail` — never a lead.
- Logged per send, like `lead_export_log`, so a silent failure is
  visible.
- If the numbers cannot be read, it says so and sends nothing else.
  **A digest that guesses is worse than no digest.**

---

## F) The Planner

### F.1 — What exists, and what is honestly missing

`src/lib/orchestrator/goalOrchestrator.ts:10` says in its own words:
*"This is NOT an autonomous 'decide what to do next' planner — it only
auto-completes a goal once its real work is actually done."* Verified.

`opportunityAgent.ts` does detect candidates from nine sources and
writes `opportunities` rows — but **every row carries `action_href`, a
dashboard URL for the owner to click** (`:49,59,69,79`). Nothing in the
feed is addressed to a Hawlai tool. That, in one line, is the agency
gap.

### F.2 — Inputs

| Input | Source | State |
|---|---|---|
| Signals | `signals.readSignals` — dated, with `confidence` and `source_url` | **exists** |
| Baseline | `growthAdvisorV2.ts:75-101` — 8 weeks of real lead counts, linear fit, residual range, returns `null` rather than guessing | **exists, reuse** |
| Targets | — | **missing.** A stored number + actual-vs-target. Before 2–4 weeks of data it must say **"still learning"**, never a benchmark |
| Capability registry | `executionPolicy.ACTION_POLICIES` + `AUTOMATION_TOGGLES:170` | **exists** |

### F.3 — Output

**At most three actions per day.** A cap, not a guideline: a list of
twelve is a list the owner ignores, and the point is that Hawlai
chose.

Each action carries:

- **evidence** — the signal id(s) and the counted numbers behind it. An
  action with no evidence is not proposed.
- **one tool** — named from the existing set (`generate_content`,
  `send_email`, `launch_campaign`, …). If no existing tool can do it,
  it is **not an action**; it is an alert.
- **expected effect**, in the baseline's own units, labelled as an
  estimate — or "unknown" where the baseline is still learning.
- **an approval record** — `requestApproval` already creates it, and
  `tests/approvalCoverage.test.ts` fails for any new sender that skips
  it.

Written to a **Suggestions box** (a table + a panel), not executed.
Alerts — things that need the owner and have no tool — go to a separate
**Alerts panel**, so "here's what I'd do" is never mixed with "this is
broken".

### F.4 — Approval first, autonomy later

Phase 1 is **suggest + one-click approve**, nothing else. The autonomy
ladder (per-action "auto after N good approvals") comes only after the
eval harness can show a measured unsupported-claim rate of zero on that
action type, and with two permanent hard stops:

1. **Spend** always needs a human. `ACTION_POLICIES` already classifies
   `spend` as its own action type.
2. **Anything public whose grounding check failed** is never
   auto-published, at any ladder level. `generateCopy` already returns
   `publishable: false` for this; the ladder must read it rather than
   re-deciding.

### F.5 — Scheduling

Add `growth_advisor` and `planner` to the `signals` cron group
(`cronGroups.ts:37`) — database-and-arithmetic work, and the group
already runs before the LLM-heavy one. **Vercel's two-cron limit is not
a constraint here**: the job-list design inside `dailyJobs.ts` already
multiplexes subsystems within a group.

---

## Order of work, and why

1. **1a — the four live failures.** Two regex widenings, hashtag dedupe
   at the compose layer, capability-claim rule. A day. Stopgap by
   written agreement (D.4).
2. **B.2 interim — stop treating Hawlai-written site text as proof.**
   One line, and it is the live cause of "free shipping".
3. **C — the Facts extractor.** Prerequisite for A (see A.0) and the
   real fix for B.
4. **A — delete the story.** After C, so genericness keeps its
   evidence.
5. **D.2 — the eval harness.** Needs approval: it spends money.
6. **E — the Daily Owner Report.** The smallest thing that makes this
   feel like an agency.
7. **D.3 — the sentence-support verifier**, measured against D.2.
8. **F — the planner**, then targets, then the ladder.

Meta post-insights ingestion (so the loop can learn which captions
worked) belongs between 6 and 8; it has no dependency on the rest.

---

## Decisions I need from you

1. **`docs/Hawlai-autonomous-agency-plan.md` was not attached.** If it
   exists, this document should be checked against it first.
2. **Which screen produced "free shipping"** — or just run B.2's two
   queries, which answer it definitively.
3. **A before C, or C before A?** I recommend C first (A.0). Deleting
   the story first is faster and will visibly worsen genericness for a
   while.
4. **Owner-stated facts: `substantiation` tier or authoritative?** C.3
   proposes flag-don't-authorise. That is stricter than today and will
   create friction for owners who type true things.
5. **Eval harness spend** — budget per run, and how often.
6. **Daily report: email only to start, WhatsApp later?** The note says
   email first and I agree; WhatsApp adds template approval and a
   different consent regime.
