# SEO, AEO and GEO — sizing the next three pieces

## 0. Method, and what this document does not know

Sizing only. Nothing built, nothing wired, no migration. Everything
about this repo below was read out of it on **24 November 2026**; the
GEO section's outside facts came from web search the same day and are
marked where they are vendor claims rather than verified.

**Three things this cannot settle, and nobody can settle from code:**

- **Perplexity's and OpenAI's developer terms** on using their APIs for
  brand-mention tracking. I searched and did not find them stated;
  they need reading directly, by someone willing to be bound by them.
- **Whether AI Overviews appear for Indian locations** on the queries
  this product cares about, and whether the SERP vendors cover Indian
  locales. No source addressed country-level behaviour.
- **What a real business's questions are.** A3 is paused for exactly
  this reason and §1 inherits it: the planner's output quality is
  mostly an interview, not a build.

**One correction to the obvious framing, up front.** "SEO auto-fix
loop" sounds like the largest of the three and is the smallest. The
machinery already exists — S7's autonomy ladder, both page actions
already reversible, and `update_page_meta` already the single entry in
`L2_ALLOWLIST`. What it needs is **evidence**, not code. §3.

---

## 1. What already exists

| | Lines | What |
|---|---|---|
| `src/lib/seo/` | **20 files** | `runTechnicalAudit`, `technicalAudit`, `searchConsole`, `searchQueries`, `queryClusters`, `aeoQuestions`, `aeoPresence`, `aeoSchedule`, `structuredData`, `liveMeta`, `liveText`, `pageTitle`, `metaLength`, `pageKinds`, `crawlers`, `localPresence`, `placeSnapshot`, `pageSpeed`, `listingFacts`, `siteIdentity` |
| `agents/aeoAgent.ts` | — | the AEO check: a model call with live web search over 4 fixed questions |
| `growth/audit.ts` | — | 9 finding types, three of them page-SEO gaps |
| `publish/platforms/hawlaiSite.ts` | **~630** | `update_page_meta` and `update_page_text`, both with `undo` |
| `autonomy/` + `autonomyLevels.ts` | 5 files | L0/L1/L2, `canHoldL1`, `pinnedToL0`, promotion evidence, automatic demotion |
| `answer_gaps` (migration 230) | — | which question a real customer asked that the records could not answer |
| `search_queries` | — | what people actually typed, from Search Console |

**A1 and A2 are shipped** (robots.txt, sitemap, llms.txt; an FAQ block
and FAQPage schema). **A5 is shipped behind `AEO_SCHEDULE_ENABLED`,
default off. A3 is paused** since 7 November — no real business, so no
facts to answer from. `docs/PLAN-AEO-GEO.md` carries all of it.

### 1.1 Two facts that decide most of the sizing below

**The AEO check already says what it is, in the product.** Its
disclosure is fixed in code rather than model-generated:

> "Simulated using Claude's own live web search — **not a direct query
> of ChatGPT, Gemini, or Perplexity, which Hawlai has no API access
> to.** Directionally useful for spotting gaps, not a guarantee."

Everything in §2 is about whether that sentence can be made smaller.

**Both page actions are already reversible, and one is already
allowlisted for unattended operation:**

```ts
update_page_meta: { riskLevel: "medium", requiresApproval: true }   // + undo
update_page_text: { riskLevel: "medium", requiresApproval: true }   // + undo
L2_ALLOWLIST = ["update_page_meta"];   L2_DAILY_CAP = 3
```

Neither is pinned to L0 (not a spend, not a delete, not critical), and
`canHoldL1` passes because `hawlaiSite` declares `undoes` for both.
**That is the whole reason §3 is small.**

---

## 2. AEO — the "query → answer page" planner

### 2.1 What is being asked for, narrowed

Not "write more content". A planner: take the questions people
actually ask, decide which ones the site does not answer, decide
whether each deserves **a line on an existing page, an FAQ entry, or a
page of its own**, and produce that one — through the existing claims
door so nothing invented reaches it.

A3 as planned stops at the FAQ block. This goes past it, so it is
**A6** rather than a reshaping of A3.

### 2.2 The inputs all exist, and that is the good news

