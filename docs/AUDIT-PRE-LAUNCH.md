# Pre-launch readiness audit — before the first real business

Written 12 November 2026, ahead of onboarding a pilot business.

**What this audit is.** I read the code. I did not run the app, click
through onboarding, or send anything. Where I say "works", I mean the
code does what it claims and a test holds it; where that is not the same
as "works on screen", it says so. The last section is the list of things
only the owner can confirm, and it is the most important part of this
document.

---

## 1. Verdict

**The pilot can start, and the single biggest risk is not a bug.** Every
automation that could embarrass the business is off by default, the
onboarding flow has no broken step, and the guards are in place. The
real risk is the **first week's content quality**: on day one the claims
guard will delete sentences that are *true* but unrecorded, and the
owner will see thin copy and conclude the product is weak.

There is one hard external blocker (**Meta App Review** for Facebook
DM replies) and one that is already in hand (Instagram), covered in §5.

---

## 2. Onboarding, end to end — NO BROKEN STEP

`STEP_ORDER` has twelve steps:

```
presence · connect · confirm · brand · photos · listing_contact ·
listing_hours · business_model · formality · language_notes ·
personality · avoid_words
```

`WelcomeChatCard.tsx` is the wizard (it lives in the dashboard, not on
its own page) and it **handles all twelve plus `done`**. Six have their
own components; the other six render inline. `TRANSITIONAL` — the list of
steps built but not wanted — is **empty**, so every step in the flow is
one the redesign asked for.

`language_notes` is conditional (only asked when the owner writes in
both languages), so the step count is a function of the answers rather
than a constant. That is deliberate and tested.

**Unverified:** nobody has walked this on a screen as a new business. The
flow is asserted, not watched.

---

## 3. NOTHING RUNS ON DAY ONE — the reassuring finding

Every automation toggle in the schema defaults to **false**:

```
auto_call_new_leads            false
comment_auto_reply_enabled     false
content_autopilot_enabled      false
dm_auto_reply_enabled          false
follow_up_email_auto_enabled   false
welcome_email_auto_enabled     false
popup_enabled                  false
seasonal_campaigns_enabled     false
google_remarketing_enabled     false
auto_pause_low_performers      false
auto_generate_variant_on_pause false
```

So a pilot business **sends nothing, posts nothing and calls nobody**
until the owner switches it on. Combined with autonomy level L0 by
default (S7) and Rule 6's approval registry, there is no path by which
the product acts outward on its own in week one.

### The one exception, and the owner should expect it

**The daily growth email has no toggle.** `runDailyGrowth` is gated only
by `dryRun` and "no owner email on record" — so the pilot owner **will
receive an email the first morning**, automatically.

That is the product working as intended, and what it says on day one is
honest: `maturityOf` returns `learning` with the reason *"there are 0
days of visitor data and a target needs N"*, so the email sets no
targets and claims no results. The digit walk prunes any block whose
numbers cannot be traced.

**Still worth telling the owner it is coming**, so the first one reads as
the product introducing itself rather than as a system that started
mailing him unasked.

---

## 4. The claims guard on a brand-new business — THE REAL RISK

A business on its first day has a name, a category, perhaps a few
products, and **nothing else**: no orders, no reviews, no ratings, no
recorded years of trading, no offers.

The guard removes, among others: social proof (`500 happy customers`),
ratings (`4.8 stars`), units sold, **years of experience**
(`10 years serving…`), superlatives, `best-selling`, scarcity
(`only 3 left`), `% off`, and any price not on record.

Most of those removals are correct. **But not all of them are false
claims** — a real business genuinely has ten years of experience and
genuinely does gift wrapping; it simply has not told Hawlai yet. So the
owner's first generated caption will have true sentences deleted from
it, and the message he takes away is "this thing doesn't know my
business".

**The product already has the answer, and the pilot has to use it in the
right order.** The interview exists in three tiers:

