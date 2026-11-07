# The one interview — A3 (answers) and L1 (listing facts)

> ## PAUSED — 7 November 2026, and not because the questions were wrong
>
> **The business this was written for is test data.** candle_by_qaaf is
> not a real business: no real orders, and a `business_story` whose
> content — including a customer testimonial — was invented. **There is
> no real business on Hawlai yet.**
>
> So this interview has nobody to interview. Collecting "real facts" for
> a business that does not exist would put invented facts on record as
> evidence, which is the one thing `knownText` makes irreversible: a
> recorded note becomes the proof that approves the same claim
> everywhere else.
>
> **The questions themselves do not expire.** They were derived from the
> schema and from the nine promises `siteClaimsReview.ts` already
> watches for, not from any one business. This document waits as it is.
>
> **Resume when:** a real business is onboarded. Re-run §0's five read
> queries against that business before asking anything — they will
> return different answers, and some of the five facts may already be
> there.

One sitting, one set of questions, two plans fed:
[PLAN-AEO-GEO.md](PLAN-AEO-GEO.md) §A3 and
[PLAN-LOCAL-SEO.md](PLAN-LOCAL-SEO.md) §L1. Both need the owner's own
facts on record and asking twice would waste the one scarce thing here —
his attention.

**Written 6 November 2026.** Nothing in this document is built yet. It
is the question list and the shape the answers come back in.

---

## 0. Before the sitting — do not ask for what is already on record

Five of these facts are already in the database. Asking for them again
wastes the meeting and invites a second, slightly different answer that
then disagrees with the first.

**Confirm the id first, then read.** Never key a later write on a
guessed slug.

```sql
-- 1. The id, from the storefront slug. Read-only.
select d.id as dealership_id, d.dealership_name, d.city, d.business_category,
       d.google_place_id, d.fb_page_id, d.instagram_business_id,
       d.owner_whatsapp_number
from dealerships d
join websites w on w.dealership_id = d.id
where w.slug = '<the storefront slug>';
```

```sql
-- 2. What the owner has already recorded, and how long each note is.
--    `length` matters: a note over 200 characters is cut off before a
--    generator ever sees the end of it (see §4).
select category, title, length(content) as chars, is_active, content
from business_knowledge
where dealership_id = '<the id from query 1>'
order by category, title;
```

```sql
-- 3. Shipping cost is already structured. It is NOT an interview answer.
select slug, published, shipping_mode, shipping_rate, shipping_free_threshold
from websites
where dealership_id = '<the id from query 1>';
```

```sql
-- 4. How he already describes the business, and in which language.
select business_description, tone_of_voice, preferred_language, messaging_pillars
from brand_profiles
where dealership_id = '<the id from query 1>';
```

```sql
-- 5. The live CHECK on the category column, before any insert.
--    Repo migrations drift from production; this has bitten before.
select pg_get_constraintdef(oid) as live_constraint
from pg_constraint
where conname = 'business_knowledge_category_check';
```

Query 5 should print
`CHECK (category = ANY (ARRAY['hours','pricing_note','policy','faq','general','business_story']))`.
If it prints the five-value version, migration 189 has not been run in
production and `business_story` cannot be used yet.

---

## Part A — L1: the listing's facts (5 questions)

**Read this first, and it is the honest part:** `dealerships` has
**no column** for a public phone, opening hours, areas served, a street
address, geo coordinates or an Instagram handle. The claims guard's own
comment says so — *"Nothing in Hawlai stores a public contact email, a
public phone number or a social handle for a business, so there was
nothing to check against and the model filled the gap the way models
do."* That is the gap that put `hello@candlebyqaaf.com` on a live page.

So **L1's answers have nowhere to go until a migration adds the
columns.** Collect them anyway — the migration is small and the facts
are the slow part — but do not expect them on the site the same day.

### A1. The public phone number

> Jo number aap chahte ho ki **customer** aapko kare — kya hai?
> Kya yeh wahi WhatsApp number hai jo Hawlai ke paas already hai, ya
> alag?
> Aur kya aap chahte ho ki yeh number **website par dikhe**?

