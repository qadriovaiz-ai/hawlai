# S4 — Growth Manager v1, and the daily report

**23 October 2026. Plan only: no code, no migration run, nothing paid.**

Exit test, exactly as the roadmap states it:

> *"Daily email arrives with only counted numbers; each suggestion cites
> evidence and the goal it serves"*

---

## 0. What I could not read, and what I need

**`roadmap/core-architecture.md` and `roadmap/growth-agent-plan.md` are
not in this repo.** There is no `roadmap/` directory here and nothing
matching those names anywhere under the working directory. So I have
**not** read the C3 section of the source document, nor §2b "the team",
§2c "agency parts", §2d "code check", nor phase P1's exact scope.

What I used instead:

- `docs/PLAN-CORE-ARCHITECTURE.md` §C3 — the repo-side mapping of C3,
  reviewed and accepted 2026-10-15, which already carries file:line
  evidence
- the roadmap index the founder pasted on 23 October
- the code itself, which is where every claim below is checked

**What I need from you before the Strategist phase (P3) is built:**
paste §2b, §2c, §2d and P1's scope, or put `roadmap/` somewhere I can
read. Specifically: §2b decides **which module owns which finding**, and
if I guess that, the manager's shape will be wrong in a way that is
expensive to undo later. Everything before P3 can be built without it.

---

## 1. Piece by piece — what exists, what is missing

### 1.1 Onboarding audit — M1 site health, M2 catalogue facts, M9 live-copy fact audit

| Piece | Where | State |
|---|---|---|
| The page reader | `src/lib/pages/readPage.ts` `readPageContent` | WORKING — returns every line with its block id and `catalogueDriven` flag |
| Live serving check | `src/lib/seo/liveMeta.ts` `readLiveMeta`, `verifyAgainst` | WORKING — fetches the real page and reports what it read |
| Page title/meta state | `src/lib/seo/pageTitle.ts` — `seo_title` then fallbacks | WORKING |
| Catalogue as records | `src/lib/facts/getContext.ts` `contextFromFacts` → `catalogueRecords` | WORKING — C1 already turns products into typed records with licences |
| The claim machinery M9 needs | `src/lib/facts/extractClaims.ts`, `verifyClaims.ts`, `src/lib/content/verifyEditedText.ts` | WORKING — S3/P4 built exactly this: give it sentences and records, get back refusals with reasons |
| A read-only audit that runs over a whole site | — | **MISSING** |
| `diagnose_business` | `masterBrainV2.ts:725` (tool), `:3415` (case) | WORKING, but it is a chat tool producing prose for a person, not a structured finding set |

**What is missing is smaller than it looks.** M9 is
`verifyEditedText` pointed at every line of every page instead of one
edited line, with nothing written back. M1 and M2 are reads over
`website_pages` and the catalogue records C1 already mints. None of the
three needs a model call to decide *what is on the page* — only M9 needs
one to decide *whether a claim is supported*, and that path exists.

**The evidence that M9 will find something:** reading
`/site/candle-by-qaaf` on 22 October, the live page says the wax *"burns
cleaner, slower, and safer than mass-market paraffin"* and *"Better for
your home, better for the air you breathe."* A comparison claim and a
benefit claim — the two classes nothing in the licence table can
support. This is already recorded as R3 in
[PLAN-S3-RESOURCE-EDIT.md](PLAN-S3-RESOURCE-EDIT.md), and the founder's
standing decision there governs what M9 may do with it: **report, never
change unasked.**

### 1.2 Tracking check (T)

| Piece | Where | State |
|---|---|---|
| Site events | `page_events` table; `is_internal` added in migration 207 | WORKING |
| Search Console | `src/lib/seo/searchConsole.ts` | EXISTS — connection state is readable |
| Ads conversion / attribution | `src/lib/attribution/attribution.ts`, `performanceBrain.ts`, `contentResults.ts` (migration 196) | WORKING |
| "Is tracking actually on?" as one answer | — | **MISSING** |

