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

### A.4 — RETRACTED. "Ignore `business_story`" would delete true facts.

> **Founder, 2026-10-11.** All 14 active `business_knowledge` rows for
> `candle_by_qaaf` are `category = 'business_story'`, and they contain
> the product and process facts — the double-boiler melting, the
> fragrance step, the 24-hour set, "never mixes cheap paraffin",
> "paraffin-free — soy wax only", "hand-poured in small batches".
>
> **So my A.4 recommendation was wrong.** "Stop reading
> `category = 'business_story'`" would have removed this business's
> entire factual evidence set in one line — every honest claim about
> materials, process and timing would have started being stripped as
> unsupported. It would have looked like the guard getting stricter and
> been the guard going blind.
>
> This is the second time in this plan I have reasoned from a category
> name instead of its contents. The lesson is the same both times: the
> label is not the thing.

**The intake question set explains why this happened.**
`businessStory.ts:35` `STORY_QUESTIONS` has ten questions, and **six of
them ask for facts** — how it is made, what takes longest, materials
and suppliers, the detail people notice, what you refuse to do, what
people get wrong. Only origin and first-customers ask for a story at
all. The category was named after the *interview*, not after what the
answers contain.

### A.4a — The re-classification, owner-confirmed, nothing automatic

Three classes, as instructed. **No row is deleted, and no row moves
without the owner confirming it.**

| Class | What it means | Used in customer copy? |
|---|---|---|
| **FACT** | a product, process, material, timing or policy fact | **Yes** — as `owner_stated` evidence (section C), never shown as a story |
| **PRIVATE** | a customer's situation, a family or personal detail | **Never.** `personalStories` protection stays exactly as it is |
| **STORY** | origin, motive, how it felt | **No.** Kept, visible to the owner, read by no generator |

**Proposed class per intake question** — by the nature of the question,
which is the part I can know without seeing every row:

| Question key | Title | Proposed | Why |
|---|---|---|---|
| `how_made` | How it's made, step by step | **FACT** | process and timings |
| `slow_part` | The part that takes longest | **FACT** | process plus duration |
| `materials` | Materials and suppliers | **FACT** | materials, origin, names |
| `detail_noticed` | The detail people notice | **FACT** | a physical, pointable detail |
| `refuse` | What you refuse to do | **FACT** | a policy fact — see the warning below |
| `mistaken` | What people get wrong | **FACT** | usually a factual correction |
| `customer_words` | What a customer actually said | **PRIVATE** | a customer's own words; `needsConsent` territory |
| `first_customers` | The first customers | **STORY**, or PRIVATE if it names people | |
| `origin` | How it started | **STORY** | motive, not fact |
| `how_you_talk` | How you talk about the work | **STORY (tone only)** | an input to voice, never a claim |

**Rows whose title is not one of those ten need individual review.**
You named one — *"Something I can stand behind"* — which is **not** in
`STORY_QUESTIONS`, so at least some of the 14 were entered by hand.
**I have seen 5 of 14 titles. The other 9 I have not seen and will not
guess at.** The query in A.4c produces the full list to confirm against.

### A.4b — Two warnings that the row you quoted makes concrete

**1. Classification must be PER SENTENCE, not per row.** You described
*"Something I can stand behind"* as containing "paraffin-free — soy wax
only" **and** "hand-poured in small batches" **and** an Instagram
handle **and** "Bulk Order". That single row holds:

- two usable FACTS;
- a **contact detail** — which `scrubInventedContacts` exists to keep
  out of copy unless it is the real one;
- and an **offer word**, "Bulk Order", which the offer rules would read
  as a claim about something that may not exist.

Marking the whole row FACT would license all four. This is the lesson
already written into `businessFacts.ts:~310`: *"PER PROP, NOT PER
BLOCK… a block the owner had edited contributed ALL its text as
evidence."* The same mistake, one level up. **The unit of
classification is the sentence.**

