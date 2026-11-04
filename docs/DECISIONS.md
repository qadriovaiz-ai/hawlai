# Architectural Decisions — P0 Audit

Section 32b: judgment calls made during this audit that weren't explicitly asked about, logged here for review rather than left buried in commit messages — plus a forward-looking checklist for when future pieces should pause and ask vs. proceed.

## Retrospective log — decisions made without an explicit ask

**10b — gated activation only, not launch.** `/api/ads/adlaunch` (creates a campaign) and `/api/ads/[id]/status` (flips it ACTIVE/PAUSED) both had zero role gating. Reading the actual code showed launch always creates the campaign `PAUSED` — no money moves until a separate activation call. Scoped the fix to activation only, and reclassified `ad_campaign_launch` in `executionPolicy.ts` from critical/spend down to medium/create to match. *Worth checking:* do you want launch itself gated too (e.g. to stop a low-authority team member from generating campaign drafts freely), or is "anyone can draft, only authority can spend" the right split?

**10b — `daily_budget` as the approval-threshold amount.** `checkApprovalAuthority` needs a ₹ figure to compare against `approval_threshold`. Used the campaign's `daily_budget` (a recurring number) rather than, say, a projected total spend over some window. *Worth checking:* a ₹500/day campaign and a ₹500 one-time spend read as the same "amount" today, but one recurs indefinitely.

**11a — two separate Master Chat tools instead of one parameterized tool.** `propose_campaign_budget_change` / `propose_campaign_targeting_change` rather than one `edit_campaign(kind, ...)` tool. Matches the existing codebase style (many small explicit tools) and lets Claude's own tool-selection do the classification instead of a second parsing step — but it's more surface area to maintain if a third edit type shows up later.

**11a — service-role client for a Master Chat insert.** Master Chat runs on the caller's own RLS-scoped session client, but `pending_approvals` is owner-only RLS — so a non-owner team member's proposal would silently fail to insert. Used `createServiceClient()` for just that insert, after `dealershipId` was already resolved server-side from the caller's own session — same pattern the approvals executor itself already uses on this table. Not a new precedent, but it is the first time Master Chat's own tool-execution layer reaches for the service client for a *write* (existing uses were storage uploads).

**11b — blocked activation auto-creates a request instead of just failing.** The literal ask (10b) was "gate this." Turning a 403 into an actual queued `pending_approvals` row was an interpretation of what "gate" should feel like for the requester, not a literal requirement. *Worth checking:* is silently queuing the right default, or should the requester be asked before their attempt becomes a standing request someone else has to act on?

**11b — one pending activation request per campaign at a time.** Clicking "Activate" repeatedly while a request is outstanding doesn't create duplicates — it just re-confirms the existing one is queued. Chose this over allowing multiple stacked requests; nothing in the spec said which was wanted.

**11c — modify-support scoped to `change_campaign_budget` only.** "MODIFY" wasn't defined precisely. Targeting changes are multi-field and interpretive (not a single number to edit); activation is binary. Scoped to the one action type where "let the approver pick a different number" is unambiguous. Targeting/activation modification would need real design work if wanted later.

**11c — re-authorize against the modified amount, not the original.** If an approver raises the requested budget while approving, the code re-runs `checkApprovalAuthority` against the *new* number before applying — otherwise someone could get an unauthorized higher spend past their own ceiling by "modifying" a lower request upward. This is a security-relevant call I made without flagging it at the time; logging it here for visibility.

**11d — renamed existing registry keys instead of leaving the drift.** `executionPolicy.ts`'s `ACTION_POLICIES` keys (`ad_campaign_activate`, `campaign_auto_pause`) didn't match the real `action_type` strings in use (`activate_ad_campaign`, `auto_paused_campaign`) — the registry was dead code, so nothing broke, but I renamed the keys rather than adding aliases or leaving a mapping layer. If anything external ever referenced the old key names directly (nothing does today, verified), this would be a breaking rename.

**12c — wrapped all 13 cron subsystems uniformly, not just the 10 that lacked logging.** The ask was really about the 10 blind subsystems; the other 3 already had their own logs. Wrapped all 13 in `runAndLog` for one consistent observability surface rather than a partial one. Flagged inline in that turn's summary at the time.

