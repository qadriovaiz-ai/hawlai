# Being named by the answer engines — AEO and GEO

Written 6 November 2026, at the founder's request, on his written
reason:

> *AEO (Answer Engine Optimization) aur GEO (Generative Engine
> Optimization) — yani Google ke AI Overview mein aana aur
> ChatGPT/Perplexity/Gemini jaise tools se poochne par business ka naam
> aana — scope se bahar hai.*

That sentence is what CLAUDE.md rule 5 asks for, and it is the second
one this week. [PLAN-LOCAL-SEO.md](PLAN-LOCAL-SEO.md) covers Google's
traditional surfaces — blue links and Maps. This covers the other
question: **when somebody asks an AI, does this business get named.**

**Nothing here is built.** It exists so the founder can decide when, and
in what order against the local-search plan.

---

## 1. The short version

1. **The measurement half already exists, and it is better than I
   expected.** `aeoAgent.ts` is the 9th SEO task: four buying questions,
   **fixed and derived in code** so a trend across runs means something,
   checked with live web search, stored in `aeo_presence`
   (migration 199), with a run-against-run comparison and a fixed
   disclosure that it is **simulated** rather than a direct query of
   ChatGPT, Gemini or Perplexity. That is the honest version of a thing
   most tools lie about.
2. **The product also already knows the theory.**
   `marketingKnowledgeSeed8.ts` — five RAG entries, written for exactly
   this — names the three structural moves: answer-first Q&A, FAQPage
   schema, and facts stated as plain text rather than trapped in images.
3. **And it does none of them.** There is **no robots.txt at all**, **no
   FAQPage schema**, **no FAQ block in the builder** (a legacy one is
   flattened into generic headings and paragraphs, which destroys the
   pairing), **no JSON-LD on any page except the storefront home**, and
   **nothing anywhere that tracks a mention outside the site**.

So this is not a new capability to invent. It is a gap between what the
product can already *measure and explain* and what it can *do*.

---

## 2. The audit — his five questions, answered from the repo

### 2.1 robots.txt — there is none, and that has two consequences

**Measured:** no `public/robots.txt`, no `app/robots.ts`, no route
serving it. `technicalAudit.ts` says so in its own header — robots.txt
is on its "deliberately not here" list because it needs a live fetch.

**So: are GPTBot, PerplexityBot, Google-Extended and ClaudeBot/CCBot
allowed? Yes — by absence.** No robots.txt means nothing is
disallowed, for any crawler. Nothing is blocking the answer engines
today.

**The first consequence is a missed signal, not a block.** There is also
**no sitemap** anywhere in the repo, and no robots.txt to point at one.
A crawler finds `hawlai.online/site/{slug}` only by following a link
from somewhere, and for a new business there is nowhere to follow from.

**The second is a design decision nobody has had to make yet.** Every
storefront is a *path* on one shared domain, so there is **one**
robots.txt for every business on the platform. A single static file
cannot say "this business does not want its copy used for AI training"
— that needs a generated route with a `Disallow` line per opted-out
business. Worth deciding before writing the file, not after.

### 2.2 FAQ/Q&A schema — not emitted, and the structure is actively lost

**Measured.** `src/lib/seo/structuredData.ts` emits `LocalBusiness`,
`Product`/`Service`, `Offer` and `ItemList`. **No `FAQPage`, no
`Question`, no `acceptedAnswer`.**

**And the worse half.** The block builder's registry
(`src/lib/blocks/registry.ts`) has no FAQ block at all. A legacy `faq`
section is converted at `convertLegacy.ts:90` into a column of generic
`heading` + `text` pairs. The words survive; **the machine-readable fact
that this is a question and that is its answer does not.** Nothing
downstream can recover it, so nothing can emit FAQPage schema from it
even if the schema existed.

That is the single most specific finding in this audit: the pairing is
destroyed on the way in, so the schema gap cannot be closed by touching
the schema file alone.

### 2.3 Content shape — the site can only say things, not answer them

**Measured.** The builder produces headings, paragraphs, images,
buttons, product grids and forms. There is no block whose shape is "a
question and its answer", and no field anywhere that holds one.

**And the JSON-LD that does exist is on one page.**
`storefrontJsonLd` is rendered from `src/app/site/[slug]/page.tsx` — the
**home page only**. `/site/[slug]/[page]` and the product page emit
none. So a hand-written FAQ page today would carry no structured data at
all.

**What already helps here, and it matters more than it looks:** the
claims pipeline. An answer-first page is a page full of stated facts,
which is the most dangerous kind of page to generate — and C2 already
refuses a sentence no record supports, `content_source` already records
whether the owner or the machine wrote each line, and S7's
`claim_checks` now records what went out. **AEO content is exactly the
work this product is already built to do safely**, which is not true of
most of the things it could build next.

