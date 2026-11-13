# Audit — "Organic Visitor → Lead → Follow-up Engine"

Written 12 November 2026, against the vision as given: four layers,
**Detect → Score → Convert → Follow-up**, with the explicit constraint
that an anonymous visitor's identity must never be discovered and that
outreach stays on consent-based channels.

This document says what already exists **by its real name**, what is
genuinely missing, and what I would refuse to build. Nothing below is
verified live: there is no real business on the platform.

---

## 1. The short answer

**Roughly 60% of this is already built**, and the two layers the vision
treats as the hard part — the anonymous-to-identified bridge, and
scoring — are the two that are furthest along in different directions:
the bridge is **finished**, and the score **exists but measures the
wrong thing** for this purpose.

| Layer | State | The honest one-liner |
|---|---|---|
| **Detect** | Most of it | Every signal except **which page** — and the page is already being sent and thrown away |
| **Score** | Exists, wrong subject | `predicted_conversion_score` scores *how well we have handled a lead*, not *what a visitor did* |
| **Convert** | Mechanism yes, trigger no | `Popup` and `ChatWidget` are built; they fire on a timer or exit-intent, never on behaviour |
| **Follow-up** | Two emails, not a sequence | No day-offset drip, and no trigger keyed on behaviour |

---

## 2. Detect — what is already recorded

`page_events` (migration 041, extended by 044, 112, 113, 152, 197, 207),
written by `src/app/api/public/track/route.ts`:

| The vision asks for | Already there? | Where |
|---|---|---|
| Traffic source | **Yes** | `utm_source`, `utm_medium`, `utm_campaign` (migration 113) |
| Repeat visit | **Yes** | `visitor_id` — an anonymous first-party UUID in the browser's own localStorage on Hawlai's domain (migration 112) |
| CTA clicks | **Yes**, partly | `event_type` of `click`, `whatsapp_click`, `chat_open`, plus `x_pct`/`y_pct` for where on the page |
| Form submission | **Yes** | `event_type = "form_submit"` |
| Pages viewed | **NO** | there is no page or path column at all |
| Pricing-page interaction | **NO** | same reason — nothing records which page |
| Time spent | **NO** | no session and no duration |
| Form abandonment | **NO** | there is `form_submit` but no `form_start` |

Three things already in place that a new build would otherwise have to
invent, and that are easy to miss:

- **Consent is recorded per event.** `consent_granted` (migration 152),
  and the route re-derives it defensively — a client claiming consent
  while sending no identifier cannot mark a row as consented.
- **The owner's own traffic is excluded.** `is_internal` (migration 207),
  from the logged-in session or the `hw=owner` cookie. Visits went 28 →
  31 while the owner tested his own shop, which at that volume was most
  of the signal.
- **Tracking never breaks the page.** The route returns `ok` and writes
  nothing when it cannot resolve the site.

### The keystone gap, and it is one line of data

`/api/public/track` **receives the slug** and uses it only to look up
`dealership_id`, then discards it. So the information needed for "pages
viewed", "pricing page interaction" and "which page did they come back
to" is **already arriving at the server and being thrown away**.

Nothing in the Detect or Score layer is worth building before this is
fixed, because "viewed pricing twice" is the single most load-bearing
signal in the whole vision and it is currently unrecordable.

---

## 3. The bridge from anonymous to identified — already built

This is the part of the vision that reads hardest and is in fact done.

- `leads.visitor_id` exists.
- `touchpointAgent.bridgeVisitorTouchpoints` reads `page_events` **by
  `visitor_id`**, over a lookback window, excluding internal traffic, and
  writes the visitor's pre-conversion history onto the new lead as
  `lead_touchpoints` rows (migration 196) — including the first
  UTM-tagged event as the real entry point, and the first piece of
  content as the thing that brought them in.

**Why that is lawful and must stay that way.** The bridge fires when a
person *voluntarily identifies themselves* — a form, a WhatsApp click, an
enquiry. It turns history the business already held into attribution for
a lead that person chose to become.

**The line to hold.** That bridge must never become a *reason to make
contact*. It is attribution, not permission. A naive version of this
vision would use the same matching to decide who to message, which is
precisely what the caution in the request rules out.