| Source | What it gives | State |
|---|---|---|
| `search_queries` | what people really typed, per page, with impressions and position | live, filled by `search_console_sync` |
| `queryClusters` | those queries grouped, so twelve phrasings of one question are one question | live |
| `answer_gaps` (230) | **the best input there is** — a question a real customer asked that the records could not answer | table live; written by `chat/answerGaps.ts` |
| `aeoQuestions` | the 4 fixed buyer-intent questions | live, deliberately fixed |
| `businessFacts` + C2 | what may legally be said | live |

`answer_gaps` deserves its own line because of what it is: every other
gap is one the product went looking for; that one is **the market
telling the business what it failed to answer**. A planner that ignored
it in favour of keyword volume would be answering questions nobody
asked.

### 2.3 The part that is genuinely hard, and it is not the writing

**Deciding that a question deserves a page at all.** Get this wrong in
the generous direction and the product mass-produces thin pages — which
is the single most reliable way to damage a small site's search
standing, and it would be Hawlai doing it unasked. The decision needs:

- **Enough facts to answer** — `businessFacts` must already carry the
  answer, or the right output is "ask the owner this", not a page. A3's
  own note: *"a short page of three true answers rather than a long one
  of twelve vague ones."*
- **Not already answered** — `liveText`/`liveMeta` read the live page,
  so this is checkable rather than guessed.
- **Enough demand to justify a URL** — a cluster with one impression is
  a sentence on an existing page, not a page.
- **A shape decision**: FAQ entry (A2's block already exists and
  already emits schema), a paragraph on an existing page
  (`update_page_text`, already reversible), or a new page.

**A new page is the one irreversible step in the whole plan.** Creating
is not reversible by `undo` — this codebase has already settled that
once, for blog posts: *"undo UNPUBLISHES, it does not delete"*. So a
new page must be **created unpublished**, or it cannot be taken back.

### 2.4 Size

| | Piece | Commits | Already exists | New |
|---|---|---|---|---|
| A6-a | The planner: clusters + `answer_gaps` + live page text → a ranked list of unanswered questions, **no writing** | **2** | all five inputs | the ranking, the "already answered" check, and a table to hold the queue |
| A6-b | The **shape** decision per question — FAQ / paragraph / new page | **1** | A2's block, `update_page_text` | the thresholds, and a refusal when facts are missing |
| A6-c | Answers written through the C2 door | **1** | `businessFacts`, `claimCheck`, `factsGate` | the generator, and the "ask the owner instead" path |
| A6-d | FAQ and paragraph output, via the existing reversible actions | **1** | both actions + approvals | wiring, and the approval card's wording |
| A6-e | A new page, created **unpublished** | **2** | `website_pages`, block registry, `pageKinds` | creation + the publish step as a separate decision |
| A6-f | The owner interview that makes any of it worth reading | **0** | `INTERVIEW-A3-L1.md` | **owner only** |

**Total: 7 commits, M–L.** A6-a alone is worth shipping and is the
honest first step: a list of "these nine questions get asked and your
site answers none of them" is useful on its own, costs no model call,
and cannot write anything wrong.

**A6-c is where the risk lives**, same as A3: an invented answer on an
FAQ page is worse than no page. It is also the only piece that needs a
real business to be worth running at all.

---

## 3. SEO auto-fix — the smallest of the three

### 3.1 It is not new machinery, it is evidence

The loop the owner described — audit finds a gap, the product fixes it
with `update_page_meta` / `update_page_text` — **already has every
mechanism it needs**, and three of the audit's nine finding types are
exactly those gaps:

```
pages_without_search_title        → update_page_meta
pages_without_meta_description    → update_page_meta
pages_still_fallback              → update_page_text
```

And S7 already decided how something earns the right to do that alone:
ten approvals as requested, no rejections, no modifications, over at
least thirty days, with at least one measured outcome that is neither
`worsened` nor `not_measurable`. `update_page_meta` is **already** the
one entry in `L2_ALLOWLIST`, capped at 3 a day.

So the gap is not code. **It is that nothing has ever been approved,
because nothing has ever run** — `candle_by_qaaf` is test data, and
S7's own record says nothing in this product has ever run unattended.

