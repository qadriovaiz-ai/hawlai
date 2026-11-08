# Local search — Google Business Profile and the rest of it

Written 6 November 2026, at the founder's request, with his written
reason:

> *candle_by_qaaf jaise local businesses Google search mein (jaise "soy
> candle in Shahjahanpur") dikh hi nahi rahe — site naya hai, Search
> Console 2 din se fail hai, aur sabse badi baat GBP/local-SEO Hawlai
> mein hai hi nahi.*

**And it covers Google's TRADITIONAL surfaces only** — blue links and
Maps. Being named when somebody asks an AI is a different question with
its own plan, [PLAN-AEO-GEO.md](PLAN-AEO-GEO.md), written on 6 November
on a second written reason. The two share one thing and it is the
scarce one: both need the owner's own facts on record, so **L1 and
A3's interview are the same conversation**, and whichever plan runs
first owns it.

**That sentence is what CLAUDE.md rule 5 asks for.** "No new
departments, tools or pages… A new tool needs a written reason from the
owner." This is the reason, on the record, and this plan is scoped
against it rather than against everything local SEO could ever mean.

**Nothing here is built.** It exists so the founder can decide *when* —
after S7, or beside it.

---

## 1. The one thing that is time-sensitive, before anything else

**The Google Business Profile API needs Google's approval, and that is a
wait, not a build.** Access is granted per project after a form, and the
turnaround is commonly weeks. Every other item in this plan can be built
in days; this one cannot be started late.

**So the application goes in first, whatever is decided about the rest.**
If it is approved and nothing is built yet, nothing is lost. If it is
built first and the approval has not been applied for, the work sits
finished and unusable.

What that needs from the founder: the existing Google Cloud project (the
same one Gmail, YouTube, Ads and Search Console already use), and the
Business Profile API access form. One sitting.

---

## 2. What Hawlai already has — more than "nothing", less than a listing

Measured in the repo on 6 November 2026.

| Piece | Where | What it does |
|---|---|---|
| The Maps listing is **identified** | `dealerships.google_place_id` | set from Integrations |
| Reviews read daily | `reputationAgent.ts`, Places API, `google_reviews` subsystem | rating, count, 5 recent reviews |
| `LocalBusiness` structured data | `src/lib/seo/structuredData.ts:103` | name, description, url, logo, **city only** |
| Real search queries | `searchQueries.ts` + Search Console | what people actually typed — **broken since 4 Nov, see §5** |
| A technical audit | `runTechnicalAudit.ts`, daily | titles, descriptions, placeholders |
| "Where are you online" | `online_presence` (migration 212) | Website / Google Maps / social / just starting |

**What is genuinely missing:** the listing itself. Hawlai can *read* a
Place's reviews and cannot see or change its hours, categories,
services, photos, posts or Q&A — which is where a query like "soy candle
in Shahjahanpur" is actually won or lost.

---

## 3. The four pieces, smallest first

### L1 — The listing's facts, published truthfully on the site — **S**

**PAUSED — 7 November 2026, and the migration with it.** This phase is
an interview plus a migration that gives the answers somewhere to live
(phone, hours, areas served, `sameAs`, address). The only business on
the platform is test data, so the interview has nobody to interview —
and adding columns before anyone can fill them truthfully is schema
without a purpose. The questions are written and waiting in
[INTERVIEW-A3-L1.md](INTERVIEW-A3-L1.md).

**And one consequence worth stating:** L4's GBP application should still
go in, because it is a queue and the wait is the point. A listing cannot
be claimed for a business that does not exist, but the API access can be
waiting when one does.

**No Google API, no approval, no wait.** `businessNode` publishes the
city and nothing else, with an honest comment saying why: *"an
addressLocality with no street is honest; an invented street address is
not."* That reasoning is right and the answer is not to invent — it is
to **ask the owner once** and publish what he gives:

phone · opening hours · the areas he serves · `sameAs` pointing at his
own Maps listing and social profiles · `geo`, if the Place record has it.

Each one is a fact he has or does not. Every one that is on record makes
the page say something true that it currently does not say.

**And one deliberate NO:** `aggregateRating` stays out, even though
Hawlai now reads the rating daily. Publishing Google's own rating in
your own page's schema is against Google's guidelines, and the existing
comment — *"a rating is the single most tempting thing to invent and the
most damaging to get wrong"* — is the right instinct for the right
reason.

### L2 — A local-presence audit, beside the technical one — **S/M**

The daily audit already reads the site and finds missing titles. The
same shape, pointed at local facts: no phone anywhere · no hours · the
city missing from the page a stranger lands on · the Maps listing not
linked · **the name, address and phone not matching between the site and
the Place record** (the one check that needs the Places read Hawlai
already does).

Findings, through the Strategist, into the daily email — the machinery
S4 and S5 built. No new surface.

**THE MAPS LEG SHIPPED 8 November 2026** (migration 225). The founder
took the Enterprise SKU knowingly: the field mask is `displayName`,
`formattedAddress` and `nationalPhoneNumber`, and the phone is what
prices the call — free for the first 1,000 Place Details requests a
month, $20 per 1,000 after, which at one request per business per month
is a thousand businesses before anything is owed.

**Split in two, because the groups forced it.** `signals` is
"database-only and fast" by `cronGroups.ts`'s own rule, so a Place
Details call cannot run there. The FETCH is monthly, in `heavy`, and
writes one row to `place_snapshots`. The COMPARISON is three strings
against three strings, costs nothing, and runs daily inside `site_audit`
where the rest of the local audit already lives. The same shape
`search_console_sync` uses: the slow half writes, the fast half reads.

**Not behind a flag**, unlike G4 and A5, and the difference is real:
those spend on every run, while this skips entirely for a business with
no listing connected — which is every business today.

**The phone is compared by digits, not by text.** Maps returns the
national format and the owner types whatever he types, so a text
comparison would report a disagreement every single day for a number
that is perfectly correct. Leading zeros are dropped from both sides and
the shorter must be a suffix of the longer, so no country code and no
national length is hardcoded.

**The earlier note, kept because it is why this took two days:**

**SHIPPED 7 November 2026 as G5, except the Maps leg.** The line above
calls the site-vs-Place comparison "the one check that needs the Places
read Hawlai already does" — and that read exists but is **field-masked to
id, displayName, formattedAddress, rating and userRatingCount**. No phone:
that is a higher Places (New) billing tier. It is also a *search* run when
the owner connects reviews, not a stored snapshot — only
`google_place_id` is kept — so comparing on a schedule means a Place
Details read per business per run. Both are the founder's cost decision,
so the Maps leg is **not built**.

**A real mismatch was found that needs no API at all.** Hawlai holds the
address TWICE, entered by hand on two different screens:
`dealerships.business_address` (the footer the law puts in every
marketing email, migration 181) and
`business_listing_facts.street_address` (the street line in the site's
structured data, migration 221). Nothing compared them. A customer who
gets an email and a customer who reads the site can be given two
different addresses. That is the high-priority finding.

The phone is deliberately **not** compared: `owner_whatsapp_number` is
the owner's and `public_phone` is the business's, and calling that
difference a fault would train the owner to ignore the check.

It runs inside the existing `site_audit` subsystem — no new cron entry
(there is no third one), no new screen.

### L3 — Pages for the places and things he actually sells — **M**

"Soy candle in Shahjahanpur" has no page to rank. The site has a
storefront and products; it has nothing that says *candles, in this
city, for these occasions*.

This is the Website Builder's existing block machinery pointed at a page
kind that does not exist yet — and it is **fact-bound by C2 like every
other surface**, which matters here more than usual: a city page is
exactly where a model would cheerfully invent "serving Shahjahanpur
since 2015".

**The honest limit:** this is the piece whose value is least certain. A
thin city page is worse than no page. It needs real content — his own
words about what he makes and who buys it — so it is as much an
interview as a build.

### L4 — The listing itself, through the GBP API — **L**, and gated on §1

Read the listing, audit it (hours missing, no categories, no photos, Q&A
unanswered), and propose changes **as Actions**: a `ResourceEdit`
family, with a before-state and an undo, because the listing is a
resource that already exists. S6's envelope is exactly the right shape
and this would be its first new platform since.

**Every change approval-gated.** The listing is the most public thing a
local business has, and `publish_actions.platform` is widened one value
at a time, as each is actually implemented (migrations 179, 204).

---

## 4. What this is NOT

- **Not a new department.** Local SEO is SEO. The findings go through
  the Strategist and the daily email; the edits go through
  `src/lib/publish`. Rule 5 is satisfied by adding depth, not breadth.
- **Not a ranking promise.** Nothing here makes a business rank. It
  makes the listing complete, the facts consistent and the pages
  present, and then **Search Console measures what happens** — which is
  why §5 is not a footnote.
- **Not a review-generation scheme.** Asking customers for reviews is a
  separate decision with its own rules, and incentivised reviews breach
  Google's policy.

---

## 5. And none of it is measurable while Search Console is down

`search_console_sync` has failed every day since 4 November. That is
also the subsystem that would tell us whether any of L1–L4 worked —
impressions and position for "soy candle in Shahjahanpur" is precisely
the number this whole plan is about.

**So the Search Console fix comes before the local work, not after.**
See the diagnosis delivered with this plan: a reconnect from
Integrations should clear it today, and whether it *stays* fixed depends
on one setting in Google Cloud.

---

## 6. Sizes, and the order I would put them in

| | Size | Depends on |
|---|---|---|
| **Search Console back up** | **XS** — a reconnect, plus one small code fix for visibility | nothing |
| **§1 GBP API application** | **XS** of effort, **weeks** of waiting | the founder, one sitting |
| **L1** the listing's facts on the site | **S** | the owner answering five questions |
| **L2** ✅ | **S/M** | G5 7 Nov 2026 · Maps leg 8 Nov (migration 225) |
| **L3** city and occasion pages | **M** | his own words |
| **L4** the listing through the API | **L** | §1 being approved |

**The order that wastes nothing:** Search Console first (it is the
instrument), the GBP application the same day (it is a queue), then
L1 → L2 while that queue moves, and L3/L4 after.

**Against S7:** L1 and L2 are small and independent — they touch the
audit and the site's schema, not autonomy. They could run beside S7
without colliding. L4 cannot start until Google answers, so the
question "S7 ke baad ya parallel" only really applies to L1–L3.

---

## 7. What I need decided

1. **Does the GBP API application go in this week?** *Recommend: yes,
   whatever is decided about the build.* It is a queue, not a task.
2. **L1's five questions — may I ask them in one chat message, or do
   they belong in Settings?** *Recommend: chat, once, and stored as
   Business Facts, so the claims guard can then use them as evidence.*
3. **L1 and L2 beside S7, or after it?** *Recommend: beside.* They do
   not touch anything S7 touches, and S7's remaining phases are
   promotion and the cap, which are slow by design.
4. **L3 — is it wanted at all?** *Recommend: decide it after L1 and L2
   are live and Search Console has two weeks of data.* A city page
   written before there is any measurement is the kind of work that
   feels productive and cannot be judged.