T is three yes/no reads plus the date of the last event of each kind.
No model, no cost.

### 1.3 Strategist — score, cap, cooldown

| Piece | Where | State |
|---|---|---|
| Findings store | `opportunities` (migration 010) — `type`, `reference_id`, `title`, `description`, `priority` (high/medium/low), `status` (open/completed/dismissed), `action_href` | WORKING |
| Finding producer | `src/lib/agents/opportunityAgent.ts:201` `syncOpportunities` | WORKING — and it already updates its own previous rows instead of duplicating, via the unique index on (dealership_id, type, reference_id) where status='open' |
| Finding reader | `opportunityAgent.ts:241` `getOpenOpportunities` | WORKING |
| Goal decomposition | `src/lib/agents/goalPlanningAgent.ts:43` `decomposeGoal` | WORKING — the file's only export |
| `impact × confidence / effort` score | — | **MISSING**, and the table has no column for it |
| 3 actions a day cap | — | **MISSING** |
| 30-day cooldown after a rejection | — | **MISSING**, and `status` has no `rejected` value — only open/completed/dismissed, with `resolved_at` as the only timestamp |
| The goal a suggestion serves | — | **MISSING** as a link. Goals exist; nothing ties a finding to one |

**This is the phase that needs a migration** (210): score inputs,
`evidence`, the goal link, and a rejection with its own date so a
cooldown can be computed. Details in P0 below.

### 1.4 Daily owner report

| Piece | Where | State |
|---|---|---|
| The clock | `src/lib/agents/autopilotAgent.ts:298` `runDailyAutopilot` | WORKING |
| The cron | `vercel.json` — `/api/autopilot/daily-run?group=signals` 03:00, `?group=heavy` 03:30 | WORKING |
| The job dispatcher | `src/lib/automation/dailyJobs.ts`, groups in `src/lib/automation/cronGroups.ts` | WORKING |
| Owner email sender | `src/lib/email/sendDealerEmail.ts:33` `sendDealerEmail`, HTML via `src/lib/email/template.ts` | WORKING |
| A daily report of any kind | — | **MISSING**. Nothing in `src/lib/` or `src/app/api` produces one |

---

## 2. Can the three agents become the Growth Manager? — confirmed, with two corrections

**Confirmed: yes, and no new agent is needed.** The shape
`PLAN-CORE-ARCHITECTURE` §C3 describes holds against the code:

- `runDailyAutopilot` (`autopilotAgent.ts:298`, 306 lines) is already a
  loop body: it calls `syncOpportunities`, then
  `draftStuckLeadFollowUps`, `applyAutoPause`, `snapshotCampaignPerformance`
  (`:299`–`:304`). Perceive and Act exist; Diagnose, Plan and Report do
  not.
- `opportunityAgent` is Perceive, and it already has the one property a
  Perceive step must have: it reconciles with its own prior rows rather
  than re-reporting.
- `goalPlanningAgent.decomposeGoal` is Plan's decomposer.

**Correction 1 — the hard constraint is already satisfied.** §C3 says
the loop "must be in-process" and names `/api/autopilot/daily-run` as
the route that produced the Vercel 508. That was fixed: the route's own
header says *"It never calls itself: a chain of self-calls is stopped by
Vercel with 508 'Loop Detected'"*, and `dailyJobs.ts` writes a job list
that each invocation works through, stopping after 180 of its 300
seconds. So S4 inherits a working dispatcher and the riskiest part of
S4 is **not** the 508. Building the loop as new route-to-route calls
would reintroduce it; nothing in this plan does.

**Correction 2 — "the hands" are thinner than one executor.**
`TASK_EXECUTORS` (`src/lib/tasks/taskExecutors.ts:22`) has exactly one
key, `generate_content` (`:50`). §C3 says this already. What it does not
say is that the executor registry is **not** where S4 should add hands:
C4's `PublishPlatform` registry is, and S3 just put `undo()` on it. S4
therefore **adds no executors**. It produces findings, scores them, and
reports; anything it wants done goes through an existing Action with its
existing approval.