**On that caution generally:** the constraint is already how every sender
in this codebase works. `src/lib/executionPolicy.ts` classifies anything
that sends, `src/lib/chat/requestApproval.ts` records it, and
`tests/approvalCoverage.test.ts` fails for anything new that reaches a
sender directly. Auto-reply only ever answers someone who messaged
first. **So this plan needs no new consent mechanism — it needs to not
add a bypass.** I would refuse to build visitor de-anonymisation,
third-party identity matching, or outbound DMs to people who have not
asked to hear from the business, and none of the pieces below do.

---

## 4. Score — the number exists and means something else

`scoreLeadConversionLikelihood` (`src/lib/agents/leadScoringAgent.ts`)
already produces a 0–100 number and writes it to
`leads.predicted_conversion_score` (migration 116), recomputed daily by
the `lead_scoring` subsystem for every unresolved lead.

Its inputs are:

```
status · createdAt · leadTemperature (latest call outcome)
touchpointCount · hasAppointment
```

**Not one website-behaviour signal.** So "87/100" today means *given how
quickly we called and how that call went, this lead is likely to
convert*. The vision's "87/100 buying intent" means something different
and nearly opposite in source: *this person's behaviour on the site
suggests they are close to buying*.

Two consequences:

1. **They must be separate numbers.** Folding behaviour into
   `predicted_conversion_score` would silently change a number the owner
   may already be reading, and would mix "what they did" with "what we
   did" into something that cannot be explained.
2. **There is no score for an anonymous visitor at all** — the existing
   one only scores rows in `leads`, and an anonymous visitor has no row
   there, by design.

---

## 5. Convert — the mechanism is built, the trigger is not

- `src/components/website/ChatWidget.tsx` — the website chat, which
  already answers visitors from the business's recorded facts and
  withholds anything it cannot support (the fact-bound work, F-15).
- `src/components/website/Popup.tsx` — triggers are **`timed`** and
  **`exit_intent`**, configured in `PopupAndTrackingSettings.tsx`.
- `popup_shown` is **already a valid tracked event** in the route's
  `VALID_EVENTS`, so a popup's appearance can already be measured.

What is missing is only the trigger condition: nothing can say "this
visitor has looked at pricing twice and is still here" because (a) the
page is not recorded and (b) there is no per-visitor score to threshold
on. The popup's words are also fixed — there is no behaviour-aware copy.

---

## 6. Follow-up — two emails, no sequence

- `runEmailAutomation` sends a **welcome email**, and a **follow-up** to
  a lead inactive for `follow_up_inactive_days` (default 3). That is two
  messages, not a sequence.
- `workflowEngine` trigger types are **`new_lead`**, **`lead_converted`**
  and **`appointment_booked`** — all CRM events, none behavioural, and
  with no day-offset steps.
- `notifyColdLeads` and `churn_detection` already chase quiet leads.

So the Day 0 / Day 2 / Day 5 / Day 10 shape does not exist in any form,
and neither does "what to send depends on what they looked at".

---

## 7. The plan, approved 13 November 2026

Each piece is independently useful, and the order is mostly forced: V2
and V3 are meaningless without V1, and V4 needs V1 for the one thing it
most lacks.

| | Piece | Size | The riskiest part |
|---|---|---|---|
| **V1** | **Record the page.** `page_events.path`, from the slug the track route already receives, plus `form_start` | **S** | A path is a page on the business's own site, **not a full URL**. Query strings are where personal data leaks into analytics, and this table is read by five other features |
| **V2** | **Group a visitor's events into a visit**, and derive time-on-site and pages-per-visit | **S/M** | A "visit" boundary is a judgement, not a fact. The 30-minute-gap convention has to be stated as a convention, and the owner's own visits stay excluded (migration 207) |
| **V3** | **A visitor intent score** from page path + time, for anonymous visitors too | **M** | It must be **its own number**. `predicted_conversion_score` measures how well we handled a LEAD; folding behaviour into it would silently change a figure the owner may already read, and mix "what they did" with "what we did" into something unexplainable |
| **V4** | **The site-wide sales and info agent** — see §7a, it is an UPGRADE | **L** | The **field-level public/internal filter**. A leak is unrecoverable, and `business_knowledge` has no privacy flag today |
| **V5** | **A behaviour-based follow-up sequence** | **M/L** | Rule 6: every step through `executionPolicy` → `requestApproval`, and switching a sequence **off** stays ungated. And a Day-5 case study needs a case study |