### 2.4 Third-party mentions — nothing tracks them, and GEO mostly is them

**Measured.** Zero hits for JustDial, IndiaMART or any directory in
`src/` or `docs/`. `online_presence` (migration 212) stores one
onboarding answer — website, Maps, social or just starting — and nothing
else. There is no table of where a business is mentioned, no count, no
check.

**So the honest answer to "how many places is candle_by_qaaf mentioned
from outside?" is: this product does not know, and cannot say.**

**One thing already collected is the right seed, though.** The AEO
check records, per question, which **competitors** the model named
(`competitivePositioning[].competitorsMentioned`, stored in
`aeo_presence`). Those are precisely the businesses that *do* have the
mentions. A list of who gets named instead of you, for your own buying
questions, is a better starting point than a generic directory
checklist — and it is already in the database.

### 2.5 llms.txt — my assessment: real, cheap, and not worth a phase

**Measured:** nothing. No file, no route, no mention anywhere in the
repo.

**My reading, and the founder should weigh it against the other
phases.** `llms.txt` is a **proposal**, not a standard. No major answer
engine has committed to reading it: the crawlers that definitely exist
and definitely matter — GPTBot, PerplexityBot, Google-Extended,
ClaudeBot — read **pages**. Writing llms.txt is writing for a consumer
that may never arrive.

**But it costs almost nothing**, because everything it would contain is
already in the database: the business name, what it sells, the city,
the catalogue, the page list. It is a template over `businessFacts`.

**So: do it as a by-product, not as a phase.** If A1 is building a
generated `robots.txt` route anyway, `llms.txt` is another route beside
it and perhaps thirty lines. What it must not get is its own milestone,
its own tests-and-plan ceremony, or any claim that it helps — because
**nothing yet measures whether it does**, and this product does not ship
numbers it cannot trace.

---

## 3. The phases, smallest first

### A1 — robots.txt, a sitemap, and llms.txt beside them — **S**

**BUILT — 6 November 2026.** What shipped is below the plan text,
under *A1 as built*.

Three generated routes, no model, no third party. `robots.txt` points at
the sitemap and states the AI crawlers explicitly — **allowing them, in
writing, rather than by absence**, so the intention is on record and a
future mistake is visible. The sitemap lists every published
storefront's pages, which is the thing that gets a new site crawled at
all.

**The decision this phase needs from the founder:** whether a business
may opt out of AI crawling of its own storefront. If yes, the route
reads a per-business flag and writes a `Disallow` line; if no, it is a
static string and simpler. **Recommendation: build the route, default
everyone in, and leave the flag for when somebody asks** — a column
nobody sets is cheaper than a static file somebody has to replace.

#### A1 as built

**Three generated routes, and a fourth change that is the reason any of
them work.**

| File | What it does |
|---|---|
| `src/lib/seo/crawlers.ts` | the crawler list, the private paths, the opt-out read, the published-pages read, and the llms.txt text. All of it testable without a route. |
| `src/app/robots.ts` | Next's `MetadataRoute.Robots`. Names every answer engine and **allows** it, disallows the private paths in every rule, points at the sitemap. |
| `src/app/sitemap.ts` | `MetadataRoute.Sitemap`. The marketing home, then every published storefront's pages. |
| `src/app/llms.txt/route.ts` | a plain-text route, because Next has no llms.txt convention to hook into — which is itself a measure of the proposal. |
| `src/lib/supabase/middleware.ts` | **the load-bearing change.** |

**Without the middleware change all three routes answered a crawler with
a 307 to `/auth/login`.** The middleware authenticates everything that
is not on a public prefix list, and these three are exact paths at the
domain root, not prefixes. A new `PUBLIC_EXACT_PATHS` list carries them.
This is the same fault migration 168 recorded for
`/api/events/dispatch`: a route that exists, is correct, and is never
reached. `tests/crawlerFiles.test.ts` section 1 fails if any of the
three leaves that list, **and** fails if the exact list is ever loosened
into a prefix list, which would publish the private half of the app.

**The opt-out, as approved:** the route reads a per-business flag and
writes `Disallow` lines **into the AI rules only** — an opted-out
business stays in the wildcard rule, so it is still findable on Google.
Default is everyone in. **The column does not exist yet**, and the read
is written so that a missing column excludes nobody and says so in the
log, rather than erroring the route. The column and the owner-facing
toggle are a later, smaller piece.

**What A1 refuses to invent:** no `lastModified` unless the owner's own
edit timestamp is readable; no city in llms.txt unless the business has
one; a failed sitemap read is `null` (so the route serves just the
marketing home) rather than `[]`, which would claim the platform is
empty; and llms.txt's own opening lines say it follows a proposal that
is not a standard and that nothing has committed to reading.

