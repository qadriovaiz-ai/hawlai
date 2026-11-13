# ROADMAP — where each stage actually stands

**This file did not exist until 13 November 2026.** The status of S5, S6
and S7 lived only inside each stage's own plan, so "what is done" meant
reading four documents and trusting their tables. This is the index.

**It is an index, not a second source of truth.** Each stage's plan holds
the detail and the reasoning; this page holds its state and what its own
plan still records as open. When the two disagree, **the plan is right
and this page is stale** — the same rule DATABASE.md carries about the
migrations.

---

## The stages

| | What it is | State | Its own plan records as open |
|---|---|---|---|
| **S4** | The growth manager: audit → findings → goals → the daily report | **Closed.** Runs daily as `site_audit` + `daily_autopilot` | A 30-day cooldown after a rejection: `opportunities.status` has no `rejected` value, only open/completed/dismissed. Partly answered later by `existingTargetOffers` re-offering after 30 days |
| **S5** | Outcomes: decisions recorded, measured on a check date | **Closed.** P6 exit test DONE 4 Nov. Migration 215 | Nothing in the plan's table |
| **S6** | Actions: nothing that changes state is reachable except through an Action | **Closed.** P6 exit test DONE 5 Nov | P4's four retirements were **WITHDRAWN** — none was a duplicate. One real find: `/api/growth-report` has no callers |
| **S7** | Autonomy L0/L1/L2: promotion asks once, demotion is automatic | **Closed.** P7 exit test DONE 6 Nov. Migrations 219 + 220 run and verified 7 Nov | **Nothing has ever run unattended.** An L2 action has by definition not run long when the stage closes |

**What "closed" means here:** the stage's own exit test is green and its
phases are done. It does **not** mean anyone has watched it work on a
real business — see the live-verification section below, which is the
thing most likely to produce a surprise.

---

## November's other work

| | What | State |
|---|---|---|
| **I1–I6** | The automated onboarding interview, three tiers | **Done.** Migrations 221, 222, 224 |
| **G1–G3a** | Technical audit: duplicate body text, stale pages, page proposals, draft pages | **Done.** Migration 223 |
| **G4** | Page speed, measured | **Built, flag OFF** (`PAGESPEED_ENABLED`) |
| **G2** | Search-query clustering | **Done** |
| **G5** | Local presence: the two addresses nobody was comparing | **Done** |
| **G5 Maps leg** | Name/address/phone against the Google listing | **Done.** Migration 225. Needs a connected listing to do anything |
| **A1, A2** | robots.txt / sitemap / llms.txt, FAQ schema | **Done** |
| **A5** | The AEO check on a schedule | **Built, flag OFF** (`AEO_SCHEDULE_ENABLED`) |
| **A3, local L1** | The interview that fills a real business's facts | **Paused** until a real business onboards |
| **A4a** | Who gets named instead of this business | **Held.** Needs A5 on, with real runs to read |
| **Auto-reply** | The DM/comment bug: three missing scopes, and nothing ever subscribed a Page | **Fixed in code.** Migrations 226 ✅, **227 NOT CONFIRMED RUN** |
| **R1–R5** | The report becomes on-demand, and carries a before-and-after | **Done** |

---

## What is waiting on somebody, not on code

1. **Migration 227** (`fb_webhook_subscribed_at` and its three siblings).
   Until it runs, the webhook subscription cannot record whether it
   worked.
2. **Meta App Review** for `pages_messaging` **and**
   `instagram_content_publish`. A queue; the owner is doing it.
3. **Reconnect Facebook** after App Review — a token carries the
   permissions asked for when it was granted.
4. **GBP API application.** Also a queue. Gates local L4.
5. **Delete the test business's fabricated `business_story` rows**
   before a real business shares that database — they still count as
   evidence through `knownText`.

---

## The honest part: green in tests, never seen live

**No real business has ever used any of this.** The full list is in
[AUDIT-PRE-LAUNCH.md](AUDIT-PRE-LAUNCH.md) §8 and it is the section most
likely to produce the pilot's surprises. The three that matter most:

- **The suite mocks Meta.** 6,487 passing tests say nothing about what
  Meta does with our requests.
- **No Meta webhook has ever reached this product**, by its own
  evidence. The auto-reply fix is reasoned from Meta's documentation and
  pinned by tests; the first real DM is what proves it.
- **No business has two weekly snapshots**, so nobody has seen a
  before-and-after. A pilot's first report will say so in words, which is
  correct rather than a gap.

---

## Next, and not started

| | What | Size |
|---|---|---|
| **V1–V5** | The Organic Visitor Engine — page-path tracking, visit grouping, a visitor intent score, the site-wide sales agent, and a behaviour-based follow-up sequence. Approved 13 Nov | see [AUDIT-VISITOR-ENGINE.md](AUDIT-VISITOR-ENGINE.md) |
| **A4a** | Held, above | S |
| **Local L2 Maps** | Done; L3 (city pages) and L4 (the listing itself) not started | M / L |
