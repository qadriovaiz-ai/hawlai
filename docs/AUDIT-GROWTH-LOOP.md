# The Growth Loop vision, against what is already built

Ovaiz's "Website Growth Auditor → Planner → Executor → Verifier",
audited line by line against S4–S7, PLAN-AEO-GEO.md and
PLAN-LOCAL-SEO.md.

**Audited 7 November 2026**, from the code rather than from memory.
Every row below names the file or migration it rests on.

---

## 1. The verdict

**Roughly four-fifths of this vision is built, and the vision's own
closing sentence is a description of S4–S7.** *"Hawlai doesn't do SEO.
It continuously watches the business + website, finds growth
opportunities, makes evidence-backed changes, asks approval where
needed, executes them, and measures the result"* — that is the daily
audit, the opportunity feed, the approval registry, the publish actions
and the decisions/outcomes loop, in that order.

**The suspicion in the brief was right.** Most of it has a different
name, and the names are below.

**And one correction I owe, because I said the opposite yesterday.** I
told you `technicalAudit.ts` "speed/duplicate/thin nahi dekhta". Two of
those three are wrong: `thin_content`, `duplicate_title` and
`duplicate_description` have been findings in that file all along. Only
page speed is genuinely absent.

**The distinction that matters most in this audit, and it is not a
feature gap:** the vision asks for *measurement*, and several things
that carry the right name are *advice*. `site_speed` in the SEO
department produces "6 concrete site speed suggestions relevant to a
small business site" — generic, model-written, never having looked at
this site. `internal_linking` invents "5 internal linking suggestions
for a small business website in this category". `competitor_keywords`
returns ten keywords competitors are *probably* targeting.

None of those is a measurement, and **advice shaped like measurement is
the exact thing this codebase's claims layer exists to distrust.** Where
a row below says ❌, it often means "the name exists and the number does
not".

---

## 2. Layer 1 — continuously inspect the website

| The vision asks for | State | What it is called here |
|---|---|---|
| Crawl all important pages | ✅ | `src/lib/seo/technicalAudit.ts`, run daily as `site_audit` in `dailyRunners.ts`. **Not a crawler, and better than one:** it reads the `website_pages` rows that *build* the pages, so nothing is missed to a failed fetch or unrendered JavaScript. |
| Title, meta, H1/H2, URLs | ✅ | Findings `no_description`, `description_length`, `no_heading`, `multiple_h1`, `duplicate_title`, `duplicate_description`, `not_published` |
| Product/service information | ✅ | `businessFacts.ts` + `loadStorefrontItems`; published as `ItemList` by `structuredData.ts` |
| Internal links | ⚠️ half | `broken_internal_link` **detects** a dead link. Nothing suggests a link from this site's own pages — `internal_linking` invents generic ones. |
| Schema / structured data | ✅ | `structuredData.ts`: LocalBusiness, Product/Service, Offer, ItemList, FAQPage (A2), `telephone`/hours/`areaServed`/`sameAs` (I1) |
| robots.txt / sitemap | ✅ | A1 — `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/llms.txt/route.ts` |
| **Page speed / technical issues** | ❌ | Nothing measures it. Only `site_speed`, which is generic advice. |
| Duplicate / thin / outdated content | ⚠️ two of three | `thin_content` (under 50 words), `duplicate_title`, `duplicate_description` all exist. **Duplicate body text** and **outdated/freshness** do not. |
| Business location / contact / reviews | ⚠️ | City on `dealerships`; phone, hours, areas, address in `business_listing_facts` (migration 221); reviews read daily into `google_reviews_snapshot` (migration 103). **The consistency check between them is missing** — that is the local plan's L2. |

---

## 3. Layer 2 — SEO