**Unverified live:** nothing has fetched these three routes on
hawlai.online yet. The build lists them (`ƒ /robots.txt`,
`ƒ /sitemap.xml`, `ƒ /llms.txt`) and the middleware test proves they are
not redirected, but no crawler has been seen reading them, and no
ranking or citation claim is made.

### A2 — an FAQ block, and FAQPage schema from it — **M**

**BUILT — 6 November 2026.** What shipped is below, under *A2 as
built*.

The structural core, and the one with a dependency the others do not
have: **the block must exist before the schema can be real.** A `faq`
block in the registry holding question/answer pairs, `convertLegacy`
mapping the legacy section onto it instead of flattening it, and
`structuredData.ts` emitting `FAQPage` from those pairs.

**Plus the thing that makes it count:** JSON-LD on `/site/[slug]/[page]`
and the product page, not just the home page. Today an FAQ page would
carry none.

**The honest limit:** FAQPage schema's rich-result eligibility in Google
has narrowed since 2023. The reason to do it is **extractability** — it
labels the content for whatever reads the page — not a rich result in
search. A plan promising stars and dropdowns would be promising
something Google has already taken away.

#### A2 as built

| File | What it does |
|---|---|
| `src/lib/blocks/registry.ts` | `faq` (a container) and `faq_item` (a question and its answer). |
| `src/lib/blocks/convertLegacy.ts` | `convertFaq` maps onto them instead of flattening into headings. |
| `src/lib/blocks/utils.ts` | `faqPairsFromBlocks` — every pair on a page, in page order. |
| `src/lib/seo/structuredData.ts` | `faqPageNode` and `productPageJsonLd`. |
| `src/lib/seo/siteIdentity.ts` | the three identity reads, once, for all three routes. |
| `src/app/site/[slug]/[page]/page.tsx` | JSON-LD on an inner page, which had none. |
| `src/app/site/[slug]/products/[productId]/page.tsx` | JSON-LD on the product page, which had none. |
| `src/lib/seo/technicalAudit.ts` | `no_faq` now counts an FAQ **block**, not only an FAQ page. |