---

## 3. Duplicate agents — which one the manager uses

Measured, 23 October 2026. "Importers" counts files importing that
module.

| Family | Files | Manager uses | Why |
|---|---|---|---|
| SEO | `seoAgent.ts` (437 lines, 4 importers), `seoToolkitAgent.ts` (169, 1), `seoPageAgent.ts` (62, 1) | **`seoAgent`** | Most used and most complete; the other two are single-caller offshoots |
| CRO | `croAgent.ts` (98, 1), `croAgentV2.ts` (88, 1) | **`croAgentV2`** | Same single-caller weight either way, so the later one, which is the one a V2 exists to replace |
| Social | `socialMediaAgent.ts` (341, 5), `socialManagementAgent.ts` (449, 2) | **neither, directly** | These generate customer-facing copy and must go through the C2 door, not be called by the manager. The manager raises a finding; publishing stays an Action |
| Growth advice | `growthAdvisorAgent.ts` (154, 4), `growthAdvisorV2.ts` | **`growthAdvisorV2`** | — |

**Correction:** the roadmap names `growthAdvisorAgent/V2`. The second
file is `src/lib/agents/growthAdvisorV2.ts` — not
`growthAdvisorAgentV2.ts`. Worth fixing in the roadmap so a later
retirement does not look for a file that is not there.

**Retirement is S6, not S4.** The roadmap puts "retire duplicate
agents" in S6, and each duplicate has live importers — retiring one is a
production route change, not a deletion. What S4 owes S6 is narrower
and testable: **the manager must import exactly one agent per family**,
so the choice above is pinned by a test rather than by this table.

---

## 4. Every generated sentence goes through C2

**Rule for this stage: the manager writes no prose of its own.**

- **Numbers are computed, never written by a model.** The exit test
  says "only counted numbers", and the only way to pass it reliably is
  that no model is ever asked for one. Counts come from SQL and from
  `src/lib/attribution/*`; the report's sentences are templates with
  those numbers substituted in.
- **Any model-written line** — a suggestion's one-line rationale is the
  only candidate — goes through the S2 door, `generateCopy`, with
  `factBound: true` and a `task`, exactly as the five customer-facing
  surfaces do. Not a second checker, not a looser one.
- **The templated prose still gets the free half.** `guardCopyFields`
  (`src/lib/content/generateCopy.ts`) is the door's no-model variant and
  exists for precisely this case: invented keys, the genericness
  verdict, the shape measure, then claims and provenance, with no model
  call and no cost.
- **An owner report is not customer copy, and the difference is
  recorded rather than used as an excuse.** Nothing in the report is
  published to a customer, so the licence table's purpose — protecting
  a reader from a claim about a product — is not what is at stake. What
  is at stake is the owner acting on a number that is wrong. That is
  why the numbers rule above is stricter than C2, not looser.

**K3 is a live risk here** (roadmap §3a): Select picking a thin
fact-set, after which the Judge correctly refuses true copy. A report
sentence refused mid-send would be worse than a plain one, so the
rationale line is **optional by design** — if the door removes it, the
suggestion still ships with its evidence id and its goal, which is what
the exit test actually requires.

---

## 5. The exit test, and how it is tested

> *"Daily email arrives with only counted numbers; each suggestion
> cites evidence and the goal it serves"*

Three claims, tested three ways.

### 5.1 "Daily email arrives" — free, then live

A test runs the whole loop with a frozen clock and a stubbed sender and
asserts one email per business per day, with the dispatcher's
180-second budget respected. Live: the founder receives it for
`candle_by_qaaf`.

### 5.2 "Only counted numbers" — free, and this is the load-bearing one

Two tests, because the property has two halves:

1. **Every number in the rendered email traces to a counted source.**
   The report is built as data — `{ label, value, source }` — and
   rendered from that. A test walks every digit in the final HTML and
   fails on any that is not in the data. A number with no `source` id
   cannot be rendered.
