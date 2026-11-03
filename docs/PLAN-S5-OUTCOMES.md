# S5 — Decision and Outcome records, the 90-day strategy, the monthly review

**3 November 2026. Plan only: no code, no migration run, nothing paid.**

S5's exit test, from `docs/PLAN-CORE-ARCHITECTURE.md:600`:

> *"After 28 days, each executed action has an outcome row"*

Read that twice before planning anything, because it says something
uncomfortable: **S5 cannot be verified for 28 days.** Every other stage
could be checked the next morning. This one cannot, and the plan has to
be built around that rather than around hoping.

---

## 1. The one thing that makes S5 different from S1–S4

Every stage so far produced statements about **what is**: this page has
no search title, this product has no image, these five lines use
wording your records do not support. All of them are checkable by
looking.

S5 produces statements about **what happened** — and the obvious next
step from there is a statement about **what worked**. That second kind
is a claim about cause, and this product has an entire layer
(`src/lib/claims`) because claims about things nobody measured are how
it has hurt people before.

So the rule that shapes the whole stage:

> **An outcome row records a measured change and whether anything
> connects that change to the action. It never records causation.**
>
> And "we could not tell" is a different outcome from "it had no
> effect". Conflating those two is how a product learns the wrong
> lesson and then acts on it confidently.

If this stage gets one thing right, it is that distinction.

---

## 2. What already exists — more than the architecture doc credits

| Piece | Where | State, and what it becomes |
|---|---|---|
| Free-text memory | `business_memory` (089) — 5 categories, 3 sources | **WORKING, and it stays.** It becomes the prose layer beside the typed rows, not a thing to migrate |
| Outcome writers | `outcomeInsights.ts:23/:61/:86` — lead status, call completion, campaign pause | **WORKING.** Three real outcome kinds already fire. They become writers of Outcome ROWS as well as prose |
| Attribution | migration 196 — `page_events.content_piece_id`, `lead_touchpoints.content_piece_id` | **WORKING.** This is the only thing that can connect a change to a piece of work. Where it is absent, an outcome is *not measurable* |
| A confidence vocabulary | `business_signals.confidence` (198) — `counted \| observed \| inferred` | **WORKING, and it is the precedent to reuse.** Outcomes get the same three words rather than a fourth vocabulary |
| Signals with expiry | `business_signals.expires_at` (198) | the pattern for "this was true then, and may not be now" |
| Goals with targets | `goals` (131/135/211) — `target_metric`, `target_value`, `deadline` | **WORKING and unused for targets.** S4 only ever wrote setup goals with no deadline; S5's 90-day strategy is what fills these in |
| Scored findings | `opportunities` (010/210) — impact/confidence/effort, `evidence`, `goal_id` | **WORKING.** A surfaced suggestion is the decision's own origin |
| The approval registry | `executionPolicy.ts`, `requestApproval.ts`, `pending_approvals` | **WORKING.** An approval the owner granted IS a decision. This is where Decision rows come from, not from a new mechanism |
| The 90-day funnel | `src/lib/strategy/diagnosis.ts` — `WINDOW_DAYS = 90`, `MIN_STEP_ENTRY`, `MIN_SOURCE_LEADS` | **WORKING.** The 90-day strategy reads this rather than counting again |
| Thin-branch strategy | `src/lib/growth/strategy.ts` — `maturityOf`, `hasNoPlan`, `planLine` | **WORKING.** S5 adds the `ready` branch the thresholds already describe |
| The daily job dispatcher | `dailyJobs.ts`, `cronGroups.ts` | **WORKING.** The results job is a new SUBSYSTEM here — see §4 |
| The report's number check | `report.ts` — `everyNumberIsCounted`, `declared`, `withoutUncountedBlocks` | **WORKING and hard-won.** The monthly review reuses all of it rather than growing its own |

**What is genuinely missing:** Decision rows (what / why / expected
effect / how it will be measured / when to look), Outcome rows measured
at that date, and preference pairs from the owner's edits.

---

## 3. What is new

### Migration 215 — `decisions` and `outcomes`

The schema IS the design here, so it goes first and it goes alone.

**`decisions`** — one row per thing the product or the owner decided to
do:

- `dealership_id`, `goal_id` (nullable), `opportunity_id` (nullable)
- `kind` — what sort of decision (approval granted, goal confirmed,
  suggestion acted on, automation switched)
- `what` — the action, in the owner's terms
- `why` — the evidence it rested on, as ids, not prose
- `expected_effect` — the metric and the direction, **nullable**,
  because "I am doing this because it is obviously right" is an honest
  decision and pretending it had a forecast is not
- `measure` — the counted metric that will be read at the check date
- `check_date` — when to look
- `decided_by` — the owner, or which part of the product
- `created_at`

**`outcomes`** — one row per decision, written at the check date:

- `decision_id` unique — one outcome per decision, so "which one is
  right" is never a question
- `measured_at`, `before`, `after`, `delta` — numbers, from counted data
- `confidence` — `counted | observed | inferred`, the same three words
  `business_signals` already uses
- `attribution` — `direct | partial | none`, from migration 196
- `verdict` — `improved | unchanged | worsened | **not_measurable**`
  — and that fourth value is the point of the whole stage
- `why_not_measurable` — stated when it is, never left to be inferred