**The prop names are `heading` and `html`, not `question` and `answer`,
and that is the decision in this phase that matters.** Four systems are
keyed on that exact set of prop names — `TEXT_PROPS`
(lib/pages/provenance.ts: who wrote this line), `BLOCK_TEXT_KEYS`
(lib/claims/guardBlocks.ts: the claims guard), `LEGACY_FIELDS`
(lib/claims/siteClaimsReview.ts: the owner's claims review) and the
Properties Panel's own marking of the owner's edits. A prop called
`answer` would have been invisible to all four, so **an AI-written FAQ
answer would have reached a live page unguarded** — the 2026-09-30
incident that put the guard on the builder in the first place. The owner
sees "Question" and "Answer" because that is what the field labels say,
and a test fails if a future block adds a text prop none of those
systems reads.

**And because the registry drives the AI author** (see
`AI_BLOCK_TYPES` — "adding a new block type there automatically becomes
something the AI can use"), the website builder can now write an FAQ
section itself, guarded, with no prompt change. That is most of A3's
plumbing, arriving early.

**Two faults found on the way:**

1. **`LocalBusiness { name: "the business" }`.** The home page called
   `businessDisplayName` with its default fallback, so a business that
   had not yet typed its name — or still had the signup placeholder —
   was publishing that placeholder as its name, in the one format built
   to be believed without being read. The reader now asks for an empty
   fallback and publishes nothing instead.
2. **The audit asked for an FAQ the page already had.** `no_faq` looked
   only at `page_type` and the slug, so an FAQ block on the home page
   still produced the finding every day. A finding that fires against
   work the owner has already done teaches them to ignore findings.

**The honest gap, and it needs one read query to size:** a page the
owner has opened in the block editor and saved was stored as a block
tree — with the legacy FAQ **already flattened** into headings and
paragraphs. Those pages gain nothing here, because there is no pair left
in the database to read. Pages still in the legacy shape convert at
render time and gain the schema immediately, with no write. The query to
count the affected pages is in docs/DECISIONS.md under this date.

**Unverified live:** no page has been fetched and no structured data
validated in Google's Rich Results Test. The schema is built and
asserted in tests; it has not been read by a machine outside this repo.

### A3 — answers written from the business's own facts — **M**

An FAQ block full of invented answers is worse than an empty page, and
this is the phase where that risk lives. The questions come from
`aeoQuestions` (already derived in code, already fixed) plus the ones
Search Console says people actually typed; the answers come from
`businessFacts` through the C2 door, so a claim nothing supports cannot
reach the page — and `claim_checks` records what did.

**The honest limit:** this is as much an interview as a build. Shipping
rates, timelines, materials, what the business will and will not do —
if those are not on record, there is nothing to answer with, and the
right output is a short page of three true answers rather than a long
one of twelve vague ones.

### A4 — where the business is mentioned, measured before acted on — **S then L**

**A4a (S):** read what is already there. The competitors the AEO check
has been naming, per question, per run — turn that into "these eight
businesses get named for your questions and you do not", which is a
finding the Strategist can carry into the daily email.

**A4b (L, and mostly not code):** the mentions themselves. Directory
listings, review requests, being written about. **Most of this is not
software** — it is the owner doing things, and the product's job is to
tell him which ones are missing and to stop him being invisible, not to
automate a directory submission.

**And a line that stays out:** nothing here buys mentions, generates
reviews, or posts on a directory as the business without being asked.
Incentivised reviews breach Google's policy and a fake mention is a
claim nothing supports.

### A5 — the measurement that already exists, on a schedule — **S**

`aeoAgent` runs **on demand only**. It is not in `cronGroups.ts`, so
unless the owner opens the SEO toolkit there is no trend — and a trend
is the entire reason the questions were fixed in code.

**This is a cost decision, not an engineering one.** Each run is a
model call with live web search, for four questions. The honest options
are weekly or monthly per business, and the number belongs with the
other policy numbers rather than in a cron file. **Recommendation:
monthly, in the `signals` group, after the local work is live** — there
is no point tracking a number before anything has been done to move it.

---

## 4. What already helps, stated plainly

A plan that lists only gaps implies the product starts from nothing.
Four things are already right:

| | |
|---|---|
| **The AEO check is honest** | fixed questions, a real trend, and a disclosure that it is simulated. Most tools in this category claim to query ChatGPT and do not |
| **The knowledge is grounded** | five RAG entries written for AEO, so the recommendations are not Claude's generic advice dressed as expertise |
| **The schema that exists is correct** | LocalBusiness with the city and no invented street, no `aggregateRating` anywhere — the two things most implementations get wrong |
| **The claims pipeline makes this safe** | answer-first content is a page of stated facts, and C2 plus `claim_checks` is the only reason that is a good idea here rather than a dangerous one |

**And one thing that is already true and worth not breaking:** nothing
is blocking the answer engines. A1 should write that down, not change
it.

---

## 5. What this plan does NOT promise

- **No ranking, and no being named.** Nothing here makes an AI mention a
  business. It makes the site extractable, the facts stated, and the
  absence measurable.
- **No direct measurement of ChatGPT, Gemini or Perplexity.** Hawlai has
  no API access to any of them, and the existing disclosure says so.
  Anything claiming otherwise would be inventing a number.
- **No rich results from FAQPage.** Google narrowed that in 2023. The
  reason to emit it is extractability.
- **And no claim that llms.txt helps.** It is cheap, it is written beside
  A1, and until something consumes it the honest statement is that
  nobody knows.

---

## 6. Order, and against the local plan

| | Size | Depends on |
|---|---|---|
| **A1** robots.txt + sitemap + llms.txt | **S** | one decision (opt-out or not) |
| **A2** FAQ block + FAQPage + inner-page JSON-LD | **M** | nothing |
| **A3** answers from the business's own facts | **M** | A2, and the owner answering |
| **A4a** who gets named instead of you | **S** | rows already collected |
| **A5** the AEO check on a schedule | **S** | a cost decision |
| **A4b** the mentions themselves | **L** | mostly the owner, not code |

**A1 and A2 share nothing with the local plan's L1 and L2** — different
files, different surfaces — so the two can run in either order or
together. **A3 and the local plan's L1 are the same interview**: both
need the owner's own facts on record, and asking him twice would be a
waste of the one scarce thing here. **Do them as one conversation
whichever plan runs first.**

**My suggested order, if both plans are wanted:** Search Console first
(it is the instrument for the local half), the GBP application the same
day (it is a queue), then **A1 + A2 together** (small, independent, and
A2 is the structural core), then the single interview that feeds **A3
and L1**, then A4a and A5 once there is something to measure.

---

## 7. What I need decided

**All four approved as recommended, 6 November 2026.** The founder's
order: Search Console (done) → the GBP application → **A1 + A2 beside
the local plan** → the combined A3 + L1 interview → A4a and A5.

1. **May a business opt out of AI crawling of its own storefront?**
   *Recommend: build the generated route, default everyone in, add the
   flag when somebody asks.*
2. **A1 + A2 beside the local plan, or after it?** *Recommend: beside.*
   They touch the block registry and the schema file; the local plan
   touches the audit and the business's own facts.
3. **Is A3's interview one conversation with L1's?** *Recommend: yes,
   and whichever plan starts first owns it.*
4. **Does the AEO check go on a monthly schedule now, or after the work
   is live?** *Recommend: after.* There is no point tracking a number
   before anything has been done to move it, and each run costs a model
   call with web search.