**32a — summary table over full column dump.** `docs/DATABASE.md` documents 87 tables at "purpose + which migration to check" granularity, not full DDL. Chosen because a full dump would duplicate the migrations (the real source of truth) and go stale immediately. If the intent was closer to a complete standalone schema reference, this undershoots that.

## 22 October 2026 — S2's close

**S2a — the estimator was replaced by measurement, not repaired.** Four
confirmation runs were approved at ~Rs 78 and cost Rs 94.73 because the
estimator modelled a four-call pipeline that now makes five to nine
calls. I deleted the hand-written call list rather than updating its
numbers: a second description of the pipeline drifts the moment the
pipeline changes, which is how it got wrong in the first place. The
estimate is now the worst per-case cost anyone has actually paid, plus
20%, with the measured runs listed by date. Consequence the owner must
live with: a 6-case run no longer fits the Rs 30 per-run cap, so runs
are 4-5 cases and the social surface needs three slices.

**S2b — parallel runs now reserve before they check.** The ceiling was
being checked against the ledger as it stood when all four runs
started, so each found room for itself in the same Rs 78. A run writes
its estimate to `spend.d/` before calling anything, and the ceiling
counts outstanding reservations. Two runs starting in the same instant
both stop, which is the safe direction.

**S2c — the withheld-subject check is code, not a prompt rule.** The
scope filter can only judge claims the extractor reported, and the
extractor is correctly told that calls to action are not claims — so a
product name inside one was never scope-checked. Rather than weaken
that rule, a separate code-only check asks which records were withheld
from this piece and whether the copy names one. Field-blind and
kind-blind, no model, no cost. Its safety is that a withheld name is
reduced to the words appearing nowhere in what the writer was given and
all of them must be present, so a shared word can never delete a true
sentence.

**S2d — the name check was NOT widened to label fields, and the number
is why.** Widening it is the obvious fix for an unlicensed benefit claim
in a title. Measured across the 127 sentences the current runs shipped,
it removed four lines and one was true copy: "2 BHK Flat at Sunrise
Heights". Separating that from "Smooth Finish" needs a list of quality
words, which is trade vocabulary and barred by rule 3. Narrowed back,
gap recorded in the door's own comment and in the roadmap as K1. The
grading sheet still puts every label row to the grader as a claim, so
the gap is visible rather than silent.

**S2e — the credential exception contains exactly one claim type.** A
business-level record may cover a claim about one named product only
when the claim type is `credential`. Not process, not material: those
are the classes the 20 October paneer incident was about. Confirmed by
an exhaustive free sweep — 6 fixtures, 6,384 record x product x
claim-type pairs, 532 allowed and all of them credentials, 0 other
crossovers.

**S2f — three existing source-grep assertions were widened, not
weakened.** Each pinned the spelling of a mechanism I broadened, and
each kept its original case explicitly plus behaviour. Flagged to the
owner in the same turn, per rule 7. One of them earned its keep within
the hour: `notCopy.test.ts`'s note-chain assertion caught the new
check's owner note being computed and never shown.

**S2g — two of my own tests were vacuous and were rewritten rather than
deleted.** A mutation check revealed that dropping `claim.claimType`
from Select broke only a source grep and not the behavioural test beside
it, which led to finding that Select never refused dairy-03's claim at
all — I had reported that it did. The second searched the judge's claims
block for the licence digits, which the claim's own canonical prints, so
it passed with the evidence filter mutated out. Both kept, with the
mistake recorded in the test.

## 22 October 2026 — S3, and two findings from the founder's own testing

**S3a — I wrote a runbook step for something I had deliberately not
wired.** `hawlaiSite.undo` handled page meta from P1; the chat tool's
candidate query stayed text-only on purpose while undo still chose by a
label guess, and I recorded that in the commit. Then I put "undo a
search title" in the P5 runbook as a thing to test. He tested it and
chat correctly told him there was no such record. The lesson is not
about undo: a capability on a module is not a capability in the
product, and a runbook must be written from the reachable path rather
than from what I had just built.

**S3b — a flag the model is never told about does not exist.** Every
claims check in the edit path honoured `writtenByOwner`. What was
missing is that no refusal note mentioned it, and two of them actively
said "do not retry with the same wording" — so when the founder said
"these are my exact words" the model had no path to act on it. Fixed as
one shared constant carried by every refusal, rather than a fourth
sentence in a fourth place.