| The vision asks for | State | What it is called here |
|---|---|---|
| "Which searches are valuable for this business?" | ✅ **and counted, not guessed** | `src/lib/seo/searchQueries.ts` reads Google's own impressions (28-day window, 3-day lag), names a query at 10 impressions, flags 20 impressions with no clicks, and calls positions 4–20 "found but below where people click". Its header is explicit: *"Nothing in this file estimates a volume… the reason this exists is that the SEO work it replaces was guessed."* |
| Keyword clusters | ❌ | Nothing groups the real queries. `competitor_keywords` invents ten. |
| Better titles / meta | ✅ | `update_page_meta` — chat sets the live search title and description with approval and a live read-back (migration 203) |
| Content briefs | ❌ | Not built — **and not its own feature.** Folded into G3 (founder, 7 Nov): when the query-gap hop proposes a page, the topic, the queries it answers and the points it must cover ARE that proposal. A brief with no page to become is a document nobody reads. |
| Internal linking | ⚠️ | As above: detection yes, suggestion from real pages no |
| Service / product pages | ⚠️ | `POST /api/website-builder/pages` creates one. **Nothing decides that one is needed.** |
| Local SEO improvements | ⚠️ | PLAN-LOCAL-SEO.md is written; L1 is paused for want of a real business, L2–L4 unbuilt, L4 waits on the GBP queue |

---

## 4. Layer 3 — AEO

| The vision asks for | State | What it is called here |
|---|---|---|
| Generate real customer questions | ✅ **twice over** | `src/lib/seo/aeoQuestions.ts` derives four in code — same every run, so a trend means something — and `searchQueries.ts` supplies the ones people *actually typed* |
| Direct, factual answer blocks on the site | ⚠️ | The **blocks** exist: `faq` / `faq_item` in the registry, rendered visibly, published as FAQPage (A2). **Writing the answers** is A3, paused on 7 November because the only business on the platform is test data. |

---

## 5. Layer 4 — GEO / AI-search visibility

| The vision asks for | State | What it is called here |
|---|---|---|
| Entity / business information consistency | ⚠️ | `sameAs` is emitted (I1), so a machine can tie the site to the Maps listing and the socials. **Nothing compares the three for disagreement.** |
| Clear facts + sources | ✅ | This is the whole claims layer: `claimCheck.ts`, `factsGate.ts`, `businessFacts.ts`, and `claim_checks` (migration 217) recording what actually went out |
| Author / expertise signals | ❌ | No `Person`, no `author`, nothing. |
| **Original statistics / case studies** | ❌ **and it should stay that way** | See §8. |
| Product / service details | ✅ | `itemNode` — Product or Service, with Offer, price, stock |
| Local / entity information | ✅ | I1, migration 221 |
| Structured data | ✅ | `structuredData.ts` |
| Measured over time | ⚠️ | `aeo_presence` (migration 199) stores a run, and `aeoAgent` **runs on demand only** — it is not in `cronGroups.ts`. That is A5, and the plan now says it ships behind a flag so it does not bill for a business that does not exist. |

---

## 6. Layer 5 — business context → Master Brain

**Every input the vision lists is already joined.**

| Input | Where |
|---|---|
| Website | `businessFacts.ts` reads the live pages |
| CRM / leads | `leads`, `countsAsLead`, lead scoring in the daily run |
| Products / offers | `loadStorefrontItems`, the offers table |
| Reviews | `google_reviews_snapshot` (103) |
| Analytics | Search Console (200/201) + attribution (196) |
| Social | the connected accounts and their posts |
| Competitors | positioning from public pages, plus who `aeo_presence` names instead of this business |
| The brain itself | `src/lib/agents/masterBrainV2.ts` |

**And the vision's own example is built.** *"Competitor X is ranking for
a query Hawlai's customer isn't covering"* is
`src/lib/opportunities/marketOpportunities.ts`, whose header answers the
vision's "Opportunity Score" directly and refuses it:

> *"Multiplying five subjective one-to-ten guesses produces a
> precise-looking number with nothing underneath it — '73/100' invites
> belief it hasn't earned."*

