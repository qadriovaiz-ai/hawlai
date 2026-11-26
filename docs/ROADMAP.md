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
| **S4** | The growth manager: audit → findings → goals → the daily report | **Closed.** Runs daily as `site_audit` + `daily_autopilot` | **Nothing outstanding.** The 30-day cooldown was the last open item and it SHIPPED on 18 Nov (`f9509cfc`): migration 210 had already added `rejected` and the cooldown, and nothing could put a row into that state — the route wrote `dismissed`, which the re-audit's live set does not contain, so the finding came back every morning. Left reading as open until 19 Nov |
| **S5** | Outcomes: decisions recorded, measured on a check date | **Closed.** P6 exit test DONE 4 Nov, **re-run 26 Nov: 16 green**. Migration 215 | **Nothing. §7's four questions were all answered** — 3-day short check (armed by `GROWTH_SHORT_CHECK_UNTIL=<date>:<id>`), `expected_effect` nullable (3 Nov), review **alongside** the daily on the 1st, P4 before P5. **The 28-day loop and the first monthly review are still ahead: 1 Dec** |
| **S6** | Actions: nothing that changes state is reachable except through an Action | **Closed.** P6 exit test DONE 5 Nov, **re-run 26 Nov: 12 green** | P4's four retirements were **WITHDRAWN** — none was a duplicate. Its one real find, `/api/growth-report`, **was deleted in `6f78aea2`** — nothing is outstanding here. Left reading as open until 18 Nov, which cost a re-investigation |
| **S7** | Autonomy L0/L1/L2: promotion asks once, demotion is automatic | **Closed.** P7 exit test DONE 6 Nov, **re-run 26 Nov: 18 green**. Migrations 219 + 220 run and verified 7 Nov | **Nothing has ever run unattended, and nothing has been promoted.** Measured 26 Nov from the code: of **32** classified actions, **5 are pinned to L0** for ever (4 spend, 1 price), **1** (`update_page_meta`) is the only key the L2 allowlist contains, and L1 needs a platform `undo` — which exists for **5** keys. Every stored level in production is still whatever `action_levels` says, which only a query answers |

**All four stages are closed and nothing in this table is outstanding as code.** Checked on 19 November 2026 against the question "what is the next stage": there is no S8. S5's outcome records are live (migration 215), S6's four proposed retirements were withdrawn because none was a duplicate, and S7's promotion reads from recorded data. What remains is not building — it is watching any of it work on a real business, which the live-verification section below is for.

**Re-verified on 26 November 2026**, because a note from outside this
repo claimed S5/S6/S7 were "not started". All three are closed, and no such note
exists in these docs — this page has said **Closed** since 19 November
(`6abc7cd7`) and the "Next, and not started" section below lists V1-V5,
A4a and local L3/L4, not the S-stages. What was actually checked:
`npx vitest run tests/s5ExitTest.test.ts tests/s6ExitTest.test.ts
tests/s7ExitTest.test.ts` -> **exit 0, 3 files, 46 tests passed**; both S5
subsystems are wired in `DAILY_RUNNERS` (`decision_results`,
`monthly_review`); and S6's four withdrawn retirements
(`growthAdvisorAgent`, `croAgent`, `videoAgent`, `strategyAgent`) are each
**still imported by live code** — they are distinct capabilities, not
stale files, exactly as §4.2a of PLAN-CORE-ARCHITECTURE recorded. The one
real retirement, `/api/growth-report`, is gone from the tree.

**What a test run cannot settle:** whether migrations 215, 217 and 220 are
applied to production, and what `action_levels` actually holds there. Both
need a query against the live database, not a green suite.

Twice now a row here has read as open after the work was done — S6 until 18 November, S4 until 19 November — and each cost a re-investigation. The header's rule about a stale page is not decoration.

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
| **Auto-reply** | The DM/comment bug: three missing scopes, and nothing ever subscribed a Page | **Fixed in code.** Migrations 226 ✅ and 227 ✅ (227 verified live 13 Nov — four columns, correct types, all nullable) |
| **R1–R5** | The report becomes on-demand, and carries a before-and-after | **Done** |

---

## What is waiting on somebody, not on code

1. **Meta App Review** for `pages_messaging` **and**
   `instagram_content_publish`. A queue; the owner is doing it.
2. **Reconnect Facebook** after App Review — a token carries the
   permissions asked for when it was granted.
3. **GBP API application.** Also a queue. Gates local L4.
4. **Delete the test business's fabricated `business_story` rows**
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
