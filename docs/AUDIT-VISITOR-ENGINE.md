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

## 7. What I would build, in order

Each piece is independently useful and each one is useless without the
one before it, which is why the order is not negotiable.

| | Piece | Size | Why here |
|---|---|---|---|
| **V1** | **Record the page.** `page_events.path`, set from the slug the route already receives, plus `form_start` for abandonment | **S** | The keystone. Already-arriving data, currently discarded. Nothing else in Detect or Score can exist without it |
| **V2** | **A visit, and how long it lasted.** Group a visitor's events into visits and derive time-on-site and pages-per-visit | **S/M** | Needs V1 to mean anything. No new third party, pure arithmetic over rows |
| **V3** | **A visitor intent score** — its own number, for anonymous visitors too, every point traceable to a recorded event, no model call | **M** | Needs V1+V2. Deliberately separate from `predicted_conversion_score` |
| **V4** | **Behaviour-triggered engagement** — a `behaviour` trigger for `Popup` and the chat, on a score threshold or a page pattern | **M** | Needs V3. Reuses the popup and `popup_shown` that already exist |
| **V5** | **A behaviour-based sequence** — day-offset steps on `workflowEngine`, with the step chosen by what the person actually looked at | **M/L** | Needs V3. Every send still through `executionPolicy` → `requestApproval` |

### What each one must not do

- **V1**: a path is a page on the business's own site, not a query
  string. No full URLs with parameters in the row — that is where
  personal data leaks into analytics.
- **V3**: the score is `counted`, never a model's opinion, and the owner
  must be able to see the events behind any number. This codebase has
  shipped invented statistics before; the digit walk exists because of it.
- **V4**: a popup that fires on behaviour is still a popup. One per
  visit, dismissible, and `popup_shown` recorded so its effect is
  measurable rather than assumed.
- **V5**: no step may send to anyone who has not opted in, and nothing
  may reach a sender without a registry entry. Switching a sequence
  **off** stays ungated — the safe direction must not be the slow one.

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