**S3c — the price rule is the one thing the owner's words do not
override, and it now says so.** Deliberate: the harm is two numbers
drifting apart, not a false claim. Left as it is, with the message
changed, because an owner told "your own words are saved as you wrote
them" otherwise reads it as a broken flag. My own description of the
rule to the founder was too broad and is corrected in the plan.

**S3d — test doubles extended, not assertions weakened.** Making the
meta undo reachable changed undo's query to `.in("action_key", [...])`,
which the chat test's fake supabase did not implement. The double was
extended and taught to honour its filters — it had been returning every
row whatever was asked for, so the action_key filter had never been
exercised by any test — and the fixture row was given the
`action_key` it always implicitly had. One existing assertion on the
price message was widened to cover the new sentence.

## 1 November 2026 — the eval spent the product's credit for nine days

**The incident.** Seven eval files each had an identical `loadKey()`
reading `ANTHROPIC_API_KEY` from `.env.local` and assigning it to
`process.env` — the variable `lib/ai/claude.ts` uses. Every paid eval
run in S1 and S2 (~Rs 905; Rs 94.73 on 22 October alone) therefore came
out of the balance production depends on. The organisation's credit
reached $0.00 on 23 October and from 24 October to 1 November every AI
call in the live product failed with `kind: "credits"`.

**Why it was not noticed.** The cost of every run was measured from the
API's own usage, reported to the rupee, and approved in advance. The
accounting was immaculate and pointed at the wrong account. Nobody — me
least of all — asked which balance was being drawn down. A per-run
ledger answers "how much" and says nothing about "whose".

**Why the evidence looked like a per-business problem.** A successful
`daily_autopilot` run does not mean an AI call happened:
`draftStuckLeadFollowUps` returns 0 without calling anything when no
lead is stuck. So 61 "successes" were mostly runs that never touched
AI, and the 19 failures were the ones that did. candle_by_qaaf was not
special, it was the business with stuck leads. There is no per-business
AI budget: one key for everything, and `generationLimits` covers
images, video, voiceover, brand kits and website builds — not text.

**The decision: refuse, never fall back.** `loadEvalKey()` requires
`EVAL_ANTHROPIC_API_KEY` and STOPS the run when it is absent. The
obvious convenience — fall back to `ANTHROPIC_API_KEY` so a run is
never blocked — is precisely the fault, so it is gone rather than
narrowed. It also refuses when both variables hold the same value,
because the separation would then be decorative.

**And one implementation, not seven.** Fixing one of seven copies would
have left six still billing production. A test asserts no eval file
reads or assigns the production key and that the harness holds the only
assignment left.

**What this says about the dead product's nine days.** The report
emails were correct throughout and kept arriving, because the audit is
model-free. Only the parts that need a model were dead. That is the
free/paid split doing its job, and it is the one piece of this that
worked as designed.

## 2 November 2026 — S4/P6, and three judgment calls inside an approved plan

The founder asked, correctly, whether I had planned the feature he told
me to plan before building. I had not. I built the drafting half of it
in P1c, wrote "the owner approves once" into a code comment as though
that settled it, and moved on. Worse, `report.ts` then shipped the
sentence *"Approve a plan and they will appear here"* in every daily
email from 24 October — naming a mechanism that did not exist, because
nothing wrote a drafted setup step into `goals`.

The plan he then approved is `docs/PLAN-S4-GOAL-APPROVAL.md`. Three
things were decided while building it that the plan did not say.

**1. "Offered once" had to mean any status, not draft-or-active.** The
plan said a step would be re-drafted when it had no `draft` or `active`
goal. Reading `/api/goals/[id]/discard` killed that: it sets
`'abandoned'` rather than deleting the row. So a step the owner
explicitly discarded would have come back the next morning, and the
morning after — breaking the plan's own promise that drafts "appear
once, not daily". Migration 211's unique index therefore has NO status
predicate: one setup step produces at most one goal row per business,
ever, and discard means no. Re-opening a step after its goal completes
is deliberately left to S5, with the outcome records that could justify
it.

**2. The report needed the PENDING count, not this run's writes.** A
step drafted yesterday and still unconfirmed is still waiting. Counting
only what this run inserted would make the email go quiet about it the
next morning and the owner would never hear of it again.