So instead: demand **counted** from Google's impressions, commercial
intent **decided in code** from the searcher's own words, capability
**counted** from the catalogue, competition gap **observed** from who
search names instead, and customer relevance **declared unknown** rather
than filled in to complete a formula. The output is a band.

**The chain after the opportunity, hop by hop:**

| Hop | State | What it is called |
|---|---|---|
| Opportunity | ✅ | `marketOpportunities.ts` → `opportunityAgent.ts` |
| → Page/content needed | ❌ | **The one missing hop.** The opportunity ends as a card with a link for the owner to click. |
| → SEO/AEO/GEO changes | ✅ | `update_page_meta`, the block tree, `structuredData.ts` |
| → Draft | ✅ | the builder and the content agents, through the claims guard |
| → Approval | ✅ | `executionPolicy.ts`, `requestApproval.ts`, `pending_approvals`, and S7's autonomy levels deciding when to ask at all |
| → Publish | ✅ | `src/lib/publish/` — `previewDiff`, `targetRef`, staleness |
| → Monitor result | ✅ | `claim_checks` + `outputMonitor.ts`, and the loop below |

---

## 7. Layer 6 — the feedback loop

| The vision asks for | State | What it is called here |
|---|---|---|
| Before: visibility / ranking / coverage | ✅ | `decision_baseline` (migration 216) |
| Change made | ✅ | `decisions` (migration 215) |
| After N days | ✅ | `decisions.check_date`, read by `runResultsJob` — `decision_results`, in the `signals` cron group |
| The metric is named in advance | ✅ **and this is better than the vision asks** | `decisions.expected_effect` is CHECK-constrained to carry `metric` and `direction`, so *"the job never has to guess what success meant"* |
| 7 / 14 / 30 days specifically | ⚠️ | One `check_date` per decision, not three fixed windows |
| Impressions, clicks | ✅ | Search Console |
| Conversions | ✅ | attribution (196) |
| AI-search visibility | ⚠️ | `aeo_presence` exists; not on a schedule (A5) |
| Learn → next optimization | ✅ | S4/S5 targets, the Strategist, and S7's promotion/demotion reading outcomes |

---

## 8. What should stay missing, and this is the one place I would argue
## back

**Original statistics and case studies, generated by the product.**

The vision lists them as a GEO signal, and they are. But a product that
writes a statistic for a business that did not measure anything is
fabricating evidence — and this codebase's entire claims layer exists
because of **one** unchecked line that reached a live homepage and then
became the proof for the same claim everywhere else. A fabricated
statistic is that failure with a number attached, which is worse: a
number is the most believable thing on a page and the least likely to be
questioned.

The same applies to anything that would generate reviews or place
mentions. PLAN-AEO-GEO's A4b already says it: *"nothing here buys
mentions, generates reviews, or posts on a directory as the business
without being asked."*

**The honest version of this signal** is to help the owner publish a
number he actually has — order counts, delivery times, how long
something lasts — which is what the interview (I2/I3) collects and what
`claim_checks` then holds to account. That is already the plan.

---

## 9. What is genuinely missing — and it is five things, not six layers

Nothing here needs a new department, a new page or a new tool
(CLAUDE.md rule 5). Two of the five belong inside plans that already
exist, and three are new.