**2. A FACT's phrasing is not automatically publishable.** `refuse`
answers are the clear case. The *fact* is "soy wax only, never
paraffin". The *phrasing* you quoted — "never mixes cheap paraffin wax"
— is a pejorative about other people's products, which the comparative
rules correctly refuse. The classification licenses **the fact**, not
the owner's sentence: copy may say "soy wax only", and may not reuse
"cheap paraffin".

### A.4c — The live constraint check, before any SQL

Rule 4: the live constraint is checked first, and the owner runs
everything by hand.

**What the repo believes** — migration 189 (lines 16-18) replaced
migration 118's constraint with:

```
check (category in ('hours','pricing_note','policy','faq','general','business_story'))
```

**Check the live one before trusting that:**

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'business_knowledge'::regclass
  and contype = 'c';
```

**And list the rows to classify:**

```sql
select id, category, title, left(content, 120) as first_120, created_at
from business_knowledge
where dealership_id = (select id from dealerships where dealership_name ilike '%qaaf%')
  and is_active = true
order by created_at;
```

### A.4d — You may not need a migration at all

Two options. **I recommend the first.**

**Option 1 — no schema change.** Move confirmed FACT rows to
`category = 'general'`, which the live constraint already allows and
which `businessFacts.ts:732` already renders as *"What the owner says
about the business"*. Zero migration, reversible with an update, and
once section C lands the real meaning lives on `FactRecord.source =
owner_stated` rather than on a category name — which is where it
belongs, given that the category name is what misled me twice.

**Option 2 — a precise category.** If you want `product_fact` to exist
as a name, the constraint must be widened first. SQL for you to run by
hand, **after** A.4c confirms the current definition:

```sql
-- 1. widen the constraint (additive; no existing value is removed)
alter table business_knowledge drop constraint if exists business_knowledge_category_check;
alter table business_knowledge add constraint business_knowledge_category_check
  check (category in ('hours','pricing_note','policy','faq','general','business_story','product_fact'));