**3. The dry-run script was counting a draft as an approved plan.**
`scripts/growth/dryRunReport.ts` passed `input.goals.length` as
`activeGoals`, with no status filter. Harmless while the table was
empty; the moment the manager drafts into it, one pending draft reads
as an approved plan, suppresses the setup steps, and shows the founder a
dry run that does not match his real email. Fixed in the same change
and called out, because it is a behaviour change he did not ask for.

**Three existing tests were changed, each disclosed rather than
quietly adjusted.** `growthReport`'s assertion on "Approve a plan" —
the sentence that is the fault — now asserts it is GONE, and covers
both branches instead of one. `dailyGrowth`'s "TOUCHES NOTHING ELSE"
exact-set assertion gained `goals`, and is still an exact set, plus a
new assertion that every `goals` write is an insert and never an
activation. `dailyGrowth`'s unreadable-goals stub gained the two
methods the new read uses, and now also asserts nothing was drafted on
a table that would not answer.

**And `sql()` joined `tests/helpers/source.ts`.** Migrations are
grepped through `code()` in this suite, which strips `//` and block
comments — neither of which a `.sql` file uses. So every `--` comment
survived into the text those tests search, which is the 2026-10-09
incident exactly: 211's own header explains at length why its index is
NOT scoped to `status in ('draft','active')`, naming that clause. One
shared stripper rather than a copy in the test, per CLAUDE.md rule 8.

**13 mutation checks, 13 killed.** One came back SUSPECT — "red, but a
different test failed" — and that was my runner naming the wrong
expected test, not a surviving guard; re-run alone, the correct test
failed. The runner also decodes vitest's output as bytes, because the
first version let Python decode it as cp1252, threw, and reported every
verdict as suspect. An instrument that cannot read its own output is
worth less than no instrument.

## 4 November 2026 — S5/P4, and the number that does not exist

### The plan's own words were loose, and I did not build what they said

§3 of `docs/PLAN-S5-OUTCOMES.md` says the ready branch sets "targets
from **this business's own baseline**". Read closely that sentence does
not survive: **a baseline is today's number and a target is
tomorrow's.** "Take this step from 12% to 30%" — the 30 comes from
nowhere. It is a forecast, and a forecast is the one thing this product
must not invent, which is the whole reason `expected_effect` was made
nullable in the same plan.

**So a target goal carries no target number.** It names the step, states
the rate that step is running at now — counted, from this business's own
funnel — and leaves `target_value` null. It is still measurable, which
is the part worth being explicit about: measuring needs a MEASURE and a
BASELINE, not a target. The number would only be needed to say "hit" or
"missed", and nothing here is entitled to say that.

Three mutation checks hold it down, including one that reads the source
for `targetValue: null` and fails on any digit in that position.

### Three smaller calls inside the same phase

**1. A target renders as a `setup` block with `isTarget: true`, not as a
new block kind.** They render the same way and go to the same place — a
draft goal on the Tasks page. What the flag changes is the word in front
of it ("TARGET —", not "SETUP STEP —") and the subject line, which now
counts targets apart from setup steps: "1 target to approve" rather than
"1 setup step to get started" to a business that is a month past getting
started.

**2. A target's figures are declared on its own block.** The digit walk
reads each block's own declarations, not the report's whole set, and a
target's sentence states three counted numbers — who entered the step,
what share got through, over how many days. Without `declared` the
target blocks would have been pruned out of the email by the rule that
exists to catch invented numbers: 3 November's silence, in a new place.

**3. `attribution: "partial"` for every target outcome, never
"direct".** A funnel rate moves for every reason a business moves —
season, price, somebody else's campaign. The goal is about the step; the
step is not about the goal. The finding-count outcomes stay "direct",
because there the thing measured IS the thing decided about.

### Two existing test files changed, and neither was loosened

`strategyDiagnosis.test.ts` compares the whole `weakest` object with
`toEqual`, so adding `fromKey`/`toKey` made three assertions fail —
correctly, which is what an exact-match assertion is for. Each gained
the keys it should carry, and a fourth assertion was added for the
property those keys exist for: a goal filed under a LABEL is orphaned
the day the business model renames it.