**Why it is asked this way:** `dealerships.owner_whatsapp_number`
already exists — but it is the number Hawlai sends the *owner* alerts
on. Publishing it because it happens to be there would be a different
purpose than the one he gave it for. He has to say yes.

**Storage:** no column today → migration. If he says "publish it", a
`telephone` field on the `LocalBusiness` node and a visible line on the
contact page.

### A2. Opening hours

> Har din ke khulne aur band hone ke time — hafte ke saat din.
> Koi din band rehta hai? Lunch break ya koi gap?
> Festival ya season mein time badalta hai?

**One answer per day, not "10 to 7 roughly".** Structured hours are what
a machine can read; a sentence is not.

**Storage:** two homes. The *sentence* can go into
`business_knowledge` under category `hours` **today**. The structured
`openingHoursSpecification` for the schema needs the migration.

### A3. The areas he serves

> Aap kahan-kahan tak service/delivery dete ho?
> Shahr ke andar koi area chhod dete ho? Aas-paas ke kasbe/gaon?
> Poore India bhejte ho, ya sirf kuch states?

**This is the question that decides whether a "near me" search can ever
match him.** It is also the one most likely to be answered too
generously — "poore India" when one order has ever shipped outside the
state is the kind of line the guard exists to remove. Ask for where he
*has actually sent* something, not where he *would*.

**Storage:** no column today → migration (`areaServed`).

### A4. The links that are already his — `sameAs`

> Aapka Google Maps listing ka link?
> Instagram ka public profile link?
> Facebook page ka link?
> Koi aur jagah jahan business ka official page hai — JustDial,
> IndiaMART, Zomato, Practo, apna khud ka purana site?

**Three of these may already be derivable** and the read queries in §0
will say: `google_place_id` gives the Maps listing, `fb_page_id` gives
the Facebook page. **Instagram does not** — only
`instagram_business_id` is stored, which is not a public profile URL.

**Why it matters more than it looks:** `sameAs` is how a machine learns
that the site, the Maps listing and the Instagram account are **one
business**. Without it they are three unrelated things that happen to
share a name. This is also the only part of §2.4's third-party-mentions
problem that code can fix.

**Storage:** derivable ones need nothing; the rest need the migration.

### A5. The address — and whether it is published at all

> Business ka pura address kya hai?
> Kya aap chahte ho ki **street address website par dikhe**, ya sirf
> shahr ka naam kaafi hai?

**Ask it as a choice, not as a form field.** Many businesses here run
from home, and publishing a home address is a decision the owner makes
once and lives with. The schema currently publishes the city and
nothing else, with a comment saying exactly why: *"an addressLocality
with no street is honest; an invented street address is not."*

**And one deliberate NO, which needs no question:** `aggregateRating`
stays out of the schema even though Hawlai reads his Google rating
daily. Publishing Google's own rating in your own page's markup is
against Google's guidelines. Do not offer it.

---

## Part B — A3: the facts the answers are written from

**The risk in this phase, stated plainly:** an FAQ full of invented
answers is worse than no FAQ. The questions are already fixed in code;
the answers can only come from what he actually says. **Three true
answers beat twelve vague ones**, and "we don't do that" is as useful an
answer as "we do".

### B0. The four questions the check already asks him against

These are derived in code (`src/lib/seo/aeoQuestions.ts`), identical
every run, so a trend means something. For a `{category}` business in
`{city}` they come out as:

1. `best {category} in {city}`
2. `best affordable {category} in {city}`
3. `where to buy {headline item} in {city}` *(or `how much does
   {headline item} cost in {city}` for a service business)*
4. `is {headline item} worth it`

**Read them out to him.** The whole of Part B is really one question —
*what is the true answer to each of these?* — broken into the facts
needed to write it.

### B1. Delivery and shipping *(answers question 3)*

> Order ke baad delivery mein kitne din lagte hain — **sach mein**, na
> ki best case?
> Shahr ke andar aur bahar alag-alag?
> Cash on delivery lete ho?
> Nazuk saamaan kaise pack karte ho? Raaste mein toot jaye to kya hota
> hai — replacement, refund, ya kuch nahi?

