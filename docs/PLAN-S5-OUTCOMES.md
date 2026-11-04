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
| ~~**P3**~~ | ~~`outcomeInsights.ts`'s three kinds write Outcome rows~~ — **SKIPPED, mis-planned. See §6a** | — | — |
| **P4** | The 90-day strategy's `ready` branch: targets from this business's own funnel — **DONE 4 Nov**, with no target number, see §6b | **M** | — |
| **P5** | The monthly review email, on the daily report's rails — **DONE 4 Nov**, see §6c | **M** | — |
| **P6** | Exit test, and the short-check-date run that makes it visible this week — **DONE 4 Nov**, see §6d | **S** | — |

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

## 6a. P3 was mis-planned, and is skipped — 3 November 2026

**The premise in §5's P3 row is wrong, and I should have checked it
before writing it.** It said `outcomeInsights.ts`'s three kinds would
"write Outcome rows as well as prose". They cannot.

`outcomes.decision_id` is NOT NULL and UNIQUE — an outcome hangs off a
decision. Those three writers fire on EVENTS, not decisions:

| Writer | Fires when | Called from |
|---|---|---|
| `recordLeadOutcomeInsight` | a lead converts or is lost | the lead routes |
| `recordCallOutcomeInsight` | a call completes | the Vapi webhook |
| `recordCampaignPauseInsight` | a campaign auto-pauses | `autopilotAgent` |

None of them has a decision behind it. A lead converting is not the
record of anybody's choice.

**What is true** is that these events could be the OUTCOME OF a
decision — if the decision recorded which lead, which call, which
campaign it was about. It does not. `decisions` carries `goal_id`,
`opportunity_id` and `why` pointers, but no general subject.

**And that is the same missing piece P2's own `not_measurable` reasons
already name**, in those words: *"the decision does not record which
thing this was about, so its effect cannot be found"*. Unblocking P3
means giving decisions a subject — a migration plus a per-action-type
map of which field in `action_details` is the subject. That is the same
shape of work as the dropped fix 1 (the eight opportunityAgent finding
types), which the founder stopped on size and risk.

**So P3 is skipped, not dropped, and it comes AFTER that piece.** It is
not blocked on anything in P4 or P5, and neither of those needs it:
both work off goals and the finding-count outcomes, which are verified
working as of 3 November.

Written down because a phase that quietly disappears from a plan is a
phase somebody later assumes was done.

## 6b. P4, as built — 4 November 2026

**What §3 asked for does not exist, and the phase is better for it.**
"Targets from this business's own baseline" reads as one thing and is
two: the baseline is today's number, counted; the target is tomorrow's,
and nothing here can know it. So a target goal names the step and the
rate it runs at, and `target_value` stays null. `docs/DECISIONS.md`'s 4
November entry has the whole of it.

**What landed:**

| Piece | Where |
|---|---|
| `targetKeyFor` / `parseTargetKey` / `weakestStepFor` / `targetGoalsFrom` | `src/lib/growth/targets.ts` (new) |
| The step's machine keys, so a goal survives a label change | `diagnosis.ts` — `weakest.fromKey` / `toKey` |
| The measure: the step's rate, direction up | `measures.ts` — `measureForTarget` |
| The baseline, read before the goal is activated | `funnelRateFor`, and the confirm route's target branch |
| The outcome, measured by the rate, `attribution: "partial"` | `resultsJob.ts` |
| The draft, on the Tasks page by the same writer as a setup step | `dailyGrowth.ts` — the `ready` branch |
| The email: "TARGET — ...", every figure declared, subject counts them apart | `report.ts`, `strategy.ts` — `planLine` |

**Re-planned every 30 days — the founder's answer, 4 November 2026:**
*"30 din baad naya target offer karo — chahe purana poora hua ho ya
nahi, system dobara dekhe aur naya target suggest kare (funnel badal
chuka ho sakta hai)."*

So `TARGET_CYCLE_DAYS = 30`, counted **per step** from the day it was
last offered, whatever became of that offer — completed, discarded,
still a draft, still active. A step whose offer is 29 days old waits;
at 30 it comes back with today's rate and today's key.

**No migration, and that is the design.** Migration 211's unique index
on `goals.source_key` has no status predicate, so a second offer needs a
different key — the day it was offered on goes in the key
(`target:<funnel>:<from>_to_<to>:<YYYY-MM-DD>`) and the 30-day rule is
counted against the step part. `parseTargetKey` still reads a key
written without a day, so nothing already on record stops being
measurable.

**A DIFFERENT step is not on that clock.** If the weakest step moves,
that is a different key and it is offered the next morning. The 30 days
only governs how often the SAME step comes back.

**One consequence worth saying out loud:** because status is ignored, a
step the owner is already working on can be offered again a month later,
so the Tasks page can hold a target beside an active goal for the same
step. That is what "chahe purana poora hua ho ya nahi" asks for, and it
is the right default — a month-old target carries month-old numbers —
but it is a judgment he should see rather than discover.

**Verified:** 46 new tests, 38 mutation checks all killed, `tsc` 0,
5,366 tests green, `next build` 0. **Unverified:** everything on a live
business. candle_by_qaaf has 45 days and 55 events, so the branch will
fire on the next daily run — that is P6's job to watch.