`recordDecision.test.ts` grepped the confirm route for a two-way
ternary that P4 turned into a three-way branch. The grep's shape
changed; the rule it protects — with no `source_key`, the measure has no
source — is asserted against the branch that now owns it. Recorded here
because "the test was failing so I changed the test" is exactly the
sentence CLAUDE.md rule 7 exists to make someone justify.

**22 mutation checks, 22 killed, no survivors.** The one worth naming:
removing the target branch from the results job makes it read "open
findings of type `target:...`" — zero before, zero after, verdict
"unchanged" — so every target this product ever sets would report that
nothing it did made any difference. That is the same shape as the bug
the founder's first P2 live check found, caught here by a test instead
of by him.

### The 30-day cycle, and the four tests of my own that were asleep

The founder answered the one open question the same day: the same step
comes back after 30 days, whatever became of the last offer, because the
funnel may have moved. Built as `TARGET_CYCLE_DAYS`, counted per step,
with **no migration** — the day goes in the key, which is what migration
211's status-blind unique index already allows.

**16 mutation checks for the cycle; the first run killed 12.** All four
survivors were defects in my tests, the same shape as the twenty before
them: the test never reached the branch it was about.

- the unreadable-age branch (`age === null`) had no fixture with an
  unreadable date, so flipping it to "old enough" changed nothing
- `lastOfferedOn` picks the newest offer, and every fixture had exactly
  one offer per step — so taking the OLDEST survived, which in a
  year-old account would re-offer every step every morning
- the "thin reason beats the schedule" test had one thin funnel and no
  recently-offered step, so only one of the two sentences existed and
  the ORDER it asserts was unreachable
- the reader's `dealership_id` filter had no second business in the
  fixture, so dropping it changed nothing

Two more came back SUSPECT — "red, but a different test failed" — and
both were my runner's expected-name matching, not a surviving guard;
re-run by hand, each died to exactly the test it should have. Recorded
because an instrument that misreports a kill as a suspect is one step
from misreporting a survivor as a kill.

## 4 November 2026 — S5/P5, the monthly review

**The one line a monthly review obviously wants, and cannot have.**
"Your weakest step was 12% a month ago and is 18% now" — nothing in
this product records what the funnel was a month ago.
`fileDiagnosisSignals` files the weakest step into `business_signals`
and `recordSignal` upserts on its fingerprint, so there is one row per
topic and no history. Reconstructing it is the mistake S5/P2b already
paid for.

So the review reports the only month-ago numbers that exist:
`decisions.baseline` and `outcomes.measured_before` — the steps the
owner actually acted on. A comparison nobody recorded is not in the
email, and §6c of the plan says so where the next person will look.

**Judgment calls:**

1. **A subsystem, not a cron entry, and it decides the date itself.**
   Vercel Hobby allows exactly two cron entries and both are used. It
   goes at the END of `signals`, after `decision_results`, so the
   outcomes measured this morning are in the review that goes out this
   morning.
2. **`withoutUncountedBlocks` gained a `resubject` hook** instead of
   the review getting its own copy of the pruning. The prune rewrites
   the subject because the subject describes what is in the email —
   true for both emails — and without the hook a pruned review would
   have gone out titled "your daily check, nothing to flag". A hook,
   not a bypass.