**The CHECKs that matter:** a `verdict` of anything but
`not_measurable` requires `before`, `after` and `delta` to be present;
`not_measurable` requires `why_not_measurable`. The database refuses a
verdict nobody can support, the same way migration 210 refuses a
half-scored finding.

### The results job

A new **subsystem** in `cronGroups.ts`, not a new cron entry —
**Vercel Hobby allows exactly two cron entries and both are used.**
`cronGroups.ts` says so in its own header. It goes in `signals`
(database-only, no model, runs before the LLM work).

It reads decisions whose `check_date` has passed and have no outcome
row, measures each from counted data, and writes one outcome row each.

### The 90-day strategy's `ready` branch

`strategy.ts` already describes it and refuses to do it:
`maturityOf` returns `ready` past 14 days and 20 events, and
`hasNoPlan` then says there is no plan because no goal is approved. S5
fills that in: targets from **this business's own baseline**, read from
`diagnosis.ts`'s funnel, re-planned every 30 days.

`draftTargetsAreOwn` — the test that every target traces to a counted
number about this business — already exists and gets extended, never
loosened.

### The monthly review

An email, on the same rails as the daily report: `buildDailyReport`'s
sibling, through `sendDealerEmail` with an idempotency key, every
number declared and the digit walk applied, blocks pruned rather than
the email dropped. **Not a page** — rule 5, and the daily report has
already proved the owner reads email.

---

## 4. The four things that will go wrong, and what stops them

**1. "It worked" with nothing behind it.** Covered by the `attribution`
and `confidence` columns being required, and by `not_measurable` being
a first-class verdict rather than an absence. A test asserts no outcome
row can say `improved` without `before`, `after` and `delta`.

**2. Silence when a check cannot be made.** Three times in the last two
days a guard's failure mode was to say nothing — the dropped email, the
discarded extractor reason, the cost counted as zero. The results job
writes a `not_measurable` row **with its reason**; it never skips.

**3. The 28-day wait.** The exit test is unfalsifiable until it
elapses. So: the results job gets a **frozen-clock test** covering
check dates in the past, today and the future; and for ONE business the
first decisions are written with a **short check date** (3 days) so the
loop can be seen closing this week rather than in December. That is a
real check, not a substitute dressed up as one — and the 28-day version
is still labelled **unverified** until it happens.

**4. A monthly email that contradicts itself.** Exactly what the 3
November report did. The review reuses `withoutUncountedBlocks` and the
`declared`/`counted` split rather than growing its own, and no alert in
it may claim more than it knows.

---

## 5. Phases and sizes

| Phase | What | Size | Migration |
|---|---|---|---|
| **P0** | Migration 215: `decisions` + `outcomes`, with the CHECKs. SQL + live `pg_get_constraintdef` pre-check + verify query | **S** | **215** |
| **P1** | Decision rows written where decisions already happen: `requestApproval` (granted), goal confirm, a surfaced suggestion the owner acts on. Read-only elsewhere | **M** | — |
| **P2** | The results job: a `signals` subsystem, frozen-clock tested, writing one outcome per due decision including `not_measurable` | **M** | — |
| **P3** | `outcomeInsights.ts`'s three kinds write Outcome rows as well as prose; `business_memory` untouched | **S** | — |
| **P4** | The 90-day strategy's `ready` branch: targets from this business's own funnel, re-planned every 30 days | **M** | — |
| **P5** | The monthly review email, on the daily report's rails | **M** | — |
| **P6** | Exit test, and the short-check-date run that makes it visible this week | **S** | — |

**Overall: L**, and the longest-running thing this project has built —
not because the code is large but because its exit test takes a month.

Each phase: tests with mutation checks, `npx tsc --noEmit`,
`npx vitest run`, `npx next build` with exit codes pasted, one commit.

---

## 6. What this does NOT do

- **No preference pairs from owner edits.** C5 lists them; they need
  the edit history S3 records to be paired with what was replaced, and
  that is its own stage. Named here so it is not assumed done.
- **No learning loop that changes behaviour.** S5 records outcomes. A
  product that acts differently because of them is S6/S7, and doing it
  here would mean acting on a month of data from one business.
- **No new department, tool or page.** Rule 5 holds.
- **No model on the measurement path.** An outcome is counted or it is
  `not_measurable`. The monthly review's prose is templates with
  counted values substituted in, as the daily report's is.

---

## 7. What I need decided

1. **The short check date for P6.** I propose 3 days, on
   `candle_by_qaaf` only, so the loop can be watched closing this week.
   The 28-day version stays unverified until December. Agreed?
2. **`expected_effect` nullable, or required?** I say **nullable**: a
   decision taken because it is obviously right is honest, and forcing
   a forecast would produce invented numbers — which is the one thing
   this product must not do. But it means some decisions can never be
   scored, and you should choose that knowingly.
3. **Does the monthly review replace a daily one, once a month?** Or
   arrive alongside it? I lean to **alongside, on the 1st**, because
   skipping a day's report to make room for the review would hide the
   day's findings.
4. **P4 before P5, or P5 before P4?** The review is more useful with
   targets to review against (P4 first). But P4 is where invented
   numbers are most tempting, and P5 reuses machinery that already
   works. I lean to **P4 first** and would rather you overrule me than
   not know the trade.

Nothing here costs money. There are no model calls anywhere in S5 —
that is a design choice, not an accident, and §6 is where it is pinned.