---

## 7a. V4 — THE AGENT ALREADY EXISTS, and that changes the work

**The founder asked me to confirm this before building, and he was right
to.** There is a widget, and behind it a real agent:

| | |
|---|---|
| `src/components/website/ChatWidget.tsx` | 128 lines |
| `POST /api/public/chat` | 111 lines |
| `runSalesAgentTurn` in `src/lib/agents/chatbotAgent.ts` | the code already calls it the AI Sales Agent |

**And two of the new requirements are already met, which is the useful
part of asking first:**

- **It is already fact-bound through C2.** `chatbotAgent.ts` imports
  `truthBlock` (factsGate), `stripUnsupported` and `stripUnverifiable`,
  and runs `stripUnsupported(spoken, facts, "publish")` — the STRICTEST
  mode. "No line without a FactRecord" is true on this path today.
- **It already reads the business's own knowledge.** `getBusinessContext`
  gives it `business_knowledge` — hours, pricing notes, policies, FAQs —
  and a `website_chat` persona that defaults to sales. It records a
  first touchpoint, captures a lead, and offers a booking.

### So what is actually missing is four things, and one of them is big

**1. IT IS ON THE WRONG PAGES — and this is the whole of "site-wide".**
The widget is rendered in exactly one place: `src/app/p/[slug]/page.tsx`,
the quick-launch landing page. The route reads
`landing_pages` by slug. **The Website Builder storefront
(`/site/[slug]`) has no agent at all** — so on a real built site, with
products, policies and an about page, there is nobody to ask. This is a
placement problem, not an intelligence problem, and it is most of V4's
value.

**2. It does not know where the visitor is.** The route passes the
landing page's `headline` and `offer_text`. A site-wide agent needs the
current page and, on a product page, the product. **V1 provides exactly
this**, which is why V1 comes first.

**3. The conversation is invisible.** Only `chat_open` is tracked —
fired by the widget, counted in analytics, mapped to a touchpoint
channel. Nothing records what was ASKED, what was answered, or **when
the agent had to say it did not know**. That last one is the most
valuable row in the whole engine: it is a fact the business is missing,
measured at the moment a customer wanted it. It should feed the same
Tier 3 machinery the claims guard already feeds (`claim_checks` → I6).

**4. THERE IS NO PUBLIC/INTERNAL FILTER — the riskiest part of V4.**

What I checked, rather than assumed:

- **`products` has no cost or margin column at all.** No `cost`,
  no `wholesale_price`, no `margin`. There is nothing internal in the
  catalogue to leak.
- **`CATALOG_COLUMNS` is already an explicit allowlist** — and it
  excludes `sku`, so the agent cannot read one out either.
- **`business_knowledge` has NO privacy flag.** `is_active` retires a
  note; it does not hide one. The categories are hours, pricing_note,
  policy, faq, general — plus `business_story` (migration 189).
- **`business_story` is the sensitive one** and already has a consent
  gate (`personalStories.ts`), which was built after a fabricated
  testimonial reached a live page.

So the filter V4 needs is **an allowlist of categories read at the
source**, plus `business_story` only through the existing consent gate.
That needs no migration. If the owner later wants a "never tell a
customer this" note, that is a column and his decision — recorded here
rather than assumed.

### 5. It only answers — a salesman also OPENS with what is running

**Added to the spec 13 November 2026.** The founder's words: a real
salesman says "humare paas abhi ye achha offer chal raha hai" without
waiting to be asked. The agent should bring up genuine running offers in
the greeting and in conversation, not only when a visitor happens to ask
about price.

**This needs no new data, which is the useful finding.** The facts layer
already carries exactly this, and already refuses to invent it:

- `BusinessFacts.offers` is built from **`discount_codes`** where
  `is_active = true`, each row passed through **`discountUsable`** —
  which refuses an inactive code, **an expired one** (`expires_at` in
  the past) and one that has **hit its usage limit**
  (`used_count >= max_uses`). So "ya expire ho chuka" is already
  handled, at the source.