3. **The owner's own words, without their figures.** `decisions.what`
   can carry a number from the moment it was recorded ("Acted on: 5
   pages have no search title"). This email did not count that 5, and
   the digit walk compares by value, so printing it would prune the
   whole result — the owner losing a result to a rule meant to protect
   him. `stripDigits` is the same answer the AI-failure alert already
   uses.
4. **No year in the body.** Same rule: a year is a digit nothing
   counted. The month is named, the email is dated.
5. **`prunedReview` is its own exported function.** Nothing this
   product can produce today puts an untraceable figure in this email,
   so the pruning path is defensive — and a defensive path reachable
   only through the job is a path no test can reach. Exported, it is
   tested directly; the mutation that dropped the subject hook dies to
   a fixture rather than surviving.

**One real fault, caught by a mutation that survived.** The month
window compared ISO timestamps against date strings. That is out by
five and a half hours at each end: a decision taken at 02:00 IST on the
1st is stored as 20:30 UTC on the last day of the previous month, and
would have been reported in the wrong month's review. The boundary is
now an IST instant, pinned at both ends of both months. The mutation
that found it (`<` to `<=`) could not fail against string comparison,
which is how the bug was visible at all.

**One guard of this project's own caught me.** `signupPlaceholder.test.ts`
failed because the new file typed out "Your business" — a Q1 guard
catching a second copy of the string it exists to keep in one place.
Fixed by importing `PLACEHOLDER_BUSINESS_NAME`, not by adding an
allowlist entry, which is what that allowlist is for.

**25 mutation checks, 25 killed.** Two needed work: one was my own
unfaithful mutation (deleting a property left a syntax error, which is a
crash and not a test of anything) and was rewritten to a subject that
counts the wrong blocks; the other was the boundary bug above.

## 4 November 2026 — S5/P6, the exit test and what it cannot prove

**The exit criterion is "after 28 days, each executed action has an
outcome row", and 28 days have not passed.** So the test does the one
honest thing available: it drives the whole chain on a frozen clock
through a single in-memory database — decision → check date → results
job → one outcome row → the monthly review reporting it — and then says
in its own header, at the top, that the live 28-day run is unverified
until 1 December. A test in it asserts the PLAN still says so too,
because a limit recorded only in a commit message is a limit somebody
later assumes was lifted.

**The short check date is armed by the environment, not by code.**
`GROWTH_SHORT_CHECK_UNTIL=<date>:<dealership_id>`, the same shape as
`GROWTH_COPY_AUDIT_ON`: it names the business (a bare date would put
every business in the product on a 3-day check, and dailyJobs.ts runs
once per dealership), and it expires by itself. No business name
anywhere in the code — rule 3 — and "remember to turn it off" is not a
safeguard. Measuring an outcome three days after a decision is not
wrong for a business somebody is watching; it is wrong as a default,
because this product would report those early numbers as results.

**13 mutation checks, 13 killed — but the first run killed 11, and one
survivor was a real hole in the test rather than a cosmetic one.**

Replacing the writer's `checkDaysFor(...)` call with a hardcoded 28
survived, because every test in the file handed `checkInDays` in
explicitly. The feature exists precisely because the three real callers
pass NOTHING — so the only path that matters in production was the one
path no test took. Fixed by arming the environment variable and calling
the writer the way the routes do. The other survivor was the usual
shape: no second business in the fixture, so the results job's
`dealership_id` filter could not fail.

**And three of my own test mistakes, found by running them:**

- `due` on the results job means "came due and still has no outcome"
  (`pending.length`), so a second run reports 0 — the stronger
  statement, which my assertion had backwards.
- 4 November plus 28 days is 2 December, so the outcome fell outside the
  November review. The arithmetic was mine, not the product's — and the
  fix is the short check, which is exactly what it is for.
- a grep asserting "no real clock in this file" failed on the in-memory
  double's own `created_at` stamp, which no assertion depends on. Scoped
  to exclude the double rather than deleted.

## Forward-looking checklist — pause and ask vs. proceed

**Proceed without asking when:**
- An established precedent for the exact same kind of problem already exists elsewhere in the codebase — reuse it, note that you did, move on (e.g. the service-client-after-server-resolved-dealershipId pattern, reused four times now: approvals executor, 11a, 11b, campaigns page).
- The decision is reversible and low-blast-radius (doc structure/scope, internal naming, which of two similarly-clean code shapes to use).
- The literal ask plus Section 37's standing rules (reuse architecture, never weaken RLS, no client-side-only enforcement for sensitive actions) fully determine the answer — there's only one architecturally sound choice.

**Pause and ask when:**
- The codebase reveals two or more genuinely different valid designs and picking one has security or data-correctness implications (who can do what, what counts as "the amount" for a threshold check).
- The spec's own wording is ambiguous enough that two reasonable readings would produce different scopes (this is exactly what happened with 32b itself).
- Implementing requires changing or renaming something already shipped that other code — or a person — might already depend on, even if nothing currently references it.
- The right UX/behavior isn't specified by the literal ask and genuinely could go either way with no clearly-better default (11b's "auto-queue on block" call).

**Always, even when proceeding without asking:**
- Say what was decided and why, in the commit message and the turn's status update — not just in code comments. A judgment call that's only visible by reading a diff line-by-line isn't actually disclosed.