```

```sql
-- 2. verify it took
select pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'business_knowledge'::regclass and contype = 'c';
```

**That SQL moves no rows.** The move is a separate, per-row,
owner-confirmed update once the classification table is agreed — and
because A.4b requires per-sentence classification, a mixed row is
**split into two rows** rather than moved whole.

### A.4e — Order, restated

1. Section C ingests these rows as `owner_stated` facts, **before**
   anything about the story category changes.
2. The owner confirms the classification table.
3. Only then does `business_story` stop being read — and by then the
   facts are in the evidence set under their own class, so nothing
   honest is lost.

**Nothing in section A may ship before C.** A.0 said that for
genericness. A.4 now says it for truthfulness, which is worse.

### A.5 — What the owner will notice

- The chat stops offering the Business Story interview.
- Copy stops containing first-person history. **This is the point.**
- More pieces will be flagged generic until section C lands, because
  product facts are a thinner vocabulary than a story (A.0).
- Existing story rows stay visible under Business Knowledge, and stop
  affecting copy.

---

## B) Step 1b — CORRECTED, and the latent bug that remains

> **Correction, founder, 2026-10-11 23:07.** `candle_by_qaaf` shipping
> is set to **Always Free** in Website Builder → Shipping. The owner
> chose it. So "free shipping" in the welcome email and the Facebook
> post was **TRUE and correctly licensed**, and it is removed from the
> list of live failures. My earlier "licensed by site text" diagnosis
> was **wrong for this case**: the site pages (home, about, contact,
> privacy-policy, terms, shop) and Business Knowledge and the product
> descriptions contain no shipping text at all. The licence came from
> `shipping_config`.
>
> **What my earlier section got right:** nothing. The rule fired, the
> check ran, and it correctly concluded the claim was true. I reasoned
> from a plausible mechanism instead of checking the store setting, and
> I should have asked for the shipping mode before writing a diagnosis.

### B.1 — Why it passed, correctly

`claimCheck.ts:779-786` asks checkout, not the text:

```ts
const charged = !s || computeShippingAmount(
  { shipping_mode: s.mode, shipping_rate: s.rate, shipping_free_threshold: s.freeThreshold },
  cheapest
) > 0;
if (charged && !namesThreshold) reasons.push(…);
```

`src/lib/shipping.ts:16` — `if (mode === "free") return 0`. So
`charged` is false, nothing is pushed, and the sentence stands. **This
is the design working**: the same function checkout uses decides what
copy may say. Verified by reading both files.

### B.2 — The latent bug, which is real and separate

`claimCheck.ts:771`:

```ts
if (freeShipping && !said(freeShipping[0])) {
```

**`!said(...)` short-circuits the whole checkout-truth block.** Any
occurrence of "free shipping" in `knownText` — a line on the About
page, a product description, an owner-entered fact — skips every check
below it, including the Flat Rate refusal.

So a **Flat Rate** store whose About page says "free shipping" may then
advertise free shipping on every surface, and checkout will still
charge the customer at the till. That is the worst shape of this bug:
the copy and the checkout disagree, and the customer finds out last.

**Status: CONFIRMED by reading the code. NOT VERIFIED whether any
tenant is in this state** — it needs a query across stores with
`shipping_mode = 'flat'` whose page text mentions free shipping.

**The fix, stated as a rule:** shipping truth is decided by
`shipping_config` alone, and **no text may override it**. Drop the
`!said()` guard for this one rule, so the block always runs. This is
the same reasoning the file already applies to comparisons
(`claimCheck.ts:~728-746`, the `always` helper): *nothing a business
says about itself can establish what a third party does* — here,
*nothing a business writes can establish what its own checkout
charges.*

Removing `!said()` does **not** break the Always Free case: the inner
`charged` test already returns false for `mode === "free"`, which is
exactly why `candle_by_qaaf` passes today.

**The two execution tests, as instructed:**

1. **Flat Rate store + "free shipping" in the site text → REFUSED.**
   Facts with `shipping: { mode: "flat", rate: 60 }` and a site page
   paragraph containing "free shipping"; assert the sentence is removed
   and the reason names the real shipping.
2. **Always Free store → ALLOWED.** Facts with
   `shipping: { mode: "free" }`; assert "Free shipping on every order."
   survives untouched, with `removed` empty.
   *This second test is the one that stops the fix over-correcting, and
   it is the live case.*

Plus a mutation check: restore `!said(...)` and test 1 must fail.

### B.3 — What survives from the earlier section

Both of these stand on their own merits and are **not** affected by the
correction:

- **Generated site text must not be evidence.**
  `businessFacts.ts:445-450` excludes Hawlai-written page text only
  once `dealerships.claims_reviewed_at` is set, and the comment above
  it records the incident where *"an invented line became the proof
  that approved the same line everywhere else."* Still true, still
  worth fixing — it just was not what happened here.
- **Remove the story block from the prompt**
  (`businessFacts.ts:712-725`). Unchanged, and section A's highest-value
  deletion.

## B-bis) The six real live failures — 1a scope

Each tested against the live rules by extracting the regex and running
it. **Every one of the six is currently MISSED.**

| # | The line | Why it passes | Fix |
|---|---|---|---|
| 1 | "a cheap candle fades after two days" | `ATTRIBUTED_PEJORATIVE` needs the noun in `alternatives\|ones\|options\|versions\|brands\|products\|stuff` — **a product noun is not in it**. And `SPELLED_DURATION` accepts `for\|in\|within\|up to` — **not `after`** | Add product nouns after the pejorative; add `after` (and `within`/`by`) to the duration prepositions |
| 2 | "goes out automatically" | **No rule of this kind exists anywhere.** A claim about what the PRODUCT does automatically, and the same shape as a claim about what HAWLAI does automatically | New rule class — see B-bis.1. **P0** |
| 3 | a founder-story line in the welcome email | Provenance licenses it because the story IS on record. Section A removes the source | Section A, deletion 1 (`businessFacts.ts:712-725`) |
| 4 | ₹999 missing from the email body | Not a claims failure — an **omission**. Nothing requires the price to appear | New check: when the records have a price and the piece is a selling piece, the price must appear. See B-bis.2 |
| 5 | duplicate hashtags on publish confirmation | **Two sources, no dedupe.** `socialMediaAgent.ts:90` invites inline hashtags ("can include 2-3 relevant hashtags at the end"); `socialPost.ts:61-63` then appends `row.hashtags` as a block. `content.ts:19-23` does the same for every social type | Dedupe at the compose layer, and stop asking for them inline. See B-bis.3 |
| 6 | "that is what makes it last" | `PERFORMANCE_DURATION` needs a noun (`scent\|fragrance\|burn\|colour…`) before the verb. **"makes it last" has no noun** | Widen to the bare performance verb when the subject is the product |

### B-bis.1 — The capability-claim class (item 2)

Two kinds of sentence, one rule class, because they fail the same way:

- **The product acts by itself** — "goes out automatically", "turns
  itself off", "self-extinguishing", "relights".
- **Hawlai acts by itself** — "I've scheduled that", "this posts
  automatically", "I'm monitoring it", "it will send tomorrow".

The second kind needs the action's **real state** to check against, and
that state exists: `pending_approvals` rows and
`executionPolicy.ACTION_POLICIES`. The rule is: a completed-action verb
may not appear unless a row says the action actually completed.

Tier: **`claim`, strict in both modes.** A false statement about what
something will do on its own has no safe draft form.

### B-bis.2 — The missing price (item 4)

This is the first **omission** check in the codebase; everything so far
removes. Shape:

- If the records have a price for the product the piece is about, and
  the piece is a selling piece (email, caption, ad — not a blog post or
  an SEO page), the price must appear.
- It is **not** auto-inserted. The owner is told: "this one doesn't
  mention the ₹999 — want it in?" An auto-inserted price in the wrong
  sentence is worse than a missing one.
- Reuses `moneyAmounts()` (`claimCheck.ts`) to detect what is already
  there, so a piece naming the price in words is not nagged.

**NOT VERIFIED:** whether the owner wants this as a note or a hard
block. My recommendation is a note; a hard block would refuse honest
teaser copy.

### B-bis.3 — The hashtags (item 5)

Three changes, smallest first:

1. **Dedupe in `composePost`** — case-insensitively, preserving order,
   across both the inline text and `row.hashtags`.
2. **Stop asking for hashtags inline.** `socialMediaAgent.ts:90` and
   `content.ts:19-23` both ask the model to put hashtags "at the end"
   while the shape also has a `hashtags` field. One source only: the
   field.
3. **Execution test** on the publish payload, not the card — the 8
   October incident was precisely a card and a payload disagreeing
   (`socialPost.ts:1-14` records it).

### B-bis.4 — Item 6's real question: record or invented?

The founder asks where these came from. **I cannot see the database, so
I cannot answer it — but I can say exactly what each one needs, and
give you the query.** Three separate cases, and they are not alike:

**(a) "no paraffin" — a CLAIM_TERM, and there is a Hinglish trap.**
`claimCheck.ts:98` lists `"no paraffin"` and `"paraffin free"`, so it
IS checked. `CLAIM_SYNONYMS:222` pairs those two — **but every synonym
pair in that list is English.** A record saying *"Paraffin wax kabhi
nahi — sirf soy wax"* licenses **"soy wax"** (the substring is there)
and does **not** license "no paraffin". So:
- if the record has the English phrase → correctly licensed, true;
- if the record is Hinglish only → **the claim is TRUE and was
  wrongly stripped**, which is the expensive direction, and the file
  already records this exact bug happening with "clean burning" in a
  Hinglish story (`claimCheck.ts:~250`).
**This is a finding in its own right: the synonym table has no Hindi or
Hinglish equivalences, in a product whose owners write Hinglish.**

**(b) "24 hours set" — unchecked either way.** Not a CLAIM_TERM, and
`SPELLED_DURATION` requires a performance verb (`lasts|burns|stays|
holds|lingers|keeps|fades`). I tested "Every candle sets for 24 hours."
and "…cures for 24 hours." — **both MISSED.** So this sentence passes
whether it is true or invented. Cure time needs adding to the duration
verbs.

**(c) The process sentences — no rule class exists at all.** I tested
"Each wick is centred by hand." and "The fragrance is added at exactly
65 degrees." — **both MISSED.** `EXACTNESS` catches "exactly centred"
but not "exactly 65 degrees" (its noun list is about alignment, not
measurements). A process claim — a step, a temperature, a timing — is
exactly the kind of specific detail the prompt asks for and nothing
verifies. **Recommend a `process` rule class, dry-run first.**

**The queries that answer it, read-only:**

```sql
-- every owner-recorded fact, so you can see what is actually on record
select category, title, content
from business_knowledge
where dealership_id = (select id from dealerships where dealership_name ilike '%qaaf%')
  and is_active = true
order by category;
```

```sql
-- and the product descriptions, the other licence source
select name, description
from products
where dealership_id = (select id from dealerships where dealership_name ilike '%qaaf%');
```

If "wick", "centre/center", "65", "degrees", "24 hour" or "paraffin"
appear in neither, those sentences were **invented** and three rule
classes are missing. If they do appear, the sentences are true and the
only issue is (a)'s Hinglish gap.

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

### C.6 — FIRST JOB: ingest the existing `business_story` rows

Added after the founder's 2026-10-11 finding. **This is C's first
deliverable, not a later one**, because section A cannot proceed until
it exists (A.4e).

The extractor reads `business_knowledge` rows **whatever their
category**, classifies them per sentence (A.4b), and emits
`FactRecord`s:

```
source: "owner_stated"       confidence: "observed"
sourceRef: business_knowledge.id + sentence index
```

Three consequences worth stating plainly:

1. **The category stops being load-bearing.** A fact is a fact because
   of its `source` and its sentence, not because of the folder it sits
   in. That is the whole reason A.4d's Option 1 (`general`, no
   migration) is enough: once C exists, the category is a UI label.
2. **PRIVATE sentences never become `FactRecord`s at all.** They are
   not low-confidence facts; they are not evidence. `splitStories` and
   `needsConsent` decide this, before classification, and keep deciding
   it.
3. **STORY sentences do not become `FactRecord`s either** — which is
   how the founder's rule ("story text does not go into customer copy;
   facts do") becomes mechanical rather than a prompt instruction. The
   prompt stops containing story text because there is no record to put
   there, not because a sentence asks it not to.

### C.7 — Hinglish: one fact, two languages

**The gap, verified.** `CLAIM_SYNONYMS` (`claimCheck.ts:222-243`) has
16 pairs and **every member of every pair is English**. So a row
reading *"kabhi sasta paraffin wax mix nahi karti"* licenses nothing:
`said("no paraffin")` is false, and the true claim is stripped. The
file already records this happening once, with "clean burning" in a
Hinglish story (`claimCheck.ts:~250`).

**Two changes, and they are different in kind:**

**(a) Synonym members in Hinglish and Hindi.** Additive, and it only
ever *licenses* — it cannot cause a strip. Example family:

```
["paraffin free", "no paraffin", "paraffin nahi", "paraffin kabhi nahi",
 "sirf soy", "soy wax only"]
```

**Dry-run first, same as every rule class**, because widening a licence
is how a claim slips through: "sirf soy" must not end up licensing
"100% pure soy" if the records never said pure.

**(b) `owner_stated` licensing is per FACT, not per phrase.** This is
the better fix and it belongs in C, not in the synonym table. When the
extractor reads *"kabhi sasta paraffin wax mix nahi karti"*, it emits:

```
key: "material.paraffin"   value: false   source: owner_stated
```

A claim is then licensed by **matching the fact**, not by matching the
owner's words. English copy saying "paraffin-free" and Hinglish copy
saying "paraffin nahi" both satisfy `material.paraffin = false`, and
neither needs a synonym pair to exist.

(a) is the stopgap that works this week; (b) is what makes the synonym
table shrink instead of grow. Both are needed, in that order, and (a)
should carry the same written expiry as the 1a regexes (D.4).

**One risk, stated:** extracting `material.paraffin = false` from a
Hinglish sentence is a *reading* of that sentence, so the record's
confidence is `observed`, not `counted`, and the extraction itself
should be shown to the owner once — "I read this as: soy wax only, no
paraffin. Right?" — rather than assumed. That is the one factual
question C.4 rule 2 already allows for, spent on confirming a reading
rather than asking for something new.

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

1. **1a — the six live failures** (B-bis): pejorative product nouns +
   `after` duration; the capability-claim class (**P0**); the price
   omission note; hashtag dedupe at the compose layer; the bare
   performance verb. Plus the story-block deletion, which is item 3.
2. **The shipping latent bug** (B.2): drop `!said()` so checkout
   decides, with the Flat Rate refusal test and the Always Free
   allowance test.
3. **Three gaps found while testing item 6**, each dry-run first: cure
   time in the duration verbs; a `process` rule class; **Hinglish
   synonym pairs**, which is the one that currently removes TRUE copy.
4. **C.6 — ingest the existing `business_knowledge` rows as
   `owner_stated` facts.** This is now the gate on everything in A: 14
   of 14 rows for the live business are `business_story` and they hold
   the real product facts (A.4).
5. **C.7(a) — Hinglish synonym members.** Additive, licence-only, and
   it stops stripping true copy this week.
6. **The owner confirms the A.4a classification table.**
7. **A — retire the story category.** Only after 4-6, so nothing
   honest is lost.
8. **C.7(b) — licensing by FACT rather than by phrase**, which is what
   makes the synonym table shrink instead of grow.
9. **D.2 — the eval harness.** Needs approval: it spends money.
10. **E — the Daily Owner Report.**
11. **D.3 — the sentence-support verifier**, measured against D.2.
12. **F — the planner**, then targets, then the ladder.

Meta post-insights ingestion belongs between 10 and 12; no dependency
on the rest.

## Decisions I need from you

1. **`docs/Hawlai-autonomous-agency-plan.md` was never attached.** If it
   exists, this document should be checked against it before any code.

2. **The other 9 row titles.** Item 6 is answered — the process
   sentences are real, they are in the `business_story` rows, nothing
   was invented. What is left is the A.4a classification table, and I
   have seen 5 of 14 titles. The query is in A.4c. I will not guess the
   other 9.

3. **A.4d — `general` with no migration, or widen the constraint for
   `product_fact`?** I recommend `general`: zero schema change,
   reversible, and once C.6 lands the meaning lives on
   `FactRecord.source`, not on a category name. Either way the live
   check in A.4c runs first and you run the SQL by hand.

4. **Owner-stated facts: `substantiation` tier, or authoritative?**
   C.3 originally proposed flag-don't-authorise. **The Hinglish finding
   argues against doing that first**: the system already strips true
   owner-recorded copy when the record is in Hinglish, and tightening
   the tier makes that worse. Recommend: fix C.7 first, then decide the
   tier with the eval harness able to measure what it costs.

5. **The missing price (B-bis item 4): a note, or a hard block?**
   I recommend a note. A hard block refuses honest teaser copy, and an
   auto-inserted price in the wrong sentence is worse than none.

6. **Eval harness spend** — budget per run, and how often. It is the
   only item here that costs money, and D.2 cannot be built without
   that number.

7. **Daily report: email first, WhatsApp later?** Your note says email
   first and I agree — WhatsApp adds template approval and a different
   consent regime.

**Answered and closed, recorded so they are not reopened:**

- *Was "free shipping" a failure?* No. Always Free, correctly licensed
  from `shipping_config`. My diagnosis was wrong (B).
- *Were the process sentences invented?* No. They are in the
  `business_story` rows (A.4).
- *A before C, or C before A?* **C before A, and it is no longer a
  judgement call** — 14 of 14 rows for the live business are
  `business_story`, so retiring that category before C.6 would delete
  the evidence set (A.4e).
- *Website builder block-aware door, chatbot genericness* — both
  deferred by you on 2026-10-11.