- `factsPrompt` already states it in words: *"Active offers: code X —
  20% off"*, or, when there are none, *"Active offers: none — do not
  write any discount, sale or offer."*
- `COPY_TRUTH_RULES` already says: *"NEVER write an offer, discount,
  sale price, free shipping, gift, guarantee... unless it is in the
  facts. With no active offer, sell the product itself."*
- And `stripUnsupported` — which this path already runs in `publish`
  mode — deletes a `20% off` that no record supports. An invented offer
  does not survive the same guard that catches an invented one in an
  email.

**So the change is behavioural, inside a path that is already guarded:**
the agent stops being purely reactive. What it must NOT become:

- **It never says an offer is running when `offers` is empty.** The
  prompt already carries the sentence for that case, and the guard
  already deletes the claim. Both stay.
- **It mentions the offer, it does not manufacture urgency.** "Selling
  fast", "only 3 left" and "while stocks last" are already in
  `SCARCITY` and are already stripped.
- **An offer is not repeated every turn.** A salesman who opens with the
  deal is useful; one who says it four times is the popup the founder
  rejected.

Size: **S**, and it belongs with **V4b**, because what is worth
mentioning depends on the page the visitor is standing on.

### V4's shape, then

**An upgrade in three steps, not a new agent:**

| | | Size |
|---|---|---|
| **V4a** | Put the existing widget on the Website Builder storefront, and make the route resolve a site as well as a landing page — the same `landing_pages` OR `websites` fallback `/api/public/track` and `/api/public/leads` already use | **M** |
| **V4b** | Pass the current page and product into the turn, so the agent knows where the visitor is standing — **and let it open with a genuine running offer** (§5 above) | **S/M** (needs V1) |
| **V4c** | Record the conversation into `page_events` — asked, answered, and **"I did not know"** — and feed the gaps to Tier 3 | **M** |

And the field-level filter is not a step: it is a precondition on V4a,
because the moment the agent is on a product page with a catalogue it is
reading more than it used to.

### What V4a shipped, 13 November 2026

| | | |
|---|---|---|
| **V4a-i** | One resolver for "whose page is this slug" (`lib/publicSite`), replacing two hand-written copies that had drifted in shape | `09b3b17e` |
| **V4a-ii** | `visitorFactsBlock` — the public path can no longer ask for the owner audience. The filter existed; nothing enforced it | `062cca27` |
| **V4a-iii** | The widget on every page of the storefront, and the robot avatar | this commit |

**What the precondition turned out to be.** Not a filter to build — one
to make unbypassable. `FactsAudience` already withheld the owner's
trading figures from a customer; `truthBlock`'s parameter defaulted to
`"owner"`, so the public surface was correct by habit. See DECISIONS.md,
13 November, including the one gap left open: `business_knowledge` has
no private-note flag and `general` is a catch-all.

**Still true after V4a:** the agent does not know which page the
visitor is on. That is V4b, and V1 is what supplies it.

### What V4 must not become

- **No new department and no new agent.** `chatbotAgent` is the agent;
  this upgrades it. Rule 5.
- **No naggy popup.** The founder said so, and `Popup.tsx` already
  exists separately with its own triggers — V4 is the agent being
  available, not the agent interrupting.
- **It asks for contact when interest is real**, which `leadCapture`
  already does. V3's score is what makes "real" measurable, and until
  V3 exists the existing behaviour stands rather than being guessed at.

---

## 8. Open questions for the owner

1. **V3's threshold is a product decision, not an engineering one.** What
   counts as "high intent" for a business with thirty visits a month?
   A score tuned on a thousand visits says nothing at that volume, and I
   would rather show the owner the events than a number he cannot check.
2. **V5's content.** A Day 5 "case study" needs a case study. For a
   business with no customers yet, those steps have nothing true to say —
   the same wall A3 and the local interview hit. The sequence may have to
   start as two steps, not four.
3. **Where the visitor score is shown**, if anywhere. There are already
   ~66 dashboard entries, and Rule 5 says depth over breadth.