### 3.2 What is actually missing

| | Piece | Commits | Already exists | New |
|---|---|---|---|---|
| S-a | Audit gap → a proposed action, raised as an approval | **1** | the 3 finding types, both actions, `requestApproval`, the registry | the mapping, and a per-run cap |
| S-b | The copy for a title/description, through the C2 door | **1** | `pageTitle`, `metaLength`, `businessFacts` | the generator — `metaLength` already holds the length rules |
| S-c | Don't re-propose what he rejected | **1** | the rejection cooldown pattern in `strategist` | applying it to page gaps |
| S-d | `update_page_text` added to `L2_ALLOWLIST` | **1** | the ladder, the cap, the promotion card | **owner decision only** — and my recommendation is NOT yet |
| S-e | The outcome measurement a promotion needs | **1–2** | `search_queries`, `decision_results` | tying a meta change to what happened to that page's impressions |

**Total: 4–6 commits, S–M**, and S-a + S-b + S-c (3 commits) are the
whole loop at L0 — every fix proposed, every fix approved by hand.
That is shippable now and needs no autonomy decision at all.

**S-e is the one nobody can shortcut.** A promotion needs a *measured
outcome*, and measuring whether a better title helped means waiting for
Search Console to move — weeks, not days. Any plan that promises
unattended SEO fixes sooner than that is promising to skip the
evidence.

### 3.3 The tension worth naming

The owner decided three days ago, for the opportunity push: **reach
only — Hawlai says where the gap is, the decision is always his.** S-a
through S-c honour that exactly: they propose, he approves.

S-d does not. It is the first thing in this product that would change a
live page with nobody watching. It is also the lowest-stakes possible
candidate for that — a reversible meta change, capped at three a day,
on a surface he can read — which is precisely why S7 put it in the
allowlist. But it is a different decision from the one he has already
made, and it should be taken as one rather than inherited.

---

## 4. GEO — feasibility first, as asked

### 4.1 What Hawlai measures today, and what it is not

`aeoAgent` asks a **Claude model with live web search** four fixed
buyer-intent questions and records whether the business was named and
which competitors were. Its disclosure says plainly that this is not a
query of ChatGPT, Gemini or Perplexity.

That is a **proxy for what the open web says**, not a measurement of
what any answer engine told any user. The two differ for a reason no
API changes: those products personalise, vary by session, and change
weekly.

### 4.2 Direct access, engine by engine

| Engine | Direct API that answers "were we mentioned?" | Reality |
|---|---|---|
| **ChatGPT** | **No.** The OpenAI API is a different surface from the consumer product — different system prompt, different retrieval, different session. An API answer is not evidence of a consumer answer | would need the consumer product, which means scraping it |
| **Perplexity** | **Partly.** The Sonar API returns answers with citations, which is closer than anything else | **whether their terms permit brand-monitoring use is unverified** — I could not find it stated and it needs reading directly |
| **Google AI Overviews** | **No official API.** Google has never offered one for SERP features | third-party SERP vendors return them |
| **Gemini** | API exists; same consumer-vs-API gap as ChatGPT | — |

### 4.3 The vendor route, and what I will not claim about it

Several vendors sell exactly this as an API — **SE Ranking** (dedicated
endpoints for AI Overviews, AI Mode, ChatGPT, Perplexity and Gemini,
with mentions, citations and share of voice), **Omnia**, **Otterly.AI**,
**Profound** (enterprise), plus Apify actors. For AI Overviews
specifically, **DataForSEO** (via `load_async_ai_overview`),
**SerpApi**, **Scrapingdog** and **Bright Data** return the content in
structured form.

**Everything in that paragraph is a vendor claim from marketing pages,
and should be treated as unverified.** Reported pricing conflicts
between sources badly enough to be unusable for planning — one puts
DataForSEO at $2.60/1k searches, another at $0.10–$0.50 per search.

**Two things no source addressed, and both are load-bearing for
Hawlai:** whether AI Overviews even appear for **Indian** locations on
these queries, and whether the vendors cover Indian locales. A GEO
number for a Shahjahanpur candle business, measured in a US locale, is
worse than no number.

### 4.4 What I will not build, and the reason