| Tier | Where | When |
|---|---|---|
| 1 | four questions inside onboarding (`listing_contact`, `listing_hours`) | at signup |
| 2 | `InterviewCard` on Settings → Knowledge Base | when the owner chooses |
| 3 | the daily email, one question | **after** a removal has already happened twice |

Tier 3 (I6) was built for exactly this gap — but by design it fires
*after* the guard has cut something. So if the owner generates copy
before answering Tier 2, he gets the bad first impression and *then* the
question.

**Recommendation for the pilot: sit with the owner through Tier 2 before
generating any copy.** It is 20-odd questions and it is the difference
between "it deleted half my caption" and "it only says what I told it".

---

## 5. The known bug (#1) and the pilot — PARTLY BLOCKED

Diagnosed and fixed in code on 12 November (commits `0b0dad06`,
`73f650ee`). Two causes: three missing OAuth scopes, and nothing ever
subscribing a Page to the app.

| Channel | Can the pilot use DM auto-reply? |
|---|---|
| **Instagram** | **Yes, probably** — its login already requests the right two permissions. Needs: migration 227 run, then **reconnect Instagram** so the subscribe call fires. |
| **Facebook** | **No, not yet** — `pages_messaging` needs **Meta App Review** on a live app. Until granted, DM replies work only for people with a role on the app. |

**So a pilot can have Instagram DM auto-reply and cannot have Facebook
DM auto-reply.** If the pilot business is Instagram-first (the common
case for the sellers this product is built for), this is not a blocker.

**A second, separate Meta gap found during this audit:**
`instagram_content_publish` is **still not requested** by any connect
flow — it appears only in a comment. So **publishing an Instagram post
from chat cannot work**, independently of the auto-reply fix. That is a
different permission and a different App Review item, and it should go
in the same submission.

**And the honest frame:** by the product's own evidence, **no Meta
webhook has ever reached it**. Everything above is reasoned from Meta's
current documentation and pinned by tests. The first real DM after a
reconnect is the only thing that proves it.

---

## 6. Approval and autonomy cards — ACCEPTABLE, not polished

The approvals page runs every action through
`humanizeActionType`, which has **eleven bespoke labels** and falls back
to title case. The fallback is deliberate and commented: `action_type` is
free text at the schema level so a new agent can introduce one without a
migration, and it "must never render as a raw, unmapped machine string".

In practice the unlabelled ones read tolerably — `send_email` →
"Send Email", `update_product_price` → "Update Product Price". The
weakest is `set_automation_toggle` → "Set Automation Toggle", which is
machine-flavoured for a card that means "turn something on".

The four labels that were written by hand because title case misled are
the right four: a page's search title, the words on a page, activating
ad spend, and `grant_autonomy` → *"Let Hawlai do this on its own from
now on"*.

**One trap for a future reader, not a defect:** `executionPolicy.ts`
contains both `auto_call_new_lead` (the action) and
`auto_call_new_leads` (the DB toggle column), in two different maps.
Singular and plural, one letter apart, meaning different things.

**Unverified:** no owner has read these cards. Whether the wording lands
is a judgement only the pilot can make.

---

## 7. THREE THINGS I EXPECTED TO FIND AND DID NOT

The September pending-tests notes list onboarding problems that are **no
longer there**. Reporting them would have sent the pilot chasing ghosts:

- **`BusinessCategoryField` defaulting to "Car Dealership"** — gone.
  "Car Dealership" does not appear anywhere in `src/`.