| | What | Where it belongs | Size |
|---|---|---|---|
| **G1** ✅ | **Duplicate body text and stale pages** — two more findings beside the nine `technicalAudit.ts` already has: the same paragraph on two pages, and a page nobody has touched in N months. Pure functions over `sections`, no new surface. | the audit | **S** |
| **G2** | **Keyword clusters from the real queries** — group what Search Console actually reports, by shared words and intent. Replaces `competitor_keywords`' invented ten with the owner's own demand. | SEO toolkit | **S/M** |
| **G3a** ✅ | **A page can be a draft.** The safety foundation G3 cannot be built without — and a fix for a hazard that was already live. | the builder | **S/M** |
| **G3** ✅ | **Query gap → a page that answers it**, briefing included — the one missing hop in the vision's own chain. The planning step (topic, the queries it answers, the points to cover) is part of this hop, not a separate feature. Detection exists (`marketOpportunities`), page creation exists (`POST /api/website-builder/pages`), the claims guard and approval exist. This joins them: an opportunity above a demand threshold proposes a page, with its title and brief drawn from the query, through an approval card. | a new piece of PLAN-AEO-GEO | **M** |
| **G4** | **Page speed, measured** — the only item with a genuine external dependency. PageSpeed Insights has a free API; it needs a key, a cap, and a decision about cost and cadence. Until then the honest state is "not measured", not "6 suggestions". | the audit | **M**, and a cost decision |
| **G5** | **Entity consistency across site, Maps and socials** — name, address and phone compared between `business_listing_facts`, the Place record and what the storefront prints. This is PLAN-LOCAL-SEO's **L2**, already written and unbuilt. | local plan L2 | **S/M** |

### G1 as built — 7 November 2026

Two findings beside the nine `technicalAudit.ts` already had, and the
audit now has eleven:

| Finding | Fires when | Priority |
|---|---|---|
| `duplicate_body` | the same paragraph (25+ words) appears on more than one page | medium |
| `stale_content` | a page has not changed in over 12 months | low |

**Both thresholds exist to stop the finding firing on good work**, which
is the reasoning that fixed `no_faq` in A2: a finding that fires against
what the owner has already done teaches them to ignore findings. Twenty-
five words is a paragraph, not a tagline — a shared line under every
heading is a site having a voice. Twelve months is deliberately
conservative: most of what a small business says about itself is still
true a year later, so `stale_content` is a low-priority hint and its fix
says so (*"If it is all still true, it needs nothing"*).

**Legal pages are exempt from both.** Standard privacy and terms wording
is not penalised anywhere, and `pageKinds.ts` already records that a
sentence is never removed from one on Hawlai's initiative — so the
finding would have had no action behind it. Last year's privacy policy
is not out of date for being last year's.

**An unreadable date is not a stale page.** `daysSinceChange` returns
null for a missing date, an unparseable one and a date in the future
(a clock problem). "The audit could not see a date" and "nobody has
touched this in a year" are different facts, and only one is the owner's
problem.

**And one design error a test caught:** the first version read prose by
PROP NAME, which cannot work — the `heading` block holds its words on a
prop called `text` while the `text` block holds its prose on one called
`html`. It now reads by BLOCK TYPE, from a declared list of the two
block types that hold prose, so a long heading is never mistaken for a
paragraph and an FAQ's *question* is never mistaken for its *answer*.

**Unverified live:** the daily `site_audit` has not run with these two
findings against a real site, because there is no real site. The
thresholds are reasoned, not tuned against real pages.

### G3a as built — 7 November 2026, migration 223

**G3 turned out to need a foundation that did not exist, and finding out
why uncovered a live fault.**

`website_pages` had **no published flag of its own.** A site was
published or not, and every page on a published site was reachable the
moment its row existed. So Website Builder's Add Page button put an
**empty page on the live site, at a real URL**, before the owner had
written a word of it — a heading and an empty paragraph, live.

**And A1 made it worse, which is mine.** `/sitemap.xml` lists every page
of every published site, so since 6 November that empty page has been
**advertised to crawlers** the moment it was created. Before A1 it could
at least only be found by following a link, and there was no link.

**G3 could not have been built over that.** Approving a proposed page
would have published an empty page and put it in the sitemap — the
product doing, on its own initiative, exactly the thing above.

| File | What changed |
|---|---|
| `supabase/migrations/223_page_draft.sql` | `website_pages.published`, **default true** |
| `src/lib/seo/crawlers.ts` | the sitemap's inner-page read filters on it |
| `src/app/site/[slug]/[page]/page.tsx` | a draft is `notFound()` |
| `src/app/api/website-builder/pages/route.ts` | a new page — and a duplicated one — starts unpublished |
| `.../pages/[id]/route.ts` | the owner's publish/unpublish, strictly a boolean |
| `WebsiteBuilderView.tsx` | the control, and a line saying a draft is a draft |