2. **No model call happens on the number path.** A test runs the report
   with `globalThis.fetch` replaced by one that fails the test if
   called, the same `forbidCalls` shape `tests/verifyClaims.test.ts`
   already uses. If a model is ever asked for a number, this fails.

Plus a mutation check for each: delete the source requirement, or let a
model write a figure, and the tests must fail.

**And the number that will be wrong first.** Migration 207 records it:
site visits went 28 → 31 while the owner tested his own site, and *"at
that traffic level his own clicks are most of the signal"*. So the
report's traffic figures must read `is_internal = false`, and a test
asserts that every visit count in the report does. A report that counts
the owner's own visits as customers is the exact failure the exit test
is written to prevent, and it is one WHERE clause away at all times.

### 5.3 "Each suggestion cites evidence and the goal it serves" — free

A suggestion is unrenderable without both. The row carries
`evidence_ref` and `goal_id`; the renderer takes a type that requires
them; a test asserts that a suggestion missing either is dropped with a
log rather than shown bare. The founder then reads one real email and
checks that each evidence id resolves to something he can look at.

---

## 6. Phases, sizes, and the riskiest part

| Phase | What | Size | Free? |
|---|---|---|---|
| **P0** | Migration 210: score inputs, `evidence_ref`, `goal_id`, `rejected_at` on findings. SQL + verify query to the founder; I do not run it | **S** | yes |
| **P1** | M1, M2, M9 as read-only audits over C1 records. No writes, no new tables | **M** | yes |
| **P2** | Tracking check T — three reads and their last-seen dates | **S** | yes |
| **P3** | Strategist: score, 3-a-day cap, 30-day cooldown, goal link. **Needs §2b first** | **M** | yes |
| **P4** | Daily report: counted-number data model, templates, sender | **M** | yes |
| **P5** | Wire into `runDailyAutopilot` as the loop body, in-process | **S** | yes |
| **P6** | Live exit test, on `candle_by_qaaf` | — | founder |

**Overall: M.** Smaller than S2 because the generation problem is
already solved, and smaller than the architecture document implies
because the 508 is already handled.

### The riskiest part

**A wrong number in an owner-facing email, and specifically the
owner's own traffic.** Everything else in S4 is reversible or visible:
a bad suggestion gets rejected and goes into cooldown, a missing
evidence id stops the suggestion rendering. But a number is acted on.
If the report says traffic tripled because the owner was testing his own
site, he makes a decision on it, and nothing in the system will ever
tell him it was wrong — there is no outcome loop until S5.

Second riskiest: **M9 reporting against the owner's own live page.**
Reading `/site/candle-by-qaaf` today, M9 will find comparison and
benefit claims on a page written before the pipeline existed. That is
true and worth telling him. It is also, delivered badly, a daily email
that tells a business owner his own website is full of lies. R3's
answer governs: report once, offer, change nothing unasked — and the
count belongs in the report, not the sentences.

---

## 7. New tools and agents

**None requested.** No new agent (§2 above), no new executor (§2,
correction 2), no new chat tool, no new department or page. CLAUDE.md
rule 5 holds.

Two things are genuinely new and neither is a tool:

- **Migration 210**, because a 30-day cooldown cannot be computed from a
  table whose only timestamp is `resolved_at` and whose `status` has no
  `rejected` value. Written reason: without it, a rejected suggestion
  either reappears tomorrow or is lost, and both are worse than the
  column.
- **One module for the report**, `src/lib/growth/report.ts` or similar,
  because the only alternative is prose assembled inside
  `autopilotAgent.ts`, and the numbers rule in §4 needs a data model
  that a test can walk.

---

## 8. What this plan does not claim

It does not claim the module map is right, because §2b is the document
that decides it and I have not read it. It does not claim M9's findings
will be correct — K1 through K5 are open, and M9 runs the same extractor
and judge those issues live in. And it does not claim the daily report
will be worth reading on day one: it claims the numbers in it will be
counted, which is the only part an exit test can settle.