- **The appointments page saying "test rides and showroom visits"** —
  gone. The surviving `showroom` references are *ad-background template
  names*, and the code says so explicitly ("these are template NAMES,
  not subjects").
- **A "Vehicle" column on the leads table** — not what it does.
  `LeadsTable` renders `lead.interest ?? lead.vehicle ?? "—"`, so a
  non-car business shows its own `interest` field. The remnant is
  internal, not owner-visible.

`car_type` does survive as a **field name** in the ad engine's JSON, but
its own prompt defines it as "the main product/service/item" — a
misnamed field, the same shape as the `html` prop that holds markdown,
not a car assumption.

---

## 8. "GREEN IN TESTS, NEVER VERIFIED LIVE" — the full list

This is the section that will produce the pilot's surprises. Everything
below passes tests and has never run against a real business.

### 8a. Shipped in the last two weeks, nothing live

| | What | What would prove it |
|---|---|---|
| A1 | robots.txt / sitemap.xml / llms.txt | fetch all three on the live site |
| A2 | FAQ block + FAQPage schema | Google's Rich Results test on a live page |
| A5 | AEO check on a schedule | flag is **off**; turn on, wait for the 1st |
| I1–I4 | listing facts + the four onboarding questions | a real owner answering them |
| I5 | interview progress, weak answers | a half-finished interview |
| I6 | Tier 3 asking for a missing fact | needs two real claim removals first |
| G1 | duplicate body text, stale pages | a real site with real pages |
| G3/G3a | page proposals, draft state | an approved proposal going live |
| G4 | page speed | flag is **off**; needs a published site |
| G2 | search-query clustering | needs real Search Console data |
| G5 | local presence findings | needs a second address on record |
| G5-Maps | name/address/phone vs Maps | needs a connected Google listing |
| #1 | auto-reply, both halves | **needs a reconnect and one real DM** |

### 8b. Older, and still unconfirmed

From the September list, still open:

- **Unsubscribe link clicked** end to end.
- **The Resend webhook** registering, and a real bounce reaching
  suppressions.
- **The CSV consent step.**
- **Weekly leads export** — the first real send.
- **Campaign activation from chat** — the retest after migration 140,
  checking `effective_status` is ACTIVE at all three levels in Ads
  Manager. **And it cannot be tested as the owner at all**:
  `approvalAuthority.ts` short-circuits owner/admin, so the approval
  card needs a `marketing_manager` team member.
- **Canva** full flow against the live API.
- **Master Chat knowledge base** still grounded after migration 161's
  RLS — it fails *silently*, returning empty.
- **`/dashboard/overview` performance section** and `/chat` work surface.

### 8c. Structural, and the honest version of "tests are green"

- **The suite mocks Meta.** 6,401 passing tests do not show that Meta
  behaves as mocked. Every Meta claim in this codebase is a claim about
  our request, not about their response.
- **Migrations 219 and 220** were confirmed run, but **nothing has ever
  run unattended** — S7 shipped and no action has been promoted to L1 or
  L2 in production.
- **India is hard-coded in many places** (the September audit counted
  121 files). Fine for this pilot; not a platform claim.
- **The invented `business_story` rows on `candle_by_qaaf` still count
  as evidence** via `knownText`. If the pilot shares that database, a
  fabricated testimonial is still readable as a fact. **Delete the test
  business's story rows before the pilot.**
- **The three-flag unpublish gap**: `setSitePublished` touches only
  `websites.published`, leaving `seo_pages` and `landing_pages` live.
  Flagged twice, still not fixed.

---

## 9. The shortest path to a safe pilot

In order, because each step removes a way the first week can go wrong:

1. **Run migration 227.** (226 is already in.)
2. **Submit Meta App Review** for `pages_messaging` **and**
   `instagram_content_publish` in one submission. It is a queue.
3. **Delete the test business's fabricated `business_story` rows**, so no
   invented testimonial can be read as a fact.
4. **Reconnect Instagram** on the pilot business, then check
   `ig_webhook_subscribed_at` is set.
5. **Sit with the owner through the Tier 2 interview before generating
   any copy.** This is the one that decides whether the product feels
   like it knows his business.
6. **Tell him the daily email is coming**, and that the first ones will
   say "still learning" — because they will, and that is correct.
7. **Leave every automation toggle off** for the first week. Watch the
   approval cards instead.
8. **Send one real Instagram DM** and run migration 226's diagnosis
   query. Whatever it says, it will name the gate.