**`default true` is the important half.** Every page that existed when
the column was added was already live; a default of false would have
unpublished a platform's worth of pages the moment the migration ran.
The migration ships the query that proves it did not.

**Publishing is not a side effect of saving**, because saving is
something people do halfway through writing — and taking a page down is
never harder than putting it up (rule 6's reasoning).

**A draft says it is one.** A page the owner cannot find on the live
site, with no explanation, would be worse than one published empty — at
least that was visible.

### G3 as built — 7 November 2026

**The hop exists now.** A search with real demand and no page produces an
approval card; approving it creates the page, unpublished.

| File | What it does |
|---|---|
| `src/lib/opportunities/pageProposal.ts` | the proposal, pure: title, slug, the searches it answers, what is on record, what is missing |
| `src/lib/opportunities/proposePage.ts` | one card per run, asked once per search ever, through `requestApproval` |
| `src/lib/executionPolicy.ts` | `create_page_draft` — create, low risk, asks first |
| `src/app/api/approvals/[id]/route.ts` | the branch that creates it, unpublished, with the slug re-derived |
| `src/lib/growth/measures.ts` | declared not-collected, with the reason |

**What a proposal is allowed to contain** is the whole design, and it is
the audit's central finding turned into code: the vision asks for
measurement and several things here that carry the right name are
advice. So — the **query** as the customer typed it (never a keyword a
model thought was "probably" being searched), the **impressions**
counted from Google, **which recorded notes belong on it** by title, and
**which answers are missing**, named.

**That last part is what keeps it honest.** A buying page needs a price,
a delivery time, a reply time and a reason to choose this business. If
the owner has not answered those, the card says so — *"I don't have your
Price range, Delivery time yet, so I can't write the page for you"* —
instead of the page being written around the hole. Every name in that
sentence is a real interview question (I2), so it is something the owner
can go and answer.

**Not one word of customer-facing copy is written here.** The page is
created empty and unpublished; the words come from the owner or from a
generator that goes through the claims guard. A test asserts the module
contains no selling point, claim or statistic — the thing §8 argued
back about.

**One card per run, asked once per search, ever.** Three cards saying
"write a page" is a backlog, and a backlog is what gets closed unread.
A rejected card counts as asked: *no* is an answer.

**The outcome is declared not-measurable, and the reason matters:** this
action cannot move a number, because the page is empty and unpublished
until the owner acts. The thing worth measuring is the page **going
live**, which is a different action this product does not record yet —
and when it does, that is what gets `impressions for this search` with
its baseline on the day it was published.

**Unverified live:** no card has been raised, no page created from one.
There is no real business with Search Console data to find a gap in.

**And two smaller ones**, both already named in existing plans rather
than new: the AEO check on a schedule (**A5**, behind a flag) and who
gets named instead of this business (**A4a**).

**Author/expertise signals** I would leave for later and say why: a
`Person` node needs a real named person who accepts being the stated
author, and the interview does not ask for one. It is two lines of
schema and one real decision by the owner, so it belongs with the
interview rather than with the audit.

---

## 10. Sequence, since you left it to me

**The audit first, which is why you are reading this before I5.** I5
builds a progress table, and if the vision had asked for a different
shape of fact-collection I would have built the wrong table. It does
not — the vision's collection story *is* the interview — so I5 is
unaffected and can proceed as planned.

**Then I5**, because it finishes an initiative already in flight and it
is the piece that gives I3's `weak` flag somewhere to live.

**Then G1 and G3**, in that order: G1 is small and sharpens the audit
that everything else reads from, and G3 closes the one hop the vision
asks for that genuinely does not exist. G4's cost decision and G2 can
follow.

**What I would not do** is start a new "Growth Loop" initiative. Four
fifths of it is S4–S7 under other names, and a sixth plan describing the
same machinery would be the thing that makes the next audit harder, not
easier.