**Scraping chatgpt.com or Google's result pages.** No source I found
states Google's current terms on SERP-feature scraping, and this
codebase does not get to find out by doing it: there is a live Meta
integration, a Google OAuth app holding Gmail/YouTube/Ads tokens, and a
Search Console connection on the same Google account. Risking those for
a visibility metric is not a trade worth making, and it is not mine to
make.

### 4.5 Size

| | Piece | Commits | New |
|---|---|---|---|
| G-a | **A4a**, already planned and not built: turn the competitors `aeoPresence` has already been recording into "these eight get named for your questions and you do not" | **1** | the finding; the data is already being written |
| G-b | A ToS reading, per engine, before any integration | **0** | **owner's, or a lawyer's** |
| G-c | One vendor behind one adapter, flag-off, if G-b clears it | **2** | the adapter, plus a trial measuring Indian locales specifically |
| G-d | Trend storage and the owner-facing number | **1** | `aeo_presence` already stores runs — mostly reuse |
| G-e | Dropping or narrowing the disclosure in §1.1 | **1** | and ONLY if G-c actually measures a named engine |

**Total: 4–5 commits, S–M — but G-a is the only one I would start.**
It costs one commit, uses data already being recorded, needs no vendor,
no contract and no terms reading, and answers the question the owner
actually has: *am I invisible compared with the businesses that are
not?*

Everything after G-a buys **precision on a number nobody is acting on
yet**. With one test business on the platform, a paid AI-visibility feed
would bill monthly to measure the visibility of a business that does
not exist — the same burn that paused `POSITIONING_ENABLED` in
September and put A5 behind a flag in November.

---

## 5. Order, and the one-line case for it

1. **G-a** — 1 commit, no dependencies, no cost, uses data already
   written. Answers "am I invisible?" today.
2. **S-a + S-b + S-c** — 3 commits. The auto-fix loop at L0: every fix
   proposed, every fix approved. Honours "reach only" exactly.
3. **A6-a** — 2 commits. The planner's list, with nothing written yet.
   Cannot produce a wrong page because it produces no page.
4. Then the pieces that need a real business: A6-c, S-e, G-c.

The first six commits need no owner decision beyond "go", no vendor, no
terms reading, and cannot write anything to a live page that was not
approved by hand.

---

## 6. The founder decisions this needs

1. **Does the SEO loop ship at L0 first** (propose, he approves) — or
   does he want S-d, the first unattended page change, in scope from
   the start? My recommendation is L0 first, and S-d only after S-e has
   produced a measured outcome, because that is what a promotion is
   supposed to rest on.
2. **Is a new page in A6's scope at all**, or should the planner stop
   at FAQ entries and paragraphs on existing pages? Creating is the one
   irreversible step, and FAQ + paragraph covers most real questions.
   If a new page is in scope, it is created **unpublished**.
3. **Is GEO worth paying for before there is a business?** My answer is
   no, and G-a is the version that costs nothing.
4. **Who reads the Perplexity and OpenAI developer terms?** I can
   summarise what a page says; I will not certify that a use is
   permitted, and this is the piece that gates every paid GEO option.
5. **How many fixes a day may the loop propose?** `L2_DAILY_CAP` is 3
   for unattended work; a proposing loop needs its own number, or the
   first run on a neglected site raises forty cards and he reads none.

---

## 7. What is still open

- **A3 is still paused** and A6 inherits the reason: no real business,
  so no facts to answer from. A6-a is the part that works anyway,
  because a list of unanswered questions needs no answers.
- **Thin pages are the real risk in A6**, and the planner's thresholds
  are the only thing standing between "answer the questions people ask"
  and "mass-produce pages nobody asked for". That is a judgment to be
  written down, not tuned quietly.
- **`answer_gaps` has a producer but no reader yet** for this purpose.
  It is the most valuable input in §2 and currently feeds only the
  onboarding fact-gap flow.
- **Nothing in this product has ever run unattended**, and S-d would be
  the first. The ladder for it is built; the evidence is not.
- **The disclosure in §1.1 stays exactly as it is** until something
  actually queries a named engine. It is currently the most accurate
  sentence in the SEO toolkit.