## 6c. P5, as built — 4 November 2026

An email on the 1st, **alongside** the daily report, saying what was
decided and what came of it. `src/lib/growth/monthlyReview.ts`, and a
`monthly_review` subsystem at the END of the `signals` group — after
`decision_results`, so the outcomes measured that morning are in the
review that goes out that morning. **No third cron entry**: Vercel
Hobby allows exactly two and both are used, so the job decides for
itself that it is the 1st and returns a skip on the other thirty days.

**What it says:** decisions recorded in the month, results measured,
how many came out better / unchanged / worse / **could not be
measured**, how many are still waiting for an answer — then up to five
results written out one by one, and up to three of the unmeasurable
ones with their reasons.

**What it refuses to say, and this is most of the design:**

1. **No causation.** Where `attribution` is not `direct` the sentence
   carries "This measure moves for other reasons too, so this is not
   proof that the work caused it." Every S5/P4 target outcome is
   `partial`, so this is the common case, not the rare one.
2. **No funnel comparison.** The obvious monthly line — "your weakest
   step was 12% a month ago and is 18% now" — **cannot be written
   honestly: nothing records what the funnel was a month ago.**
   `recordSignal` upserts on its fingerprint, so `business_signals`
   holds one row per topic and no history. The only month-ago numbers
   this product has are `decisions.baseline` and
   `outcomes.measured_before`, which is exactly what the email reports.
3. **No model.** Templates with counted values put in, pinned by a test
   that greps the file for any model call.
4. **No year in the body.** Every digit in a block has to be a declared
   counted value, and a year is neither counted nor about the business.
   The month is named; the email is dated.

**Two things it reuses rather than reinvents:** the digit walk
(`everyNumberIsCounted`) and the pruning (`withoutUncountedBlocks`).
The prune rewrites the subject, because the subject describes what is
in the email — so it gained a `resubject` hook, or the first pruned
review would have gone out titled "your daily check, nothing to flag".

**Two faults found while building it:**

- the month window compared ISO timestamps against date strings, which
  is out by five and a half hours at each end — a decision taken at
  02:00 IST on the 1st is stored as 20:30 UTC on the last day of the
  month before, and would have been filed under the wrong month. The
  boundary is now an IST instant, pinned at both ends.
- `signupPlaceholder.test.ts` caught the new file typing out "Your
  business" — a guard built in Q1 catching a second copy of a string it
  exists to keep in one place. Fixed by importing the constant, not by
  an allowlist entry.

**Verified:** 41 new tests, 25 mutation checks all killed, `tsc` 0,
5,407 tests green, `next build` 0. **Unverified:** nothing has run
live. The first real review goes out on **1 December**, which is also
when P6's 28-day exit test comes due.

## 6d. P6, as built — 4 November 2026

### The exit test

`tests/s5ExitTest.test.ts` drives the whole chain on a frozen clock,
through ONE in-memory database so the rows one stage writes are the
rows the next one reads: an action recorded → a check date → the
results job → exactly one outcome row → the monthly review reporting
it.

**What it shows:** every decision that came due has an outcome row,
across all three kinds; nothing is written before the check date; a
second run of the job adds nothing; a second click is still one
decision; a decision nobody could measure gets a row WITH its reason;
and another business's due decision is not answered by this business's
run.

**What it cannot show, and this is the honest part:** that the
production cron fires on day 28 and writes that row against the live
database. Nothing can until 28 days elapse. The first decisions were
recorded on 3 November 2026, so **the live 28-day run is UNVERIFIED
until 1 December** — and a test in that file asserts this plan still
says so, because a limit that lives only in a commit message is a limit
somebody later assumes was lifted.

### The short check date

`GROWTH_SHORT_CHECK_UNTIL=<date>:<dealership_id>` puts ONE business on a
3-day check instead of 28, so the loop can be watched closing this week.
The shape is copied from `GROWTH_COPY_AUDIT_ON`, which learned both
lessons the hard way:

- **it names the business**, because `dailyJobs.ts` runs every subsystem
  once per dealership — a bare date would put every business on a 3-day
  check, measuring outcomes before the thing measured has had time to
  move, and this product would then report those as results. A bare date
  arms nothing and says so in the log.
- **it expires by itself** on the date given, because "remember to turn
  it off" is not a safeguard.
- **no business name in the code.** The id comes from the environment
  (CLAUDE.md rule 3).

`recordDecision` applies it for all three callers, who pass no wait of
their own; an explicit `checkInDays` still wins, for a caller that knows
what it is asking for.

**To arm it**, set the variable in Vercel to tomorrow-or-later and the
business's id. Decisions recorded while it is armed get a 3-day check;
ones already written keep the date they were given, because a check date
is a record of what was decided, not a setting.

**Verified:** 16 new tests, 13 mutation checks all killed, `tsc` 0,
5,423 tests green, `next build` 0. Two guards of this project's own
caught the work: `.env.example`'s completeness test (the new variable
was undocumented) and, in P5, the signup placeholder allowlist.

**Unverified:** the live 28-day run (1 December), the first real monthly
review (1 December), and the short check against the live database —
which needs the variable set and three days.

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