**Shipping *cost* is not asked here** — it is already structured on the
`websites` row (query 3 in §0) and the facts layer reads it. Confirm it
is right in the dashboard; do not record it a second time as a note,
because then two places can disagree.

**Storage:** `business_knowledge`, category `policy`.

### B2. Timelines — how long things take

> Jo cheezein aap bechte ho — ready stock hain, ya order ke baad banti
> hain?
> Agar banti hain: ek piece banne mein kitna time?
> Bulk ya custom order ka lead time?
> Koi enquiry aaye to aap kitni der mein jawab dete ho?

**Why the last one is in the list:** it is the single most asked
pre-purchase question for a small business and nothing in Hawlai knows
the answer, so no surface can ever say it.

**Storage:** `business_knowledge`, category `general`.

### B3. Materials and how it is made *(answers question 4, "is it worth it")*

> Exactly kya material use karte ho? Naam se.
> Kya aap kuch **deliberately nahi** use karte? (woh hi asli jawab hota
> hai)
> Banane ka process — koi step jo aap karte ho aur sasta banane wala
> nahi karta?
> Kitne din chalta hai / shelf life? Kaise rakhna chahiye?
> Koi certification, lab test, standard? **Agar koi nahi hai to saaf
> "koi nahi" likho.**

**Run query 2 from §0 before asking this.** Some of this is likely
already recorded, and re-asking produces a second, slightly different
version of the same fact — which is worse than not asking, because then
the site can say both.

**"Koi certification nahi hai" is a valuable answer, not a blank.** With
nothing on record, a generator that wants to sound credible reaches for
a plausible one. With "none" on record, it cannot.

**Storage:** `business_knowledge`, category `general`.

### B4. What he will and will not do — the nine named promises

These nine are not a guess. `src/lib/claims/siteClaimsReview.ts` already
watches for exactly these phrases, because each one turns into an email
from a customer expecting something. **Yes or no on each.** A "no" means
the guard strips the promise; a "yes" with a detail means the page may
finally make it.

| # | Ask | If yes, also ask |
|---|---|---|
| 1 | Gift sets / hampers / gift boxes? | Kya aata hai usmein, kitne ka? |
| 2 | Bulk / wholesale / corporate orders? | Minimum quantity, pricing, lead time |
| 3 | Restock alerts — out-of-stock pe batate ho? | Kaise — WhatsApp, email? |
| 4 | Custom / personalised / bespoke orders? | Kya customise ho sakta hai, minimum, extra charge |
| 5 | Subscription ya monthly box? | Price, kya milta hai, cancel kaise |
| 6 | Wedding favours / wedding gifting? | Minimum, lead time |
| 7 | Gift wrapping? | Free ya paid |
| 8 | Samples / free samples? | Paid ya free, kaise milta hai |
| 9 | Workshops ya classes? | Kahan, kitne ka, kya le ke jaate ho |

### B5. Returns, refunds and the policies

> Return lete ho? Kitne din ke andar? Kis condition mein?
> Refund kaise aata hai aur kitne din mein?
> Exchange?
> Damaged delivery pe exact kya karte ho?

**Storage:** `business_knowledge`, category `policy`.

### B6. Price, as an answer rather than a number *(answers question 2)*

> Sabse sasti cheez kitne ki hai? Sabse mehengi?
> Kya aap chahte ho ki website par price range likha ho?
> Koi offer ya discount **aaj** chal raha hai?

**Individual prices are already in the products table** and the facts
layer reads them — do not re-record them. What is missing is whether he
wants a *range stated as an answer*, which is a different thing from a
price on a product card.

**Storage:** `business_knowledge`, category `pricing_note`.

### B7. The doubt question *(answers question 4)*

> Jo customer aapke paas aa ke **nahi** khareedta — uska sabse common
> sawaal ya shak kya hota hai?
> Aur aap use sach mein kya jawab dete ho?
> Koi aapse sasta mil raha hai — aapke paas se kyun le? **Ek cheez jo
> check ki ja sake**, adjective nahi.

**This is the most valuable question in the document and the hardest to
answer well.** "Best quality" is an adjective and gets stripped. "Soy
wax, not paraffin, and it burns 40 hours instead of 25" is a fact and
survives. Push for the second kind. If he only has adjectives, record
nothing rather than recording an adjective.

**Storage:** `business_knowledge`, category `general`.

### B8. The language

> FAQ ke jawab kis zubaan mein hone chahiye — English, Hindi, ya
> Hinglish?

`brand_profiles.preferred_language` already holds an answer (query 4).
Confirm it still matches what he wants on a page a stranger reads, which
is not always the same as what he wants in a WhatsApp message.

---

## Part C — the format to send the answers back in

One block per answer. Paste them in any order; the labels are what
matter.

### For Part A (L1) — these are held until the migration

```
=== L1 ===
PHONE: <number>                       | publish on site: yes / no
PHONE_IS_WHATSAPP_NUMBER: yes / no
HOURS_MON: 10:00-19:00  (or: closed)
HOURS_TUE: ...
HOURS_WED: ...
HOURS_THU: ...
HOURS_FRI: ...
HOURS_SAT: ...
HOURS_SUN: ...
HOURS_NOTE: <lunch break, festival changes, anything the grid misses>
AREAS_SERVED: <comma-separated, only places he has actually served>
SAMEAS_MAPS: <url, or "derive from google_place_id">
SAMEAS_INSTAGRAM: <url, or "none">
SAMEAS_FACEBOOK: <url, or "derive from fb_page_id">
SAMEAS_OTHER: <JustDial / IndiaMART / old site / "none">
ADDRESS_FULL: <full address, for our records>
ADDRESS_PUBLISH_STREET: yes / no        <- if no, only the city is published
```

### For Part B (A3) — these go into Business Knowledge as rows

One row per fact. `category` must be one of `hours`, `pricing_note`,
`policy`, `faq`, `general`, `business_story` — and **confirm the live
constraint with query 5 first**.

```
=== KNOWLEDGE ROW ===
category: policy
title: Delivery time
content: Order ke 2-3 din mein Shahjahanpur ke andar, 5-7 din baaki India mein.
```

```
=== KNOWLEDGE ROW ===
category: general
title: What we do not do
content: Koi subscription nahi, koi workshop nahi, gift wrapping nahi.
```

**A "no" gets a row too.** That is the whole point of B4 — an absence on
record is a promise the guard can refuse, while an absence of a record
is a gap a generator fills.

---

## Part D — the four rules that decide whether an answer is usable

**1. 200 characters per note, and twelve notes.** Verified in
`src/lib/claims/businessFacts.ts`: the notes block slices each row's
content to 200 characters and takes the first 12 rows. A 400-character
answer is not stored wrong — it is **silently cut in half** before any
generator reads it, and the half that survives may be the wrong half.
Long answers get split into two short rows.

**2. A fact, not an adjective.** "Best quality in the city" has nothing
to check and gets removed. "Soy wax only, no paraffin" is checkable and
survives. The guard does not distinguish between a lie and an
unsupported truth; both come out.

**3. No customer's private situation.** A note that describes a named or
identifiable customer's illness, bereavement or accident is held back
from all copy unless he confirms that customer agreed — and the right
answer in a meeting is simply not to collect it.

**4. His story is not a product fact.** Why he started, how he felt, the
journey — those belong under `business_story`, and they are
**deliberately withheld** from customer-facing copy. Recording them as
`general` to get them onto the site works around a rule that exists
because a 224-word founder story once became a welcome email.

---

## What this interview does NOT settle

- **Nothing is published by collecting answers.** A3 still has to write
  the FAQ block through the C2 door, and L1 still needs a migration
  before a phone number has a column to live in.
- **No claim here is verified.** What the owner says is what the
  business says: `knownText` treats a recorded note as evidence, which
  is exactly why a generous answer in this meeting becomes a supported
  claim on a live page. An answer that is slightly too good is worse
  than a missing one.
- **Search Console's real questions are not in this list.** A3 also
  reads what people actually typed, which needs the data to accumulate
  since the reconnect on 6 November. That half is not an interview.
