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

## 4 November 2026 — S6/P0, and what the measure found before it was finished

**The founder replaced S6's exit clause** (decision 1 of 4): *"nothing
that changes state is reachable except through an Action"*, and
*"tool count falls"* is withdrawn. The architecture doc's §3 row and
§4.3 now say so with his date. The old clause could be satisfied by
deleting the analytics tool.

**Building the measure found two things, and one of them needed fixing
before the measure could be honest.**

**1. `approvalCoverage.test.ts` is one hop deep.** It greps each tool's
`case` body for the symbols that reach the outside world. Two tools'
bodies were one line, delegating to `switchMetaCampaign`. The money step
behind that call WAS gated — I checked, it goes through
`createPublishAction` — but that grep could not see it, so the grep was
not what kept it gated. Both tests are kept: the grep asserts the SHAPE
of each gate (that `send_email` proposes, that the five audited actions
name their action type), the new walk asserts reachability.

**2. One function served both campaign directions.** Starting a
campaign is approval-gated; pausing is direct by policy (rule 6, the
safe direction must not be the slow one). Both correct, both in one body
behind `if (kind === "pause")`. **A call graph cannot see which branch a
caller takes**, so anything following `activate_meta_campaign` arrived
at the pause path's direct Meta call and read the money step as
ungated. The only way to quieten that would have been to allowlist the
money step — the one entry such a list must never carry — so the
function was split into `resolveCampaignForSwitch` /
`pauseMetaCampaign` / `activateMetaCampaign`. No behaviour change;
three test files that CALL it now call the direction they test, and four
source-grep assertions were restated against the split and are stronger
for it.

**A guard that reads `git show HEAD:` cannot be green in the commit that
changes what it guards.** `campaignSwitchTools.test.ts` does that
deliberately, so its four assertions were red for exactly one commit and
green immediately after. Recorded because the alternative — making
`committed()` fall back to the working tree — would have destroyed the
property that file exists for. The same assertion now also exists
against the working tree in `stateChangeDoor.test.ts`, so a merge of the
two directions fails before it is committed as well as after.

**11 mutation checks, 11 killed.** Four needed work, and three of those
were my own:

- a mutation deleting the walker's property-call sweep survived, because
  a word boundary matches after a dot: the plain-identifier regex
  already collected `client.sendWhatsAppText(`. **The line was removed**
  rather than kept as insurance no test could hold.
- a mutation that returned early from the pause path survived, because
  the walk reads CALLS, not control flow, and the call stood below it as
  dead code. Rewritten to what "the path closed" actually looks like:
  the call going away.
- one mutation left a syntax error behind, which is a crash and not a
  test of anything; and one expected the wrong test name, which it
  reached by a different assertion that was a genuine kill.

**And two of this project's own guards caught me inside one hour:** the
drift check I had just written matched the words "sends" and "posts" out
of prose and nothing else — vacuous and green, the exact failure its own
section 2 exists to prevent — and `noControlCharsInSource.test.ts`
caught a literal backspace my patch script wrote into a comment where a
regex word-boundary escape was meant. That test's name says *"a \b
eaten by a script is the reason"*. It was.

## 4 November 2026 — S6/P1, and a live fault found by reading the code it was about to restructure

**Approving the same card twice carried the action out twice.** I
reproduced it before claiming it: a `place_outbound_call` card approved
twice placed **two real phone calls**, and both requests answered 200. A
video card uploaded to YouTube twice. Internal mail sent twice.

**The code already knew, in writing.** `src/lib/publish/release.ts`
says in its own comment: *"The route has no already-approved guard, and
the inline card's state is local to the component, so a page reload
genuinely does offer the button again"* — and defends itself with a
compare-and-set on `publish_actions`. That defence covers the publish
family only. The sends had nothing: the discount code re-checks whether
the code now exists, a customer email takes migration 208's idempotency
claim, and a call, an upload and a team email were unprotected.

**So the fix went in before the restructuring**, which is the rule I
argued for in the S6 plan: a fault on a live surface is fixed before
that surface is rebuilt. One guard in `/api/approvals/[id]`, covering
every branch at once: a card whose status is not `pending` is refused
with 409 and a reason, before anything runs.

**It does not block a legitimate retry**, and that is why it reads the
ROW rather than remembering the click. Every branch that fails returns
without marking the row, and the marking happens after all of them, so a
card whose send genuinely failed is still pending and can be approved
again. A test asserts exactly that, because a guard that stranded a
failed send would be worse than the bug.

**One existing test restated, and its property kept.**
`activationCardEndToEnd.test.ts` documented this scenario already —
"a page reload can offer Reject on a card that already went through" —
and expected 200. That 200 answered the owner *"Rejected — nothing was
changed"* about a campaign that was running on Meta. It now expects 409
with the reason, and the assertion that mattered — the executed record
is not rewritten — is unchanged. Recorded because this is the third test
restatement today and each one needs a reason that is not "it was
failing".

**5 mutation checks, 5 killed**, including the live fault itself and the
"guard placed after the action instead of before it" variant. A sixth
was removed rather than contrived into a kill: adding
`|| approval.reviewed_at` to the guard is an **equivalent mutant** —
`reviewed_at` is written in the same update as the status and nowhere
else, so it changes nothing in the test or in production.

## 4 November 2026 — S6/P1, the Dispatch envelope

**Two families, not one Action type**, which the architecture doc's §4.2
settled and this builds: `publish/` is for edits to a resource — there
is a `before`, execution re-verifies against it, undo is real — and a
send has none of that. So `src/lib/dispatch/` has its own shape, and
`undoable` is the **literal `false`**, not a boolean. A future
dispatcher cannot quietly grow an undo; the compiler refuses it, which
is where the mutation check for that property had to be aimed too.

**The honest sentence is composed, not remembered.** Every tool wrote
its own `confirm` line, and whether it mentioned that a send cannot be
taken back was down to whoever typed it. `requestApproval` now appends
the dispatcher's own `cannotBeTakenBack` sentence when the caller has
not already said it. A new dispatcher cannot ship a card that omits it,
and a test asserts the sentence is in the owner's terms — "they have
still been called", "not unseen" — rather than "this action is
irreversible".

**Two dispatchers moved, not ten.** `place_outbound_call` and
`publish_video`, each lifted out of the approvals route unchanged. The
registry writes down why each remaining send has not moved, and a test
asserts those reasons exist, because a list of "not yet" with no reasons
is a list on which the next person moves the easy one rather than the
right one. `send_email` is deliberately last: two paths and migration
208's claim.

**The evidence the move was faithful is the OLD tests.**
`approvalExecution.test.ts` asserted all of this before the move — a
call placed only after approval, the lead re-read so an opt-out is
honoured, a video published only after approval — and passes unchanged
after it. A new test written alongside a refactor proves the new code,
not the sameness.

**One test restated, property strengthened.** `approvalCoverage`
required an `action_type === …` branch in the route for every gated
action — the dead-end check. The envelope is now a second way to carry
one out, so it asks "is there anything at all" and **also** refuses
BOTH at once: a dispatcher plus a leftover branch is two paths for one
action, and the branch would be the one nobody notices.

**A real bug, found by my own test's last line.** `dispatcherFor`
indexed the registry object directly, so `dispatcherFor("toString")`
returned `Object.prototype.toString` — and the route would have called
`.execute()` on it. `action_type` is a free-text column and
`requestApproval` is not the only thing that inserts into
`pending_approvals`, so "nothing would put that string there" was not a
guarantee to rely on. One `hasOwnProperty` line.

**17 mutation checks, 17 killed**, one of them against `tsc` rather
than vitest because a literal type is checked by the compiler. Three
needed work and two were mine: a grep for the idempotency claim that
matched `String(id)` somewhere ELSE in the route (the decision row at
the bottom), and a "preview sends" mutation that only imported the
sender without calling it — a mutation that does not do the thing is not
a test of whether the thing is caught.

## 4 November 2026 — S6/P2, and the two tools that write their own approval

**A deviation from the plan, stated first.** P2's row said this registry
would grow from 18 entries to every state-changing tool. That would mean
hand-copying **41 parameter schemas** that `masterBrainV2.ts` already
holds — and **P3's whole job is to move those once**. So P2 did the part
the exit clause needs (which family each of the 59 tools is in) and left
the definitions to P3. Writing them twice would have been work whose
only output is a second place to be wrong.

**Four families, and the question each answers is "what does this change
OUTSIDE this product?"**: `read` (nothing), `Internal` (only our own
rows — a draft, a goal, a setting), `ResourceEdit` (a platform or site
resource, through `publish/`), `Dispatch` (a one-shot send, no undo).

**Every label was measured, then re-checked by a test.** The call graph
is walked out of each tool's own case body with the Actions as walls, so
a tool that grows a send stops matching "read" and the suite names it.
A tool with no family fails by default — which is the hole "tool count
falls" left open: a tool nobody classified was invisible to the check.

### The finding: two tools write their own approval row

`propose_campaign_budget_change` and `propose_campaign_targeting_change`
insert into `pending_approvals` **directly**, bypassing
`requestApproval` — whose own header says why there is one writer: *"so
the three places a decision happens cannot each invent their own
shape"*. What that costs, read off the code:

1. **no `ACTION_POLICIES` check.** `requestApproval` refuses an action
   nobody classified, because absence is not safe by default. A direct
   insert writes the row regardless, and the route still carries it out.
2. **no risk level**, so the card cannot show one.
3. **no approvalId back**, so there is no inline Approve/Reject — which
   is why these two tools end by telling the owner to go to
   `/dashboard/approvals`. Every other card is decided in the message it
   appears in, and the tool registry's own entries say *"Never directs
   them to a separate page."*
4. **none of `requestApproval`'s note**, which is what stops the model
   narrating a draft row as a completed action.

**Not an authority hole** — the budget insert does set `amount`, so the
approval threshold still sees the number. Checked, because that would
have been the serious version.

**Recorded as a DEFECT, not as a decision**, on its own list separate
from the ungated-by-decision one: that list records choices; this one
records work owed, names the fix (P2a) and shrinks only. A third tool
doing it fails the suite, and so does a fixed one whose entry was not
deleted.

### And one thing the walk cannot see, written down rather than assumed

`read_page` and `edit_page_text` **share one body**, branching on the
tool name inside — so the walk cannot tell them apart, exactly as
`switchMetaCampaign` could not be told from its pause path in P0. There
the answer was to split the function; here the body is long and page
text is live, so the pair is **recorded** with its reason and
`read_page`'s label is asserted by reading rather than by walking. Found
by listing every case whose own slice holds nothing but its label — not
one at a time, which is how the first one surfaced.

**12 mutation checks, 12 killed.** Two needed work and both were real
gaps in my own assertions, found by writing the mutation for them:

- relabelling `send_email` as `Internal` SURVIVED, because the
  exemption list is per tool and per symbol and was therefore also
  excusing a wrong family. Now a tool that reaches a sender by decision
  cannot be labelled `read` or `Internal`.
- relabelling `propose_price_change` as `Internal` SURVIVED, because
  the Internal check only asked whether it reaches a SENDER — and a
  price change reaches none, it goes through `createPublishAction`. Now
  a `read` or `Internal` tool may not reach the resource-edit machinery
  either.

**And the exemptions moved into one file** shared by both door tests,
rather than being copied into the second one. Two lists in two files is
two lists that drift, and a mutation that copies them back now fails.

## 4 November 2026 — the auto-reply surface: audited, deferred, and one flag left standing

The founder asked whether Instagram/WhatsApp auto-reply and auto-calling
actually work or are only built. Audited from the code and from his own
database, then **deferred by his decision** (S5/S6/S7 first). Recorded
here because the next person to open this will otherwise re-discover it.

**His production row says everything is connected and ON** — Facebook
Page, Instagram, `dm_auto_reply_enabled`, `comment_auto_reply_enabled`,
`auto_call_new_leads`, all true. **`auto_reply_log` has 0 rows, ever.**

**That proves the handler never reached its own insert.** The write is
inside the DM loop, after the attempt, and records `success: false` on
failure — so this is not "it tried and could not send". Nothing was ever
attempted.

**And `autoReplyHandler.ts` cannot say why: four silent early returns**
(no entry id, no dealership matched, no reply token, both toggles off)
and exactly one `console.error` in 236 lines. The candidates, none
resolved: the Callback URL not registered or `messages` not subscribed;
`FACEBOOK_APP_SECRET` unset, which fails closed by design; the Instagram
webhook sitting on the **separate Instagram app**, whose secret is not
the one `verifyMetaSignature` uses; or `fb_page_id` null — the lookup
matches that column, and the first query I gave him checked the TOKEN
instead, which was my mistake and would have left this hidden.

**Two things are not built, as distinct from not configured:** Instagram
COMMENT replies (`channel === "facebook"` only; the handler's own
comment says the Instagram endpoint is not built), and any
customer-facing WhatsApp auto-reply at all — `/api/webhooks/whatsapp` is
the owner controlling Hawlai over WhatsApp, not customers being
answered. Both would be new surfaces and need his written reason
(rule 5).

**THE FLAG, AND IT IS HIS DECISION TO LEAVE IT:** both toggles are ON
while the plumbing is broken. So the day anyone fixes the webhook or
sets the env var, **unattended replies to real customers begin at that
moment** — not at a moment he chose. I recommended switching them off
(ungated, instant, rule 6); he chose to note it and carry on with S5/S6.
Not re-litigated here; this paragraph is the note he asked for.

**When it resumes, the agreed first step is visibility, not plumbing:**
make the handler say where it stopped (S-sized). Fixing the webhook
first would mean the next live test produces another round of "0 rows,
and nobody can say why".

## 4 November 2026 — S6/P2a, and a hole S6/P1 had quietly opened

**The fix P2's measure asked for.** Both campaign-edit tools now go
through `requestApproval`, so they get the `ACTION_POLICIES` check, the
risk level (`change_campaign_budget` is high, `change_campaign_targeting`
medium) and an approval id — which means **Approve and Reject are in the
chat message now**, where every other card already was. The two
`/dashboard/approvals` dead ends are gone, and the budget call still
sends `amount`, which is what the approval threshold reads.

**The defect list did its job and then deleted itself.** P2 recorded
these two on a shrink-only list with the fix named; when the fix landed,
the suite went RED because the list was stale — exactly as designed —
and the two entries went. The two assertions that guarded them are now
universal: **no tool writes its own approval row**, and **no tool sends
the owner to another page to approve something.** That is the end state
the list existed to reach.

### And the hole P1 had opened, found by a guard I did not know about

`sitePublishGuard.test.ts` holds an invariant: *"the sentence the owner
reads has to be on the row"*, because *"a card that shows words it did
not store leaves 'who approved this and what did it say' answerable only
from a client string"*.

**S6/P1 broke it.** P1 made `requestApproval` APPEND the dispatcher's
"cannot be taken back" sentence and return the composed string for the
card — while the row went on storing the caller's shorter version. So a
call card showed one sentence and the record kept another.

**And the guard did not catch it**, because it only checked that a
`confirm` key existed in each call's details, not that it matched what
was shown. One hole, two lessons: the composition now happens BEFORE the
insert and `action_details` carries it (`{ ...req.details, confirm }`),
so there is one sentence and one place that writes it; and the guard was
restated from "twenty call sites each remembered to" to "the one place
that guarantees it", with a test that RUNS the writer and compares the
stored string to the returned one rather than grepping for a key.

**8 mutation checks, 8 killed**, including the old fault put back. Two
needed work and both were loose assertions of mine, found by writing
their mutations: a pattern matching `change_campaign_(budget|targeting)`
passed when the two action types were SWAPPED — which would route a
targeting change through the budget policy, a different risk level and a
different threshold — and a grep for `confirm: result.confirm` anywhere
in the file passed while this particular card lost its approval id,
because that string appears in three other branches. Both are now sliced
to the branch they are about.

## 4 November 2026 — S6/P3a, and the direction a definition can flow

**The 59 chat tool schemas moved out of `masterBrainV2.ts`** into
`businessBrain/toolSchemas.ts`, **byte for byte** — 658 lines, verified
against the committed file before the move was made, and the file went
from 5,180 lines to 4,522. `TOOLS` is re-exported from its old home, so
every caller and all ten test files that import it are untouched.

**Byte-identity is load-bearing here, not tidiness.** `cachedTools()`
marks the last entry with `cache_control: ephemeral`, which makes this
array the Anthropic **prompt-cache prefix** — and a prefix must be
byte-identical every request or the cache misses and every chat turn
pays full price. So `toolSchemas.test.ts` carries a SHA-256 fingerprint
of the array: a schema change is allowed and sometimes necessary, and it
has to be deliberate, with the fingerprint updated in the same commit
and the reason in the message. This project has already spent nine days
of unattended credit on a change nobody was watching.

### Measured before deciding: the plan's P3 would have been lossy

The plan said the registry would hold the definitions. **It cannot hold
these ones.** `BusinessBrainToolParam` is `string | number | boolean`
with a description; **24 of the 59 schemas constrain a choice with an
`enum`** and four use an array with `items`. Moving the definitions into
that shape would delete the constraints the model relies on.

So the direction is fixed, and written into the new file's header: the
definition lives as the Anthropic schema, and anything simpler —
including the Vapi/voice shape — is DERIVED from it. A definition can
only flow in the direction that loses nothing.

### And a drift that was already there, measured rather than assumed

Four of the registry's 18 entries already disagree with the chat schema:
`trigger_call` says `leadId` where the tool takes `leadName`,
`send_email` says `to` where it takes `recipient`, and
`propose_price_change` and `launch_meta_campaign` are each missing a
field. **None of the four is call-enabled** — the two that are
(`pause_meta_campaign`, `update_website_url`) match — so this is latent
debt and not a live fault, and saying which it is matters. P3b is where
the second copy stops existing.

**8 mutation checks, 8 killed.** One was mine twice over and worth
recording: the assertion that the drift note exists read the file
through `code()`, **which strips comments** — and every string it looked
for (`trigger_call`, `leadName`, `send_email`, `recipient`) also appears
in the schema data below the note. So it passed on the data while the
note it was about could have been deleted. Now it reads the header only,
through `sourceWithComments`, which is exactly what CLAUDE.md rule 8
says to do when the comment IS the thing under test.

**Two existing tests re-pointed, nothing loosened:**
`seoOwnerWords.test.ts` and `undoOnTheContract.test.ts` each slice a
tool's schema out of source text, and that text is in a different file
now. The rules they assert — `generate_seo` has somewhere to put the
owner's exact line, `undo_page_edit` can be told which edit — are
unchanged.

## 4 November 2026 — S6/P3b, and the duplicate that was not one

**What P3b was supposed to do:** stop the registry keeping a second
copy of chat-tool parameters, so the four measured drifts become
impossible.

**What measuring first changed about it.** I snapshotted the live voice
tool list before touching anything, then compared the registry's
entries to their schemas for the two call-enabled tools. The keys, the
types and `required` **matched**. The DESCRIPTIONS did not — and they
differ on purpose:

| | wording |
|---|---|
| schema (chat model) | *"Only on a FOLLOW-UP call, after a numbered list was shown. Pass it exactly. Never invent one."* |
| registry (voice) | *"Only on a follow-up, after a numbered list was shown"* |

Deriving everything from the schema — the obvious reading of "stop the
duplicate" — would have pushed chat-prompt shouting into a live voice
assistant's function list. **So the duplicate was only half a
duplicate**, and the design changed: **the SHAPE has one source, the
WORDING has two audiences.** Keys, types and `required` come from the
schema and cannot disagree with it; a description may be overridden per
channel, and that is now a decision rather than an accident.

**The four drifts are gone by construction**, and the two overrides
that named arguments the tools do not take (`trigger_call`'s `leadId`,
`send_email`'s `to`) were deleted rather than left to be ignored — an
override for a non-existent argument is a wrong word in a file the next
person will trust. A test refuses a new one.

**The snapshot is the justification for touching a live path at all:**
the two call-enabled tools send byte-identical JSON after the change. A
refactor of a voice path proves itself by not moving.

### The miss worth recording: P3a's commit left three tests red

Three tests slice a tool's description out of `masterBrainV2.ts` through
`committed()`, which reads `git show HEAD:`. While P3a was uncommitted,
HEAD still had the schemas, so all three were green through every gate I
ran — and went red the moment P3a landed. **I found them in P3b's gates,
not P3a's.** Fixed here, pointed at the schemas' new home.

That is the second time today a HEAD-reading test has moved a failure
one commit later (the first was `campaignSwitchTools` in P0). The
pattern is worth naming: **a gate run before a commit cannot see a test
that reads the commit.** The fix is not to stop reading HEAD — that
property is deliberate — but to re-run the suite after a commit that
moves code, which is now what I do.

**10 mutation checks, 10 killed.** One survived first and it was a real
gap: reverting the renderer to read `tool.parameters` directly left the
snapshot green, because the two call-enabled tools have their own
override maps and those maps produce exactly the snapshot — which is
where the snapshot came from. A chat-only tool with PARTIAL overrides is
what tells the two paths apart, and `send_email` (two overrides, eight
arguments) is now asserted.

## 4 November 2026 — S6/P5, the last door entry that was owed

`oneDoorForCopy.test.ts` carried `seoToolkitAgent.ts` on MIGRATING from
11 October with the debt written out: it HAD claims and provenance
(`guardOrMark`) and was MISSING *"the genericness verdict and the key
strip for its two customer-facing tasks, meta_tags and
gbp_optimization"*. **That entry is deleted.** The two tasks go through
`generateCopy`, and the eight owner-facing ones deliberately do not.

**Why the eight stay out, in the entry's own words:** a keyword list, a
technical audit, a competitor read are advice for the owner. A door
built for customer copy would put a customer-first ordering and a word
cap on a table of keywords. So this file is now through the door for one
kind of text and not for another — which `oneDoorForCopy`'s own header
names as the one thing its import check cannot see. Deliberate, and
written down in both places.

**Three judgment calls inside the migration:**

1. **No word cap.** `contentTypeKey` is absent, because a meta
   description has a CHARACTER limit of its own and a word cap would be
   the wrong unit. "Absent means no cap, which is NOT a cap of zero" is
   the door's own rule.
2. **No retry — `revise: false`.** The genericness VERDICT is pure code
   and runs either way; the repair is a second model call. The entry
   asked for the verdict, not for a new bill on every SEO task, so the
   verdict travels out as `_generic` and nothing is retried. This path's
   cost is exactly what it was.
3. **The owner's words are restored AFTER the guard**, unchanged from
   decision C of 2026-09-29: the guard runs on what Hawlai wrote, and a
   claim the owner typed himself is his to make — the card warns instead
   of stripping it.

**The first version used a dynamic import** and was genuinely through
the door while reading as unguarded to the suite, because the check
looks at the import line. Static now, like the other five callers — and
a test pins that, because "works at runtime, looks broken to the guard"
is a state worth never being in twice.

**10 mutation checks, 10 killed.** Two were weak assertions of mine,
both found by writing their mutations:

- the "one model call, not two" test used bland-but-unworn copy, so
  nothing was judged generic and the retry gate was never exercised — it
  passed while a mutation arming `revise: true` survived. It now uses a
  worn opener ("Are you tired of…"), which the verdict genuinely fires
  on, and also asserts the verdict reaches the caller.
- nothing asserted that the records are passed at all. `facts: null` is
  a STATE in this codebase, not an absence, so passing null would have
  quietly downgraded every SEO draft's check with no test noticing.

**And one thing I had wrong about the product:** I wrote the first
tests against invented task keys (`keyword_research`) and an invented
output shape for `gbp_optimization`. The real keys are in `SEO_TASKS`,
and the real shape is `{description, categories, postIdeas}` — now used
verbatim, because a key strip that deleted `categories` would be a
silent data loss and that test is where it would show.

## 5 November 2026 — S6/P6, the exit test, and the measure's own limit

**S6 closes.** The criterion the founder restated on 4 November —
*"nothing that changes state is reachable except through an Action"* — is
measured by `stateChangeDoor.test.ts`, and the copy half
(`oneDoorForCopy.test.ts`) has a **shorter backlog**: four entries on 11
October, three now, each one deferred by his own decision.

**The exit test does not re-prove the other files.** It asserts the four
things nothing else states, and the first two are the ones that matter:

### 1. The clause covers the CHAT SURFACE, and that is a limit of the instrument

I tried to extend the walk to API routes. It reported **147 of 273
routes** as reaching every sender in the product — including
`/api/admin/invoices` placing a phone call. **None of it was true.**

Traced rather than guessed: the walk resolves calls by NAME, and `POST`
is declared in **145 files**. Walking from one route arrives at every
other route's handler and from there at everything. The instrument is
sound from a tool, whose body calls distinctive names, and useless from
a route.

So the clause is tested where the measure works — and that is also
where all five audited incidents came from: a real email, a real call, a
public video, a live discount code and the unattended-posting toggles
were each reachable **from one chat sentence**. Extending it needs a
type-aware call graph, which is work, not a gap nobody noticed.

### 2. A green result from a blind measure looks exactly like a green result from a guarded product

So the exit test asserts both directions: **doors open, the walk DOES
arrive at the live Meta call; doors closed, it does not.** And the
conflation above is additive by construction — a name with many bodies
walks all of them — so it can raise a false alarm and cannot produce a
quiet pass. P0's zero-offence result is therefore robust against the
very weakness that made the route attempt useless, which is the
opposite of what I expected when I started measuring.

**And a stronger result for the sends:** `trigger_call` cannot reach
`triggerVapiCall` even with every door open. The tool raises an
approval and returns; the call is placed later by the dispatcher, from
the approvals route. There is no path to wall off, which is the
strongest form of the clause and it is what S6/P1 built.

**11 mutation checks, 11 killed — and six needed fixing first, all
mine.** Worth listing, because the pattern is the same one as yesterday:

- two anchors matched text that earlier phases had already changed
- one anchor was not unique (`const created = await
  createPublishAction(...)` appears three times) and landed in the wrong
  function
- one mutation replaced an import and left the CALL standing, so the
  walk still saw the name
- **two assertions were satisfiable by any occurrence**: "the plan says
  unverified live" matched any of five places in the file, so deleting
  the exit section's own statement left it green. Both now read the
  EXIT SECTION, which is where somebody reads the stage's result.
- and one regex failed against wrapped prose — the sentence it asked
  for crosses a line break.

**One process miss worth recording:** I reported a single-file test run
as passing when the output I grepped did not contain the `Tests` line at
all. The run had failed. A grep that finds nothing is not a pass, and I
now confirm that line is present before saying so.

## 5 November 2026 — the target the owner never saw

**Found from the outside, by the owner.** candle_by_qaaf's email of
5 November carried two suggestions and said nothing about targets, while
`goals` held two target drafts written that morning at 14:37 UTC
(`online_store:views_to_checkouts` and
`from_visit_to_customer:views_to_leads`, both `draft`).

**The cause was one gate in two places.** Target blocks were rendered
inside `hasNoPlan(maturity, activeGoals)` — in `report.ts` and again in
`dailyGrowth.ts` — so only a business with NO approved plan ever saw
one. A target is about the narrowest step in a funnel that is already
running, which is to say about a business that HAS a plan, so the gate
hid the feature from every business it was built for. Drafting was never
gated, so the rows reached the Tasks page anyway: **the email and the
database disagreed**, which is worse than either silence or noise.

**And the other half was quieter.** `targetGoalsFrom` has returned a
sentence for the empty case since S5/P4 and `runDailyGrowth` has put it
in its result, where the call site dropped it. So an owner whose funnel
was too thin, or whose step was offered three weeks ago, read an email
with no mention of targets at all — indistinguishable from a product
that had forgotten about them. That sentence is now a line in the email.

### Three judgment calls, none of them asked for

**1. The subject names both.** The rule in `subjectFor` is that the
subject promises what is in the email, and suggestions won it outright.
Now that targets are shown to a running business, the ordinary morning
is both — and a suggestion is something to read while a target is a
decision waiting on him. "2 suggestions and 1 target to approve". The
thing that needs him is not the thing that goes unmentioned on the one
line he reads before opening it.

**2. A test that asserted the bug was RESTATED, not deleted.**
`growthTargets.test.ts` carried *"A BUSINESS WITH AN APPROVED PLAN IS
NOT OFFERED DRAFTS AT ALL"*, which is exactly the behaviour he asked to
remove. CLAUDE.md rule 7 says bring it to the owner rather than weaken
it — he decided this one in the instruction itself, so it is restated
and **stricter**: it now holds down both halves, that setup steps keep
the gate and targets do not.

**3. The reason sentence became email copy, so its figures are
declared.** `targets.ts` said in a comment that the 30-day sentence was
"NOT EMAIL COPY — it states a number and nothing declares it". The
moment it goes in an email the digit walk reads it, so `TargetDraft`
now returns `whyCounted` beside `why` — **together, in one return**,
because picking a sentence in one place and its declarations in another
is how a line ends up declaring the figures of a sentence it is not. An
unreadable date prints no figure and therefore declares none.

Its grammar changed with it: "offered 1 day ago", not "1 days". Two
assertions were restated for that, and they are the only two.

**18 mutation checks, 18 killed.** One of mine was invalid first: it
opened a brace it never closed, so the file did not parse and the run
died with no failing test. A mutation that breaks the build tests
nothing, and "non-zero exit" is not the same as "the guard is tested".

**Left alone, and said rather than fixed:** `scripts/growth/
dryRunReport.ts` never passed `targetGoals` at all, so the dry run has
never shown a target and still does not. It would need a diagnosis to
read, which is a different job from this fix.

## 5 November 2026 — which block was left out, and over which figure

**The founder's second request the same day.** Since 3 November a report
block whose figures nobody counted is pruned rather than taking the
email down with it, and the email says so: *"I left 1 thing out of this
email, because a figure in it did not trace back to anything I
counted."* He was told something was missing and given no way to find
it. `blocksLeftOut` was a count in a run result the call site dropped,
and `removed` — the block kinds and the offending figures — was a
`console.error` in Vercel's logs, which he has never read.

**That is the same shape as the fault the pruning rule exists to fix:**
the product knew, and said so where nobody was looking.

### Where the record goes, and why there is no migration

`audit_log` (migration 128) already has exactly this shape: the owner
may SELECT his own rows, nothing may UPDATE or DELETE them, and
`event_type` is free text *"so a new source shouldn't need a migration
to log a new event type"* — written in 2024 for this case. Event type
`report_blocks_left_out`, actor `cron:daily_report` or
`cron:monthly_review`, the blocks in `details`. **No SQL for the owner
to run.**

**Both records stay.** The log line is written BEFORE the row is
attempted and is not redundant: the row needs the database to be
reachable and the line does not. The one thing this must not be is the
only record AND a silent one.

### logAuditEvent now returns whether it wrote

It swallowed the exception by design — ten call sites depend on it never
throwing — and it threw the REASON away as well, which is a different
thing. It never looked at the insert's own `error` either, so a refused
insert and a successful one were indistinguishable to every caller. It
returns `{ ok, error }` now; the swallow is unchanged and the ten
callers that ignore the return behave exactly as before.

### One test is a source assertion, deliberately, and here is the measure

The monthly review's call site is asserted with `code()` rather than end
to end. I tried the real route first: a decision whose own words carry a
figure — *'Give all 7 pages a search title'* — and it did **not** prune,
because `readable()` strips digits out of the two strings the owner's
routes wrote before they reach a block. `prunedReview`'s own header
already said the rest: nothing this product can produce today puts an
untraceable figure in that email, so the path is **defensive**.

And the seam the daily report's tests use is not available: the daily
report is pruned in `dailyGrowth.ts` and built in `report.ts`, so a spy
on the export intercepts the cross-module call — while
`buildMonthlyReview` and `runMonthlyReview` are in the same file, where
a spy cannot reach an internal call. Faking a prune would have meant
adding a seam to production code for a logging commit.

So the recorder's behaviour is tested directly, with that surface among
its cases, and what the source assertion holds down is that **this call
site reaches it**. A mutation removing the call, or passing the wrong
surface, is killed.

**18 mutation checks, 18 killed.**

## 5 November 2026 — S7/P0, and a correction to the plan it follows

**The founder approved all six questions in PLAN-S7-AUTONOMY.md §12
with the recommended answers**, including the one that matters most:
promotion **asks once** with the evidence on the card, and the product
never writes its own permission.

### I was wrong about this repo's own history, in the plan he approved

The P0 row said *"the exit test first, red, as S5 and S6 both did"*.
`git log --diff-filter=A` on the two files says otherwise: `010e12f`
S5/**P6** and `ea8e7e7` S6/**P6** — both wrote their exit test **last**.
S6/P0 was the measure, not the exit test.

Corrected in the plan rather than quietly dropped, because he approved
the plan partly on that sentence. Writing it first is a **new** practice
here, and the reason stands on its own: written last, an exit test is
shaped by what was built, and S6's own exit test records two of its
assertions being satisfiable by any occurrence in the file.

### And a day's drift in every date I wrote today

Every new comment I added in the two S6 fixes earlier today said
**6 November 2026**. Today is the **5th**. Caught by my own new test —
the one asserting a `STAGE_OPEN` marker's date is not in the future —
which failed on its first run. Fixed in 16 files.

Worth recording rather than quietly correcting: the dated incident
comment above a guard is the thing that stops a later tidy-up removing
it, and a guard dated a day after the incident it describes is a guard
whose own account is wrong. The test that caught it was written for a
different purpose entirely.

### A quarantine, and the price of it

An exit test written first is red for the stage's length, and rule 1 is
"real exit codes, pasted". A default suite with one known-red file means
every commit for weeks pastes "1 failed" and asks the reader to remember
which failure was expected — which is how a red suite stops meaning
anything.

So: `tests/open/`, its own config, its own `npm run test:open`, and
`tests/stageOpen.test.ts` in the **default** suite holding the whole
arrangement down — the exclusion and its reason, the config, the script,
a dated `STAGE_OPEN` marker per file saying RED is expected, and a
refusal to let the directory sit there empty with the machinery still
around it.

**"Excluded" must never quietly become "never run".** That is the exact
shape of the auto-reply fault still open in production: a switch that
says on, over a path that does nothing.

**18 assertions, 1 green on purpose, 17 red. 13 mutation checks against
the guard, 13 killed.** One mutation of mine named the wrong guard: a
marker reading `2026-13-45` still matches the date pattern, so the DATE
assertion is what catches it.

## 5 November 2026 — S7/P1, and a column the plan did not have

**`owner_words`, and it is not a detail.** Both page tools keep an
unsupported claim when the owner says he wrote the line himself, and
tell him he is standing behind it. That is an unsupported claim reaching
the public, and S7's demotion rule would have fired on it — taking away
a permission he never misused, for his own sentence.

Found by reading the tools rather than by designing from the plan. The
row now carries two counts that mean opposite things (`claims_removed`
is the system working; `claims_unsupported` is the system failing) and a
flag for whose words they were, forced false when nothing was kept.

**The plan said `text_hash`; that was wrong.** The monitor re-reads the
surviving sentences and asks the extractor about them from scratch. A
hash cannot be re-read. So the copy is stored, and P2 clears it once a
verdict exists.

**Raised, not decided:** for the page surfaces the stored text is the
business's own marketing copy. When P1b widens this to emails and
WhatsApp replies it will carry a customer's name, and retention becomes
a DPDP question. In migration 217's header, for him.

**Written at the executor, not at the tool.** The counts come from the
guard in the tool; `published` is only knowable where the change lands.
So the counts ride on the action row as NUMBERS — not counted out of
`claimWarnings`, which is prose for the owner and would be a reader
grepping its own copy (rule 8) — and the executor writes the row, after
the action is marked executed, where a bookkeeping failure cannot undo
an edit that worked.

**24 mutation checks, 24 killed. One survived first and the gap was
real:** every fixture had a kept-unsupported count of zero, so hard-
coding that column to 0 was invisible to the entire suite. The column
that stops S7 punishing the owner for his own words was unobserved.

**And two tests were tests of nothing until they were fixed** — the same
shape twice: a branch that could not be reached (the registry check sat
behind a surface check that always matched first) and a fixture whose
guard was skipped (`factsFor` returns `ctx.facts` before it reaches the
database, so mocking the gatherer did nothing).

## 6 November 2026 — S7/P2, and an exit test that was wrong about the cron

**The monitor is the eval gate pointed at live rows.** Same refused set
(imported, not re-listed), same splitter with hashtags opened out, same
free code-only checks first. A second, differently-written judge would
give one question two answers.

**THE EXIT TEST'S EXPECTATION WAS WRONG, and I changed it.** P0 asserted
`GROUPS.signals` contains `output_monitor`, because this plan said "a
daily subsystem in the signals group". `cronGroups.ts` says signals is
*"database-only and fast… never queues behind LLM calls"*, and the
monitor calls a model on every row.

Changing an exit test's expectation is the thing writing it first was
meant to prevent, so it moved in **one direction**: stricter. It now
pins the group, pins that signals does not contain it, and pins the
POSITION — before `daily_autopilot`, which is the subsystem that sends
the daily email, so a monitor running after it would report today's
escape tomorrow. That is also the entry that went unreached for two days
when the dispatcher's secret went stale.

**A cap, not a flag.** 20 rows and ₹2 per business per run. A switch
defaulting to off would be `dm_auto_reply` all over again with the sides
swapped — a monitor that says it is running while it checks nothing. And
the cap is not a pass: the rows it skips keep ageing, so the blindness
P3 reads grows.

**Blindness is measured from the oldest thing still waiting**, not from
when the monitor last ran. A monitor that runs daily and fails daily has
run recently and seen nothing. `null` (nothing published) is kept
distinct from `0` (published today, checked today).

**The plan's retention rule changed on contact.** It said to clear the
copy and keep only refused sentences. The copy of a row that was WRONG
is the evidence behind a demotion the owner will be told about, and a
row that could not be checked must stay readable. So only clean rows
lose their copy.

**26 mutation checks, 26 killed, no survivors on the first pass** — the
first time in this project. The reason is not that I was more careful:
this file had a worked example to copy instead of a design to invent.

## 6 November 2026 — S7/P3, and a cross-tenant bug a test found

**The brake is built before the accelerator**, which is the whole shape
of this stage. Nothing can be promoted yet, so nothing has been
demoted — the rule, the write, the record and the telling are tested and
none has fired live.

### The bug worth the whole phase

The monitor's zeroed run was a module-level constant and **spreading it
copies the array reference**, so every run pushed its escapes into the
same array. The daily cron runs every subsystem for every business
inside one invocation — so one business's run would have carried
another's escapes, and the demotion rule would have taken a permission
away from the second for something the first published. **A cross-tenant
decision out of one shared literal.**

Found because a test asserting the owner's-words flag on a second run
read the first run's escape. Now a function, with the cross-tenant case
pinned by its own test.

### An existing test caught the wiring, and the code moved

`dailyRunOrder.test.ts` checks every runner entry against the shape
`  <key>: (s, `, and an inline async body broke it. The test catching
that is the test working, so the join became `monitorAndDemote` and the
runner table went back to one line an entry.

### Migration 218, for one word

`notifications.kind` is CHECK-constrained and `emitNotification`
swallows a refused insert. Without the migration the brake would work,
write its decision row, and tell the owner nothing. There are three
records on purpose — decision row, notification, log line — because
they fail in different ways, and a limit that lives in one place is a
limit that can go quiet.

### Five of my own mutations were wrong before the guards were

Four of them the same mistake in different clothes: `undefined ??
call()` **evaluates** the call, so two mutations meant to delete one
changed nothing; one inverted a logging branch and left the `return` it
was about standing; one reintroduced the shared array by adding the key
*before* the original, where the later key wins; and one produced code
that did not parse, so the run died with no failing test.

**31 mutation checks, 31 killed** once they were faithful.

## 6 November 2026 — a dead connection that says so, and a helper I should have used

**Two small fixes, one fault.** candle_by_qaaf's Search Console
connection died on 4 November; the only trace was an error string on a
job row, and the owner found out on the 6th by asking why an email was
missing. That subsystem is the instrument the whole local-search plan
depends on.

**1. The message named the status and not the cause.** It preferred
`error_description`, and for this failure that is the LESS useful field:
Google answers `{"error":"invalid_grant","error_description":"Bad
Request"}`. So three days of rows read *"(Bad Request)"*, which names no
cause and rules nothing out. `invalid_grant` is what says the refresh
token is dead at Google's end — the thing that decides whether
reconnecting is the whole fix. Both fields now, code first.

**2. Nobody was told.** A notification now, with Google's own reason
quoted and the consequence stated ("your real search terms have stopped
updating"), **once** — only when the previous run succeeded, because a
notification a day about the same dead connection is one he learns to
ignore, which ends where not telling him ends. **And it still throws**,
so the health panel cannot go green on a morning that read nothing.

Migration **219** adds the kind, and it is **generic**
(`integration_disconnected`): Gmail, YouTube and Ads hold refresh tokens
from the same Google app and can die the same way, and a kind per
integration means a migration per integration. It also **supersedes 218**
— running 219 alone is enough.

### THE HELPER I SHOULD HAVE USED, AND IT IS RULE 8'S OWN SUBJECT

`tests/helpers/source.ts` has had an `sql()` function all along, for
precisely this: **`code()` strips `//` and `/* */` and leaves every SQL
`--` comment standing.** Today's migrations carry long headers that
quote their own clauses, so a structural assertion read through `code()`
passes on the comment. I used `code()` and `sourceWithComments()` on
migrations in three test files written today and only noticed when an
assertion contradicted itself: 219's header explains why the kind is
*not* `search_console_disconnected`, naming the string, so the file both
contained and did not contain it.

Switched to `sql()` in `claimChecks`, `autonomyDemotion` and
`searchConsoleDeath`, with the one assertion that **is** about a comment
(217's DPDP note) left reading the raw file on purpose.

**This is rule 8 exactly, in a file type its helper does not cover by
default** — and the reason the suite has 1,128 raw-source assertions on
an allowlist is that this keeps happening.

### And one test was naming a migration where it should have found one

The "declared kinds and the database cannot drift apart" assertion named
218. It broke the moment 219 added a kind, because the constraint is
drop-and-recreate and only the **highest-numbered** migration describes
what the database accepts. It now finds the newest migration that
touches `notifications_kind_check` — six have so far, and there will be
a seventh.

**17 mutation checks, 17 killed.** One survived first: a mutation making
the telling rethrow was invisible, because every failure case I had
written returns an error *object* rather than throwing, so the catch
inside the telling was never entered. The case that catches it is now
its own test — and the fault it guards against is this commit's own
fault in miniature: an error that hides the thing it is about.

## 6 November 2026 — S7/P4, and the two things the exit test found

**L2 exists in the type and in the database, and nothing can grant it.**
The allowlist holds one key (`update_page_meta`, the founder's decision
3), no row has been written, and promotion is P5. A test asserts
`promotion.ts` is absent, which goes red the moment P5 starts.

### Two tests restated, both stricter (rule 7)

The founder decided this on 5 November with both tests in front of him.

*"AND THE DATABASE CANNOT EVEN SAY L2"* protected an invariant that was
never "L2 cannot exist" — it was "a level cannot be written that the
code has not earned the right to honour". It now walks **every** spend,
delete and critical action and asserts the DATABASE refuses L2 for each,
and a new test pins the code's allowlist against the SQL one.

*"THE TYPE AND THE CONSTRAINT CANNOT DRIFT APART"* named migration 209
and broke when 220 widened the check. It now FINDS the newest migration
defining the constraint. Naming a file means editing the test every time
the thing it guards changes, and that is the edit made carelessly.

**And two fixtures stopped being hypothetical:** both
`autonomyLevels.test.ts` and `approvalCoverage.test.ts` used `"L2"` as
their example of a level the build does not understand. Now `"L3"` — and
the second also asserts a KNOWN level comes back, because "everything
reads as null" would have passed the old version while making every
level unreachable.

### THE EXIT TEST FOUND TWO REAL THINGS

**`set_automation_toggle` was not pinned.** Classified edit / high, so
every rule let it reach L1 — while its own policy comment reads "THE ONE
THAT TURNS OFF EVERY OTHER GATE. After this runs, content publishes and
emails send with nobody looking." Four of six toggles are critical. An
action whose effect is to start one of those cannot be less gated than
the thing it starts.

**A positional boolean silently un-gated an action.** P4 wrote
`canHoldL2(key, hasUndo: boolean)`; the exit test, written first, called
it with `{ hasUndo: false }`. The boolean parameter took the object,
read it as truthy, and said `ok: true` for an action with no undo. The
failure mode of a bare boolean there is a silent un-gating. Both
functions take an object now.

**This is the return on writing the exit test first**, and it is the
second time this stage: at P1 it caught its own false-green, and here it
caught two faults in the code it was written to describe.

### 21 mutation checks, 21 killed, one equivalent mutant recorded

Two survived first and the gap was real: the only assertion pinning the
toggle lived in `tests/open/`, which the default suite does not run — so
a guard the exit test found would have been unprotected until P7.
Asserted in the default suite now, with a check that the REASON stays
true.

One is recorded rather than fixed: `!["L1","L2"].includes(level)` and
`level === "L0"` are the same function while three levels exist. No test
can tell them apart, and contorting one would be testing the shape of an
expression rather than its behaviour.

## 6 November 2026 — S7/P5, promotion that asks

**The product earns the permission and asks once, with the numbers on
the card.** `promotion.ts` never writes `action_levels` — a test asserts
it never will — and the only path from "earned" to "granted" is the
owner pressing Approve, where the route re-checks the allowlist and
re-checks the undo at the moment of granting.

**Nothing new is collected for promotion.** The evidence is rows that
already existed: `pending_approvals.modified_details` (migration 127),
status, and S5's outcomes. S7's new collection is for the demotion side,
which is the half that had no instrument.

**The four wrong readings, each refused and each tested:** a modified
approval is us being inaccurate, not him agreeing; one ignored card
disqualifies, because a row he never touched is not consent;
`not_measurable` is not a pass; and evidence from before a demotion does
not count, or an action taken away for a real escape is re-promoted the
same week.

### Three test gaps the mutation run found, all one shape

Each assertion reached a refusal — just not the one it was named for.
The mock's `.in()` was a no-op, so the "whose decisions are these"
filter was invisible. And the undo check, in both `proposePromotion` and
the route, was unreachable because the only allowlisted action's
platform *does* implement undo: the honest fix was to mock the registry
and take it away, in both places.

**And one "survivor" was my harness:** vitest's verbose reporter
truncates a long `file > describe > name` path, so matching on the full
test name reports a killed mutant as a survivor. Worth remembering for
every mutation run here.

**32 mutation checks, 32 killed** once all four were honest.

### An existing test caught the new action

`recordDecision.test.ts` requires every action type to be named in one
of `measures.ts`'s lists. `grant_autonomy` went in the NOT COLLECTED
one: what a granted permission did for the business is not one number.
`claim_checks` records what it published while running alone, but the
results job cannot read that table — naming it as a source would claim
a measurability that does not exist.

## 6 November 2026 — S7/P6: the cap, the screen, the morning that asks

**The cap closes rather than opens.** Three a day, enforced at the door
that reads the level — a cap checked elsewhere is one something gets
around by calling a different function. Reaching it **asks**; the work
still happens on his word and only the autonomy is lost. An unreadable
count means **no room left**, because a cap that opens on a database
hiccup is not a cap. An L1 action is not rationed: he asked for each
one.

**The morning that asks is in `signals`**, the model-free group, so it
runs before the monitor in `heavy` — which means a card rests on
**yesterday's** verdicts. That is the honest ordering, not a
compromise.

**The screen is on `/dashboard/autopilot`, not a new page** (rule 5),
and it never says a level's name to him: "Runs on its own" or "Asks you
first". Three counts about what it published, and the middle one —
**not checked yet** — is never folded into the clean one. The monitor
runs the morning after, and showing that as nothing-wrong would be S7/P2's
confusion moved onto a screen.

`/api/autonomy` is read-only on purpose. A level is raised in one place
and lowered without asking anyone; a PATCH there would be a third way to
change a permission.

### Four test gaps, all one shape — and it is the fifth time this stage

**The double ignored its filters.** Dropping `.is("approval_id", null)`
and `.eq("published", true)` changed nothing any test could see, because
the mock returned the same rows whatever it was asked. Both fixtures now
carry a row the filter has to exclude.

**And two assertions were satisfiable by an import line.** "The cap
consults capRemaining" passed on the import after the call was deleted;
"the card is on the page" passed on `import AutonomyLevelsCard` after
the JSX was removed. The cap is now tested through the door, and the
page assertion reads the JSX.

**28 mutation checks, 28 killed** once all four were honest.

### Flagged rather than changed

`ALWAYS_REQUIRES_APPROVAL` lists `update_page_meta`, which may now run
unattended. Nothing is actually contradictory — the doc comment says
"whatever the amount", and the coverage test already allowed these keys
to hold L1 — but the NAME is stronger than the rule and reads as a
promise S7 breaks. Renaming an exported constant used in several files
is not this phase's work.

## 6 November 2026 — white text on a white card, and the guard for it

**The founder opened the P6 card and the action's NAME was missing** —
body text, badges and numbers all there, no title. He offered a
screenshot; the code was enough.

**I wrote the card as `bg-slate-900` with a `text-slate-900` title.**
`tailwind.config.ts` INVERTS the slate scale for this app's dark theme:

```
slate-50:  #0b0b0f   (near-black — a BACKGROUND)
slate-900: #f2f2f4   (near-white — a TEXT colour)
```

So the card had a near-WHITE background and near-white text. The badges
(`bg-slate-200 text-slate-600`) and the grey body text showed; the
title was white on white. No type error, no failing test, no console
warning — it renders, and the words are not there.

**The fix is the shared `.card` class** (`bg-slate-100`, the near-black
surface every other card on that page uses). Hand-rolling the card
chrome is what let it drift, and a test now pins that too.

### The guard, and it found two more

`tests/invertedSlateScale.test.ts` checks one element's own class list
for a background and a foreground naming the same shade — always a
mistake, never a style choice — and for `text-white` on the light end.
It reads the scale FROM the config, so a future re-theme fails the test
rather than silently making it wrong.

**It found five more instances in two files I did not write**, all the
same bug:

| Where | What was invisible |
|---|---|
| `ConsentBanner.tsx` | the **Accept button's label on the public storefront's cookie banner** |
| `ToolMarketplaceView.tsx` | the selected department filter (×2) and a toast |

All five fixed with the house pattern for a prominent surface,
`bg-brand-600 text-white`, copied from `WorkflowBuilder` rather than
invented. **Not allowlisted:** the test had just proved them, and a
consent banner with an invisible button is a customer-facing fault, not
a tidy-up.

### And two of my own tests were wrong on the way

**An eaten backslash, twice in one session.** A patch script wrote
`\b` into a regex and Python read it as the backspace escape, so
`/\b(throw|return)\b/` became a literal control character.
`noControlCharsInSource.test.ts` caught it both times — the test exists
because this happened before, and it is now the third time. **Patch
scripts that write regexes go through a file, not a shell heredoc.**

**And `sourceGrepDiscipline.test.ts` caught the new guard reading raw
source.** Stripping comments is not a formality here: this guard's own
header names `bg-slate-900` and `text-slate-900` while explaining the
bug, and so does the comment above the card that caused it. A guard
reading raw source would report its own explanation as an offence —
rule 8's exact shape, pointing at itself.

**7 mutation checks, 7 killed.**

## 6 November 2026 — S7 closes, and its exit test failed its own audit

**The autonomy half of S7 is closed.** The exit test is green and has
moved out of `tests/open/` into the default suite; the quarantine
machinery that carried it while it was red is **deleted**, because the
guard holding it said what to do when a stage closes and nothing
replaces it: *"the next person should delete the lot rather than inherit
it."*

### Writing the exit test first paid for itself three times

At **P1** it caught its own false green — two assertions went green
because §15's contract table quotes the heading they look for. At **P4**
it found two real faults in the code it describes: `set_automation_toggle`
was not pinned, and a positional boolean silently un-gated an action. At
**P7** it failed its own audit.

### THE AUDIT: five of its assertions were satisfied by a comment

Mutation-checking the exit test was only possible once it was green, and
it found five assertions that something other than their subject
satisfied:

- "the database names which keys may be L2" — satisfied by migration
  220's **header**, which explains the allowlist and names the key. So
  replacing the real constraint with `action_key is not null` left it
  green.
- "`claim_checks` has a `published` column" and the same for
  `claims_unsupported` — satisfied by 217's header, which explains every
  column. Renaming the column left it green.
- "the monitor reuses the eval gate's own refused set" — satisfied by
  the monitor's header naming `outputGate.eval.ts`. Replacing its
  imports with local stubs, **a second differently-written judge, the
  exact thing that test forbids**, left it green.
- "the plan admits nothing ran unattended" — satisfied by the word
  "unattended" appearing several times in the section.

**All five now read the thing instead of a word about it.** SQL through
`sql()` and scoped to its own constraint; columns as declarations; the
monitor's actual import line through `code()`; the plan's admission as
its own sentence. Where an assertion genuinely IS about a comment, it
reads the raw file on purpose and says so.

**This is rule 8, in the file whose job is to say what is true** — the
fifth time in this stage. The pattern is not carelessness about one
file: a grep for a word is the easiest assertion to write and the
easiest to satisfy.

**Four of my own mutations were aimed at S6's exit test** (the
reachability walk and the copy door's backlog live there), and two more
edited something the assertion did not read. Corrected, then **25 of 25
killed**.

### What S7 did not prove, and it is in the plan rather than here

Nothing has ever run unattended: no L2 row, no promotion card, no
demotion, the cap never reached. That is arithmetic, not an omission —
the threshold is ten approvals over thirty days. The full account,
including which migrations are still unconfirmed and the two things
flagged rather than fixed, is PLAN-S7-AUTONOMY.md's
`### S7 EXIT — what this stage did not prove`.

## 6 November 2026 — AEO/A1, and a correct route nobody could reach

**Three generated routes: `/robots.txt`, `/sitemap.xml`, `/llms.txt`.**
A1 of PLAN-AEO-GEO.md, with all four of its decisions approved as
recommended.

### The change that mattered was not one of the three routes

I wrote `src/app/robots.ts` and `src/app/sitemap.ts` and they were
correct, and **a crawler fetching either would have been answered with a
307 to `/auth/login`.** `src/lib/supabase/middleware.ts` authenticates
everything not on `PUBLIC_PATH_PREFIXES`, and all three of these are
**exact paths at the domain root**, not prefixes of anything.

This is the fault migration 168 wrote down for `/api/events/dispatch`,
arriving again in a different shape: a route that exists, is right, and
is never reached. The fix is a second list, `PUBLIC_EXACT_PATHS`,
matched with `.includes(pathname)` rather than `startsWith` — because
`startsWith` on a list containing `/robots.txt` is harmless, but the
*shape* is the one that published the private half of the app the last
time somebody reached for it. **The test fails both ways:** if one of
the three leaves the list, and if the exact list is ever turned into a
prefix list.

### The opt-out is written for a column that does not exist

Decision 1 was approved as recommended — build the route, default
everyone in, add the flag when somebody asks. So `optedOutSlugs()`
queries a column that **is not in the schema yet**, and a Postgres
"column does not exist" error is treated as *nobody has opted out*,
logged, and the route answers normally. A thrown read does the same,
loudly.

That is deliberate and it is the only honest default: the alternative —
failing the route — hides every business from every answer engine
because of a missing migration. **And the opt-out excludes a business
from the AI rules only.** It stays in the wildcard rule, so opting out
of ChatGPT is not accidentally opting out of Google. A test asserts both
halves.

### Four things A1 refuses to invent

| Where | What a lazier version would have done |
|---|---|
| `sitemap.ts` | `lastModified: new Date()` on every URL. A crawler that reads one made-up date learns to distrust all of them; A1 omits the field unless the owner's own edit timestamp is readable. |
| `publishedPages` | return `[]` on a failed read. `[]` says "this platform has no pages", which is a claim; `null` says the read failed, and the sitemap then serves just the marketing home. |
| `llmsTxt` | invent a city for a business that has none. |
| `llms.txt` route | 500 when the business list cannot be read. It answers, and the body says the list could not be built rather than showing an empty one. |

### My assessment of llms.txt is in the file, not just the plan

The founder asked for an honest read on llms.txt and the answer is that
it is **a proposal (llmstxt.org), not a standard, that no major answer
engine has committed to reading.** It shipped anyway because everything
in it was already in the database and it cost about thirty lines beside
two routes that do matter — and **the file says this about itself in its
own opening lines**, so nobody reading it, including a future me, is
misled about what it is. Nothing in the product claims it helps and
nothing measures whether it does. A test asserts the honesty lines are
there, and another asserts the plan still says the same thing.

### Mutations: 23 of 23 killed

And a harness change worth keeping: the mutation runner now reads
vitest's **json** reporter rather than the verbose one. The verbose
reporter truncates long test names, and on 6 November a truncated name
made a killed mutant read as a survivor. The json report carries the
full name, so the verdict is read from the name itself.

The test file also had a mock bug of exactly the kind this codebase
keeps finding: `vi.doMock` inside each test, with the route imported
after it. **The module is cached after the first import, so the mock
applied once** and every later test ran against the first test's
database. One module-level `vi.mock` with a mutable `current` fixed it.
A per-test `doMock` without `resetModules` is a mock that silently
works for one test.

### Unverified live

Nothing has fetched these routes on hawlai.online. The build lists all
three as dynamic routes and the middleware test proves they are not
redirected, but **no crawler has been observed reading them**, and no
claim is made about ranking or about being cited by any answer engine.

## 6 November 2026 — AEO/A2, and two bad prop names kept on purpose

**A `faq` block, an `faq_item` block, FAQPage schema, and JSON-LD on the
two page kinds that had none.** A2 of PLAN-AEO-GEO.md.

### The decision: the props are called `heading` and `html`

An `faq_item` holds its question on `heading` and its answer on `html`.
Those names are bad. I kept them, and this is why.

Four separate systems are keyed on that exact set of four prop names:

| Where | What it does with the list |
|---|---|
| `TEXT_PROPS` — lib/pages/provenance.ts | which props hold words, so it can record who wrote each line |
| `BLOCK_TEXT_KEYS` — lib/claims/guardBlocks.ts | which props the claims guard checks |
| `LEGACY_FIELDS` — lib/claims/siteClaimsReview.ts | which field a claim in the owner's review belongs to |
| `TEXT_PROPS` — the Properties Panel | which edits mark a line as the OWNER's, not the machine's |

A prop named `answer` would be invisible to all four. The claims guard
would not read it, so **an AI-written FAQ answer would reach a live page
unguarded** — exactly the 2026-09-30 incident that put the guard on the
builder. The review would not list it. And the Properties Panel would
not mark the owner's own typing as theirs, so the guard would rewrite
the owner's words.

The alternative was to add two names to four lists, three of which are
copies of each other. I considered consolidating them into one import
and decided against it inside A2: it would have forced a restatement of
an existing assertion in `tests/contentSourceScope.test.ts` that pins
the literal list, and the guard-coverage test below gets the same
protection without touching it. **The consolidation is still worth
doing, as its own change, and provenance.ts already asks for it in its
own header ("One definition, no bundle").**

**What keeps this from rotting:** a test walks the whole registry and
fails if any propField of type text/textarea/richtext is a key the
claims system does not read. One exemption, dated, with a reason:
`alt`, because an image's alt text describes a picture rather than
making a claim, and guarding it would change what the guard rewrites on
every existing page — a different decision from this one.

### Two faults found on the way

**`LocalBusiness { name: "the business" }`.** `businessDisplayName`
falls back to the words "the business" for a missing name *and* for the
signup placeholder, and the home page called it with that default. So a
business that had not yet typed its name was publishing that stand-in as
its name — in JSON-LD, the one format designed to be believed without
being read by a person. Found by writing the test for
`loadSiteIdentity`, which asked for an empty fallback and then failed
because the old behaviour was still there. It now publishes **no
structured data at all** for a business with no name, which is this
file's rule everywhere else.

**The audit asked for an FAQ the page already had.** `no_faq` looked at
`page_type` and the slug only, so a business that put an FAQ block on
its home page — the thing A2 exists to make possible — was still told
every morning that it has no FAQ. It now counts a real pair anywhere in
a page's blocks. A finding that fires against work the owner has already
done teaches them to ignore findings.

### What the schema will and will not do

Google narrowed FAQPage's rich-result eligibility in 2023. **This is not
a dropdown under a search result and nothing in the product says it
is.** What it is: the page stating, in a form that needs no parsing,
which string is a question customers ask and which is the answer. A test
asserts the plan and the schema file both still say so.

The pairs also only ever come from `faq_item` blocks that are **rendered
visibly on the same page** as the script tag. Structured data describing
content a visitor cannot find is both the one thing Google calls out as
a violation and, more simply, a lie. For the same reason the inner page
passes an ItemList only when a block on it actually shows products — an
About page carrying the catalogue would be describing something it does
not display.

### The honest gap, and the read query that sizes it

A page the owner has opened in the block editor and saved is stored as a
block tree, and `convertFaq` **flattened** the pairs on the way in. For
those pages there is no pair left in the database, so they gain nothing
from A2 until something rebuilds them. Pages still in the legacy shape
convert at render time and gain the schema immediately, with no write.

Nothing is guessed about how many there are. **The read query first, as
always — it confirms the ids before any SQL keys on them:**

```sql
-- How many saved pages lost their FAQ pairs to the old conversion?
-- A page in the NEW shape (top-level items are type 'section') whose
-- tree holds no 'faq_item' but does hold a heading that reads like a
-- question. Read-only; nothing is changed by this.
select
  w.slug          as site_slug,
  p.slug          as page_slug,
  p.content_source,
  p.updated_at
from website_pages p
join websites w on w.id = p.website_id
where p.sections::text like '%"type":"section"%'
  and p.sections::text not like '%"type":"faq_item"%'
  and p.sections::text ~ '"text":"[^"]*\?"'
order by p.updated_at desc;
```

If that returns rows, the fix is a one-off re-pairing pass, and it needs
the owner's eyes on each page rather than a blind write — a heading
ending in a question mark is a strong hint and not a fact.

### Mutations: 34 of 34 killed

Four did not die on the first pass and all four were real test gaps, not
false alarms:

- **The reader's own `&&`.** Changing `question && answer` to
  `question || answer` in `faqPairsFromBlocks` changed nothing, because
  every assertion reached the reader through `legacyToBlocks` (which
  already drops a question-less item) or through `faqPageNode` (which
  filters again). The reader is what the pages call, so it is now tested
  directly.
- **`dangerouslySetInnerHTML` on the answer.** The test asserted the
  answer does not reach the page as `&lt;p&gt;` — which passes happily
  when the string is injected as live markup instead. That is the other
  half of the 2026-09-21 misnamed-prop bug and the worse half. Both are
  now asserted.
- **Filtering the FAQ block's children to pairs.** Every fixture held
  only pairs, so dropping everything else changed nothing measured.
  `allowedChildren` is advisory, and a page that silently drops a block
  the owner placed does not match the editor they placed it in.
- **A mutation of mine that did not parse.** Swapping `<div>` for
  `<details>` while leaving `</div>` meant the file never compiled, no
  test ran, and the harness reported a suspect rather than a survivor.
  Rewritten balanced, and it dies.

### Unverified live

No page has been fetched and no structured data validated in Google's
Rich Results Test. The build compiles all three routes and the tests
assert the graph; **a machine outside this repo has not read any of it.**

## 7 November 2026 — the only business on the platform is test data

**The founder confirmed that candle_by_qaaf is not a real business.** No
real orders, and a `business_story` whose content was invented —
including a customer testimonial. **There is no real business on Hawlai
yet.**

Four consequences, in the order they matter.

### 1. A fabricated testimonial is live, and A1 pointed crawlers at it

A fabricated personal story and an invented customer message — a
customer's accident, in the first person — are on a published page. That
was already wrong. **What changed yesterday is that A1's sitemap started
actively advertising it**: before, that page could only be found by
following a link from somewhere, and for this site there was nowhere to
follow from. A1 removed exactly that obscurity, on purpose, for every
storefront.

So the risk is mine to name plainly: **the work that shipped on 6
November made a fabricated testimonial discoverable.** The feature is
right and the content is not.

**Unpublishing needs three flags, not one.** This is the finding that
matters operationally:

| Surface | Gate | Covered by the dashboard's Publish toggle? |
|---|---|---|
| `/site/{slug}`, its inner pages, the product page | `websites.published` | **yes** |
| `/sitemap.xml`, `/llms.txt` | `websites.published` (`.eq("published", true)`) | **yes** |
| `/seo/{slug}` | **`seo_pages.published` — its own column** | **no** |
| `/p/{slug}` | **`landing_pages.published` — its own column** | **no** |

`setSitePublished` (src/lib/website/setSitePublished.ts) updates
`websites.published` and nothing else. A business unpublished from the
dashboard can still be serving an SEO page and a landing page, each
behind a flag nothing in that flow touches. **That is a product bug
independent of today's news** and it is recorded here rather than fixed
in passing.

The cart and checkout routes have no `published` check at all, but they
are client-only and hold no business copy, so nothing fabricated is
reachable through them.

**And the removal, once unpublished:** a 404 plus Search Console's
removal tool, not a `robots.txt` block. Blocking the crawl of an already
indexed page prevents Google from ever seeing that it is gone.

### 2. A3 and L1 are paused, and the questions are not thrown away

Collecting "real facts" for a business that does not exist would put
invented facts on record as evidence — and `knownText` treats a recorded
note as proof, so a generous answer becomes the thing that approves the
same claim on every other surface. That is the loop this codebase spent
Stage 1 breaking.

INTERVIEW-A3-L1.md waits as written. The questions came from the schema
and from the nine promises `siteClaimsReview.ts` already watches for, not
from any one business, so they do not expire.

**L4's GBP application still goes in**, because it is a queue and the
wait is the point.

### 3. THE GUARDS STAY. The software failures were real.

This is the part most at risk of being got wrong later, so it is written
down now: **almost every guard in this codebase carries a dated
candle_by_qaaf incident as its reason, and those incidents really
happened.**

- `hello@candlebyqaaf.com` really was generated onto a live contact page
  for a domain nobody owned.
- `<p>` tags really did render as visible characters on a live homepage.
- The white-on-white card really was invisible.
- The RLS gap, the 307 redirect, the cross-tenant array reference — all
  real defects in real code.

**What was fake is the business, not the bugs.** A test business is a
perfectly good place for a real software failure to happen. So nothing
is relaxed, no allowlist entry is removed, and
`multiTenantVocabulary.test.ts` keeps its dated entries.

**What IS now known to be unreliable** is any claim about business
outcomes drawn from this data: order counts, revenue, "one order on
record", the attribution rows, `aeo_presence` history, the
`decisions_outcomes` baseline. Those describe a business that was not
trading. Nothing has ever been promised on them, and nothing should be.

### 4. A5's recommendation changes, and that is a cost decision

PLAN-AEO-GEO's A5 recommends a monthly AEO check per business. Each run
is a model call with live web search. **With no real business, a monthly
schedule bills for a business that does not exist** — the same burn that
paused `POSITIONING_ENABLED` in September. So A5 ships behind a flag,
default off, and the plan now says so.

### The SQL, read first

Nothing below is keyed on a guessed slug. The founder runs all of it by
hand.

```sql
-- 1. READ. Every business and every storefront, so the id is confirmed
--    rather than assumed. Read-only.
select d.id as dealership_id, d.dealership_name, d.created_at,
       w.id as website_id, w.slug as site_slug, w.published
from dealerships d
left join websites w on w.dealership_id = d.id
order by d.created_at;
```

```sql
-- 2. READ. Every publicly visible surface for that one business, across
--    all three tables that have their own `published` flag.
select 'website'      as surface, w.slug, w.published from websites      w where w.dealership_id = '<id from query 1>'
union all
select 'seo_page'     as surface, s.slug, s.published from seo_pages     s where s.dealership_id = '<id from query 1>'
union all
select 'landing_page' as surface, l.slug, l.published from landing_pages l where l.dealership_id = '<id from query 1>';
```

```sql
-- 3. WRITE. Takes the public visibility away and keeps every row.
--    Reversible: set published = true to put it back.
update websites      set published = false where dealership_id = '<id from query 1>';
update seo_pages     set published = false where dealership_id = '<id from query 1>';
update landing_pages set published = false where dealership_id = '<id from query 1>';
```

```sql
-- 4. VERIFY. Query 2 again. Every row should now read `published = f`.
```

### One thing flagged rather than done

The invented `business_story` rows stay in the database for testing, as
the founder decided. **They are still evidence**: `knownText` reads
`business_knowledge` title and content, so a test run can still produce
copy that quotes a customer who does not exist — and a guard that
approves a fabricated testimonial because a fabricated note supports it
teaches nobody anything.

Retiring just those rows keeps the history (`is_active` exists for
exactly this) without feeding them to a generator:

```sql
-- READ FIRST — which rows, and what do they say?
select id, category, title, is_active, left(content, 120) as starts_with
from business_knowledge
where dealership_id = '<id from query 1>'
order by category, title;

-- Then, only for the invented ones, by id. Not by category: nine of the
-- business_story rows hold real product facts the tests rely on.
-- update business_knowledge set is_active = false where id in ('<...>');
```

**The founder's call, not mine** — it changes what the test fixtures see.

## 7 November 2026 — I1: somewhere truthful to put a phone number

**Migration 221, `business_listing_facts`.** I1 of
PLAN-AUTO-INTERVIEW.md, which is the local plan's L1 with the interview
automated. The founder asked for the columns now, before any real
business exists, so the automated interview has somewhere to write.

### The shape: a publish decision beside every value

The table could have been six columns on `dealerships`. It is a table,
with `publish_phone` next to `public_phone` and `publish_street_address`
next to `street_address`, because **a fact Hawlai knows is not a fact
the owner asked to publish** — and there is already a standing example
of the difference on the row this would have been added to:
`dealerships.owner_whatsapp_number` exists so Hawlai can message *him*.
Publishing it because it happened to be in the database would be a
second use of a fact given for a first one.

Both flags default to `false` in the migration, and `readListingFacts`
treats a false flag **exactly** like a missing value. Two tests hold
both halves, because either one alone is a gap: a column defaulting to
true would publish on the first insert before any flag was read, and a
reader that checked truthiness rather than `=== true` would accept the
string `"yes"` — or `"no"`.

### Why this table exists at all, and it is not a feature request

The claims guard's own header records it, dated: *"Nothing in Hawlai
stores a public contact email, a public phone number or a social handle
for a business, so there was nothing to check against and the model
filled the gap the way models do."* What it filled it with was a
plausible email address on a domain the business did not own, on a live
contact page.

A column is not the fix for a model inventing things — the guard is. But
a business that HAS a phone number and no column to keep it in will keep
having that gap filled for it.

### Three deliberate absences, each asserted

- **No `geo` column.** The local plan says "geo, if the Place record has
  it", nothing in this product reads a Place's coordinates, and the
  interview does not ask — an owner typing their own latitude is not a
  thing that happens. A column nothing can fill is schema without a
  purpose, which is the criticism I made of L1 as a whole two days ago.
- **No second home for the Place id or the Facebook page id.** Both are
  already on `dealerships`, so the Maps and Facebook `sameAs` URLs are
  derived. Two spellings of one fact is how they come to disagree.
  Instagram *does* get a column: only `instagram_business_id` is stored
  and it cannot be turned into a public profile URL.
- **No `aggregateRating`, and no column for one.** Hawlai reads the
  Google rating daily, which makes this the field most likely to be
  added by someone being helpful.

### RLS from the first migration, both halves

Owner select and active-team-member select, and **no client write policy
at all** — writes go through the service-role client from a route that
has already checked the caller owns the business. Two new tables shipped
without RLS during the pricing-tiers work and were caught afterwards;
four tests assert it here rather than hoping, including one that fails
if any `for insert/update/delete` policy ever appears.

### `sameAs` is strict, because it is a claim

`sameAs` says *this other page is the same business*, and a reader
follows it. So a URL with no scheme is refused: `instagram.com/shop` in
markup is a **relative link** that resolves against the storefront and
points at a page on the business's own site that does not exist.

### Mutations: 42, then 7, then 2 — and what the survivors were

The first pass killed 37 of 42. All five survivors were worth the time:

**Three were broken mutations of mine, and two of those found real
redundancy.** `telephone: listing?.phone ?? ""` and
`areaServed: listing?.areasServed ?? undefined` changed nothing, because
`compact()` already drops an empty string and an empty array. The
`.length ?` guards I had written on three fields were **redundant with
compact**, and redundant code cannot be mutation-tested — so the
redundancy went and `compact` keeps its one job. The third declared an
unused `Set` and changed nothing at all; rewritten, it dies.

**One was a real gap with a real attack shape.** Deleting the
`http:`/`https:` check changed nothing, because `javascript:alert(1)` has
no hostname and the dot check refused it — for the wrong reason.
`javascript://www.instagram.com/%0aalert(1)` *has* a hostname with a dot
in it, so the scheme check is the only thing standing between it and a
published href. Now tested.

**One was rule 8 arriving in a comment block.** The verify-query
assertion matched `/relrowsecurity/`, which appears twice in the
migration — once in the query and once in the sentence saying what it
should print — so deleting the query left the test passing. It now
asserts the query.

**And one more gap the re-run found.** With the redundancy gone,
`compact`'s empty-string branch had no caller in any test. The realistic
one is `brand_kits.logo_url = ''` — an owner who cleared the field
rather than never setting it — which without `compact` publishes
`image: ""`, a machine-readable claim that there is a logo at that
address. Tested with the empty string, not with a contrived value.

**Final: 42 of 42 killed**, across the three passes.

### The SQL, and it is the founder's to run

```sql
-- Migration 221. Read the live state first.
select relname, relrowsecurity from pg_class where relname = 'business_listing_facts';
```

If that returns no row, the migration has not been run. After running
it, the three verify queries are in the migration's own footer: RLS
enabled, exactly two SELECT policies, and both publish flags
`boolean / NO / false`.

### Unverified live

**Nothing writes this table yet**, which is the point: the columns exist
so I4 has somewhere truthful to put an answer. No business has listing
facts, so no page's structured data has changed, and the migration has
not been run in production.

## 7 November 2026 — I2: the interview as data, and one list of promises

**25 questions in a registry**, replacing the document a person reads
out in a meeting. All four of the plan's decisions approved as
recommended: four questions in onboarding, a fact asked for once ever,
a deterministic answer check with no model call, and a twice-failed
answer stored and marked weak rather than blocked.

### The decision: OFFER_PATTERNS moved out of siteClaimsReview.ts

The nine promises the claims review watches for — gift sets, bulk
orders, restock alerts, custom orders, a subscription, wedding favours,
gift wrapping, samples, workshops — now live in
`src/lib/claims/offerPromises.ts`, and both the review and the interview
import them.

**Why it had to be one list rather than two.** The interview asks the
owner, one by one, whether he makes each promise, so that a "yes" is on
record before a page says it and a "no" is on record so the guard can
refuse it. Asking about a *different* nine would be worse than not
asking: the interview would collect answers nobody checks, and the
review would keep flagging promises nobody was asked about. A test now
fails if the review grows its own copy back.

**And it had to be pure.** The question registry is read by a client
component, and `siteClaimsReview.ts` imports the whole facts layer. The
new file imports nothing — the same reasoning `lib/pages/provenance.ts`
states in its own header: *"One definition, no bundle."* This is also
the consolidation I declined to do for `TEXT_PROPS` in A2 and said was
worth doing on its own; this one was in I2's path, so it happened here.

### Rule 3's second half is the one the registry exists for

`tests/multiTenantVocabulary.test.ts` already sweeps every source file
and would catch a prompt naming a trade. What it cannot catch is what
`multiTenantRender.test.ts` records: **a prompt can be category-neutral
in its words and still assume a way of trading.** "How many days does
delivery take" is meaningless to a coaching centre, and asking it is
what makes a product feel like it was built for somebody else.

So questions that assume a way of trading are gated on
`dealerships.business_models` (migration 186), the industry-agnostic
hook this codebase already has. **And an unknown model is asked
neither** — empty `models` means nobody has answered, which is not the
same as "every way of trading". A mutation that read it as "every way"
dies.

Four questions carry no gate and must not acquire one: reply time, why
you and not someone cheaper, returns, and what you work with. Those are
questions for a sweet shop and a coaching centre alike.

### progressFor is what makes a half-finished interview safe

The expensive failure in §2.1 of the plan is not abandonment — it is
that **a half-filled record looks complete to a generator**, because
`knownText` reads what is there and has no way to know what the owner
never reached. "Four of nine answered" is the fact that stops six rows
being read as the whole truth.

The total is derived, never a literal — the same rule `steps.ts` states
for the step count, for the same reason it states it — and it counts
only the questions *this* business is asked, so a services business with
fewer tier-2 questions is not reported as permanently behind.

### Mutations: 36 of 37 killed, and the one that survived is not a miss

**Two survivors shared one root cause, and it was a real weakness.**
Both tier-1 assertions read `questionsFor(1, {})` — the FILTERED list.
So a fifth question moved into tier 1 but gated on a way of trading was
filtered out of the very answer being checked, and the assertion saw the
same four and passed. The filtered list cannot prove what the flow
contains; both now read the registry, and both mutants die.

**The third is an unreachable defensive branch, reported as one.**
`isComplete` reads `total > 0 && answered === total`, and removing
`total > 0` changed nothing — for a true reason: there is no way through
the public API to reach a tier with no questions, because tier 1 is
never gated and tier 2 always keeps its ungated questions. The branch is
correct and stays; it is what makes a future all-gated tier safe rather
than silently "complete". What is testable is the **invariant** that
makes it unreachable, and that is now asserted across every combination
of business models.

Calling that a kill would have been the dishonest option. It is a
survivor with a reason, and the reason is written in the test beside it.

### Unverified live

**Nothing asks these questions yet and nothing writes an answer.** I3
judges answers, I4 asks the four in onboarding. The registry is pure
data: 40 tests assert its rules, and no owner has seen a single prompt.

## 7 November 2026 — I3: judging an answer without reading it

**The validator: split to fit, check the category, and follow up once on
an answer that is only praise.** I3 of PLAN-AUTO-INTERVIEW.md.

### The 200 was a literal in two files, and that was the real risk

`businessFacts.ts` slices each recorded note to 200 characters before a
model sees it, and that file already records what the cut did:
*"content cut at `slice(0, 200)` — mid-sentence, so '40 hours burn hota
hai' could reach the model as a number with no unit."*

I3's job is to split an answer so it never needs cutting. **A validator
splitting at 200 while the reader sliced at 180 would have reintroduced
the mid-sentence cut, quietly, and nothing would have failed.** So the
number moved into `src/lib/knowledge/noteShape.ts` with the six
categories, and both files import it. Third extraction of this kind in
three days (`provenance.ts` asked for it, `offerPromises.ts` in I2, this
one now) and the reason is the same every time: a constant with two
homes is a constant that will disagree with itself.

**Pure, so it costs no bundle.** The validator and the registry are read
by a client component and `businessFacts.ts` pulls in the whole facts
layer.

### Split, never truncate — and the boundary matters

A sentence is kept whole wherever it fits, because **a fact broken in
half is two wrong facts**. A single sentence longer than a note falls
back to a word boundary; a single unbreakable word — a pasted URL — is
cut, because losing the owner's answer is the worse option. A test joins
the notes back together and compares them to what was typed, so nothing
can be dropped silently.

And a long answer becoming four rows is safe rather than lossy, because
`rowsForPrompt` already says out loud how many rows did not fit: *"N
more recorded note(s) did not fit here. Do not guess what they say."*

### The decision: the vagueness check is deliberately under-eager

The founder asked for a follow-up on a vague answer. The obvious reuse
does not work, and this is worth writing down because somebody will try
it: **`claimCheck` decides whether a claim is supported by the records,
and here the answer IS the record.** There is nothing behind it to check
it against, so the guard would pass "we have the best quality in the
city" without complaint — and it would be right to, because those are
the owner's own words about his own business.

So the check is new, small, and structural: **does the answer contain
anything a customer could check** — a digit or a unit — and does it
reach for a superlative instead. Both conditions, deliberately:

| Answer | Verdict | Why |
|---|---|---|
| "We have the best quality in the city" | **weak** | nothing checkable, and a superlative |
| "The best because it burns 40 hours, not 25" | fine | a number rescues it |
| "We press it by hand and let it rest overnight" | fine | no number, but no superlative either |

**The third row is the decision.** This check cannot tell a specific noun
from a vague one without a vocabulary of nouns — and a vocabulary of
specific nouns would be one trade's words handed to every business,
which is rule 3 and the leak this codebase has had twice. So a plain
specific sentence it cannot recognise as specific is left alone. The
asymmetry is chosen: a false "weak" means arguing with an owner about a
good answer, and an owner who cannot get past a question abandons the
interview — which is the expensive failure, because a half-filled record
looks complete to a generator.

**Units are industry-neutral by construction**: a rupee, a percentage, a
day and a kilogram mean the same thing to a sweet shop and a coaching
centre, and none of them names what is being measured.

### Mutations: 42 of 42 killed across three passes, and one found a
### rule-3 guard that guarded nothing

Eight did not die on the first pass. Five were real test gaps, each the
same shape — **a fixture that passed for the wrong reason**:

- Every "a number passes" fixture also carried a unit ("2 to 3 **days**",
  "**₹**650", "40 **hours**"), so deleting the digit half of the check
  changed nothing: the unit half was quietly doing all the work.
- The length test used one giant sentence, which takes the word-boundary
  branch, so a mutation letting the sentence **accumulator** run to twice
  the limit survived.
- The unbreakable-word test asserted "more than one note" and "the x's
  are in there", both still true when a 300-character note was emitted
  whole.
- The non-falsifiable fixtures were answers that are not vague anyway
  ("None, we have no certification"), so dropping the `needsFalsifiable`
  condition changed nothing about them.
- The purity test read `answerCheck.ts` only, while `noteShape.ts` is
  what it imports — and that is the file a client component pulls in.

**And the one worth recording on its own.** A rule-3 assertion in my test
read `expect(src).not.toMatch(/\bjars?\b/i)` over a file that is largely
**regex literals**. In the source text a unit appears as `|\bjars?\b)`,
so the character before "j" is the "b" of `\b` — a word character. There
is no word boundary there, and the assertion could never have matched a
trade word added inside the unit pattern. It looked exactly like a
multi-tenant guard and guarded nothing. A word-boundary assertion cannot
police a file made of regexes; the check is now a plain
case-insensitive substring, over a named list of trade words, applied to
both lists in the file.

This is CLAUDE.md rule 8 in a new costume: that rule is about comments
defeating a grep, and this is escape sequences doing the same thing.

**Two others were broken mutations of mine** — one aimed at a comment
line the assertion does not read, one with a double-escaped anchor that
never applied. A mutation that never applies is not a passing one.

**And one was a no-op against redundant code**: `isVague`'s
`if (!t) return false` is already covered by the `&&` below it. Removed,
as with I1's `.length ?` guards — redundant code cannot be guarded.

### The gap I3 leaves, named rather than left to be found

**The `weak` flag has nowhere to live.** `business_knowledge` has no
column for it. `judgeAnswer` decides it and nothing records it, so until
I5 — which needs a progress table anyway — a twice-failed answer is
stored exactly like a good one. Giving it a migration of its own now
would mean two migrations where one will do, so it waits, and it waits
in writing.

### Unverified live

Nothing calls `judgeAnswer`. No answer has been split, no follow-up has
been asked, and no owner has seen a prompt.

## 7 November 2026 — I4: the four questions, asked and written

**Two onboarding screens, a route, and the first thing in this
initiative that actually writes a row.** I4 of PLAN-AUTO-INTERVIEW.md.

### Two screens for four questions, which departs from my own plan

The plan's I4 row says "four steps". It is two, and the reason is the
plan's own §2.1: three of the four are one-line answers that belong
together, the week's opening hours is a seven-row grid that needs its
own room, and four screens for four trivial questions is four
transitions in a flow where **abandonment is the expensive failure** —
because a half-filled record looks complete to a generator.

Said here rather than quietly done. The registry drives both screens, so
splitting them into four is a change to one list.

**And they sit after the redesign's five screens, not inside them.**
`presence → connect → confirm → brand → photos` stay contiguous; the
listing questions join the block that follows, where the brand-voice
questions already live. `TRANSITIONAL` — the list whose own comment says
"nothing new goes on this list" — stays empty, because this is approved
scope in both orders rather than drift.

### The decision: recording a fact and publishing it are different
### permissions

Anyone on the business may record the phone number. **Only the owner may
put it, or a street address, on a public page.** `profiles.dealership_id`
says which business a user belongs to; `dealerships.owner_id` says
whether they own it, and a team member belongs without owning.

A non-owner who asks to publish is **refused and told**, not quietly
written `false`. A silent false is a setting the owner would later find
switched off with no explanation — and the screen would have looked as
though it saved. **Turning publishing off is never refused**, which is
rule 6's reasoning (the safe direction must not be the slow one) applied
to a privacy flag instead of an automation.

### Absent is not empty, and that is the trap this piece was shaped
### around

The two screens patch the same row. A cleaner that returned every column
on every call would have **the hours screen wipe the phone screen's
answers, every time, with nothing looking wrong** — the same trap the
brand-profile route already records for `brand_voice`. So
`cleanListingFactsPatch` includes only keys the caller actually sent, and
`null` is a value (it is how a number comes off the record) while an
absent key is left alone. A test asserts the two screens' patches share
no key at all.

The route refuses an empty patch rather than upserting one, because
upserting nothing would stamp `answered_at` on a business nobody
answered for.

### Mutations: 34 of 34 killed across two passes, and three survivors
### were the same weakness

**Three assertions about the route were satisfiable by any occurrence in
the file — and the file has two handlers that look alike.** Deleting the
401 from PATCH left GET's copy matching the regex. Deleting the
`profiles` read from PATCH left GET's. Both mutants survived tests whose
names say they check exactly that. The handlers are now sliced apart and
each assertion reads the one it is about.

**This is CLAUDE.md rule 8's lesson arriving a third way.** The rule is
written about comments defeating a grep; I3 hit it as escape sequences
inside a regex literal; this is duplication between two functions. The
general form is the one worth keeping: *an assertion satisfiable by any
occurrence proves nothing about the occurrence that matters.*

**A fourth was a regex that missed a parenthesis.**
`expect(route).not.toMatch(/\.\.\.body/)` does not match
`...(body as any)`, so a spread writing every client-sent field straight
into the row survived.

**A fifth was a fixture in the order it was asserting.** The hours grid
was built Monday-first, so `Object.keys(grid)` and the week's own order
were the same list, and a mutation that iterated the grid instead of the
week changed nothing. The fixture is now deliberately out of order.

**One was an anchor of mine that matched twice** (`STEP_ORDER` and
`TARGET_ORDER` have identical tails) and so never applied. A mutation
that never applies is not a passing one.

**And one is not a real mutation**, reported as such: replacing the
body's type check with `(body ?? {})` changes nothing observable,
because `hasOwnProperty` returns false for every key on a string, a
number or an array. The check is a cast-safety nicety with no reachable
difference, and the test already asserts the behaviour that matters.

### An existing test was restated, not weakened

`tests/onboardingSteps.test.ts` asserted `totalSteps(ONE_LANGUAGE)` is
**9**. Two approved steps made it 11, so a test whose subject had not
changed went red.

The literal was the problem. That describe block is called *"THE TOTAL IS
DERIVED, SO IT CANNOT SAY FIVE"* — and pinning it to a number typed in
the test made the test carry exactly the kind of hardcoded count it
exists to forbid. Restated, it reads the total off `STEP_ORDER` and
asserts the conditional step accounts for the difference. **Strictly
stronger**: two mutations confirm it (making `language_notes`
unconditional, and making `stepsFor` stop filtering) where the literal
would only have caught a change in size.

### Unverified live

**Nothing has run.** No owner has walked these two screens, because
there is no real business to walk them; the flow is asserted, not
observed. Migration 221 is in production, so the first real signup will
be the first row — and that will be the first genuine test of this
piece.

## 7 November 2026 — I5: a half-finished interview that says so

**Migration 222, the resumable interview, and the first caller of
`judgeAnswer`.** I5 of PLAN-AUTO-INTERVIEW.md, carrying the gap I3 left
in writing: the `weak` flag now has somewhere to live.

### A real bug, found by the test written for it

`contextFrom` merges skipped questions into `answered` on purpose, so
the **interview** stops re-asking something the owner declined. The gap
disclosure then counted progress through that same context — so a
business that **skipped eight of nine questions got no disclosure at
all**. The facts layer read it as fully answered.

That is precisely the failure this whole piece exists to prevent,
arriving through the fix for a different one. Two different questions
now read two different things:

| Question | Reads |
|---|---|
| "What do I ask next?" | answered **+** skipped (`contextFrom`) |
| "How much is on record?" | answered **only** |

Found because the test for "a skipped question does not count towards
the answered total" failed on the first run. It is the kind of bug that
would never have shown up in use: everything works, and the prompt is
quietly confident.

### The decision: where the thin flag lives

On **`business_knowledge`**, beside the text it qualifies — not on the
progress table. The flag describes a sentence a generator will read, so
it has to be readable in the same row as the sentence. Keeping it on the
progress table would have meant joining note titles to question keys,
and a title is the owner's to edit, which makes it the wrong thing to
key a join on.

It is also mirrored on `interview_answers.weak`, for the questions whose
answer is a **column** rather than a note, where there is no row to
carry it.

**And the progress table holds status, not content.** The answers are
already in `business_knowledge` or `business_listing_facts`; a third
home for the same sentence is how two copies of one fact come to
disagree — the mistake extracted three times this week already.

### A read-then-write, not an upsert, and the reason is the owner's

My first version used `upsert(..., { onConflict: "dealership_id,title" })`
on `business_knowledge`. **That fails at runtime: there is no unique
index on those columns.** Postgres needs one for ON CONFLICT.

The fix is not to add the index. That table is the owner's own,
hand-editable through the Business Knowledge page where any title can be
typed, so a unique index on user-entered text could fail to create
against rows that already exist and would later reject a perfectly
reasonable edit. Two queries instead of one, in a flow where one person
answers one question at a time.

### Mutations: 45 of 45 killed, and the three survivors were one lesson
### in its sharpest form yet

All three were assertions that something is **present**, where the thing
occurs more than once:

- the `business_knowledge` select appears **twice** in
  `businessFacts.ts`, so dropping the column from one read left the
  assertion green and the flag missing from half the callers;
- `weak: verdict.weak` is a **substring** of `is_weak: verdict.weak`, so
  writing `weak: false` into the progress row survived a test whose name
  says it checks both;
- `when: undefined` appears **twice** in the route, once per handler.

This is the third shape of the same lesson in three days. CLAUDE.md rule
8 is written about comments defeating a grep; I3 hit it as escape
sequences inside a regex literal; I4 hit it as duplication between two
handlers. **The sharpest form is this: when the thing being pinned
occurs more than once, presence proves nothing — count it, or slice the
file.** All three assertions now count occurrences.

### An existing test was restated, not weakened

`tests/customerStoryConsent.test.ts` pinned the whole column list of one
read — `select("category, title, content, public_use_consent")` — so
adding `is_weak` broke a test whose subject is that **one** column. It
now asserts the column is selected in **both** reads, however long the
list gets, which is stronger: the old literal was satisfied by either
read on its own. Two mutations confirm it.

### Unverified live

**Nothing has run.** Migration 222 is not in production, `judgeAnswer`
has not judged a real answer, and no owner has seen the card. The first
genuine run of this is still the first real business.

## 7 November 2026 — G1: duplicate body text, and pages nobody has read

**Two findings added to `technicalAudit.ts`, which now has eleven.**
G1 of AUDIT-GROWTH-LOOP.md, the first of the five things that audit
found genuinely missing.

### Both thresholds exist to stop the finding firing on good work

`MIN_DUPLICATE_WORDS = 25` and `STALE_DAYS = 365`, and neither number is
a guess at a technical optimum — both are chosen so the finding does not
fire on a site that is fine:

- **Twenty-five words is a paragraph, not a tagline.** A short repeated
  line — "Get in touch", an address, a strapline under every heading —
  is a site having a voice, and flagging it would flag every
  well-built site.
- **Twelve months is deliberately conservative.** Most of what a small
  business says about itself is still true a year later. Six months
  would fire on almost every page of almost every site, which is the
  same as firing on none.

This is A2's `no_faq` reasoning applied twice: **a finding that fires
against work the owner has already done teaches them to ignore
findings.** `stale_content` is therefore priority `low`, and its fix
line says out loud that the page may need nothing.

### Legal pages are exempt from both, and the exemption is borrowed

Standard privacy and terms wording is not penalised anywhere — and more
to the point, `lib/seo/pageKinds.ts` already records that a sentence is
never removed from a legal page on Hawlai's initiative, so a duplicate
finding against one would have had **no action behind it**. Last year's
privacy policy is not out of date for being last year's.

The exemption uses `isLegalPage` rather than a fresh regex, because that
file's own header says it: *"A safety rule kept in two places is a safety
rule that will disagree with itself."*

### An unreadable date is not a stale page

`daysSinceChange` returns null for a missing date, an unparseable one,
and a date in the **future** (a clock problem, not a stale page).
"The audit could not see a date" and "nobody has touched this in a year"
are different facts and only one of them is the owner's problem — the
same distinction `null` carries everywhere else in this codebase.

The daily runner's select had to grow `updated_at` for the finding to
fire at all; without it every page looks undated and the check is dead
code that passes its tests.

### A design error a test caught

The first version read prose by **prop name** — `["text", "html"]`. That
cannot work here: the `heading` block holds its words on a prop called
`text`, while the `text` block holds its prose on one called `html`. So
a long heading was being collected as a paragraph.

It now reads by **block type**, from a declared `PROSE_BLOCKS` list of
the two registry types that hold prose. That also fixes the subtler
case: `faq_item` carries its question on `heading` and its answer on
`html`, and two pages asking the same question is normal while two pages
giving the same long answer is a copy.

### Mutations: 22 of 22 killed, and three survivors were overlapping
### guards

Three went red through an existing test rather than through the
assertion named for them, which is the useful signal rather than a pass:

- **De-duplicating slugs** changed nothing, because every fixture had one
  paragraph per page. A page with the **same paragraph twice on itself**
  is the shape that needs it — and it is not duplicate content either,
  because search engines compare pages and that is one page.
- **Adding `heading` to `PROSE_BLOCKS`** changed nothing, because the
  prop filter blocked it anyway. Two overlapping guards, so neither
  could be tested through the other — the same pattern as I1's
  redundant `.length ?` checks. The declaration is what is pinned now.
- **Removing the prop filter** changed nothing for the same reason, and
  the case it actually exists for is the FAQ question. Now tested.

### An existing fixture was corrected, not a test weakened

`tests/technicalAudit.test.ts` has a test called *"A CLEAN SITE REPORTS
NOTHING — no finding is invented to look busy"*, and it went red.

**The finding was right and the fixture was a convenience:** `page()`
builds every page from the same `LONG` paragraph, which was harmless
while nothing compared bodies between pages. Two pages with the
identical paragraph IS duplicate content. So the second page got its own
words, and the claim is now also asserted with recent dates — a fixture
with no dates must not be called stale either.

### Unverified live

The daily `site_audit` has not run with these findings against a real
site, because there is no real site. **The thresholds are reasoned, not
tuned against real pages**, and the first real business is where they
get tested.

## 7 November 2026 — G3a: a page can be written before it is public

**I set out to build G3 and found it had no foundation — and that the
missing foundation was a live fault, part of it mine.**

### What was wrong, and what I did to it

`website_pages` had **no published flag of its own.** A site is
published or not (`websites.published`), and the route that renders an
inner page checked the site and then found the page by slug. There was
nothing else to check. So Website Builder's **Add Page** button put an
empty page — a heading and an empty paragraph — **on the live site at a
real URL**, immediately.

**And A1 made it worse on 6 November.** `/sitemap.xml` lists every page
of every published site, so from that day an empty page was advertised
to crawlers the moment it was created. Before A1 it could only be found
by following a link and there was no link; A1 removed exactly that
obscurity, deliberately, for every storefront. The feature is right and
this was its cost, unnoticed until now.

**G3 could not be built over it.** Approving a proposed page would have
published an empty page and put it in the sitemap — the product doing,
unprompted, the thing above. So G3 split: **G3a** is the draft state,
**G3** is the proposal that uses it.

### `default true` is the important half of the migration

Every page that existed when this column was added was already live. A
default of `false` would have **unpublished a whole platform's worth of
pages the moment the migration ran** — a one-line schema change taking
every customer's site down.

So the new state is opt-in: only a page created from now on, by a path
that asks for it, starts unpublished. The migration ships the query that
proves nothing was taken down (`count(*)` against
`count(*) filter (where published)`, and they must be equal).

**And the render check is `=== false`, not `!page.published`.** A row
read before the column exists gives `undefined`, which is not false —
and that page was live, so it stays live. The strict comparison is what
makes the migration safe to run while the old code is still deployed.

### Publishing is the owner's click, and never a side effect of saving

Saving is something people do halfway through writing. A save that
published would mean the owner cannot work on a page without it being
read — which is the problem this piece exists to fix, inverted.

Taking a page down is the same call with `false`, and it is never harder
than putting it up: **the safe direction must not be the slow one**
(CLAUDE.md rule 6's reasoning, applied to a page rather than to an
automation).

**A duplicated page starts unpublished too.** Two live pages with the
same words is G1's `duplicate_body` finding, arriving by the owner's own
click a day after G1 shipped.

### A draft says it is one

A page the owner cannot find on the live site, with no explanation, is
worse than one that was published empty — at least that was visible. The
builder says it plainly: *"This page isn't live yet. Nobody can reach it
and it isn't in your sitemap."*

And the publish control is not optional polish: without it, adding a
page would be a **dead end**, which is a regression on what the owner
had before. A test asserts it exists.

### Mutations: 17 of 17 killed, first pass

Including the four that matter most: the column defaulting to `false`,
the sitemap listing drafts again, a save publishing as a side effect,
and the strict `=== false` becoming a truthiness check.

### Unverified live

Migration 223 is not in production. No page has been created as a draft,
nothing has been published by that button, and the sitemap has not been
re-fetched by anything. **And one thing worth the founder's eye:** on a
real platform I would expect the verify query's two numbers to match
exactly; if they ever differ, something has written `false` to a page
that was already public, and that is worth stopping for.

## 7 November 2026 — G3: the hop the vision asks for

**A search with real demand and no page now produces an approval card,
and approving it creates the page unpublished.** Everything on either
side of this was already built; what was missing was the sentence
between them.

### What a proposal may contain, which is the whole design

This is the audit's central finding turned into code. That audit found
that the vision asks for **measurement** while several things in this
product carrying the right name are **advice** — `site_speed` writes six
generic suggestions without looking at the site, `competitor_keywords`
returns ten keywords competitors are *probably* targeting. A proposal
built from invented keywords would have been the fourth.

So a proposal contains only:

| In it | Where it comes from |
|---|---|
| the query | the customer's own typing, via Search Console |
| the impressions | counted, Google's |
| which recorded notes belong on it | the owner's own `business_knowledge`, matched on the search's content words |
| which answers are missing | interview question keys (I2), filtered to unanswered |

**And the missing half is what keeps it honest.** A buying page needs a
price, a delivery time, a reply time and a reason to choose this
business. If those are not on record the card says so rather than
letting the page be written around the hole — and every name in that
sentence is a question the owner can actually go and answer, because a
test holds that each one is a real registry key.

**The title is the customer's own search, tidied.** That is the only
source of a page title that cannot smuggle one trade's vocabulary in
(rule 3) — and it is capitalised as a sentence, not word-by-word, so it
does not read like a headline nobody wrote.

### A design error a test found

`slugFromQuery` fell back to the whole search when it had no meaningful
words in it, which turned *"the best near me"* into a page at
`/the-best-near-me` — **a slug manufactured entirely out of filler, for
a search that does not say what it is about.** A search with no subject
cannot name a page. The fallback is gone and `proposalFor` refuses it.

### Nothing acts without a registry entry

`create_page_draft`: create, **low** risk, `requiresApproval: true`.

Low risk because **nothing becomes public** — the page is created with
`published: false` (migration 223, G3a), so it is unreachable and absent
from `/sitemap.xml` until the owner presses Publish, and deleting it
costs one click. It still asks first, because a product that adds pages
to someone's site unprompted is one they stop trusting with their site.

**The slug is re-derived in the route, never read from the card** — the
lesson the toggle and autonomy branches both record: a stored
`action_details` is a value the server should not act on blindly. And a
collision is **said**, not worked around with a numbered slug: the owner
approved a page for a search, and a second page at `-2` is not that
page.

### Asked once per search, one card per run

Three cards saying "write a page" is a backlog, and a backlog is what
gets closed unread. A card already raised for a search stops another
**whatever the owner decided** — rejected counts, because *no* is an
answer. A failed read proposes nothing rather than risking a duplicate:
the cost of staying quiet is one missed card, and the cost of being
wrong is a duplicate page on a real site.

### The outcome is declared not-measurable, and that is not a shrug

A guard in `recordDecision.test.ts` refuses an action type that is in
neither the measured list nor the not-collected one, and it caught this
immediately.

**The honest answer is that this action cannot move a number.** The page
is empty and unpublished until the owner acts, so naming
`search_console` as the source would record a failure for a page that
was never put up — the product scoring the owner's inbox rather than its
own work. The thing worth measuring is the page **going live**, which is
a different action this product does not record yet. When it does, that
is what gets `impressions for this search`, with its baseline on the day
it was published. Written down rather than left to be rediscovered.

### A comment that had become false

`executionPolicy.ts` said, above `update_page_text`: *"There is no draft
layer inside a published site — website_pages IS what /site/{slug}
renders."* True when written; **false since migration 223 the same day.**
Corrected, with what did *not* change stated too: an approved edit to an
already-published page is still public the moment it saves, because that
page's flag is already true. The draft layer protects a new page, not an
edit to a live one, so that action's risk is unchanged.

### Mutations: 35 of 35 killed, and the three survivors were one family

Three went green on the first pass, all of them the same kind of weak
assertion — the third day in a row this family has shown up:

- **An assertion that read the constant it was testing.**
  `proposalFor(gap(..., PAGE_WORTH_IT - 1))` moves with the constant, so
  lowering the threshold to 1 kept the test passing. It asserts the
  number now, and fixed values either side of it.
- **A substring again.** *"1 searches, together 90 times in 28 days"*
  CONTAINS *"90 times in 28 days"*, so the singular test was satisfied
  by the plural sentence — the same trap as `weak:` inside `is_weak:`
  yesterday. It now asserts the plural phrasing is absent.
- **A source grep cannot see reachability.** Replacing the collision
  check with `if (false)` left its message sitting in the source and the
  test green. What a grep has to pin is **the test being made**, not the
  words printed when it fails.

### Unverified live

No card has been raised and no page created from one. There is no real
business with Search Console data to find a gap in, so the thresholds
and the grouping are reasoned rather than observed.

## 7 November 2026 — G4: page speed, measured instead of advised

**The last of this audit's findings that needed a real measurement.**
Behind a flag, default off, monthly when on — the founder's decision,
and the same reasoning that keeps A5 behind one: with no real business
on the platform, a monthly run spends quota and attention on test data.

### What stood here before, and why it mattered

`site_speed` in the SEO department writes *"6 concrete, prioritized site
speed improvement suggestions relevant to a small business site"* —
model-written, generic, **never having looked at the site.** The Growth
Loop audit's central finding was that the vision asks for measurement
while several things here carrying the right name are advice, and this
was the clearest example of it. It is now beside a measurement rather
than instead of one.

### The decision that shaped the file: field and lab are different claims

PageSpeed Insights returns two kinds of number and treating them as one
is how a tool like this starts lying.

- **Field data (CrUX)** is what real visitors experienced over 28 days.
  **A new site with little traffic does not have it** — which is every
  business this product is for, at the moment they most want to know.
- **Lab data (Lighthouse)** is one simulated load on Google's hardware,
  on a connection Google throttled. Useful for "what is heavy on this
  page"; not a measurement of anybody's experience.

*"Your visitors waited 5.1 seconds"* and *"a test load took 5.1
seconds"* are different claims. So:

- a reading carries `from: "field" | "lab"`, decided from what Google
  actually returned;
- the sentence changes with it — "Visitors to this page waited…" vs "A
  single test load of this page waited…" — and a test asserts the lab
  wording never says *visitors*;
- **the absence of field data is stated**, in its own sentence, rather
  than quietly substituting the lab figure. Same rule as
  `could_not_check` in the output monitor and `null` in the sitemap
  reader: an absence is a fact, not a gap to fill.
- **there is no lab INP**, so it is null outside field data rather than
  approximated from the nearest available number, and the finding that
  reads it is typed field-only.

**And one unit trap worth recording:** CrUX reports CLS multiplied by
100 while Lighthouse reports the fraction. Converted once, in the
reader, because the kind of mismatch that silently turns 0.05 into a
failure is exactly what a "measurement" must not do.

### Google's thresholds, quoted rather than chosen

`GOOD` and `POOR` are the numbers Google publishes. A product inventing
its own would be scoring the owner against a standard nobody else uses
— and only what is **poor** produces a finding, because "needs
improvement" on every page of every site is the same as a finding on
none (G1's rule, a day old).

### The key is optional, on purpose

PSI answers without a key and rate-limits harder; with one the free
quota is 25,000 calls a day. A missing key is **logged and the call is
still made**, because a check that silently never ran because an env var
was never set is worse than a rate-limited one. `PAGESPEED_API_KEY` and
`PAGESPEED_ENABLED` are both in `.env.example` with that reasoning.

### Where it runs

`heavy`, not `signals` — `cronGroups.ts`'s own rule is that signals is
"database-only and fast", and this calls a third-party API over the
network. **After `search_console_sync`**, so if a run is cut short the
searches are already in: they are what every other piece reads.

One page per business: the storefront's home. Measuring every page of
every business monthly is a quota bill for very little, and what is
heavy on the home page is usually heavy everywhere.

### Mutations: 32, with 30 killed, one hardened and one honest no-op

**M27 was a real weak assertion.** The env-var test matched
`/PAGESPEED_ENABLED/`, and `code()` strips `//` comments but not `#`
ones — so **commenting the variable out left the test green**, for a
variable nobody setting the project up would ever see. It now anchors to
the start of a line. (It went red through a stricter existing test,
which is the only reason it did not pass silently.)

**M15 is a no-op and is reported as one.** Removing the `!reading.from`
guard from `speedFindings` changes no output: with no numbers, every
individual check is null-guarded anyway. The guard narrows a type rather
than deciding behaviour, so there is nothing for a test to catch.
Calling it a kill would have been the dishonest option.

### Unverified live

**Nothing has run.** The flag is off, nothing has called PageSpeed
Insights, no signal has been written, and the first real measurement
needs both a real business and the founder turning the flag on.

## 7 November 2026 — G2: grouping the searches, and a correction I owe

**The last of the Growth Loop audit's five findings.** And it opens with
a correction, because the founder approved a plan partly on a sentence
of mine that was too strong.

### The correction

That audit's keyword-clusters row said `competitor_keywords` *"invents
ten"*. It does — **but only for a business with no Search Console
connection.** `REAL_DATA_INSTRUCTIONS` in `seoToolkitAgent.ts` already
swaps the static instruction for the real terms with Google's own counts
the moment a connection exists, its own comment says *"With Search
Console connected there is no need to guess"*, and
`tests/searchQueries.test.ts` has asserted both halves since migration
201 — including that the word "probably" is gone from the prompt.

I stated the unconnected case as the whole case. **The audit document
now carries that correction in the row itself**, and a test holds that
it does, because a plan read six months from now should not repeat my
overstatement.

**What is genuinely missing stands:** nothing GROUPS the real queries.
Even with a connection, a model is handed a flat list and returns ten
individual terms. *"These five searches are the same subject and
together they are 180 impressions"* is a computed fact nobody computed
— and it is the fact that tells an owner whether a subject is worth an
afternoon.

### Deterministic, and that is the point rather than a saving

A model asked to group searches groups them slightly differently each
time, and **a grouping that moves cannot be compared month to month.**
That is exactly the reasoning `aeoQuestions.ts` records for fixing its
four questions in code — *"'not mentioned' last week and 'mentioned'
this week might be answers to entirely different questions, so the
movement means nothing"* — applied again.

So: the most common content word becomes a subject, every search
containing it joins that group, the rest are clustered again on what is
left. Greedy, because the question an owner is asking is "what is the
biggest thing I am being searched for", and that is the most common word
by definition.

**Ties are broken alphabetically, and that is load-bearing.** Without
it, two runs over the same data could pick different subjects. Three of
my own test expectations were wrong about which word would win — "soy"
and "candles" tie at three each, so the subject is "candles" — and the
tie-break working is what made them wrong. The expectations were
corrected to what the rule produces, with the tie named in the comment,
rather than the rule being bent to the expectations.

### A search belongs to one group only

"soy candle gift box" contains both "soy" and "gift". Counting it in
both groups would make the totals **add up to more demand than Google
reported**, which is the one thing a counted number must never do. A
test asserts the grouped total never exceeds the input total.

**And one search is a search, not a subject.** Below two members there
is no group — and those rows are left out of the clustering rather than
deleted, so a caller still sees every search.

### One definition of what a search is about

`contentWords` and the stopword list moved into `queryClusters.ts`, and
`pageProposal.ts` imports them. Two copies would have been the **fourth
duplicated definition this week** — after `TEXT_PROPS`, the nine
promises and the 200-character note length. The pattern is clear enough
now to state as a rule: in this codebase, a list two files both need
goes in a pure module of its own the first time the second file wants
it, not the third.

Every stopword is filler **in any trade** (rule 3): "near me" is filler
everywhere, "candle" would be a leak, and a test sweeps for both.

### A bug a mutation found by hanging, and a harness lesson behind it

`clusterQueries`' `while` loop had exactly one exit: the splice that
removes a group's members from the work list. A mutation that stopped
removing them **made it spin forever** — and the first sign of that was
not a failing test, it was the mutation harness sitting there for three
minutes before timing out.

That is the failure shape worth naming: this function runs in the daily
job for every business, and a change that stopped shrinking the list
would not throw, would not fail a type-check and would not fail a test.
It would hang the run. **Nothing reports and nothing finishes.**

**And the first fix was worse than the bug.** I added three guards — a
spin counter, an empty-subject break and an empty-members break — and
spent four mutation passes watching each of them "survive" in turn,
because every one covered the other two. **Overlapping guards are
untestable guards**, which is the same lesson as I1's redundant
`.length ?` checks and I3's redundant early return, arriving in its most
expensive form yet.

The loop now has one rule, at the bottom, with no `continue` to skip
past it: **every pass either shrinks the list or ends the loop.** A
mutation removing it is reported as `HUNG` — its own verdict, neither a
kill nor a survivor, because "this one line is the only thing standing
between the daily run and an infinite loop" is exactly what it proves.

### Three hours of tooling, and what it cost

The mutation run for this piece had to be started five times, and the
founder asked three times whether it was done. The causes, in order, all
mine:

1. **The per-mutation test list carried the whole repo.** One pass of
   `multiTenantVocabulary` + `searchQueries` takes over ten minutes; the
   three files these mutations are about take six seconds. A
   per-mutation list should carry the tests that are supposed to catch
   it — the rest is what the full run afterwards is for.
2. **I gave an estimate I had not measured** (45 seconds a mutation) and
   it was wrong by two orders of magnitude.
3. **Killing a run can leave a mutation on disk.** The harness restores
   in a `finally` that a kill skips — and the repair script found a live
   mutation sitting in `queryClusters.ts` twice. Any harness like this
   needs a repair pass, and it is now written as one.
4. **Overlapping guards**, above, which turned one survivor into four
   passes.

### Mutations: 24 killed, 1 HUNG

### Where the grouping is actually used

`marketOpportunities`' "demand without offer" card now says *"it is one
of 2 searches about 'delivery' that together showed you 150 times"* —
summed from Google's figures, never estimated, and **said only when the
clustering found a group.** A sentence that repeats the single search's
own number in different words is one the owner learns to skip.

The clustering runs once per call rather than per opportunity: it is
deterministic, so doing it again would be the same answer at more cost.

**And a follow-up worth naming rather than quietly doing:** G3's
`sameSubject` is a strict containment check, and its own comment says
real grouping is G2's job. Now that clusters exist, G3's `answers` list
could use them and would group a little more generously. That changes
shipped behaviour the founder has already accepted, so it is **his call,
not a tidy-up** — written here rather than done.

## 7 Nov 2026 — I6: the question the product asks because it needed the answer

**The kind was always there and always thrown away.** Since migration 217
`claim_checks` has recorded `claims_removed` as an integer — how many
sentences the guard deleted, never which kind. But `claimCheck.ts`'s own
`Problem` type has carried `kind: "price" | "claim" | "substantiation"` on
every removal since it was written, and `stripUnsupported` flattened it
away one line before any caller could see it. I6 carries it through:
`removedKinds` on the return, on `ClaimCheckField`, and into a new
`removed_kinds jsonb` column (migration 224).

**The removed sentences are still not stored.** 217 left that question
open and this closes it the same way: the kind is enough to ask the right
question, and the sentence is text a model wrote about a business that
could not support it. Storing it would create a table of the product's own
unsupported claims with no retention answer.

**An empty `removed_kinds` means NOT RECORDED, not "nothing was removed."**
Every row written before 224 has one. Reading it as a clean output would
make Tier 3 confident about a history it cannot see, so an empty list
contributes nothing to the counts.

**The mapping from a removal to a question is refused wherever it cannot
be read off the guard's classification.** `price` → price range,
`substantiation` → why them and not someone cheaper, `claim` carrying a
unit of time → delivery time, and **everything else asks nothing at all.**
A mapper that guessed would ask the owner about a "material" because a
sentence mentioned one — the invented-keyword mistake the Growth Loop
audit found three times in this product, arriving in the interview.

**Twice, then once ever.** A single removal can be a generator reaching
for something the business genuinely does not do; twice is a pattern
(`ASK_AFTER = 2`). One question per run, for the reason G3 gives about
page proposals. And `interview_answers.asked` (migration 222) means the
question is never raised again — answered, skipped and asked are all
"leave it alone", the founder's decision of 7 November.

**The ask is recorded BEFORE the email is built.** If the send then fails,
one question is lost. The other order loses "once, ever" and asks forever,
and of those two failures the forgettable one beats the nagging one.

**Two mutation survivors, both real, both fixed.**
- The tie-break test passed by coincidence: it fed `price` first, where
  Map insertion order and alphabetical order agree, so deleting
  `localeCompare` changed nothing. It now feeds `substantiation` first.
- `nextGapToAsk` had a registry check that **no input could reach**, since
  `gapsFrom` only ever produces the three keys `questionForKind` returns.
  The same overlapping-guard fault as I1, I3, I5 and G2. It is gone, the
  lookup that CAN fail stays in `gapAskLine`, and the invariant it stood
  for — every key this tier returns is a registered question — is pinned
  by a test that goes red when the registry is renamed.

**An existing exhaustive test was updated, not loosened.**
`tests/claimsGuard.test.ts` deep-equals the whole of `stripUnsupported`'s
return precisely so a new field cannot appear unnoticed; its own comment
records the same update being made on 9 and 10 October. Going red on
`removedKinds` is the alarm working. The field was added to the expected
object, which keeps the match exhaustive and now also pins the empty array
on the clean path.

**Unverified live.** Nothing has run against a real business, because
there is not one. The gap counts read `claim_checks`, which has rows only
from test data.

## 7 Nov 2026 — A5: the AEO check gets the cadence it always needed

**Nothing new is measured.** `generateAeoCheck` has run since A0 and
already writes every run into `aeo_presence` and derives a trend from it.
It ran **on demand only**, so unless the owner opened the SEO toolkit
there was never a second run to compare against — and a trend was the
entire reason the question set was fixed in code. A5 is a cadence and a
cost gate. The measuring, recording and trending stay where they are.

**The question set is the load-bearing part.** `recordPresence` writes
every run into the same table whatever was asked, and `aeoTrend` compares
the last run with the one before. A scheduled run that passed no question
set would let the model choose its own — and that row would not merely
fail to produce a trend, it would land beside the fixed-set runs and
break the NEXT comparison too. So the scheduled path builds its questions
through `aeoQuestionsFor(dealership, facts)`, the same call the on-demand
route makes, and a month with no buildable question set is skipped rather
than measured loosely. Two tests pin the two paths to the same call.

**The plan said `signals`. That was wrong.** `cronGroups.ts`'s own rule is
that `signals` is "database-only and fast", and this calls a model with
live web search. In `signals` it would sit in front of the lead-export
email and the stale-approval sweep — the fault that file's header records
about Social Media Auto-Posting reading "100% success" while one post
reached Facebook in 28 days. It is in `heavy`, beside `page_speed`.

**AND THE FIRST PLACEMENT WITHIN `heavy` WAS ALSO WRONG — an existing
test caught it.** It went last, on the reasoning that nothing reads it so
it is the right thing to lose if the 60 seconds run out. But last would
not have lost it gracefully: on the one day a month it does any work,
every business's per-campaign AI work would already have spent the
budget, and a run that never happened looks identical to a month the
business was simply not named. `tests/dailyJobs.test.ts` pins
`daily_autopilot` as the last subsystem — a decision with an incident
behind it — and went red. It now runs before `daily_autopilot`, and the
corrected reasoning is in the comment beside the key so the plan does not
talk a future reader back into `signals`.

**Off by default**, the same decision `PAGESPEED_ENABLED` ships under:
each run is four live web searches per business, monthly, and a trend for
a business that does not exist is a bill for test data. The flag is read
strictly — anything other than the exact string `"true"` pauses it, so a
typo cannot start the spend. The paused message names the on-demand check
on purpose, because a flag that reads as "the feature is gone" is worse
than no flag.

**A business with no name is not measured.** The question is "who does X
here, and is THIS business named" — asking it about a business called
nothing records an answer about nobody. Same empty-fallback call A2 made
for the JSON-LD business name.

**A failure records nothing.** `_aiFailure` and the agent's own fallback
both save no row, because a stored zero reads as "this business is
invisible" when the truth is "nobody looked".

**Mutation score 33/34, and the 34th is equivalent, not a survivor.**
`name || "the business"` sits below an early return on an empty name, so
it is unreachable and the mutation changes nothing. The guard that
matters — the early return itself — is killed twice over.

**Unverified live.** Nothing has run on a schedule, because the flag is
off and there is no business to run it for.

## 7 Nov 2026 — G5: the two addresses nobody was comparing

**The headline check in the plan is not built, and the reason is a bill.**
Local plan L2 named "the name, address and phone not matching between the
site and the Place record" as "the one check that needs the Places read
Hawlai already does". That read exists, and it is field-masked to id,
displayName, formattedAddress, rating and userRatingCount — Places (New)
bills by the fields requested and a phone number is a higher tier. It is
also a search run at connect time, not a stored snapshot: only
`google_place_id` is kept, so comparing on a schedule means a Place
Details read per business per run. That is the founder's cost decision,
the same kind he reserved for G4 and A5, so the Maps leg is written down
and left out rather than quietly added to the bill.

**And there was a real mismatch to find without it.** Hawlai stores the
business address TWICE, on two different screens, in two hands:
`dealerships.business_address` is the postal address the law puts in
every marketing email's footer (migration 181), and
`business_listing_facts.street_address` is the street line published in
the site's structured data (migration 221). Nothing has ever compared
them. A customer who gets an email and a customer who reads the site can
be given two different addresses — a local-search problem and a plain
honesty problem at once. That is the high-priority finding.

**Abbreviations are reported as a mismatch, on purpose.** "Rd" and "Road"
come back as different. Not a false positive: the fix for a local listing
is for the two records to be identical, which is what every
NAP-consistency guide asks for, and a check that quietly treated them as
the same would hide what it was asked to find. Case, spacing and
punctuation are normalised; nothing beyond that is guessed.

**The phone is deliberately not compared.** `owner_whatsapp_number` is
the owner's number and `public_phone` is the business's published one.
Those are legitimately different, and calling the difference a fault
would train the owner to ignore the whole check. A missing public phone
is reported as a fault; a phone on record that he chose not to publish is
reported as HIS CALL, at low priority, in those words.

**No new subsystem, no new screen.** It runs inside `site_audit`, which
already reads rows and runs pure code daily — and there is no third cron
entry to give it anyway. One signal, separate from site health, because
that standing statement already means something on its own.

**A latent trap found on the way, and only half fixed — deliberately.**
`pageText`'s comment said it returned "everything a reader would actually
read". It does not: it reads the props named text, html, label and alt,
while `faq`, `faq_item` and `product_grid` carry their words under
`heading`. So a page whose section heading said the city would have been
told it never mentions one. A new `allText` reads every string prop and
is what G5 uses. **`pageText`'s behaviour is unchanged on purpose** —
every word count in `auditSite` reads it, so folding headings in would
move the thin-content threshold for every business at once. That is a
product decision, and it is written in the comment rather than done.
This is G1's lesson in its final form: reading prose by prop name cannot
work in a block system where the same words live under different keys.

**Mutation score 40/40, and three of the findings came from the
harness.**
- Deleting the call from `runTechnicalAudit` left all 35 tests green —
  every one of them called `recordLocalPresence` directly, so the feature
  could have shipped **completely unwired**. There is now a test that
  runs the real subsystem entry point.
- Every fixture put the home page first, so reading `pages[0]` passed. A
  page list from the database has no guaranteed order.
- The wiring fixture's page did not name the city either way, so passing
  an empty page list looked identical to passing the real one.
Three of my own mutations were invalid rather than survivors — one
changed only a comment the test strips, one added a key to a TYPE union
that changes nothing the daily route dispatches, and one was unreachable
below an early return. Each was rewritten to mutate what actually runs.

**Unverified live.** No business has a second address on record, because
there is no real business.

## 8 Nov 2026 — One text reader, and a test that keeps its list complete

The founder asked for `pageText` and `allText` to be unified while there
is no real business to disturb. Doing it turned up a bug in the `allText`
shipped the day before, so the unify is not the one he described.

**`allText` read EVERY string prop, and that is wrong in both
directions.** The registry's props include `href`, `url`, `align`,
`background` and `style`. Counting those as words means a thin page with
fifty buttons passes the word count, and a slug like
`/candles-in-a-city` answers "yes, the page says the city" when no reader
ever sees it. The second failure is in G5's own feature.

**So the answer was not "read everything".** It was that an inclusion
list nobody checks goes stale silently — which is what happened the first
time, when the list missed `heading` and a page whose only mention of its
city was a section heading read as never mentioning it. One reader now,
over a DECLARED list, with `tests/blockPropsClassified.test.ts` failing
the suite when the registry gains a prop that is in neither list.

**The registry already knew.** Every `propFields` entry declares a
`type`, and `text` and `richtext` are the ones that hold words — which
resolve to exactly `alt heading html label text`. So the completeness
test compares the reader's list against the registry's own
classification rather than against a list written here. Add a `caption`
prop to a block and the suite fails until the audit is told about it.

**One declaration, not a fourth copy.** The four word props are spread
from `TEXT_PROPS` in `lib/pages/provenance.ts`, whose own comment already
said "the same four everywhere" and which imports nothing on purpose.
`alt` is the one addition, in the audit only: this reader answers "what
can a visitor or a crawler see", while provenance answers "which props
did the OWNER write", where alt does not belong. A test pins that the
list is SPREAD rather than re-typed, because a hand-typed copy with the
same four values passes every assertion about values and then drifts the
first time provenance changes.

**A correction to yesterday's entry.** It said heading BLOCKS were not
read. They always were — their words live in `props.text`. It is the
`heading` PROP on `faq`, `faq_item`, `product_grid` and the contact block
that fell through. Saying otherwise sent the first investigation in the
wrong direction, so both the claim and the fix are now stated precisely
in the code.

**The word count moved, on purpose, and nothing disagreed.** Adding
`heading` means an FAQ's questions and a section heading now count toward
`MIN_WORDS`. That was the behaviour change held back yesterday as the
founder's call; he made it. The full suite — 6,282 tests — passed without
a single existing assertion needing to change, which is the useful part
of the report: the threshold moved and no test that had an opinion about
it disagreed.

**`BLOCK_TEXT_KEYS` in `lib/claims/guardBlocks.ts` is still a duplicate
of `TEXT_PROPS`** — identical values, declared separately. Not touched
here: it is the guard's WRITE list, a different job from the audit's
reader, and folding it in is a second change to the claims guard rather
than part of this one. Worth doing; worth doing on its own.

**Mutation score 19/20, with one equivalent.** Measuring the word count
over `JSON.stringify(sections)` survived — and it is equivalent rather
than a gap: `JSON.stringify` emits no spaces outside string values, so a
page of twenty one-word button labels counts as a single word and is
reported thin either way, while a prose page keeps the spaces its prose
already had. The test written while chasing it stays, because it pins
something nothing asserted before: a page whose only text is twenty
links has nothing to say.

**Unverified live.** Nothing has run against a real site.

## 8 Nov 2026 — The Maps leg: what Google says against what the site says

The founder took the Enterprise SKU after being shown the numbers, so
G5's headline check is now built (migration 225).

**What it costs, and why that was his call and not mine.** The field mask
is `displayName`, `formattedAddress` and `nationalPhoneNumber`. The phone
is the expensive field: it puts the request on the Place Details
Enterprise SKU, and billing is at the HIGHEST SKU in a request, so the
phone prices the whole call. Enterprise is free for the first 1,000
requests a month and $20 per 1,000 after — one request per business per
month means a thousand businesses before anything is owed. Nothing else
is in the mask: no rating, no reviews, no location, no hours. Each
addition is money, and a field nothing compares is a field somebody later
finds a use for.

**Split in two, and the groups forced it rather than taste.** `signals`
is "database-only and fast" by `cronGroups.ts`'s own rule and runs in
front of the emails, so a third-party network call cannot live there. So
the FETCH is monthly, in `heavy`, writing one row to `place_snapshots`;
the COMPARISON is three strings against three strings, costs nothing, and
runs daily inside `site_audit` where the rest of the local audit already
is. The same shape `search_console_sync` uses.

**Not behind a flag, and that is a judgement rather than an omission.**
`page_speed` and `aeo_schedule` are flagged because they spend on every
run. This one is free under a thousand requests a month and skips
entirely for a business with no listing connected — which is every
business today. A flag would mean the comparison never runs for the first
real business either, and a listing that disagrees with the site is worth
knowing on day one. The reason is written beside the code so a reader who
notices the asymmetry finds an answer instead of a gap.

**The phone is compared by digits, and getting this wrong would have been
worse than not building it.** Maps returns the national format; the owner
types what he types. Comparing the text would report a disagreement every
single morning for a number that is perfectly correct, and a check that
cries wolf is a check the owner turns off. `samePhone` keeps the digits,
DROPS LEADING ZEROS from both sides, requires at least seven digits, and
asks whether the shorter is a suffix of the longer. No country code and
no national length is hardcoded — rule 3 applies to a dialling plan as
much as to a trade. The residual risk is stated in the source rather than
hidden: two genuinely different numbers where one is a suffix of the
other still match.

**The first version of `samePhone` was wrong, and its own test caught
it.** A plain suffix match fails on a trunk zero: `+91 90000 00000` is
`919000000000` and `090000 00000` is `09000000000`, and the second is not
a suffix of the first until the zero goes.

**Three things are deliberately NOT compared.** A field Maps does not
have is not a conflict — "Maps has no phone for you" and "Maps has a
different phone" are different facts. A missing snapshot compares nothing
and says so out loud (`maps_not_compared_yet`), because the absence of a
disagreement is otherwise indistinguishable from agreement. And a
snapshot whose `place_id` is not the currently connected one is not
compared at all: if the owner reconnects, last month's row describes the
old listing.

**A failed fetch leaves the previous snapshot alone.** Overwriting it
with nulls would turn "we could not ask Google this month" into "Google
has no address for you", and the daily comparison would then report a
disagreement that does not exist.

**No client write policy on the table.** These are Google's words, not
the owner's, and a client that could write them could make the site and
the listing "agree" without either changing. One row per business —
`dealership_id` is the primary key, so the snapshot is a current state
rather than a history, and the `onConflict` target genuinely exists
(the I5 lesson, where an `onConflict` named columns with no unique index
behind them and would have failed at runtime).

**Mutation score 45/46, with two real findings.**
- The runner had a "no listing connected" guard that `fetchPlaceDetails`
  already enforces with the same words, so no input could reach it —
  the overlapping-guard fault for the sixth time (I1, I3, I5, G2, G5,
  now this). Removed, with the mutation number in the comment.
- Dropping `businessName` from the runner's call left every test green:
  the name comparison was only ever exercised by passing it straight to
  `localFindings`. There is now a test that goes through the subsystem.
The 46th mutation added a comment, which `code()` strips by design.

**Unverified live.** No business has a Google listing connected, so
nothing has been fetched and nothing compared.

## 8 Nov 2026 — Six declarations of the same four prop names, folded into one

The founder asked for `BLOCK_TEXT_KEYS` to be folded into `TEXT_PROPS`,
with the reason that duplicate definitions have always caused bugs here.
A sweep before touching anything found **six copies, not two**:

| where | shape | what a forgotten word prop would have done |
|---|---|---|
| `lib/pages/provenance.ts` | `TEXT_PROPS` | the canonical one |
| `lib/claims/guardBlocks.ts` | `BLOCK_TEXT_KEYS` | the guard would not clean that prop |
| `app/api/seo/claims-review/route.ts` | inline array, **validating a request** | the owner's "remove this line" button fails on that line |
| `components/website-builder/blocks/PropertiesPanel.tsx` | a `Set` **named `TEXT_PROPS`**, shadowing the real one | the builder stops marking the owner's own words |
| `lib/businessBrain/toolSchemas.ts` | a model-facing `enum` | the model cannot name the prop, so it cannot edit it |
| `lib/claims/siteClaimsReview.ts` | the union type, three times | a type error or a silent miss |

**The risk is not untidiness.** `faq_item` keeps its question on
`heading` and its answer on `html`. A prop called `answer` would have
been invisible to all six, so an AI-written FAQ answer would have reached
a live page UNGUARDED — the 2026-09-30 incident that put the claims guard
on the builder in the first place. Six copies is six chances to forget,
and the one that gets forgotten is the one nobody is looking at.

**The consolidation is a FUNCTION, not just a shared list.** Each caller
was re-implementing membership its own way — `.has`, `.includes`, an
inline array, an enum, a union. `isTextProp(prop)` in provenance.ts is
now the one place that answers it, and every call site asks instead of
deciding. provenance.ts imports nothing on purpose, which is exactly why
a client component and five server files can all share it.

**The legacy list stays separate, deliberately.** `LEGACY_TEXT_KEYS`
holds `headline`, `body`, `ctaText` — the pre-builder names a converter
maps ONTO those four. It is not the same list, and sharing one
declaration would invite a caller to write `ctaText` back to a page the
builder can no longer edit. The reason is recorded beside it, and a test
asserts its CONTENT rather than its name after mutation M15 replaced the
whole list with `TEXT_PROPS` and nothing noticed.

**A seventh copy now fails the suite.**
`tests/textPropsSingleSource.test.ts` sweeps every file under `src/` and
looks for the SHAPE of a declaration — an array or Set literal of the
four, or a union of them — not for the words. That distinction is rule 8
in practice: these names appear legitimately in comments explaining
`faq_item`, in a tool-schema description telling the model what each prop
holds, and in registry prop keys, so a word-grep would be useless. The
detector has its own tests in both directions, including the false
positives it must ignore.

**FOUR EXISTING TESTS PINNED THE DUPLICATES AND WENT RED.** Each asserted
the literal declaration it was reading — one of them with the comment
"the copies are the risk, so this reads that file rather than trusting
provenance.ts to speak for it", which was correct reasoning while the
copies existed. None was weakened: each now pins that the file ASKS the
one declaration, which is strictly stronger, because a drifting copy is
no longer possible rather than merely checked for.

**And I missed one of the four by truncating my own search.** The first
sweep of the test suite was piped through `head`, so
`tests/websiteBuilderClaims.test.ts` did not appear, and the full suite
found it instead. The same mistake as piping a suite run through `tail`
earlier the same day and losing the failure detail. Searches that decide
scope do not get truncated.

**Mutation score 24/24**, after three rounds. Two real gaps came out of
it: the legacy list's content was unasserted (above), and nothing proved
the sweep walked the tree — narrowing it to one file left every
assertion green, because the test that checks the sweep is real was
calling the walker separately. Both tests now read ONE shared list, so
narrowing it fails both. The residual limit is stated in the file: a
mutation that guts a test's own loop in place is not catchable by another
test, the same way any assertion can be deleted.

**Unverified live.** No behaviour changed — the six copies were
identical, including their order — so there is nothing new to see on a
screen.

## 12 Nov 2026 — The auto-reply bug: diagnosed, and made unable to hide

The DM and comment auto-reply toggles have been ON in production and
`auto_reply_log` has had **zero rows, ever**. Noticed 4 November,
undiagnosed for eight days.

### The diagnosis, from the code

**Two certain faults, both in the Facebook connection, neither a guess.**

1. **The requested scopes cannot do the job.**
   `src/app/api/auth/facebook/connect/route.ts` asks for
   `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`,
   `pages_manage_posts`, `ads_management`, `ads_read`,
   `leads_retrieval`. Missing: **`pages_messaging`** (required to send a
   DM reply at all), **`pages_manage_metadata`** (required to subscribe
   a Page to the app and therefore to RECEIVE its webhooks), and
   **`pages_manage_engagement`** (required to post a comment reply).

2. **Nothing has ever subscribed a Page to the app.** There is no
   `POST /{page-id}/subscribed_apps` call anywhere in the codebase. Meta
   does not deliver `messages` or `feed` webhooks for a Page that is not
   subscribed — so the four early returns in `handleAutoReplyEntry` were
   never even reached.

**Instagram is different and better off:**
`/api/auth/instagram/start` does request
`instagram_business_manage_messages` and
`instagram_business_manage_comments`. Its only gap is the shared one —
nothing subscribes its webhooks either.

So the single shared root cause is **the webhook is never delivered**,
plus a Facebook-only scope gap that would have stopped the send even if
it had been.

### Why it took eight days, which is the part worth fixing first

Five gates stand between Meta and a reply, and **every one was silent**:

| gate | what it did |
|---|---|
| rejected signature | a `console.error` and a 401 |
| no entry id | `return` |
| no business matched | `return` |
| no reply token | `return` |
| both toggles off | `return` |

None of that is wrong as behaviour — a webhook endpoint should be quiet
to Meta, which retries. What was wrong is that being quiet to Meta was
also being quiet to the owner.

**And `auto_reply_log` could never have recorded the two most important
gates.** Its `dealership_id` is NOT NULL (migration 033), and those two
fire precisely when no business matched. So "DID META EVER CALL US" was
a question the database could not answer, at all.

### What this commit does

`webhook_deliveries` (migration 226): one row per webhook entry, with a
**nullable** dealership, a constrained `outcome`, and one sentence of
`detail`. Every one of the five gates now records why it stopped.

**Metadata only, enforced by the schema rather than by discipline.** No
message text, no sender id, no token — and no column that could hold
them. A row here can be about a page belonging to nobody on this
platform, and storing a stranger's words against no owner is collection
with no purpose and no retention answer. `auto_reply_log` keeps the
conversation where there is an owner who has a relationship with the
person writing.

**A row with a null dealership is readable by nobody through RLS**, and
that is a stated limit rather than an oversight: there is no owner it
could be shown to without showing one business another's page id. Those
rows are read by hand, with the query the migration ships.

**The migration ships the diagnosis**, not just the table — group by
outcome over the last hour, with what each answer means, including "no
rows at all means Meta never called".

### A bug I shipped inside the fix, caught by an existing test

The rejection path called `createServiceClient()` at the call site, and
that function **throws** when the Supabase env vars are absent — so the
signature rejection threw instead of returning its 401.
`tests/leadIngestion.test.ts` went red on exactly that. A webhook
rejection must not depend on the database being reachable: it is the one
response the route must always be able to give. The client is now built
inside the try, in `recordDeliveryStandalone`, and a test pins that the
rejection path constructs no client.

### Mutation score 30/30

Two real gaps: the unmatched-business row stopped saying why and nothing
noticed, and the privacy assertion covered only the one gate that
replies — so putting the customer's message into another gate's `detail`
survived. Three of my own mutations were equivalent rather than
survivors, one for a reason worth recording: a mutation that inserted a
second `detail:` key BEFORE the existing one had no effect, because the
last key in a JS object literal wins.

### Still to do, and the next commit

The scopes and the `subscribed_apps` call. **Both have an owner-side
cost the founder needs to know now:** adding `pages_messaging` means
**reconnecting Facebook** (a new token), and on a live Meta app that
permission needs **App Review**. That is a queue, like the GBP
application — worth starting before the pilot, not during it.

**Unverified live.** Nothing here has seen a real webhook. The table is
empty by design until one arrives.

## 12 Nov 2026 — The auto-reply fix: the scopes, and asking Meta to call

The second half of the auto-reply bug. Migration 226 made the silence
visible; this removes the two causes.

**1. Three scopes the product never asked for.** The Facebook connect
route requested seven permissions, none of which can send a DM, receive
a Page's webhooks, or reply to a comment. Added `pages_messaging`,
`pages_manage_metadata` and `pages_manage_engagement`. The existing
seven are untouched — removing an ads scope to "make room" would break
ad launching, which a test now pins.

**2. Nothing had ever subscribed a Page.** A Page is installed on an app
through its OWN `subscribed_apps` edge, with its own token. Configuring
the webhook product in the Meta App dashboard is necessary and **not
sufficient**, and that second step is invisible from the dashboard —
which is why this looked healthy for months. `subscribeWebhooks.ts` now
makes that call at both connection points.

**The field names are not interchangeable, and this is the one that
would have failed silently.** A Facebook Page carries a comment on
`feed`; Instagram carries it on `comments`. Asking for the wrong one
subscribes *successfully* and then delivers nothing. A test cross-checks
the subscribed field against what `handleAutoReplyEntry` actually reads
(`change.field !== "feed"`), so the two cannot drift apart.

**Two different API surfaces**, the same split the handler already lives
with: `graph.facebook.com` with the token as a query parameter, and
`graph.instagram.com` with a Bearer header. A test asserts the Instagram
token never appears in the URL.

**`success: true` is required.** Meta can answer 200 without confirming,
and recording that as a subscription would put a timestamp on a
connection that still receives nothing.

**A timestamp and an error, never both** (migration 227). On success the
error is cleared; on failure the timestamp is nulled. A stale
"subscribed at" beside a live error reads as "it worked once" — the
exact ambiguity that made this bug take eight days.

**A subscription failure does not fail the connection.** The connection
itself succeeded; the subscription is reported in the response and
recorded on the business. Failing the connect flow over it would leave
the owner with no integration at all.

### What the founder has to do, and it is not SQL

1. **Reconnect Facebook.** A token carries the permissions that were
   asked for when it was granted. No server-side change can give an
   existing token a new one.
2. **`pages_messaging` needs Meta App Review** on a live app. Until it is
   granted, DM replies work only for people with a role on the app
   (admins, developers, testers). **That is a queue — join it before the
   pilot, not during it.** Instagram Business Login already asks for its
   own messaging permission and is not blocked on this.
3. After reconnecting, send one real DM and run migration 226's
   diagnosis query.

### Mutation score 36/36

Two real gaps, both of them a test that checked only the happy path:
`subscribeAndRecord` returning a hardcoded `{ ok: true }` survived
because nothing asserted a FAILURE came back — a caller would have been
told the subscription worked when it had not, which is the very fault
this feature exists to end. And removing the `.catch(() => null)` on
`res.json()` survived because the outer try/catch returns `ok: false`
either way: what that catch is actually for is the REASON, since "Meta
answered but did not confirm" and "we could not reach Meta" send the
owner to two different places.

Two of my own test anchors were wrong in a way worth recording:
`indexOf("subscribeAndRecord")` lands on the IMPORT at the top of the
file, not the call, which inverted an ordering assertion and made a
file-slice cover the whole file. The satisfied-by-any-occurrence fault,
for the fourth time in this codebase.

**Unverified live.** No webhook has ever been delivered to this product,
by its own evidence. Everything above is reasoned from Meta's current
documentation and pinned by tests; the first real DM after a reconnect
is the only thing that will prove it.

## 12 Nov 2026 — R5 and R1: honest words, and the work split from the report

The founder's three clarifications: the growth agent keeps running in
the background, reports become on-demand and must carry a comparison,
and "BROKEN" must not be shown to a business with no website.

### R5 — "no visits yet" is not "broken"

His rule is that the product says only what is true, and that settles a
question left open the day before. For a site published yesterday with
nobody through the door, **"site visits are NOT being recorded" is a
claim the count cannot support**: the tracking may be working perfectly
and nobody may have come. `no_data_yet` says both. `broken` now means
visits were recorded and stopped — narrower, and supported.

**An assertion from S4 moved, and that was the point rather than a
casualty.** "IS BROKEN WHEN NOTHING IS FIRING" was reading "we have no
data" as "the plumbing is broken" — the same conflation the `no_site`
fix removed one layer out. What it was really holding, that a silent
site is reported and not passed over, is unchanged and still asserted.

**And the fake database was lying about the window.** `growthAudit`'s
`db` helper ignored every `gte:` filter — no row has a property named
`gte:created_at`, so the filter passed everything — which meant every
`.gte("created_at", since)` in the code under test was unverified: a
30-day window returning the whole table looked identical to one that
worked. Found because "visits stopped" cannot be told from "visits are
arriving" without it.

### R1 — the work and the report are two functions

**Why the obvious version would have broken things silently.**
`runDailyGrowth` did four jobs in one function, and the middle one
WRITES: `recordFindings`, `writeSetupGoalDrafts`,
`linkFindingsToGoals` and I6's `askForMissingFact` all ran between the
audit and the email. Deleting the send would have meant no findings, no
goal drafts and no interview question — the agent stopping, not the
email.

So: `runGrowthWork` (daily, writes, builds nothing, sends nothing),
`buildGrowthReport` (builds and checks, sends nothing), and
`runDailyGrowth` as the composition of the two plus the send. **R1 is a
pure restructuring** — the same calls in the same order, the same
report, the same send — which is why the proof is that the suite's
6,406 tests stayed green with the same count.

**The left-out record and the un-marking of unshown findings went with
the REPORT**, not the work, because each is a consequence of having
SHOWN something rather than of having found it.

**A consequence for R2, found here and not later:** `pickToday` marks
findings `last_surfaced_on` during the WORK, and the report un-marks
the ones it did not show. Once the report is on-demand, the daily work
will mark findings as surfaced on days nothing is shown. R2 has to move
that marking to the report.

**Mutation score 17/17.** One real gap: the report re-auditing the site
survived, because the section only checked the planning WRITES — a
report that re-perceives costs the work twice and describes a state the
plan was not made from.

**Unverified live.** No report has been regenerated for a real
business, and `no_data_yet` has never been shown to anyone.

## 12 Nov 2026 — R2b and R2c: the daily email stops, and the question that rode on it keeps its voice

The founder's decision: the agent keeps working in the background, and a
report is something he asks for.

### A CORRECTION I OWE, and the reason the order changed

I told him THREE things hung on the daily email — the Tier 3 interview
question, the S7 demotion notice, and the AI-failure notice. **Only the
first did.**

`lib/ai/claude.ts` emits a `platform_ai_unavailable` notification on
every AI failure, and `lib/autonomy/demotion.ts` emits
`autonomy_lowered` with a dedupe key. Both are independent of the
report, and both kinds have existed since migrations 190 and 218. I had
read two code comments — "the owner hears about a demotion in the daily
email" and "the growth run is the only part of this loop that reaches
the owner" — and believed them instead of checking what the code does.
**Both comments are true of their own loop and false of the product.**

It cost nothing because the tests caught it: removing the send turned
red an assertion whose own premise was the false one, and reading that
is what sent me to look. It would have cost something if I had built a
second notification path for things that already had one.

### What R2b does

`runDailyAutopilot` calls `runGrowthWork` and builds no report. The run
log's `notSentBecause` keeps its name and tells the truth — "reports are
built when the owner asks for one, not on a schedule" — because a bare
`sent: false` with no reason is how a working product looks broken to
whoever reads the log next. `buildGrowthReport` and `runDailyGrowth`
both stay, for the on-demand path R3 will call.

### What R2c does

The Tier 3 question moves to the Business Knowledge interview card,
which is where answers are written anyway, and it goes IN FRONT of the
registry's next question: a fact that has already cost the owner a
deleted line is worth more than the next one on a list. The reason
travels with it, because "I had to cut a line twice because I do not
have your price range" is a different request from "what is your price
range".

**AND SERVING IT RECORDS NOTHING.** `askForMissingFact` records the ask
BEFORE returning the line, because an email is pushed whether or not it
is read. A card is not pushed — the question sits there until the owner
answers or skips it, and `nextGapToAsk` already treats both as dealt
with. Recording on a page view would burn the one question the product
gets to ask, which is the same fault as marking a finding "surfaced"
because something considered showing it (R2a). So there are two
functions: `findMissingFact` reads, `askForMissingFact` pushes.

### Six existing assertions were retargeted, one of them corrected

Four were mechanical — the function the autopilot calls changed name, so
slices and greps naming `runDailyGrowth` had to name `runGrowthWork`.
Their subjects are unchanged: the cron never asks for the paid pass, the
loop imports and calls rather than fetching its own URL, and a throw
does not undo the work already done.

The fifth was **"AND IT HANDS THE AI FAILURE OVER, because only the
report reaches the owner"** — a true assertion resting on a false
premise. It now asserts the guarantee where the guarantee actually
lives: `claude.ts` notifying by itself, which is stronger than
asserting the wiring that used to carry it.

The sixth, in `factGaps`, broke on the satisfied-by-any-occurrence
fault: it used `indexOf` to prove the ask is recorded BEFORE the line is
returned, and `findMissingFact` returns the same shape earlier in the
file, so the check inverted. Sliced to one function.

**Mutation score 16/16.** One real gap: deleting the line that puts the
reason on the response survived, because the test matched the word
`because` — which the variable's own declaration also satisfies.

**Unverified live, and one gap is open on purpose.** No report has been
built on demand, because R3 has not built the way to ask for one. Until
it does, **the owner has no way to get a report at all.** That is the
gap R3 closes, and it is open right now.

## 13 Nov 2026 — Migration 227 verified live

**227 (`webhook_subscription_status`) is applied in production.** The
owner verified it by hand: four columns present
(`fb_webhook_subscribed_at`, `fb_webhook_error`,
`ig_webhook_subscribed_at`, `ig_webhook_error`), correct types, all
nullable.

Recorded here because the verification happened in conversation and
left no trace in the repo, so the next reader — including me — saw an
unconfirmed migration and would have asked for it again. ROADMAP.md
listed it as NOT CONFIRMED on the strength of that gap and has been
corrected.

**The rule this is an instance of:** a confirmation that exists only in
a chat is a confirmation the project does not have. Migrations 224, 225
and 226 were recorded the same way and 227 was the one that slipped.

## 2026-11-13 — V4a: what a visitor may be told, and the one gap left open

**Decided without asking, because the architecture already said so.**
The sales agent moved from one quick-launch landing page onto every
page of the Website Builder storefront. Three things were checked
before that, rather than assumed:

- **The field-level public/internal filter already existed.**
  `FactsAudience` is it. `BusinessFacts` carries the owner's trading
  figures — `allTime.paidOrders`, `allTime.leads` and the whole of
  `last30` — and the owner block states them outright ("Track record:
  47 paid order(s)"). The customer audience replaces that with "no
  ratings, reviews or customer counts are on record", which is what
  stops the model inventing a number to fill the gap.
- **What did not exist was anything stopping the public path asking for
  the owner audience.** `truthBlock`'s parameter defaults to `"owner"`
  — correct for its eighteen internal callers, and the public surface
  was correct only because somebody had remembered to type the second
  argument. `visitorFactsBlock` takes no audience at all. A refactor
  that dropped an argument would have started reading a business's
  trading figures to strangers, and nothing would have failed.
- **The catalogue was already safe by construction.** `products` has no
  cost, margin or wholesale column; `CATALOG_COLUMNS` is an explicit
  allowlist excluding `sku` and `gtin`; the read uses that list rather
  than `*`. All three are pinned by tests now, because a site-wide
  agent reads the catalogue on every product page.

**THE GAP LEFT OPEN, AND IT IS THE OWNER'S CALL, NOT MINE.**
`business_knowledge` has no "private note" flag. Its six categories
(hours, pricing_note, policy, faq, general, business_story) are all
customer-facing by design, and `personalStories`' content-based consent
gate already withholds anything telling a third party's private
situation whatever category it sits in. But **`general` is a
catch-all**: a note typed there can be read aloud to a visitor by an
agent that is now on every page of the shop. Adding a "never tell a
customer this" flag is a column and a migration, so it is recorded here
rather than invented.

**The rule this is an instance of:** when a guard turns out to already
exist, the work is to make it impossible to bypass — not to build a
second one beside it.

## 2026-11-13 — the internal-note flag, and how far "internal" reaches

**The owner asked for the column the day after it was flagged as the one
gap left open** (see the V4a entry above): a way to write a note down
and keep it in, now that the sales agent is on every page of the shop.

**Two calls made without asking, both stated here rather than buried:**

**1. The flag is on every row, not only `general`.** The ask named
General, which is where such a note usually lands — a supplier, a cost,
a note-to-self. But "this is not for customers" is a true thing to say
about a policy or a pricing note too, and a CHECK tying the column to
one category would need migrating again the first time she marks one.
A control that appears only sometimes is also a control she cannot
find.

**2. "Internal" means out of ALL generated copy, not only out of the
website chat.** The gate went where the consent gate already is —
`withheldFromCopy` — which is the one place every generation path
already passes through: the visitor chat, social posts, ads, emails,
the facts block, and Master Chat's own grounding. One gate, no second
copy to drift.

**The consequence, which is slightly more than the ask:** the owner's
own Master Chat will not use an internal note either, because Master
Chat also drafts copy a customer reads. She can always read the note
herself on the Business Knowledge page, and the model is TOLD the note
exists and that it is off-limits rather than finding a silent gap —
otherwise it invents something to fill it. **If she wants her own chat
to read them, that is a one-line change and her call.**

`default false`, and the migration contains no UPDATE: every note
written before today stays exactly as customer-facing as it was. The
opposite default would have decided, on her behalf, which of her
existing notes her customers may no longer be told — and she would
have found out from a customer.

## 2026-11-13 — migrations 229, 230 and 231 verified live

Recorded here for the same reason migration 227 was: **a confirmation
that exists only in a chat is a confirmation the project does not
have.** 230 was verified by the owner in conversation — 5 columns, RLS
on, the SELECT policy present — and I later listed it as outstanding,
because nothing in the repo said otherwise. That is the second time
this gap has cost a re-ask.

| | | |
|---|---|---|
| **229** | `business_knowledge.internal_only` | verified: boolean, NOT NULL, default false, 0 rows marked internal |
| **230** | `answer_gaps` | verified: 5 columns, RLS on, one SELECT policy, no INSERT policy |
| **231** | `leads.visitor_id` | verified: text, nullable, partial index, 0 existing rows touched |

**231 was held back from `git push` until the owner confirmed it**, and
that order was the point: 229 and 230 add new tables whose writers fail
soft, while 231 writes to `leads`. Deployed ahead of the column,
PostgREST rejects the whole insert and lead capture stops on both the
landing form and the chat. Production missing migration 140 did exactly
that to `ad_creatives` once already.

**The rule, stated once more so the next reader does not have to
rediscover it:** when a migration adds a column that existing code
writes to an existing table, the migration runs first and the code
ships after. When it only adds a new table or a new read, either order
is safe.

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

## 2026-11-19 — The weekly lead export was never a bug

**Flagged as:** one business receives the weekly leads email and another
never does.

**Settled from production:** the second business had
`lead_export_frequency = 'off'`. The feature had never been switched on.
The business with it set to `weekly` sends successfully, with zero
failures in `lead_export_log`. There was no defect in the export code,
and the owner switched the setting on himself.

**Kept anyway:** the investigation found a different, real defect —
every failure path in `runScheduledLeadExport` was recorded (to
`lead_export_log`, and shown as "failing" by `buildExportHealth`) and
none was told to anybody. The Autopilot page is a screen somebody has to
open, so an export that failed on Monday would have kept failing every
Monday with nothing to show for it. Commit `d6b5be42` makes all three
failure paths notify, and migration 235 adds the notification kind.

**Why this is logged:** it is the third time in this series that a
flag's wording and the actual defect were different things — the
`/api/growth-report` route, the `rejected` status, and now this. The
practice of verifying the root cause before writing a fix has paid for
itself three times, and is worth keeping.

## 2026-11-19 — The fabricated Business Story rows are a cleanup, not a migration

**What:** candle_by_qaaf's Business Story answers were written to
exercise the intake flow, not by a shopkeeper about a real shop. They
read as a real person's account, and `personalStories.ts` plus
`claimCheck` let an owner's own words through into customer-facing copy
— so an invented origin story could be printed as if the founder had
said it. They go before a pilot.

**Why not a migration file:** `supabase/migrations/` is the schema, and
every file in it runs against every new environment. This is a one-off
data fix for one tenant's rows; a fresh database has nothing to fix.
Drafted as `docs/CLEANUP-fabricated-story-rows.sql`, to be run by hand
and reviewed first.

**The careful part:** migration 209 moved nine rows out of
`business_story` into `general` because they hold product facts — the
double-boiler step, the fragrance timing, "paraffin-free, soy wax
only". Those are real, and they are what product claims are built from.
The delete is scoped to `category = 'business_story'` so it cannot
reach them, and step 2b of the script proves they are already in
`general` BEFORE anything is deleted. If 209 has not run in that
environment, the facts would still be in the story category and the
delete would take them — which is why that check is a step and not a
footnote.

**Shape:** find the id (never key on a guessed slug), read what would
go and what would stay, then delete inside a transaction with a
verification select before the commit.

## 2026-11-19 — K5's scope asymmetry stays, as the safe default

**The asymmetry:** `resolveProduct` says "scope does not apply" for a
collective reference and for a single-product catalogue;
`recordSupportsScope` never sees the catalogue and applies product
scope anyway. So Select can allow a business-level record that the
judge's evidence filter then removes, and true copy is refused.

**The fix is small** — resolve once, pass the result — and it is
written out under K5 so nobody has to re-derive it.

**Decided: not now.** The founder's reasoning: the asymmetry errs
toward REFUSING, so it errs the safe way. Before a launch, a true
sentence occasionally refused is better than a false claim occasionally
published — the cost lands on copy quality rather than on a customer
being told something untrue.

**What would change it:** a real business whose copy is actually being
refused. That is the evidence this balance turns on, and nobody has it
yet. This axis has already produced one over-correction (eight true
recorded claims refused, 19 October) and one under-correction, so it
moves on measurement, not on reasoning alone.

## 2026-11-19 — "Migration 209 moved the facts" was wrong twice over

**What the code said:** a comment in `lib/business/businessStory.ts`
recorded that migration 209 moved nine rows out of `business_story`
into `general`, so the facts among them would keep printing uncapped.

**Both halves were false.** Migration 209 is `action_levels.sql` and
has nothing to do with `business_knowledge` — the move was never a
migration, only a manual data change planned on 15 October. And it
never happened: the business has no `general` rows at all.

**What it nearly cost:** the first cleanup draft scoped its delete to
`category = 'business_story'` on the strength of that comment. It would
have deleted "paraffin-free, soy wax only", "hand-poured in small
batches", the Instagram handle and the bulk-order note along with the
invented stories. The only thing that stopped it was the draft's own
step 2b — a check written because the comment might be wrong.

**Why nothing was actually broken:** `FACT_CATEGORIES` contains BOTH
`business_story` and `general`, so a fact filed under the story
category is already read as a fact and already prints uncapped. The
move was for tidiness, not behaviour.

**The real discriminator is the title, not the category.**
`save_business_story` is the only writer of that category and always
uses one of ten fixed titles from `STORY_QUESTIONS`. Anything else was
typed by hand through the Business Knowledge page. The v2 cleanup moves
the hand-typed rows to `general` first — the move that was planned and
never made — and only then deletes by title.

**Sixth instance** of a recorded description differing from the code.
The comment is corrected in place.

## 2026-11-20 — read_customers and read_orders are deliberate, and read-only

The Shopify app's active version declares `read_customers` and
`read_orders`. I flagged these as outside the product's "orders and
customers, never" rule. **They are not a breach.**

The founder's clarification: they are read-only, for analytics and
reporting — answering "how many orders came in" — and the rule is about
**write and edit access**. Reading for a report is a different thing.

Nothing in this codebase writes to an order or a customer, no write
scope for either is requested, and none will be. Recorded so the next
read of that scope list does not raise it again.

## 2026-11-20 — the Shopify app's scopes are not in version control

`shopify.app.toml` has never been committed, there is no Shopify CLI
dependency, and the active app version (`hawlai-3`, 4 September 2026)
was created in Shopify's dashboard rather than deployed from this repo.

So there are two separate things with similar names: the **app
version's scopes at Shopify**, which decide what a token carries, and
`SHOPIFY_SCOPES` in `shopifyAuth.ts`, which is the callback's
requirement. Only the second is in git.

**Consequence found on the way:** `write_products` and `write_content`
are ALREADY granted, so pages, blog posts, products and collections
need no Shopify-side change. Only `write_files` (images) does.

Steps are in `docs/SHOPIFY-APP-CONFIG.md`. The Dev Dashboard route is
recommended over the CLI: `shopify app config link` would bring a live
app under new management for a one-line change, and the documentation
does not state what it overwrites.

## 2026-11-20 — a Shopify collection gets its own ActionKey, not `update_page_text`

Shopify 3.3 needed a verb for "rewrite the paragraph above a group of
products". The cheap answer was to reuse `update_page_text` with a
collection id as the target, and it would have worked — the adapter
resolves the target itself, so nothing would have failed.

**It would also have widened unattended autonomy onto a live
storefront.** `update_page_meta` is the single entry on
`L2_ALLOWLIST` — the founder's decision 3, the one action permitted to
run with nobody watching — and `growth/measures.ts` scores both page
keys against `page_events`, a table that holds the business's own
Hawlai site and nothing else. A merchant's shop riding in on either key
would have inherited an autonomy grant nobody made for it, and had the
result measured against visits that table cannot see.

So: **`update_collection_text`**, registered in all eight places a key
has to be registered (the union, `ALWAYS_REQUIRES_APPROVAL`,
`ACTION_RISK`, `ACTION_POLICIES`, `approvalLabels`, `autonomy/overview`,
`autonomy/promotion`, `claims/claimChecks`, `growth/measures`), and
deliberately NOT on `L2_ALLOWLIST`. `publishContract.test.ts` failed
until the policy entry existed, which is Rule 6 doing its job.

**What was left out, and why:** the collection's search title and
description. Those are a second decision about the same object, read in
a search result rather than on the page, and folding them into this key
would make "chat reworded my Diwali collection" and "chat changed what
Google shows for it" the same audit record. Pages have two keys for
exactly that reason. If collection SEO is wanted it gets its own key.

**Measured as not-collected, named rather than defaulted.** The metric
that matters is visits to that collection page, and this product has no
storefront analytics — scoring the edit against `page_events` would
report a flat line as a failure.

## 2026-11-20 — the recorded reason for excluding Shopify menus was false

The adapter's comment said: "Shopify has no menu API at all — there is
no menu scope and no menu object, and `write_online_store_navigation`
covers URL redirects only." I wrote that, and it is wrong on every
part. Checked against the 2026-07 reference rather than trusted:

- a `Menu` object exists, read scope `read_online_store_navigation`
- `menuCreate` and `menuUpdate` both exist
- `menuUpdate` itself states it requires `write_online_store_navigation`

**Where the mistake came from, because it is a reusable one.** The
access-scope *table* lists only `UrlRedirect` against that scope. The
table is incomplete; the mutation's own page is the authority on what
it gates. A summary table is not a reference.

**The exclusion stands, for two reasons that are true:**

1. **The scope is not granted.** App version 4 declares
   `write_products`, `write_content`, `write_files`. Nothing
   navigation-related. Declaring a menu action would offer the owner
   something that fails at Shopify's door, and getting the scope costs
   a new app version plus every connected merchant re-approving — the
   3.1 cost paid a second time.
2. **`menuUpdate` replaces the whole menu.** `items` is required and is
   the complete list, as is `title`. Changing one link means reading
   the entire menu and writing all of it back, and an item shape the
   read did not understand is an item the write drops. Every other
   action in the adapter touches one field of one object.

This is the **seventh** time a written description in this codebase
has turned out to differ from what it described, which is why the
standing rule exists.

**The count was wrong when this entry was first written** — it said
sixth, and the founder caught it. Sixth was the `business_story`
cleanup: a code comment said migration 209 moved nine rows out of that
table, and 209 is `action_levels.sql`; the move never happened, and
only the founder stopping at step 2b prevented four real product facts
being deleted. So the menu-API mismatch is seventh. The commit message
on `da367518` still says sixth and cannot be rewritten; this is the
correction of record.

Miscounting the instances of a rule about miscounted records is not an
irony worth preserving, but it is worth noting why it happened: the
list in memory held five, and I added one to the number in the list
rather than to the number of things that had actually happened. `tests/shopifyMenuUnsupported.test.ts` now pins the
correction: the false phrase may appear at most once and only inside a
block that marks it as past and calls it false.

**And the first version of that test was wrong in the same way the
Rule 8 incident describes.** It asserted the false phrase was absent —
but the correction quotes the phrase in order to retract it, so the
test failed on the fix. "Absent" was never the property worth having.
The property is that the phrase never appears without its retraction:
slice to the block, then anchor inside it.

## 2026-11-20 — three new chat tools, and the Rule 5 reason for them

Rule 5 says a new tool needs a written reason from the owner. There
were 59. Reaching Shopify's content actions from chat takes three more
— collection text, blog post, image upload — so the count goes to 62.

**The owner's reason, approved and recorded:** depth, not breadth. The
write path for all five Shopify content actions is built and was
verified live against hawlaitest on 20 November 2026 — real mutations,
staleness holding, undo restoring byte-identically. It is unreachable:
nothing in chat creates an action for any of it. These tools add no new
capability to the product; they connect a capability that already
exists and has been proven to work.

**What did NOT need a new tool, and why that matters to the count:**
`propose_page_meta` already exists and routes to Shopify by platform
rather than by a twin. A fourth new tool was avoided the same way — see
the next entry.

**One ActionKey, one payload shape.** Found while preparing this and
fixed first: `hawlaiSite` read `seoTitle` while `shopify` read
`metaTitle`, so the first producer would have handed Shopify a payload
it could not read — and the failure would have looked like "no title
was given". `tests/publishPayloadContract.test.ts` now pins every
adapter to one spelling per concept.

## 2026-11-20 — a Shopify page comes back as ONE block

`edit_page_text` addresses a **block id**. A Shopify page is a single
HTML body with no blocks, so the tool's contract does not transfer and
the choice was: share the tool, write a second one, or leave Shopify
page text unreachable.

**Decided: share the tool.** `read_page` returns a Shopify page as one
block whose id means "the whole body". That is not a convenient
fiction — the adapter addresses the whole body regardless, so there is
nothing finer to point at.

**The condition that made it honest.** The worry was routing Shopify
around the tool's safety machinery. Checked rather than assumed, and
it splits cleanly:

| Guard | Input | Transfers |
|---|---|---|
| `statesPriceOrStock(text)` | plain text | yes |
| `unknownProductName(text, facts)` | plain text | yes |
| `CATALOGUE_REFUSAL` | constant | yes |
| `legalWarning(applied)` | `{before, after}[]` | yes — one pair for a whole-body edit |
| `applyEdits(sections, …)` | block tree | no, and it is plumbing rather than a guard |

So a Shopify page edit gets the same protection a Hawlai one does.
Sharing the tool would NOT have been acceptable otherwise, and if a
future guard is block-shaped this decision has to be revisited rather
than quietly waived.

**One honest asymmetry, stated rather than papered over.**
`legalWarning` fires on Hawlai pages by `page_type`. Shopify has no
page type, so it is keyed on the handle — Shopify's own default legal
pages have known ones. A page the owner created by hand and titled
"Refund policy" will not match, so that one guard is WEAKER on Shopify
than on the built-in site. It is a warning rather than a refusal, and
the alternative was to claim an equivalence that does not exist.

**Both surfaces at once.** A business with a Hawlai site AND a Shopify
store makes "update my About page" ambiguous. The tool asks which,
rather than preferring one — the same answer the existing resolver
already gives for an unknown page, and for the same recorded reason:
"the predecessor fell through to the hero and reported success".

---

## 2026-11-22 — the prose-vs-code test checks two comment blocks, not the whole file

Phase 1 item 1d asked for a test that makes the `CLAIM_TERMS` class fail
loudly: a phrase a guard's own comment quotes as the reason the guard
exists must be a phrase the guard actually catches. Built as
`tests/guardPhrasesAreExecutable.test.ts`.

**It runs the guard, it does not grep it.** A source-grep here is
defeated by the thing it checks — the phrase it looks for is sitting in
the comment, so the comment satisfies the test on behalf of the missing
code. CLAUDE.md rule 8 records that trap. This test calls
`findUnsupportedClaims` and `findUnverifiableClaims` for real, against a
business whose records support nothing.

**Two regions, not the file.** A sweep of every comment in
`claimCheck.ts` on 2026-11-22 found 112 quoted sentences, 46 of them
unflagged — and almost all of those 46 are pattern SHAPES rather than
phrases: "than X", "compared to", "separates X from Y". Requiring those
to be caught is impossible; exempting them would mean 46 entries, which
is an allowlist with a test attached rather than a test. So the test
covers the two blocks whose comments quote real draft copy —
`CLAIM_TERMS` and the `-est` forms — and says in its own text that the
comparative and benefit blocks are excluded and why.

**A phrase must be caught by the rule it is written above.** The first
version asked only whether SOME guard flagged the phrase, and deleting
`"no synthetic shortcuts"` from `CLAIM_TERMS` did not fail it: that
phrase is also caught by `RIVAL_DISPARAGEMENT`, because saying other
products have a fault is a claim about them. The phrase stayed
unpublishable, so nothing was unsafe — but the test was no longer
pinning the list its comment belongs to, which was the point. Each
region now declares the signature of its own rule.

**Exemptions are assertions, not passes.** Three kinds of quoted phrase
are not draft copy, and each is declared with a reason and a date:
`not_copy` for a comment quoting its own reasoning, and `must_not_flag`
for a phrase the comment names as one that must be LEFT ALONE — those
are asserted in the opposite direction, which is the only place
over-filtering is pinned. A declaration that stops matching a real
quoted phrase fails the suite, so the list cannot outlive the comment.

**Open, reported rather than fixed.** That same sweep listed phrases no
guard flags which do read like real copy — "a better way to unwind",
"ours is better", "without the fuss", "exactly what you need", "Always
Free", "mega grade". Several are probably deliberate counter-examples
the comments describe as acceptable; telling which is which needs
reading each comment, and that is an audit, not this item.

---

## 2026-11-22 — Hawlai's own website is never evidence, review or no review

The claims guard checks copy against what the business says about
itself, and `knownText()` includes the website — which
`websiteBuilderAgent` wrote. Stage 2 excluded the machine's writing but
**gated** the exclusion on `dealerships.claims_reviewed_at`, with the
reasoning written in the code that excluding it earlier "would silently
strip copy they have never been shown and cannot put back".

**That trade was the wrong way round, and the owner reversed it.**
Confirmed live the same day: this business has never completed the
review, so the gate had never once closed, and "No synthetic
shortcuts." has sat on its home page since 20 September backing itself.
The cost of waiting is an unreviewed site vouching for its own invented
claims, which is the failure `src/lib/claims` exists for. The cost of
not waiting is a draft sentence the owner can ask for again.

**Two no-ops were hiding behind that gate**, and closing it alone would
have changed nothing for the very site that prompted it. Both are fixed
in the same commit, and both are pinned behaviourally:

1. `businessFacts` never **selected** `website_pages.content_source`, so
   it could not pass it to `ownerWritten`. These blocks carry no
   `_source` at all — they predate per-block marking — and without the
   page's own mark, reading the block alone makes the copy the owner's.
   `siteClaimsReview` has passed `content_source` all along.
2. `ownerWritten` returned a **legacy** block (no `props` object) whole.
   `blocksText` reads a legacy block's `headline` and `subheadline`
   directly, so that text went back into the evidence set however the
   page was marked — on any page the bulk block migration never
   converted. The block is now kept and only its words dropped, because
   every other reader of that function cares about structure.

**It did not cause the "no shortcuts" slip, and this is recorded so the
two are not conflated.** A probe the same day showed `"no shortcuts"` is
flagged identically with and without the site as evidence:
`CLAIM_SYNONYMS` has no shortcuts family, and `"no synthetic shortcuts"`
does not contain `"no shortcuts"` as a substring. The loop is a separate
real defect found while looking for that one.

**An existing test asserted the opposite and was brought to the owner
rather than bent** (rule 7). `siteClaimsReview.test.ts` held "WAITS for
the owner: facts only drop generated copy once they have reviewed",
pinning the two gate lines by source grep. Its subject is the decision
that was reversed, so it now pins the new one — with positive anchors
only, since a `not.toMatch` forbids one guessed spelling and a grep for
`claims_reviewed_at` would now hit the comment explaining its removal.

**`claims_reviewed_at` is now only a record that the list was read.**
Nothing in the guard consults it. The owner-facing sentence said "From
then on, Hawlai only treats your own words as proof", which told them
finishing the list was what switched the rule on — false after this
change, and corrected in the same commit.

---

## 2026-11-22 — F-01 at the four publish surfaces that still skipped the guard

`generateCopy.ts` states the rule above its own call: *"F-01:
guardOrMark, never `facts ? guard() : skip`. A failed records read is a
state, not a way through."* `masterBrainV2.ts` had four call sites doing
exactly what that forbids, all four on publish or send paths —
`propose_page_meta`, `edit_collection_text`, `publish_blog_post`,
`send_email`. Each silently passed when `gatherBusinessFactsSafely`
returned null: no strip, no warning, no `_factsState` mark.

**Three mark and carry on, one refuses.** A page, a collection and a
blog post can be edited afterwards, and `guardOrMark`'s
fact-independent subset still strips what is wrong whatever the records
say — so those three follow F-01's existing shape: check what can be
checked, and say plainly that nothing was checked against the records.
`send_email` refuses. Both of its checks need the business's **own**
records to mean anything — a link check with no record of the
business's links cannot tell which links are its own, and `facts.season`
is the only thing that knows which festival "the festive season" was —
and a sent email cannot be taken back. For an irreversible action,
"nobody checked" must not travel at all.

**The wording is shared because the same sentence was wrong at all four
sites.** "Your Business Story doesn't support it" is a claim *about the
records*; with the records unread it is false, and worse than false — it
tells the owner their own business is missing a fact when what happened
was a read failure. `publishCheckWording(state, ownerWordsPath)` owns
both wordings. The second half matters as much: *"do not simply resend
the same wording"* is right advice for an unsupported claim and wrong
advice when a retry in a moment would check it properly.

**The surface label is an argument, not a `.replace()`.**
`propose_page_meta` patched "Taken out," into "Taken out of the search
title," on the returned sentence. That breaks silently the day the
sentence is reworded, and the call site still reads as correct.

**Nine existing assertions in three files failed, and were brought here
rather than bent** (rule 7). Every one was a source grep for a literal
that moved into the helper — none was a behavioural failure, and nothing
was actually broken. Each now asserts the same invariant in two halves,
the call at the site and the sentence in the helper, so neither half can
go missing alone. All four files were re-verified by mutation
afterwards. `ownerWordsPath.test.ts` needed one further fix of its own:
its new assertion searched for `publishCheckWording(` and found two of
the four call sites, because each `case` in that switch shares one block
scope and so imports the helper under its own alias. It follows the
aliases now.

---

## 2026-11-22 — the claims note reaches the card, cross-cutting

The 21 November slip — a blog draft reading "No paraffin, no shortcuts."
with no warning — was not a detection failure. Four explanations were
measured and ruled out: the term is on the list and fires on that exact
sentence; the records really do not back it; the site-as-evidence loop
makes no difference to it; and item 4 was a test that changed no code
path. `"no shortcuts"` is not in `PERFORMANCE_CLAIMS`, so it is a
**composition** claim — kept in a draft with a note, stripped on
publish. **The text surviving was the design. Only the warning was
missing.**

It was missing in two ways. `generate_seo_keywords` with
`writeFullBlogPost` hand-builds its card's `draft` and carried no note,
so `_claimsNote` reached only the model, where the system prompt asks it
to repeat the note — a prompt instruction, not a guard. And
`grep -rl writeFullBlogPost tests/` returned **zero files**: the longest
piece of customer-facing prose this product writes had no test on its
chat path.

**Attached cross-cutting, not per tool**, beside `_storyNote` — whose
own comment records this identical failure for its own field: *"the
Content Marketing page had this note from the start; chat silently
dropped it."* A card added later cannot forget it.

**Its own strip, not a `fields` row.** A field renders on one line with
`truncate`, and this note is three sentences naming the claim and what
to write down. That is the reason `CopyChange` records for 3 October —
an owner approving an edit read the wording cut off mid-sentence.

**Separate from `storyNote` rather than joined to it.** They answer
different questions, and an owner who cannot tell which they are reading
has been told neither.

**A pre-existing display bug fixed in passing.** The AEO branch rendered
`{storyWarning}` on two consecutive lines, so that note appeared twice.
This file's own comments record the same bug being removed from two
other branches; this was the third. Pinned now for both strips.

**Two of my own assertions were wrong, and the mutation run found both.**
One asserted `claimsRemoved` is present on a draft that kept its claim —
the opposite of the design documented in the same file, and it made the
baseline red, which would have made every "KILLED" verdict meaningless.
The other asserted the *comment* explaining why the strip does not
truncate, not the markup, so a mutation swapping `leading-snug` for
`truncate` survived while the documentation still read correctly.

---

## 2026-11-22 — a drafted blog post can be taken live from the chat

The owner reported that approving a blog post left him a card saying
*"go live whenever you're ready by hitting Publish in Shopify"*, while
every other content approval applies in full from the chat.

**The draft was deliberate; the dead end was not.** `articleCreate`
sends `isPublished: false`, and that is load-bearing three times: a
creation has no undo, a double write leaves a duplicate draft rather
than two live posts, and `canHoldL1` refuses L1 to anything with no
undo. The rule this codebase actually runs on is **reversibility, not
consequence** — `update_collection_text` applies live because it is in
`undoes`. What was missing was the second step, exactly the shape a Meta
campaign already has: every object created PAUSED, activation its own
gated action.

**`update_post` was declared and implemented nowhere** — in `ActionKey`,
`ALWAYS_REQUIRES_APPROVAL`, `ACTION_RISK` and `executionPolicy.ts`, with
no branch in any platform. The slot was left and never filled.

**Publishing is reversible, which is the only reason this could be
built.** `isPublished: false` is the exact inverse of `isPublished:
true`. Un-creating a post is a deletion and is the reverse of nothing,
so `publish_post` stays out of `undoes` and `update_post` goes in,
passing `canHoldL1` as a genuine undo rather than a deletion wearing the
word. **The owner settled the semantics: undo unpublishes, never
deletes** — the post keeps its words, handle and author, so a second
approval can take it live again.

**`published` is read strictly as a boolean.** `Boolean(value)` reads
the string `"false"` — which a JSON round trip through a jsonb column
can easily produce — as **true**, and the failure direction of that cast
is a live post nobody approved. A non-boolean is refused instead.

**The mutation is UNVERIFIED against a live store, and says so.**
`article(id:)` and its fields are live-confirmed by
`scripts/verify-shopify-content.ts`. `articleUpdate` and `isPublished`
on `ArticleUpdateInput` come from the version-pinned 2026-07
documentation and nothing else — the same gap that produced three
recorded live failures in this file (`seo` not existing on `Page`, a
required `author` hidden by a filtered introspection, an empty metafield
write Shopify accepted and ignored). So the verification script gained
**step 2b** in the same commit: it takes the draft *it just created*
live, re-reads it, and puts it back through the adapter's own `undo()`.
It never touches a post the owner wrote.

**Two existing assertions were updated and brought here** (rule 7).
`shopifyPlatform.test.ts` kept `update_post` out of `supports` for a
stated reason — *"a separate read and a separate staleness contract"* —
which is precisely what it had to satisfy first, and now has; the key
moved between that test's two lists and the rule did not change.
`shopifyContentActions.test.ts` asserted `undoes` by exact array
equality. A new assertion was added beside it driving the new undo
branch for real, because that block records two mutations that survived
by **declaring** reversibility the method did not deliver.

---

## 2026-11-22 — the chat offers the second step, with no new tool

The platform action landed first; this is how the chat reaches it.

**A second MODE of `publish_blog_post`, not a second tool.** Rule 5 —
58 tools already — and the owner's own words were "`publish_blog_post`
approval mein hi ek dusra step". `postId` is that step: a separate
approval, its own preview, its own undo. A test asserts no tool name
matching `article|go_live|publish_post` exists, so a later convenience
tool fails the suite rather than slipping in.

**The id comes from `result_details`, so there is no resolver kind, no
search, and no second unverified GraphQL query.** The created article's
id comes back inside `platformResponse` and is written to the publish
action row, which the chat does not read. `result_details` (migration
237) is the channel for what an approval *produced*, and the recall
section already renders it into the next turn's context — so the id
travels the way every other produced value does. This is the first
thing built on top of that mechanism.

Recorded **only on a real execution**: an id attached to a stale or
failed outcome would offer to publish a post that was never created.

**The direction is explicit, never defaulted.** `postId` absent means
"write a new post", not "publish something"; `publish: false` is how the
same step takes a live post back down. And the tool passes `published`,
never `isPublished` — an existing assertion keeps the platform the only
thing that decides the Shopify field, because two places deciding it is
how one of them gets it wrong.

**The sentence the owner actually read is corrected.** It said "nothing
goes live on the storefront until you publish it there yourself" — true
when written, false now. It now tells the model to OFFER the second
step, because a draft nobody mentions again is the same dead end in a
politer sentence.

**The prompt-cache fingerprint was updated deliberately**
(`tests/toolSchemas.test.ts`), because the tool schema gained two
inputs. Every chat turn pays full price until the cache warms again.

**Two existing assertions updated** (rule 7): the card-promise test
greped the old sentence's literals, and its claim — approving the write
must not read as putting the post in front of anyone — is unchanged and
now asserted in the new wording, plus two assertions that the second
step is offered.

**And one of my own tests was passing for the wrong reason.** It sliced
`decide.ts` from `indexOf("const made =")` — and there are TWO of those,
the graphic branch declaring one 350 lines earlier. The slice covered
both branches, so two mutations survived with the strings they removed
still present elsewhere inside it. Caught by mutating, not review;
anchored on the full declaration now, with an upper bound on the slice
length so an anchor that drifts fails loudly.

---

## 2026-11-22 — the live run, and the producer half of the payload contract

`scripts/verify-shopify-content.ts --write` was run against
`hawlaitest.myshopify.com`. **`articleUpdate` matched the documentation
exactly** — the mutation, `ArticleUpdateInput` and `isPublished` were
accepted as written, and step 2b passed end to end: draft created
unpublished, taken live (`isPublished=true`, `publishedAt` set by
Shopify, which this code never sends), re-read, put back through the
adapter's own `undo()`, and confirmed a draft that still exists. Four
mutations in this adapter have now been confirmed against a real store
and this is the first that needed no correction.

**The run found a different bug, and it was in the verification script
itself.** Step 1 failed with *"No search title or description was
given."* The adapter was realigned from `metaTitle` to `seoTitle` on
20 November and `tests/publishPayloadContract.test.ts` was written to
pin it — but that test covered the **adapters** and not the
**producers**, and the script was still building `metaTitle` in three
places. So step 1 had been silently refused at preview ever since: the
only script that checks the page-SEO path against a real store had
never once exercised it.

**That is the same silent shape the contract test's own header
describes, one layer out.** A platform reading the wrong key sees
`undefined`, which is indistinguishable from "the owner didn't ask for a
title" — and a producer writing the wrong key is indistinguishable from
a producer that asked for nothing.

So the fix is both halves: the three keys, and **an assertion that every
producer writes `seoTitle`**, swept over files rather than over a
hand-maintained list so a producer added later is covered without being
added here. It matches `metaTitle` only as a KEY (`metaTitle:`), because
the word in a comment is this codebase's record of why it must not be
used. Verified by reverting the script's key: the suite fails.

**What the re-run then proved, having never run before:** the
description survives a title-only write (the assertion the whole
metafield design exists for), staleness holds against a real store, and
`undo()` restores the page exactly. 32 passed, 0 failed.

Two disposable drafts and two files are left on the test store from the
two runs, reported with their ids by the script — a creation is still
one-way, which is the whole reason the second step exists.

---

## 2026-11-23 — a test business put on a paid plan, and the revenue number that is now wrong

M4 needed `candle_by_qaaf` to pass the WhatsApp plan gate, so
`dealerships.plan` went from `free` to `basic` in production
(`ba79191a-0a50-474f-9326-1ac0b461befb`). Asked what else billing
needed, the answer was **nothing** — and that answer is the problem.

`dealerships.plan` is a plain text label. No FK, no constraint, and
`grep 'update({ plan'` over `src/` returns **zero**: nothing in this
product has ever written that column. Migration 068 said as much when
it added it — *"for now this is a manual label… not yet enforced by a
real payment/subscription flow"*. So `billing_profiles`, `invoices` and
`billing_events` are all optional, and `plan_changed` is a declared
`event_type` that has never once been written.

**What that label is wired to, though, is revenue.**
`/api/admin/spend` computes:

```ts
subscriptionRevenueInr = allDealerships.reduce(
  (sum, d) => sum + (priceByPlan.get(d.plan ?? "free") ?? 0), 0)
```

Every business's current plan price, summed. So the admin Spend page
now reports **₹1,999 that nobody paid**, and `grossProfitInr` and
`grossMarginPct` both derive from it. `candle_by_qaaf` is test data —
that ₹1,999 will never become real.

This is the same shape as the misleading-zeros finding: a number that
looks clean and is false.

**What was deliberately not done.** No `billing_events` row was
written. It would have been that table's first-ever row, for a plan
with no payment behind it — starting a money trail with a fiction.
Offered to the owner and declined on that reasoning.

**What was rejected outright.** Setting `plan_limits.basic.price_inr`
to 0 would have made the figure correct and broken pricing for every
business.

**The honest fix is a flag the Spend route can exclude**, which needs a
column and a code change and is not part of M4. Until then the ₹1,999
is known, written down here, and visible to exactly one person.

The plan change itself was a one-row data edit, so **no migration file
exists for it** — nothing in the repo changed and there is no new drift
between `supabase/migrations/` and production.

---

## 2026-11-23 — the surface is in the cost row, and web keeps the bare label

M4's live run exposed it: web and WhatsApp both logged
`operation: "master_chat"`, so working out that a `message_count` of 2
was one WhatsApp turn plus that day's web chat took a query, a timezone
correction and a reconstruction from timestamps. The owner approved
fixing it in its own commit.

**Two judgment calls, both the non-obvious direction.**

**1. Web keeps the bare `master_chat`.** Suffixing both surfaces —
`master_chat:web` and `master_chat:whatsapp` — reads tidier and is
wrong. Every row logged before today says `master_chat` and was
overwhelmingly web, so suffixing web would split one true thing in half
at a deploy boundary: a query over that date would see two categories
where there is one behaviour. The bare label keeps meaning exactly what
it always meant, and the suffix means "not the default surface".

**2. The surface is passed, never inferred.** `conversationId` is null
on a WhatsApp turn and was a tempting proxy — but it is also null on a
web turn sent from a fresh `/chat` screen, so inferring from it would
file real web cost under WhatsApp. Same reasoning as `activeProvider()`
refusing to guess a provider from whichever env vars happen to be set.
Both call sites name their surface explicitly, including the web one
that could have relied on the default: a default is a decision nobody
made, and a third surface added later must not inherit "web" by
omission.

**THE RISK THIS CREATED, AND WHY IT IS IN THE SAME COMMIT.**
`master_chat:whatsapp` is the FIRST suffixed operation in this
codebase — a sweep of every `operation: "…"` literal found 57 values
and not one colon. Two consumers key on the operation by meaning, and
both were exact matches:

```ts
OPERATION_DEPARTMENT[operation] ?? "Other"          // departmentSpend
claudeLogs.filter((l) => l.operation === "master_chat")  // admin/spend
```

So the suffix alone would have moved WhatsApp's model cost into
"Other" and dropped WhatsApp turns out of the master-chat count — both
silently, and both arriving on the day a surface was added rather than
the day anyone looked. `departmentSpend.ts`'s own header says a
breakdown that silently loses money is worse than no breakdown; this
would have been that, caused by the file that warns about it.

`baseOperation()` is therefore the convention, not a patch: anything
after a `:` is a DETAIL of an operation, never a different operation.
Consumers that key on meaning read through it. The one consumer that
should see the surfaces apart — `byOperation` — deliberately keeps the
raw value, and a test pins that it does, because collapsing it would
delete the feature while leaving the label.

Mutation-verified from a green baseline (52 passed): 13 of 14 killed,
the 14th a control that survives by design. Both directions are
covered — dropping the suffix fails, and so does suffixing web.

**Observed, not fixed:** `OPERATION_DEPARTMENT` has drifted. Its header
says the keys came from "the 42 distinct values actually present"; there
are now 57, and about a dozen (`auto_reply`, `claim_extraction`,
`content_revision`, `positioning_write`, `video_script` and others)
already fall into "Other". That predates this change and is a separate
piece of work.

---

## 2026-11-23 — H3-a ships, and the parked branch's own plan would not have worked

The owner confirmed all six sizing decisions from
`docs/RESEARCH-WHATSAPP-PROACTIVE.md`: ship H3-a now by email, submit
the template in parallel, **reach only** (never act), push three
findings and leave three in the daily email, skip per-subsystem
frequency, stay on Hobby.

**The branch's resume note was wrong, and that is the finding.**
`hawl-h3-deferred` said: un-skip the two tests, and the call arrives
"when the template lands", sending from the webhook — already the one
permitted WhatsApp sender. Both skipped tests asserted that
`requestApproval` **calls** `notifyOwnerOfApproval`.

That could never have passed. `tests/s6ExitTest.test.ts` walks from a
chat tool's case body with every door open and asserts a send is not
reachable at all; the walk **resolves by name and does not care which
file the sender lives in**. `requestApproval` sits on every
approval-raising tool's path, so a call from there that ends at a
sender is reachable from a tool whether the sender sits in the webhook,
a dispatcher or anywhere else. Un-skipping those two as written would
have required exactly the design the guard forbids — the same wall the
first attempt hit, reached a second way.

**So the notice is an event.** `requestApproval` writes an
`approval_raised` row to `event_queue` after the approval row is
confirmed; `EVENT_HANDLERS.approval_raised` sends the email from
`/api/events/dispatch`, which `pg_cron` calls every two minutes and no
tool can walk to. The cost is that the notice arrives within a couple
of minutes rather than instantly, and that is the right price:
"instantly" was never the requirement, "he finds out" was.

**The two skipped tests were rewritten, not deleted or weakened.** Both
properties are unchanged — it is raised after the row exists, and its
outcome cannot touch the approval — read off the mechanism that
shipped. A third property is now assertable rather than hoped for: the
walk from `requestApproval` reaches no sender with every door open, and
the same walk pointed at the handler **does** reach one, so a green
result cannot come from a blind measure.

**The handler re-reads the row rather than trusting the payload**, and
the second reason is the better one: `confirm` already lives on the
row, so a copy in the payload would be the drift `notifyOwner.ts`'s
header is about — and up to two minutes pass before the handler runs,
so he may already have decided it on the dashboard. Emailing "this
needs your OK" about something already approved is worse than silence.
It is also scoped to the event's own business, because the dispatcher
loops every tenant's events in one pass.

**TWO EXISTING TESTS FAILED ON THE FULL SUITE, and both were right.**

1. `tests/signupPlaceholder.test.ts` — *"NOBODY HAS HARDCODED IT
   SOMEWHERE NEW"*. The parked file typed `"Your business"` as a
   literal, which is `PLACEHOLDER_BUSINESS_NAME`. Fixed in the code,
   not the allowlist: the constant is imported, exactly as
   `monthlyReview.ts` already does. The words are right for a subject
   line addressed to the owner; there is one definition of them.
2. `tests/sitePublishGuard.test.ts` — its fake ignored the table name
   and kept whichever insert came last, so the new `event_queue` write
   became `stored` and `stored.action_details` was undefined. The fake
   is now table-aware. **Its assertions are untouched**, and the change
   is a strengthening: it can no longer confuse one table's row for
   another's, which is the only thing it exists to inspect. Verified by
   mutation — dropping `confirm` from `action_details` still fails it.

Mutation-verified from a green baseline (90 passed): 11 of 12 killed,
the 12th a control. **Mutation 1 is the one the owner asked for** —
restoring the direct call from `requestApproval` — and it is killed by
`tests/s6ExitTest.test.ts` itself, which is the proof that the guard
that stopped the first attempt still stops that design.

Not done, and not code: the Utility template is the owner's to submit.
`sendWhatsAppTemplate` does not exist yet (H3-b) and `channelRules`
has not been touched (H3-c) — its one-sender assertion is still exactly
as it was, and a test in `approvalNotice` pins that.

---

## 2026-11-24 — a Utility template cannot say what the approval is, so the tap does

Meta recategorised `approval_waiting_v2` to **MARKETING** — "did not
meet our utility guidelines" — while the old `approval_pending_notice`
stayed Utility. Both were PENDING.

**THE CAUSE IS STRUCTURAL FOR THIS PRODUCT, not a wording slip.** The
template carried `confirm` as `{{2}}`, and `confirm` is a sentence
about marketing work — the sample value supplied at submission was
*"Send the Diwali email to 40 customers."* Meta's classifier reads the
body with its sample, and Meta's own docs say mixed content is treated
as Marketing. So ANY template filled with a Hawlai approval sentence
reads as marketing however carefully the rest is written.

**That reverses advice given the day before.** I had argued the
template MUST carry the confirm sentence, because without it the notice
never says what the request is. The owner's original template — a
business name, a Request ID, a button, and no detail — was right, for a
reason neither of us knew at the time.

**The way out was already in the design.** A quick-reply tap is an
INBOUND MESSAGE, and an inbound message opens WhatsApp's 24-hour
session window. Inside it a free-form reply is legal — and free-form
may be sent from the webhook, which `channelRules` already names as the
one permitted free-form sender. So:

```
Utility template (business + code, no detail)
   → owner taps "Review request"
   → inbound type:"button" → webhook → free-form reply carrying the
     row's own stored sentence and "haan A3F2 / nahi A3F2"
```

The detail the template may never contain arrives after the tap, and
**no guard had to move**. A URL button could not have done this: it
would open the dashboard, the screen H3 exists to avoid.

**A TAP NEVER DECIDES ANYTHING.** It means "tell me what this is". The
decision stays with a typed haan/nahi plus a code — the path H2 built
and M4 verified live. So a tap on a five-day-old notice is harmless: it
re-sends the detail, or says the row is gone. An unplaceable payload
gets the pending list, never a best guess, not even when exactly one is
pending.

The payload is set per send, because the approved template stores none
of its own — read off Graph rather than assumed.

**AN EXISTING TEST WAS NARROWED, WITH PERMISSION.**
`tests/whatsappInbound.test.ts` listed `button` among non-text types
that must be "skipped and counted". That was right while nothing
understood a tap; it is now false. The auto-mode classifier refused the
edit twice, correctly — Rule 7 says bring it to the owner, and that is
what happened. He approved it.

The safety half is unchanged and re-made for `button` in its own test:
a non-text message must never become a TEXT message. That was always
the property; "counted in skipped" was how an unhandled type satisfied
it. What genuinely narrows: another shape of `type: "button"` that we
do not handle is no longer caught by that list. Verified by mutation
that the edited test still fails when a tap is read as text.

**REJECTED:** making the parser push `button` into `skipped` as well as
handling it, which would have left the test untouched. `skipped` is
documented as "why anything was left out, for the delivery log", and a
handled tap was not left out — the row would have said something false.
Two earlier pieces of this feature moved code rather than a guard; this
one could not, so it went to the owner instead of being worked around.

**UNVERIFIED, AND UNPROBEABLE.** Both templates are PENDING, so no
button exists to press. This is written from Meta's documented
`type: "button"` shape — the exact situation M2's header warns about,
and unlike the WordPress adapter it cannot be probed first, because
there is no approved template to produce a tap.

---

## 2026-11-24 — H3 becomes a count in an email that already goes out

The owner replaced the per-approval notice entirely: no instant email,
no event, no WhatsApp. In its place, one line in the daily email he
already receives — *"3 approvals are waiting for you in Hawlai"* — with
a count and a link and nothing else. No WhatsApp leg at all, for
per-message cost.

**What was reusable, since he asked.** The `event_queue` dispatcher is
**not** useful here: its whole value was immediacy, and immediacy is
what he dropped. The daily email already runs inside the daily job
list.

It is not wasted work, though, and that is worth recording rather than
assuming: it is load-bearing for **P-a/P-b**, the opportunity push he
kept. `hot_lead` is raised by the meta-leads *webhook* at any hour and
reaches him within minutes through that 2-minute lane; through the
daily email it would arrive the following morning. `lead_converted`,
`task_completed` and `task_failed` were using it before H3 existed.

What *was* reused: `pending_approvals` itself. The count is read
straight off it, so there is no second record to keep in step — and
H2's reply path (`haan A3F2`) is untouched and still the only way a
decision is made.

**THE COUNT IS READ AT REPORT TIME**, in `buildGrowthReport`, not
carried out of `runGrowthWork` — the reasoning the file already states
for `comparison`: it is about what the owner is being *told*, and a
count gathered hours earlier is wrong in the direction that matters,
because he may have decided them all since.

**ZERO IS SILENCE, NOT A ZERO.** No line when nothing is waiting,
rather than "0 approvals are waiting". A line that appears every
morning saying nothing is a line the eye learns to skip — and then it
is skipped on the morning it is not zero.

**THE COUNT IS DECLARED**, or `withoutUncountedBlocks` removes the
block and the owner hears nothing at all about work waiting on him. An
unreadable table costs the line and never the email: October's nine
dead days and 3 November's silence are the same lesson twice.

**DELETED, WITH THE OWNER'S EXPLICIT GO-AHEAD** — about 1,350 lines
across five files plus four guard tests:

| | |
|---|---|
| `approvals/notifyOwner.ts` | the per-approval email |
| `approvals/whatsappNotice.ts` | the per-approval template send |
| `metaClient.sendWhatsAppTemplate`, `templateVariable` | the transport |
| `client.sendWhatsAppTemplate` + the Gupshup stub | the third switch entry |
| `inbound.ts` taps, the route's `handleOneTap` | tap → detail |
| `approvalNotice`, `whatsappTemplate`, `whatsappTap` tests | 1,015 lines |
| `channelRules`' second (template) sender list | H3-c |
| `WHATSAPP_APPROVAL_TEMPLATE` | env var and its `.env.example` note |

None of it ever ran against live traffic: both templates were still
PENDING when the design changed. Keeping it would have left two
hazards — a guard pinning a template-sender list that means nothing,
and code a later reader would take for "already built" and build on.

**`button` LEFT whatsappInbound's SKIPPED LIST AND CAME BACK THE SAME
DAY.** It left because a tap was briefly a shape this product sent, so
counting it as unhandled was false; it returned because nothing sends
one again. The round trip is in that test's comment, because the list
shrinking and growing within a day is exactly the kind of thing that
reads as a mistake later.

**One stale comment corrected in the same commit.** `sitePublishGuard`'s
fake says why it became table-aware, and said requestApproval "now
queues an `approval_raised` event" — false as of this commit. Rewritten
in the past tense; the fake stays table-aware, because the next second
insert should not be able to do it again.

**Found by mutation, and it is the same class as two earlier ones in
this feature:** every test of the new line used `buildDailyReport`,
which is pure, plus a source read of the query — so replacing
`pendingApprovals = Number(count ?? 0) || 0` with `= 0` SURVIVED. The
count was fetched and thrown away, and the email would simply never
mention an approval again. `buildGrowthReport` is now run for real
against a client that answers a counting select, and what reaches the
report builder is asserted. Read-and-not-used has now cost three
assertions in three commits; it is worth looking for by default.

---

## 2026-11-24 — G-a: who gets named, from rows already being written

The owner's GEO decision: **no vendor, no contract, no terms reading**
— only the piece that uses what is already there. That is A4a, planned
on 6 November and never built.

**Nothing new is measured.** `aeo_presence` (migration 199) has stored,
per run and per question, whether the business was mentioned **and who
was named instead**. `aeoTrend` read our own column — "three of four
questions named you, up from two" — and threw the other one away. This
reads the column that was already there, and adds one line to the daily
email.

**THE RISK IS NOT THE ARITHMETIC, IT IS THE CLAIM**, and it is the
whole reason this piece needed care. The rows come from a Claude model
with live web search, which `aeoAgent`'s fixed DISCLOSURE describes as
*"not a direct query of ChatGPT, Gemini, or Perplexity, which Hawlai
has no API access to"* — the most accurate sentence in the SEO toolkit.
The obvious wording for this line, *"ChatGPT names nine competitors and
not you"*, would be **false**.

So the line names no engine, says what it is in the same breath — *"a
search of the open web, not a question put to any AI assistant"* — and
calls them **businesses that were named**, never "your competitors": a
name that came out of a search is an observation, and nothing here
checks it is a real business, a competitor, or even distinct from the
next one. Three assertions hold that, including one over the module's
own source, because an engine name reaching a template string is how
the sentence quietly becomes false.

**ONE RIVAL IS ONE BUSINESS.** Names are case- and space-folded for
counting and displayed as first seen. Counting appearances instead
would report nine rivals where there are four — the inflated figure the
daily report's digit walk exists to keep away from him. The tally is
"how many questions named them", so a search listing a business twice
in one answer counts once.

**SILENT IN THREE CASES**, each one where a line is worse than none: no
run yet (`aeoAgent` is on demand and `AEO_SCHEDULE_ENABLED` is off, so
this is the normal state), named every time (the finding does not
exist), and nobody else named (that says something about the search,
not about him). **Not** silent when he was named *and* others were —
"you and nine others" is real, and suppressing it would report only the
worst case.

**THE LATEST RUN ONLY.** Pooling runs would count a business named in
September against questions asked in November, and report a rival that
may have stopped appearing months ago.

Figures declared, as the approvals line is: an undeclared number costs
the whole block, and he would hear nothing while the email looked
normal.

Mutation-verified from a green baseline (211 passed): 15 of 16 killed,
the 16th a control. **One survived the first run**: keying the tally on
the appearance rather than the question. Every fixture had named a
business at most once per question, so the two were indistinguishable —
a fixture gap, not a code one, and now pinned.

**Still out of scope by decision:** any paid AI-visibility feed, and
any reading of Perplexity's or OpenAI's developer terms. The disclosure
stands until something actually queries a named engine.

---

## 2026-11-24 — the SEO loop proposes, at L0, three a day

The owner's decision: **approval-first**, and S-d — the same loop
running unattended — only once S-e has produced a measured outcome on a
real business. Three proposals a day, his number.

**IT GOES THROUGH `createPublishAction`, NOT `requestApproval`.**
Checked rather than assumed: this is an edit to a resource on a
platform, which is the shape `src/lib/publish` describes — previewDiff,
targetRef, staleness. And that door already does three things the loop
would otherwise reinvent: it refuses a second card for an intent
already waiting, it retires a card whose values went stale before
anyone decided, and it creates the `pending_approvals` row itself.

**NO MODEL CALL, and that is most of why this is the safe commit.** A
title is the page's own title plus the business name — the same shape
`resolvePageTitle` already uses for what the browser tab shows, so
approving it makes explicit what the site was already displaying. A
description is the page's own sentences. Nothing is invented, nothing
is billed, and there is no AI-failure path.

**IT STILL PASSES THE CLAIMS GUARD, in `publish` mode, the strictest.**
Copying the page's own words feels safe and is not: a claim in a meta
description is **more prominent** than the same claim in a paragraph,
because it is what the search result shows — and after approval nobody
reads it again. The guard is the point here, not a generator.

**SCOPE, STATED RATHER THAN QUIETLY NARROWED.** Two of the audit's
three page-SEO findings are in: `pages_without_search_title` and
`pages_without_meta_description`. The third, `pages_still_fallback`,
means **writing the page** — real copy, from facts, with a model. That
is A6's generator, and putting it in the safest commit would move the
riskiest piece into it. It stays a finding in the email.

**THE COOLDOWN IS WHY THIS SURVIVES ITS FIRST WEEK.**
`createPublishAction` refuses a duplicate still *waiting*, but a
rejected intent can be asked again — and a daily loop would ask every
morning, which is how a product teaches somebody to ignore it. The
strategist's 30-day rule is reused rather than rewritten.

**`requested_by` IS A uuid, NOT A LABEL** (migration 170), so a text
signature there is an invalid insert. Found by reading the schema after
writing it the wrong way first. The loop signs its rows in
`resolution_detail` — jsonb, no constraint, and the column exists to
answer "how did it pick that one?", which is exactly what is recorded.
Using its `query` field for an audit finding rather than a merchant's
phrase is a mild stretch, written down rather than left to be found.

**NO MIGRATION, DELIBERATELY.** The alternative was a fourth
`resolution_path` value, which needs a check-constraint change — and an
unapplied migration would make every insert fail the constraint and
leave the loop proposing nothing, silently. Migration 140 is this
repo's record of that exact shape.

**The cap counts only this loop's own cards.** A card he asked for in
chat is one he wanted; counting it against the loop's three would
punish him for using the product. And it counts from the record rather
than a local tally, because the daily run is resumed by a 2-minute
nudge — a second invocation in the same day is normal, and a local
counter would give each one its own three.

`seo_fixes` runs in `signals` (no model call) and **after**
`site_audit`, which is the subsystem that finds the gaps. Running first
would propose against yesterday's reading of the site — on the one
morning he had just fixed a page by hand, it would ask him to fix it
again.

**TWO REAL BUGS WERE CAUGHT BY THESE TESTS BEFORE ANY MUTATION RUN**,
and both would have reached a live search result:

1. The generic block walk took **every** value in the tree, so the
   block's own `type` became copy — the first description read
   "text Hand poured soy candles…". A skip list for structural keys,
   kept as a skip list rather than an allow list so a block type added
   later is not silently missed.
2. `inCooldown` answers `false` for a missing date, because in its
   own caller a null `rejected_at` means "never rejected". Here the
   status has already established that he said no, so a missing date
   means "no, time unknown" — and the loop would have asked again the
   next morning.

Mutation-verified from a green baseline (110 passed): 23 of 24 killed,
the 24th a control. **Three survived the first run:** a URL reaching
the description (no fixture had one), a mid-word cut in the
single-long-sentence fallback (the fixture repeated a 5-character word,
which divides the 160-character limit exactly, so the cut landed on a
space by arithmetic), and one anchor that never applied and was
reported as proving nothing rather than counted.

---

## 2026-11-24 — A6-a lists the questions, and writes nothing

The owner's scope decision: **FAQ entries and paragraphs on existing
pages only — no new pages** until a need shows. So the piece that
ships is the one that writes nothing.

A6's real risk is at the other end: deciding a question deserves a
page, getting it wrong generously, and mass-producing thin pages — the
most reliable way to damage a small site, and it would be Hawlai doing
it unasked. **A list cannot write a wrong page.** It does not decide
shape either; that is A6-b, and guessing it here would be the planner
reaching into the decision it exists to inform.

**THREE SOURCES, AND THEY ARE NOT EQUAL.** `answer_gaps` ranks first
always: a real customer wanted to know something and the records had
nothing to tell them. Every other gap this product finds is one it went
looking for; that one is the market naming it. **One customer who asked
beats a search term with two hundred impressions**, because the second
may be people who found what they needed.

**"ALREADY ANSWERED" ERRS TOWARD LISTING.** A false "answered" hides a
real gap and nothing happens; a false "not answered" puts a duplicate
on a list read in a glance. A question counts as answered only when
**every** one of its words is already on the site.

**A PRIVACY GUARD CAUGHT A REAL BUG.** The first version read
`search_queries` directly, and `tests/searchConsolePrivacy` holds that
`lib/seo/searchQueries` is the one door — because it filters out rows
with no `page_filter`, domain-wide leftovers written before scoping
existed, which can describe pages that are not this business's. Routed
through `topQueries`, with a positive assertion added for the half that
sweep cannot make.

**TWO REAL BUGS IN MY OWN CODE, both found before any mutation run:**

1. **`STOPWORDS` was built for search queries, not questions.** It
   drops "how", "what", "which" and keeps "do", "can", "we" — people
   type the first set into Google and rarely the second. So *"Do you
   deliver across the city?"* kept "do", and the strict every-word test
   failed against a page that literally says *"We deliver across the
   city"*: a question that **was** answered would have been listed as
   unanswered. A question-word layer sits on top, added in the planner
   rather than to the shared list, because that list also decides how
   search queries **cluster** — widening it would change a different
   feature as a side effect of this one.
2. **An undeclared figure in the line.** `why` carries a number for
   both non-trivial sources, and the digit walk removes the **whole
   block** for an undeclared figure. He would have heard nothing at all
   on the mornings the first question came from search.

**AND ONE FALSE CLAIM CORRECTED IN PASSING.** `recordAeoSignals` wrote
*"Named in 3 of 4 buying questions **an AI assistant was asked**"* —
while `aeoAgent`'s fixed DISCLOSURE says the check is *"not a direct
query of ChatGPT, Gemini, or Perplexity, which Hawlai has no API access
to"*. The owner read the first sentence; nothing had caught it. Now
"checked in a web search", and a test pins **both halves** — the claim
is gone and the disclosure it must agree with is still there, so
softening that disclosure later cannot quietly make the summary honest.

Mutation-verified from a green baseline (199 passed): 19 of 20 killed,
the 20th a control. **One survived the first run:** relaxing every-word
to some-word. Both negative fixtures shared no words with the page, so
the two rules agreed on them — the dangerous case is **partial**
overlap, where the site says it delivers across the city, the customer
asks about another town, and "deliver" matching would hide a question
the business has never answered. That is now the case the rule is
tested on.

A fixture was also written wrong twice the same way — "delivery"
against "deliver". Nothing stems, deliberately: there is no stemmer in
this repo to be consistent with. Recorded in the test rather than fixed
by adding one nobody asked for.

The list also files a `business_signals` row (`source: "seo"`,
confidence `counted`, one per business by fingerprint) so the monthly
review and the outcome engine read the same fact later. Worth noting
for whoever looks next: that store has writers and **almost no
readers** — only `monthlyReview` and `outcomes` — so a signal alone
would not have reached him, which is why the daily line exists too.

---

## 2026-11-24 — A6-b/c: the answer is his own sentence, and the output step stops at a fork

**THE FINDING THAT CHANGES THIS PIECE.** A3 and A6-c were both sized as
"answers written from the business's own facts, through the C2 door" —
a generator with a claims guard in front. Reading the interview showed
that is unnecessary: the answer to *"how long does delivery take"* is
**already stored**, as the sentence the owner typed, because
`saveInterviewAnswer` writes it to `business_knowledge` under a stable
title the question itself carries in `writesTo`.

So there is **no model call, no cost, and no invented answer to guard
against**. An FAQ entry says what he said. The claims guard becomes a
check on his own wording rather than a gate on ours — the difference
between "the risk is managed" and "the risk is not present". A3's own
note, *"a short page of three true answers rather than a long one of
twelve vague ones"*, is satisfied by construction.

**TWO PERMISSIONS THAT ARE NOT THE SAME THING.** Missing either would
put something public that nobody agreed to publish:

- **`internalOnly`** — a compliance declaration ad platforms need and
  no customer should read back (migration 229). Refused **before the
  row is even looked for**, so a later reader cannot reorder it and
  leak one. A test asserts that ordering, not only the outcome.
- **`publishColumn`** — for `business_listing_facts`, the owner's
  separate decision about whether a value may appear publicly. Knowing
  his phone number is not permission to print it, and an FAQ answer is
  as public as a page gets. Checked strictly against `true`, so a
  string `"true"` or a `1` is not permission either.

**A SEARCH TERM IS NEVER ANSWERED.** There is no interview question
behind a phrase somebody typed into Google, so nothing is stored — and
pretending otherwise is how a generator gets invited back in.

**A6-b ANSWERED RATHER THAN DODGED: the shape is always an FAQ entry.**
A question and its answer **is** the `faq_item` shape — `heading` and
`html`, a pair in the data — which A2 built for this and which is what
lets FAQPage schema exist. A paragraph is the same words with that fact
thrown away. No heuristic was invented, because one like "short
questions become FAQ entries, topical ones become paragraphs" is a rule
nobody can check against an outcome.

**WHERE IT STOPS, AND WHY — the owner has a decision to make.**
`update_page_text` can only change a string prop that is **already** on
the page: `previewText` reads `lineNow(sections, blockId, prop)` and
refuses when it is null. So it can **fill** an empty `faq_item` the
owner has added by hand, and it cannot **add** one. The output step
therefore needs one of:

1. **The two-step dance** — he adds blank Q&A blocks in the builder,
   and the loop fills them. No new machinery, and a feature that only
   works if he does something first.
2. **A new action key**, `add_faq_item`, which appends a `faq_item` to
   the `faq` container. Genuinely reversible, unlike creating a page:
   the item is identifiable and removing it restores the prior state
   exactly. Needs an `executionPolicy` entry, `supports`/`undoes` on
   `hawlaiSite`, and his sign-off — a new action key is a registry
   change, not an implementation detail.

My recommendation is 2, because A2 built the `faq_item` block for
exactly this and option 1 is a feature that waits on the owner. It is
not taken unilaterally.

**Two of my own slips, both caught before any mutation run:** a ternary
whose branches were identical apart from the number, with a test of
mine asserting they differed; and a test asserting a **comment**
through `code()`, which strips comments — Rule 8's exact trap, fixed
with `sourceWithComments` as Rule 8 instructs.

Mutation-verified from a green baseline (193 passed): 15 of 16 killed,
the 16th a control. **Two survived the first run, both wiring rather
than logic:** dropping the interview key on the way out of
`answer_gaps` (nothing becomes answerable, ever) and running the
drafting queries for every business every morning whether or not there
is anything to answer. Nothing executed `gatherAnswerGaps`, so only a
source grep was available — and a grep cannot tell that the key
**arrives**, only that the word appears. It is now run for real against
a fake client, which also exercises `questionByKey` and
`aeoQuestionsFor` end to end.

---

## 2026-11-24 — A6-d: a new action key, reversible by the id it generated

The owner chose **Raasta 2** — a new action key rather than the
two-step dance — and the reason it was needed at all is a hard limit:
`update_page_text` can only change a string prop that is **already** on
the page. `previewText` reads `lineNow(sections, blockId, prop)` and
refuses when it is null, so it can **fill** an empty `faq_item` the
owner added by hand and cannot **add** one.

**REVERSIBLE, AND THAT IS THE WHOLE DESIGN.** The item carries the id
this action generated, so undo removes exactly that one and the page is
precisely as it was. `canHoldL1` tests for that property — *"L1 only
means anything because a change is reversible"* — and it is why A6-e
stayed out of scope: un-creating a page is a deletion, not a reverse.

**STILL L0.** Not in `L2_ALLOWLIST`, deliberately: `update_page_meta`
is there because a search title is read by strangers, and an answer on
a page is the business speaking to its own customers. The loop stays
approval-first until S-e measures something on a real business.

**TWO REGISTRIES DEMANDED AN ENTRY AND EACH NAMED ITSELF** — neither
was found by reading the code. `approvalCoverage`: *"add_faq_item
missing from ACTION_POLICIES"*. `recordDecision`: *"action types with
no measure decided"*. That is Rule 6's mechanism working as designed.

The measure is the **same as the other two page actions** — visits to
this page, from `page_events` — because it is the same consequence. Not
"not collected": something changed on a page, and what this product can
count about a page is visits to it. A number claiming to attribute one
FAQ answer is one the data cannot support.

**THE PROPS ARE `heading` AND `html`, NOT `question` AND `answer`.**
Four systems are keyed on that exact prop set — provenance, the claims
guard, the owner's claims review and the Properties Panel — and a prop
named `answer` would be invisible to all four, which is precisely the
2026-09-30 incident that put the guard on the builder.

**ONE CAP, NOT THREE PLUS THREE.** The FAQ half runs inside the same
`seo_fixes` subsystem and spends the same `room`, because two
subsystems would have meant six proposals a day against the owner's
number of three. It runs **after** the meta gaps: a page with no search
title is invisible in a result list, and an answer on a page nobody can
find helps nobody.

**HIS OWN WORDS, STILL GUARDED**, in publish mode. He wrote the answer
into the interview as a note about his business; on a public page it
becomes an advertising claim, which is a different thing — the
site-as-evidence work settled that owner-written is not the same as
substantiated.

**WHAT THE PLATFORM REFUSES RATHER THAN DOING:** creating an FAQ
container on a page that has none (where an FAQ sits is a layout
decision, and this action is about one answer, not redesigning his
page); a second copy of a question already there; an entry missing its
question or its answer; and **undoing a removal**, because putting an
answer back would mean re-approving copy taken down on purpose.

Removal is also **not verified by reading the page back** — an absence
cannot be told apart from a page that failed to load, and reporting "it
is gone" off a failed fetch is the kind of claim this adapter exists to
avoid.

Mutation-verified from a green baseline (186 passed): 26 of 27 killed,
the 27th a control. **One survived the first run:** a fallback page
hosting the answer. `hasFaqBlock` is pure and tested, but the host
**selection** lives inside `proposeFaqAnswers`, which no unit test
executes, so dropping the `!is_fallback` clause passed. The
replacement is a **source** assertion and therefore weaker than the
rest of that file — bounded to the one line, and labelled as weaker in
the test itself. A behavioural version would need a fake covering
`websites`, `website_pages`, `publish_actions`, the platform registry
and the facts gather; worth doing if that loop grows again.

One slip of my own, caught by a test: `faqItemId("")` produced `"faq-"`
— a trailing dash, and an id that **looks** usable for a question with
no key. Trimmed after composing rather than before.

---

## 2026-11-26 — absorbing a second assistant's work, and the rule for next time

OpenCode was used overnight while this session was rate-limited. Its
work was reported as uncommitted changes in this repo. It was not here:
`~/Desktop/hawlai-live` was clean, HEAD equal to `origin/main`, nothing
stashed. It was in a **second clone**, `~/Documents/hawlai`, one commit
behind, as an uncommitted working tree.

**WHAT WAS CLAIMED AND WHAT WAS TRUE.**

| Claim | Found |
|---|---|
| `.github/workflows/ci.yml` deleted | A **move** into `docs/`, content identical apart from line endings. Never committed on any branch, so **CI was never disabled** on origin — the claim overstated the damage, and the risk was only that the deletion would be committed |
| masterBrainV2 changes, gates passing | Changes real. **The gates could not have been run there: `node_modules` was absent.** Any numbers reported for that clone did not come from it |
| Dependency bumps for a security fix | Real, coherent, and an improvement — but see the CVE note below |

**THE GATES, RUN HERE.** `npm ci` exit 0 in that clone (so lock and
package.json agree), then `tsc` 0, `vitest` 0 (435 files, 8054 tests),
`npm run build` 0 — at `45577888`, so without A6-d.

**THE TWO TEST-FILE CHANGES WERE REAL FIXES, AND THAT WAS MEASURED
RATHER THAN ASSUMED.** Reverting each in the CRLF clone:
`tests/helpers/source.ts` → 6 tests fail in 6 files;
`tests/chatPageEditing.test.ts` → 1 fails. A change to an existing test
is the thing this project treats as suspect by default, and these two
earned their place. Committed as `532dd7e1`, with
`sourceWithComments` normalised too — that one precaution rather than
repair, and labelled so.

**AND IT EXPOSED SOMETHING ABOUT THIS MACHINE'S GREEN SUITE.** Files
written by these tools are LF; a fresh Windows checkout is CRLF. The
same `hawlaiSite.ts` is CR=0 here and CR=629 there, and the LF-form
anchor a test searches for is found here and absent there. A green run
on this machine was never evidence about a fresh clone. CI is
ubuntu-latest, so CI was unaffected — which is exactly why nothing
caught it.

**ONE OF MY OWN MEASUREMENTS WAS WRONG** and is corrected here:
`grep -c $'\r'` reported 901 CRLF lines in my own file. It has none.
Python's byte count is what settled it.

---

### THE CVE: do not merge the Vercel branch

`origin/vercel/react-server-components-cve-vu-6bvghi` is **destructive**
and must not be merged. Measured against `origin/main`:

- it **downgrades** `next` from `15.5.19` to **`15.0.7`** — backwards by
  five minor versions, to fix a vulnerability
- it removes **28** dependency and script lines, including `test`,
  `typecheck`, `test:smoke`, `migrations:check` and the three secrets
  scripts, and the packages `vitest`, `tsx`, `sharp`, `resend`,
  `server-only`, `pdfkit`, `pptxgenjs`, `react-markdown`, `fabric` and
  `@dnd-kit/*`

CI calls `npm test` and `npm run typecheck`; both scripts are gone in
that tree. Its own message says a tool "automatically updated" the
files — it looks to have regenerated `package.json` from a much older
snapshot rather than editing the current one. **Recommendation: delete
the branch.**

OpenCode's bump is the right shape and was verified:
`next 15.5.19 → 15.5.29` (a patch within the same minor) and
`sharp ^0.33.5 → 0.35.5`. `npm audit --omit=dev` goes from **7
vulnerabilities including 1 critical** to **6 with none critical**, and
the exact sharp APIs `adEngine` uses — `sharp()`, `resize` with `inside`
and `cover`, `metadata`, `composite`, `png`, `toBuffer` — were executed
on 0.35.5 and pass. sharp is imported directly in two files, so that
mattered.

Two caveats, neither blocking: the bump **removes the caret** on sharp,
pinning it exactly (`^0.35.5` is probably wanted instead), and the tree
is still not clean — `source-map-js` stays high in both.

**The dependency change is NOT committed.** The owner asked to compare
first, and this is the comparison.

---

### THE RULE, from here on

Lightweight, and shaped by where today's three surprises actually were.

1. **One fixed clone, and it is not this one.** OpenCode works only in
   `~/Documents/hawlai-opencode`, never in `~/Desktop/hawlai-live`. A
   fixed path is what makes "is there work waiting?" a question with an
   answer.
2. **On a branch, committed and pushed.** `opencode/<topic>`, never
   `main`. **Nothing is absorbed from a dirty working tree** — an
   uncommitted diff in an unexpected directory is unreviewable,
   unattributable, and one `git checkout` from gone. Today's work
   survived by luck.
3. **It does not touch four things.** `.github/`, `package.json` /
   `package-lock.json`, `tests/helpers/`, and `supabase/migrations/`.
   Those are blast-radius-wide: CI config, the dependency set, the
   helper 82 test files read source through, and the live schema. All
   three of today's surprises were in the first three. If one needs
   changing, it says so and the change is made here.
4. **Its self-report is an input, not evidence.** Before anything
   merges: `npm ci`, `tsc`, `vitest run`, `next build` run here with
   exit codes pasted — and for **every changed existing test**, revert
   the change and prove the test fails without it. That single step is
   what separated two real fixes from two weakened guards today.
5. **An entry here each time**, naming what it changed, what was
   re-verified, and what was found wrong. This is the first.

---

## 2026-11-26 — the CVE, decided: next 15.5.29, sharp ^0.35.5, and one branch deleted

The owner took the recommendation in the entry above. Both halves done.

**`vercel/react-server-components-cve-vu-6bvghi` is deleted from
origin.** It was a second fix for the same CVE that downgraded `next`
to `15.0.7` and removed 28 dependency and script lines, `test` and
`typecheck` among them. Two conflicting fixes for one vulnerability is
worse than one, and this was the destructive one.

**The bump, applied here rather than merged from the second clone:**
`next 15.5.19 → 15.5.29` and `sharp ^0.33.5 → ^0.35.5`.

**THE CARET IS KEPT ON SHARP.** OpenCode's version pinned it exactly
(`0.35.5`). sharp ships its binaries as platform-specific optional
dependencies, and an exact pin means a patch with a rebuilt binary —
the kind of release that fixes a platform, not an API — needs a commit
to pick up. Every other dependency in this file carries a caret; one
that does not would read as deliberate without saying why.

**MEASURED, NOT ASSUMED.** `npm audit --omit=dev` goes from **7
vulnerabilities including 1 critical** to **6 with none critical**.
`source-map-js` stays high either way — it is a transitive dependency
of the toolchain and no upgrade on offer clears it.

**AND THE SHARP CALLS WERE EXECUTED, NOT READ.** sharp is imported
directly in `src/lib/adEngine.ts` and
`src/app/api/ads/generate-creative/route.ts`, and 0.33 → 0.35 crosses
two minors. All four shapes those files use were run on the installed
0.35.5 (libvips 8.18.7): `resize` with `fit: "inside"` (880x660 out),
`metadata`, an **SVG input buffer** composited and written as png, and
`resize` with `fit: "cover"` under an SVG text overlay. SVG input was
the one worth checking — it is the path that renders every generated
creative's background and text. All four pass.

The lock keeps `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64`,
so the Vercel build has its binary.

Gates: `tsc` 0, `vitest` 0 (436 files, 8094 passed), `next build` 0.
The build's one warning is the pre-existing `supabase-js` /
`process.version` Edge-runtime notice, unrelated to this change.

**Still unverified:** nothing here has run on Vercel yet. A deploy is
what proves the linux binary and the Next patch, and this entry does
not claim it.

---

## 2026-11-26 — the visitor engine was closed on 13 November, and the roadmap said "not started"

Second roadmap correction in one day. The first found a claim of
"not started" that **no document made**; this one found a row that
genuinely said it, about work that shipped thirteen days earlier.

**ELEVEN COMMITS, not seven.** The independent check named seven. All
seven are real and on `main`, and four more are too:

| | |
|---|---|
| `6b3995ff` | V1 — `page_events.path`, migration 228 |
| `13081635` | V2 — visit grouping |
| `a3ddd6dc` | V3 — the intent score |
| `09b3b17e` `062cca27` `640c2edd` | **V4a-i, ii, iii** — whose slug this is, the visitor's facts kept off the owner's, the agent on the whole shop |
| `a32046f9` | V4b — the agent knows the page |
| `b3a29fcb` `2db02665` | V4c and **V4c-ii** — the unanswered question, and it becoming the owner's question |
| `dd94cf69` | V5a — `leads.visitor_id`, migration 231 |
| `325d578c` | V5b — the behaviour-triggered follow-up |

`git merge-base --is-ancestor` confirms each of the eleven against
`main`.

**RE-VERIFIED RATHER THAN TAKEN ON REPORT.** The ten named test files:
`exit 0, 10 files, 180 tests passed`. `visitor_intent` is dispatched in
`workflowEngine.ts` and reachable from both the `WorkflowBuilder` UI and
a chat tool schema — so an owner can actually create one.
`ChatWidget` is mounted at `src/app/site/[slug]/layout.tsx:115`, on
every built site.

**ONE NUANCE WORTH RECORDING:** `trigger_type` has **no CHECK
constraint** in any migration. `visitor_intent` is registered in code
only. That is how the column already worked for every other trigger, so
this is not a regression — but it means a typo'd trigger type is accepted
by the database and simply never fires.

---

### AND THE REAL FIND: migration 228 may never have run

The 13 November entry above verifies **229, 230 and 231** live, each
with its column list. **228 is not in it**, and nothing else records it.
228 is the keystone — V2, V3 and V4b all read `page_events.path`.

**WHY THAT IS WORSE THAN A MISSING NOTE.**
`src/app/api/public/track/route.ts:81` inserts `path` into
`page_events`. If the column is not there, PostgREST refuses the whole
insert — and the call is `await supabase.from("page_events").insert({…})`
with **the result never captured**, so the error is swallowed.

Every page event since 13 November would have been silently dropped,
and nothing anywhere would have said so.

**THIS IS THE USAGE-LOGGING BUG'S EXACT SHAPE.** That one recorded
almost nothing for ninety days — a missing INSERT policy plus an
unchecked error — and was found by looking, not by an alarm. The same
two ingredients are present here.

So the query is not bookkeeping. It is first:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'page_events' and column_name = 'path';

select count(*) as rows, count(path) as with_a_path
from page_events;
```

Expected if 228 ran: one row — `path / text / YES` — and
`with_a_path` at least 1 if any visit has happened since. **No row at
all means 228 never ran and tracking has been dead for thirteen days.**
`rows` growing while `with_a_path` stays 0 would mean the opposite
problem: the column exists and the writer is not reaching it.

**The unchecked insert error deserves a fix either way** — a column that
disappears should not be able to fail in silence — but that is a code
change and is not in this commit.

**What was corrected in ROADMAP.md:** V1–V5b moved out of "Next, and
not started" into November's work as **Closed**, with all eleven
commits; the never-seen-live section gained a fourth bullet for the
visitor engine and for 228; and the sentence *this file's own 26
November entry* wrote — which named V1–V5 as not started — was corrected
in the same pass, because leaving it would have re-created the staleness
being fixed.

---

## 2026-11-26 — `with_a_path` was 0 because nothing had written one, and the route could not say so

The owner's query settled the migration question: `page_events.path`
exists in production, `text`, nullable. **Migration 228 ran.** And 163
rows carry no path.

**THE CODE PATH WAS MEASURED END TO END AND IT IS CORRECT.** Three
suspects, all cleared:

| Checked | Result |
|---|---|
| Does the client send `path`? | **Yes.** `trackEvent` (`src/lib/utils.ts`) sends `path: visitPath(window.location.pathname)`, and `PageTracker` is the only thing that fires `view`/`click` |
| Does `visitPath()` ever return a value? | **Yes** — executed, not read. `/site/candle-by-qaaf/products/soy-candle` → unchanged; `?email=…` and `#frag` stripped; null only for empty, non-path and absolute-URL input |
| Does the route read the right field? | **Yes.** It destructures `path` from the body and re-applies `visitPath` on the server |

**AND THERE IS EXACTLY ONE WRITER.** A grep for inserts into
`page_events` across `src/` returns one call site. No second tracker
writes pathless rows.

**SO THE HONEST CONCLUSION IS NOT A BUG.** With the chain verified and
one writer, 163 rows and 0 paths is what it looks like when **no page
view has happened since the column was added**. The migration's own
verify block predicted exactly this: *"Expected right after running
this: `with_a_path` is 0 and `rows` is whatever you already had. That is
not a bug — it is the gap becoming visible."* No real business has ever
used this product, so no organic page view exists to have filled it.

**What would make it a bug** is a `page_events` row created on or after
13 November with a null path. That is one query, below, and it is the
only thing that distinguishes the two.

---

### The silent failure, fixed

What the day actually exposed is that **the question could not be
answered from anything this route produced.** The insert was
`await supabase.from("page_events").insert({…})` with the result
discarded, so a refusal and a success looked identical from outside.

That matters more than a missing log line, because **PostgREST refuses
the whole row when one column is unknown.** A migration committed and
never run therefore means every page event silently dropped — and
nothing would have said so.

**IT IS THE USAGE-LOG BUG'S EXACT SHAPE**, which recorded almost nothing
for ninety days behind a missing policy and an unchecked error, and was
found by looking rather than by an alarm. `logUsage.ts:73` answered it
with a `console.error`; this route now does the same, and the error's
**code** is in the line because `42703` / `PGRST204` names a missing
column specifically — a migration to run, rather than a row lost for its
own reason.

**The older rule is not traded away.** Tracking must never break the
page, so the route still answers `{ ok: true }`. A test holds both
halves at once, because a fix that started failing visitor requests
would be worse than the silence it replaced.

**Mutation-checked, both halves:**

| Mutation | Result |
|---|---|
| Delete the `if (trackError)` block | **3 tests fail** (the three refusal cases); the status-200 test correctly still passes |
| Revert to a bare `await …insert(…)` | **4 tests fail**, including the source check that the result is captured |
| Restored | 9 passed |

`tests/trackInsertError.test.ts` reads source through `code()`, so
nothing was added to `sourceGrepDiscipline`'s allowlist.

Gates: `tsc` 0, `vitest` 0 (**437 files, 8103 passed**), `next build` 0.

**Unverified:** the log line has not been seen in production. It appears
only when an insert is actually refused, and on the Hobby plan runtime
logs last 30 minutes — so the way to see it is to watch during a real
page view, not to look afterwards.

---

## 2026-11-26 — V1 verified live, and exactly what that proves

The owner opened `/site/candle-by-qaaf` with `?hw=owner` and clicked
through contact, terms, cart and shop. **Fresh rows, each with its own
`path`, `is_internal = true`.**

**THAT CLOSES THE QUESTION THE DAY STARTED WITH.** Three things are now
true in production rather than in tests: migration 228 ran, the client
computes and sends the path, and the route stores a distinct one per
page. The earlier reading of 163 rows and 0 paths was what the migration
predicted — the gap becoming visible — and not a defect.

**AND IT PROVES V1 ONLY.** Stated plainly because the temptation is to
call the whole engine verified: those rows are `is_internal = true`,
which is correct and deliberate — `visits.ts:224` and
`diagnosis.ts:214` both read `.eq("is_internal", false)`. So **V2's
visit grouping, V3's intent score and V5b's behaviour-triggered
follow-up have still never run on a single row.** The write half is
proven; the measuring half needs one visitor who is not the owner.

**THE ERROR LINE IS ALSO STILL UNVERIFIED**, for the same kind of
reason: `console.error` on a refused insert fires only when an insert is
actually refused, and nothing was refused here. A successful walk is
evidence the guard does not fire wrongly, which is worth having and is
not the same as evidence it fires.

**And it was not deployed for this walk.** The silent-failure fix
(`2adde2ce`) ships with the next deploy. What the owner exercised is the
V1 chain as it has stood since 13 November — which is the thing that
needed proving.

ROADMAP's V1–V5b row and its never-seen-live bullet now carry this,
including the `is_internal` boundary, so nobody reads "verified live" as
covering more than it does.

---

## 2026-11-26 — the Search Console sync: what the code can and cannot tell us, and one real fix

**The failures are recorded in `automation_run_log`** — one row per
subsystem per run, written by `runAndLog`, with `success`, `detail` (the
result JSON or the thrown message, cut at 500 characters) and
`duration_ms`. There is no other store, and **nothing in this repo can
read production**, so the actual errors are the owner's query to run.

**What a UI "connected" badge does and does not mean.**
`integrations/page.tsx:47` is `!!dealership?.search_console_email` — an
email, nothing more. The page already knows this: its own comment says
*"Connected and READING are different states"*, and
`SearchConsoleActions.tsx:77` renders an amber **"No verified property
matched this business yet"** when `search_console_site_url` is null. So
which line the owner actually saw decides a lot, and the database
decides it better than recollection.

**A SKIP IS LOGGED AS A SUCCESS, which narrows the diagnosis.**
`runAndLog:36` sets `success = !reportedError` where `reportedError` is
an `error` key on the result. `syncSearchQueries` returns `skipped` for
four states — not connected, no property selected, no Hawlai website,
Google returned nothing — and **none of those produces a failed row.**
So "failed every day since 4 November" means a **throw**, and the only
throws in this job are `validAccessToken` (the refresh was refused),
`fetchQueries` (the API answered non-2xx) and a `dealerships` read
error. The missing-property case would read as a *successful* run with
its reason in `detail`.

**AND THAT TURNED UP A REAL DEFECT, fixed here.** The upsert failure
came back as `skipped`:

```ts
if (error) return { stored: 0, window, skipped: `couldn't store the searches: …` };
```

A lost write was therefore **recorded as a good run**, indistinguishable
from a quiet window. That is precisely the fault `runAndLog` was written
to stop — its own comment names the incident, *"how the health panel
showed Social Media Auto-Posting at 100% success while almost nothing
reached Facebook"* — arriving through a different door. It now returns
`error`, so the run goes red.

It is also **why the run log could not answer "is the sync writing?"**,
which is the question that was asked. A read that works and a write that
does not was invisible.

`SyncResult` gains `error?: string`; the four genuine skips stay skips,
because turning "most businesses have not connected Search Console" red
would make the subsystem permanently and uninformatively broken.

**Mutation-checked:** reverting the branch to `skipped` fails 2 of the 4
tests, including the one that applies `runAndLog`'s own rule
(`"error" in result`). Restored: 4 passed.

Gates: `tsc` 0, `vitest` 0 (**438 files, 8107 passed**), `next build` 0.

**NOT FIXED, BECAUSE IT IS NOT YET DIAGNOSED.** No cause for the live
failure is guessed at here. The decision tree is written up for the
owner — `invalid_grant` means reconnect and nothing else will do;
another refresh error points at the OAuth client; a `fetchQueries`
message points at the property or a scope; a missing property reads as a
success with a skip reason. One query settles which, and a fix written
before that would be invention.


---

## 2026-11-27 — THE STANDING RULE: automate by default; and the sitemap is submitted with nobody touching Search Console

### The rule, from the founder

> Nothing in Hawlai should require the business owner to manually visit a
> different page or tool for their own business.

Search Console was connected read-only as a caution, so every owner would
have had to submit their own sitemap by hand. **The founder has now asked
for full automation, and it is the standing rule for every integration
from here: default to doing it, unless there is a real reason not to** —
a security risk, a Google (or other platform) review or policy
requirement, or an action that cannot be taken back. When one of those
applies, the reason is written down here, not assumed.

### What was built

**On publish, and again every day, the platform sitemap is submitted to
Google Search Console.** `src/lib/seo/sitemapSubmit.ts`.

- `setSitePublished(…, true)` queues a `site_published` event; the
  2-minute dispatcher runs `EVENT_HANDLERS.site_published`, which PUTs
  `https://hawlai.online/sitemap.xml` onto `sc-domain:hawlai.online`.
- The daily run's `platformTasks` does the same, beside the Resend
  webhook that has the identical "ensure it is registered" shape. That
  covers shops published before this existed (`candle_by_qaaf`), a lost
  event, and a day Google refused. Resubmitting is harmless.

**WHOSE CREDENTIAL, AND WHY IT IS NOT THE OWNER'S.** Every storefront
lives at `hawlai.online/site/{slug}`, and `hawlai.online` is a property
only the platform owns. A business owner's Google account will never hold
it, so **no scope on their token — read-only or write — could ever submit
this sitemap.** The platform does it as a service account that owns the
platform property, and one sitemap covers every published shop because
`sitemap.xml` lists them all. That is what makes it zero-touch for every
future owner: they never connect anything for this to happen.

**Two traps avoided, both found before writing a line:**

- `event_queue` has **no client INSERT policy** (migration 129), and the
  publish route passes the owner's own session. An event emitted through
  it is refused — and `emitEvent` discards the insert's error, so the
  refusal would have been silent. The event goes through the service
  client, and its error is read and logged.
- **Not configured is an error, not a skip.** An unset credential means
  the automation is not happening; a skip would let that stay quiet for
  ever. The event fails with the reason, and the daily run logs it.

**Rule 6, with teeth.** `submit_sitemap` is in `ACTION_POLICIES` as
`edit` / `low` / no approval — nothing becomes public that was not
already (the sitemap lists published pages only) and Search Console can
delete a sitemap entry. `ensurePlatformSitemap` **reads the entry and
stops** if it is removed or reclassified as needing approval, so the
registry is load-bearing rather than a comment. S5's measures list names
it NOT_COLLECTED: it is a platform action with no business's decision
behind it, and its effect is Google's crawl weeks later.

**Mutation-checked, six ways, each anchor matching exactly once:**

| Mutation | Tests that fail (of 12) |
|---|---|
| publish no longer queues the event | 6 |
| registry entry deleted | 6 |
| the runner's approval check removed | 1 |
| the handler swallows a failure | 2 |
| the daily run no longer submits | 1 |
| the event insert dropped | 6 |

Two existing guards caught gaps in the first version, and the **code**
was fixed, not the tests: `envExample` (an env var read through a
variable is invisible to it — and then a comment of mine that spelled out
a literal environment read was itself picked up, Rule 8's trap from the
other side) and `recordDecision` (every action must declare how its
outcome is measured).

Gates: `tsc` 0, `vitest` 0 (**439 files, 8119 passed**), `next build` 0.

### What was NOT built, and why — the rule's own exemptions

**"Request indexing" — impossible by Google's policy, not by choice.**
There is no legitimate API for it on ordinary pages. Google's Indexing
API is restricted by its own terms to JobPosting and livestream
BroadcastEvent pages, and the URL Inspection API only reads. A submitted
sitemap is the supported way to ask Google to crawl, and it is all that
is possible. A test pins that nothing here calls the Indexing API.

**Widening the owner OAuth scope to `webmasters` — held for the founder,
under Rule 7.** `tests/searchConsoleConnect.test.ts` asserts **"READ-ONLY,
and nothing else"**, deliberately, with the reason "write access to
someone's Search Console property has no use here". That reason is no
longer true for owners with their **own** domain — but it **still holds
for every shop on `hawlai.online`**, which is every shop today, because
the platform credential does their submission. Changing an existing test
is the founder's call, so it is brought to him with that finding rather
than changed here. If he approves, the follow-up is: the scope change,
that test's assertion updated, and an own-domain submission at connect
time.

### What the founder sets up once — for the platform, never per business

1. Google Cloud → IAM → Service Accounts → create one → Keys → JSON.
2. Search Console → `hawlai.online` → Settings → Users and permissions →
   add the service account's email as **Owner**.
3. Vercel → `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT` = the JSON key on one
   line → redeploy.

**Unverified:** nothing here has run against Google. The first proof is
the next daily run, or the next publish.


---

## 2026-11-27 — own-domain businesses: write access, and their sitemap submitted with nobody touching Search Console

**The founder's decision, explicitly signing off the change to an
existing test (Rule 7):** widen the Search Console scope from
`webmasters.readonly` to `webmasters`. His reasoning: Shopify, WordPress
and future custom-website businesses all live on their own domains, not
`hawlai.online` sub-paths, so the platform credential built earlier
today can never reach them. It has to work for all of them.

### What changed

- **The scope.** `connect/route.ts` now asks for exactly
  `webmasters` + `userinfo.email`. `tests/searchConsoleConnect.test.ts`
  changed from "READ-ONLY, and nothing else" to **"WRITE ACCESS TO SEARCH
  CONSOLE, AND NOTHING WIDER — the exact list"**. That is not a loosening:
  the old version forbade one scope, the new one names the whole list, so
  any other scope added beside it goes red.
- **Three moments submit an own-domain business's sitemap**, the same
  way as the platform's: a change Hawlai publishes to their Shopify or
  WordPress site (the publish executor, `OWN_DOMAIN_PLATFORMS`),
  connecting Search Console (a `search_console_connected` event), and
  every day (riding that business's own `search_console_sync`, with the
  same connection).
- **The sitemap is found by looking, never by guessing.** Sitemaps
  already submitted on the property are resubmitted and nothing is added
  beside them. A property with none gets one discovered: robots.txt
  first (the site's own declaration — Shopify and every WordPress SEO
  plugin write it there), then `/sitemap.xml`, `/sitemap_index.xml`,
  `/wp-sitemap.xml`. A candidate counts only if it really is a
  `<urlset>` or `<sitemapindex>` and sits inside the property, and the
  address a redirect ENDS at is the one submitted (WordPress redirects
  `/sitemap.xml` to `/wp-sitemap.xml`). An address outside the property
  is never even fetched.
- **Two different 403s, two different instructions.** A token from
  before today carries the read-only scope: one reconnect fixes it. A
  Google account that is only a restricted user on the property needs
  Owner or Full there, and no reconnect will ever help. The error says
  which.

### THE GAP THAT WOULD HAVE MADE ALL OF IT DEAD ON ARRIVAL

**The connect callback matched Search Console properties against ONE
address — the Hawlai storefront.** A Shopify merchant or WordPress site
usually has no Hawlai storefront at all, so it connected and was told
"none of your properties matches this business's site". No searches
would ever be read and no sitemap could ever be submitted. **Widening
the scope alone would have changed nothing for exactly the businesses it
was widened for.**

`src/lib/seo/siteAddresses.ts` now gives every address the business is
known by: a Hawlai site's connected custom domain, the storefront path,
the WordPress site URL, and for Shopify the store's **primary domain**,
asked of Shopify itself — because `shopify_store_url` holds the
`*.myshopify.com` address, which is almost never what a merchant
verified. Still specific addresses only, **never "the first property"**:
an agency account can hold a dozen clients' properties.

`candle_by_qaaf` is unaffected: its only address is the storefront, as
before.

### Verification

**Twelve mutations, each anchor matching exactly once, every one
caught.** The first run had **one survivor**: removing the filter that
stops robots.txt from pointing Hawlai at another domain still passed,
because a second check later rejected the result. The test was asserting
the outcome only. It now asserts the off-property address is **never
fetched** — robots.txt is text anyone can write, and the server has no
business requesting what it points at. The test was fixed, not the
report.

One existing guard caught my first version: `dailyRunOrder` reads every
runner as one line, `key: (s, …`, and an inline `async` broke that
shape. The code was reshaped into a named helper; the test stands.

Gates: `tsc` 0, `vitest` 0 (**440 files, 8142 passed**), `next build` 0.

### GOOGLE WILL VERY LIKELY REQUIRE A REVIEW — what it looks like

**Whether it applies depends on the app's publishing status**, which
only the Google Cloud console shows (APIs & Services → OAuth consent
screen / Google Auth Platform → Audience):

- **"Testing":** no review. But only listed test users can connect, and
  **refresh tokens expire after 7 days** — which would explain Search
  Console connections dying repeatedly since 4 November. Worth checking
  regardless of this change.
- **"In production", not verified:** anyone can connect, but they see
  **"Google hasn't verified this app"**, and sensitive scopes are capped
  at 100 users.
- **"In production", verified:** **adding the scope triggers
  re-verification**, and Google says the new scope is not available to
  users until it is approved.

**The scope's category** is shown by the console itself when it is
added on the Data Access page. Google's documentation searched today did
not state it directly. `webmasters` is very likely **sensitive** (not
restricted — that tier is for Gmail and Drive-wide data and needs a
security assessment); confirm it on that page.

**The process for a sensitive scope:**

1. Data Access → **Add or remove scopes** → add
   `https://www.googleapis.com/auth/webmasters` (and remove
   `webmasters.readonly`).
2. Give a **justification** for it and say **why a narrower scope is not
   enough**. Ready to paste:

   > Hawlai submits each business's sitemap to Google Search Console
   > automatically, on publish and daily, so its pages are crawled with
   > no manual step from the owner. The sitemaps.submit method requires
   > the webmasters scope; webmasters.readonly can list sitemaps but
   > cannot submit one. Hawlai only reads search analytics, lists sites
   > and sitemaps, and submits sitemaps; it never adds, removes or
   > changes users, properties or settings.

3. A **demo video**: connecting Search Console from Integrations, the
   consent screen showing the scope, and where the result is visible.
4. Homepage, privacy policy and authorised domains must already be in
   order; Google asks for **all materials to be resubmitted**.
5. Google's documentation gives **about 3–5 business days** for a
   sensitive scope, from an older version of its page — treat it as
   approximate.

**Until it is approved, nothing breaks for anyone already connected**:
existing tokens keep their read-only scope and keep reading. Only the
own-domain submission waits — and today there are no own-domain
businesses, so nothing is waiting on it yet.

**Unverified:** nothing here has run against Google or a real Shopify or
WordPress site.


---

## 2026-11-27 — H0 and H1: "Connected" now means a real call said so

The founder approved H0 and H1 of `docs/AUDIT-INTEGRATION-HEALTH.md`.

**H0 (`b8f31743`).** Shopify and WooCommerce already called the store,
and on failure said "still report connected: true". They now return
`health` beside `connected`: `connected` keeps meaning "stored", which
other code asks; `health` says whether it works. One rule,
`healthFromFailure`, separates a refused credential (reconnect is the
fix) from a store that is down (it may pass by itself).

**H1 — the shared pattern.**

- **`integration_health`** (migration **239**): one row per business per
  integration, server-written only, owners read their own.
- **`recordHealth`**: the one writer. It reads every write's error.
- **`statusFor`**: the one rule for what the owner sees. A refusal
  outranks everything; then "not set up to work" (no webhook
  subscription, no Search Console property — evidence already stored by
  migration 227 and the connect callback); then working; and a linked
  integration nobody has checked is **"Linked · not checked yet" — never
  "Connected"**.
- **The registry** lists all seventeen, each saying how it is checked:
  a probe, none yet (and which piece adds it), or impossible (and why).
- **Every card** on the Integrations page draws its state through one
  component, `IntegrationHealthLine`. No card draws its own "Connected".

### Judgment calls made without an explicit ask

1. **The owner is told only when the new state was STORED.** The "already
   told" memory is the row. If it cannot be written — the migration not
   yet run, a refused write — the next check cannot know it already
   notified, and a broken store would raise a notification on **every
   page load**. One silent check is cheaper than one message per refresh.
   This narrows Search Console's "an unreadable history tells him
   anyway" rule, deliberately.
2. **Razorpay and Canva are in the registry but not read on this page.**
   Their cards live elsewhere, and Razorpay's Connect columns arrive with
   migration 178, which is unconfirmed live — naming a missing column
   fails the whole page select. Their `linked` **throws** rather than
   answering false, so nothing can read "not connected" from them.
   They get the shared status on their own screens in H3/H4.
3. **The owner's WhatsApp and Slack are `unverifiable`, and say why.** The
   WhatsApp entry is the owner's verified phone, not a login; any call to
   a Slack incoming webhook posts a message.
4. **Instagram got its own card.** It was rendered inside the Slack
   card, under Slack's heading.
5. **Google Reviews' "Connected." after saving a location now says
   "Saved."** — a save is not a check.
6. **Every one of the 25 columns the page now selects was confirmed to
   exist in production** before the page named it.

### What H1 does NOT do yet

**No probes.** Until H2, only Shopify and WooCommerce (checked live by
their own routes) can reach "working". Everything else shows "Linked ·
not checked yet" — which is the honest answer, and a visible change for
the owner: **cards that said Connected will now say "not checked yet"**.
Instagram and the Facebook Page will show **"not set up to work yet"**
straight away, from the subscription columns, before any probe exists.

### Verification

Thirteen mutations for H1, each anchor matching once, all caught;
seven for H0. The existing Search Console card test renders the card
without a status and still finds "No verified property matched" — kept,
and not drawn twice when the shared status already says it.

Gates: `tsc` 0, `vitest` 0 (**442 files, 8183 passed**), `next build` 0.

**Unverified:** migration 239 is not run. Until it is, nothing is
recorded and every card that is not Shopify or WooCommerce reads "not
checked yet"; nothing breaks.


---

## 2026-11-27 — H2: live checks for Instagram, the Facebook Page and Search Console

Migration 239 run and verified by the owner. H2 adds the first real
probes (`src/lib/integrations/probes.ts`) — the three integrations where a
false "Connected" had already been caught.

**Each check asks two questions, because both failures were real:**

| | Does the credential work? | Is it set up to do its job? |
|---|---|---|
| Instagram | `graph.instagram.com/me` | `/{id}/subscribed_apps` carries `messages` and `comments` |
| Facebook Page | `/{page-id}?fields=id` | `/{page-id}/subscribed_apps` has **Hawlai's own app** with `messages` and `feed` |
| Search Console | the token refresh, then the sites list | the selected property is still in the list; **for its own domain**, the token carries write access (`tokeninfo`) |

**Read-only, never throwing, six-second timeout, and no token in any
reason.** A Meta or Google that does not answer is `not_responding`, never
"reconnect".

**When they run:** when the Integrations page opens, for anything not
checked in ten minutes; and passively on every real use — a DM reply's
**send** (not the writing of it) and the search sync.

### Judgment calls made without an explicit ask

1. **A probe writes back what it saw of the webhook subscription — to
   Hawlai's own columns, never to Meta.** H1 decides "not set up" from
   `ig/fb_webhook_subscribed_at` (migration 227). Without this, a live
   check saying "working" and a stale column saying "never subscribed"
   would contradict each other on one card. Now the column is what Meta
   last said: dated when seen subscribed (only if it was not dated
   already), nulled with the reason when seen not. H1's rule and its test
   are unchanged.
2. **The search sync records its state with `notify: false`.** It already
   tells the owner through `tellOwnerItDied`, pinned by
   `tests/searchConsoleDeath.test.ts`; a second notification for the same
   dead connection would be noise.
3. **Only the platform property is exempt from the write-scope check** —
   the platform's service account submits that sitemap, so a read-only
   owner token there is fine.
4. **Ten minutes of freshness, six seconds of timeout** — starting
   numbers, not measured ones.

### Verification

Fourteen mutations, each anchor matching once, all caught. One test of
mine was wrong first: it sliced the DM send block to the first
`} else {`, which is the Instagram-or-Page branch *inside* that block, and
cut away the lines it was looking for. It is now bounded by the rethrow
that closes the block.

Gates: `tsc` 0, `vitest` 0 (**443 files, 8209 passed**), `next build` 0.


---

## 2026-11-27 — Instagram deliveries are verified with the Instagram app's secret

**Measured before fixed.** After Instagram was reconnected, Meta delivered
— and every delivery was rejected, "signature did not match", so the
owner's test DMs never reached the reply. Both Meta routes verified with
`FACEBOOK_APP_SECRET`. Meta's documentation says "your app's App Secret"
without saying which, so a diagnosis shipped first (`21ae2ee0`) that
accepted nothing and recorded which secret matched. **The owner's next
three test DMs all recorded "it DOES match INSTAGRAM_APP_SECRET", none
FACEBOOK_APP_SECRET.** On that evidence, and on his explicit instruction,
the fix:

**`verifyMetaDelivery`** — the delivery's `object` chooses the key:

| `object` | Checked against |
|---|---|
| `"instagram"` | `INSTAGRAM_APP_SECRET`, then `FACEBOOK_APP_SECRET` |
| anything else | `FACEBOOK_APP_SECRET` **only** |

Reading `object` from a not-yet-trusted body is safe: it only chooses
which secret to check, and nothing is accepted unless signed with that
secret. **The Instagram secret can never admit a Page or lead-ads
delivery** — a test signs a Page delivery with it and requires a 401.
Facebook stays as the fallback for Instagram because Instagram connected
through Facebook Login is signed with the Facebook app's secret, which is
how these routes always verified.

**An existing test changed, on the owner's instruction.**
`tests/metaSignatureDiagnosis.test.ts` section 2 held that the routes call
`verifyMetaSignature` once with no override — "not a door" — because the
evidence was not in yet. It now holds that each route verifies through
`verifyMetaDelivery` exactly once and calls `verifyMetaSignature`
directly nowhere, and still that the diagnosis feeds only the recorded
reason and a rejection is still a 401. The narrower rule itself is pinned
in `tests/metaDeliveryVerification.test.ts`, including the route end to
end.

**Mutation-checked five ways**, each anchor matching once: the Instagram
secret opening every kind of delivery (3 fail), never tried (2), the
Facebook fallback dropped (2), failing open (7), a route verifying the
wrong bytes (2).

Gates: `tsc` 0, `vitest` 0 (**445 files, 8227 passed**), `next build` 0.

**Unverified:** a real DM through the deployed fix has not been watched
yet.


---

## 2026-11-28 — Instagram is stored by the id Meta's webhooks use

**The second thing behind "the test DM got no reply", found the moment the
first was fixed.** With signatures verifying, two deliveries came back
`no_business_matched`. Compared exactly, in production:

| | id |
|---|---|
| Meta's webhook `entry.id` | `17841432344301688` |
| stored `instagram_business_id` | `28844011251865336` |
| Instagram `/me` → `id` | `28844011251865336` (app-scoped) |
| Instagram `/me` → `user_id` | `17841432344301688` (the professional account) |

**The reconnect had updated the row correctly.** The callback has always
stored the wrong one of the two: it asked `/me` for `id,username` and
saved `id`, while Meta names the account in webhooks by `user_id`.

**Both ids work on both edges the product calls** — `?fields=username`
and `/subscribed_apps` — checked live, read-only, with the stored token.
So storing `user_id` is safe for every reader of the column (the webhook
match, the health probe, the subscribe call; the reply already sends with
the id Meta named).

**The fix, in two halves:**

1. **The callback stores `user_id`** and subscribes with it. **A missing
   `user_id` fails the connection** with a sentence — it never falls back
   to `id`, which would quietly re-create exactly this.
2. **Existing connections are corrected by the Instagram health check**,
   which already reads `/me`: if the stored id is not `user_id`, Hawlai's
   own column is corrected. **Refused when another business already holds
   that id** — one account's DMs routed to two businesses is worse than
   routed to none — and then the state is "incomplete" with the reason.
   No reconnect, no hand-run SQL.

Five mutations, each anchor matching once, all caught.

Gates: `tsc` 0, `vitest` 0 (**446 files, 8233 passed**), `next build` 0.

**Unverified:** a DM routed and answered end to end.


---

## 2026-11-28 — Seller Mode F1 and F2: the DM reply remembers, and is never silent

The founder's revised plan (`docs/PLAN-INSTAGRAM-SELLER-MODE.md`, UPI
direct) confirmed the order; the foundation comes first.

**F1 (`f3d7a41a`) — conversation memory.** The DM reply answered each
message alone. It now sees the last six exchanges of **this sender's**
thread **on this channel**, rebuilt from `auto_reply_log` — no new table.
Quoted as what was said, never as instructions. A public comment never
sees a private thread. The same read gives Meta's 24-hour window, with an
unknown time treated as **closed**.

**F2 — honest escalation.** When the claims guard withheld a reply (or
the AI or the records failed), the customer got nothing and the seller
found out only in a log. Now:

- **The customer gets a holding line** in the owner's language — "the
  team will reply here" — and nothing else: no price, no time, no claim,
  so there is nothing for the guard to check. **Once since the last real
  answer**, not once per message.
- **The seller is told at once** (`dm_needs_reply`): what the customer
  wrote and why Hawlai did not answer. Once per customer per day — the
  date is in the dedupe key because notifications are deduplicated
  permanently (migration 106).
- **The question the records were silent on becomes the owner's
  question** — `answer_gaps` with `instagram_dm` / `facebook_dm`, using
  the website chat's own `gapReportRule`. A category, never the
  customer's words: anything not a known key becomes "other".
- **A failed holding line is recorded, not thrown**, and the seller is
  still told.
- **The thread shows a holding line as a turn the customer saw**; a
  generated-but-unsent reply is still not one.

### Judgment calls

1. **Migration 240 adds `dm_order_received` beside `dm_needs_reply`**, so
   Seller Mode needs one fewer migration. Nothing emits it yet.
2. **`dm_needs_reply` stays in-app**, not pushed to WhatsApp/email: the
   pushed kinds are a list the founder chose on 23 Nov; adding to it is
   his call.
3. **The holding line exists in English, Hinglish and Hindi only** —
   `normaliseLanguage`'s three values.

### Verification

F1: eight mutations, all caught. F2: ten, all caught — including the
holding line sent on every message, the seller not told, the dedupe key
losing its date, and the model's own words kept as a gap key.

Gates: `tsc` 0, `vitest` 0 (**448 files, 8260 passed**), `next build` 0.

**Migration 240 is not run.** Until it is, the seller notification insert
fails and is logged; the holding line and the answer gap still work.


---

## 2026-11-28 — F3: the Instagram token, encrypted and kept alive

**The last Meta credential in the clear.** `oauthSecrets.ts` had deferred
it "to the next pass"; it now answers customers with nobody watching.
And an Instagram long-lived token dies after ~60 days with nothing
refreshing it — every connection went silent on a schedule.

- **Migration 241:** `instagram_access_token_encrypted`,
  `instagram_token_expires_at`.
- **The Page token's rule:** read encrypted-first with a plaintext
  fallback; every write — connect, manual entry, refresh — encrypts and
  **nulls the plaintext** in the same statement. Past a **known** expiry
  the token reads as none.
- **A daily refresh** (`instagram_token_refresh`, heavy group) when the
  token has under 10 days left **or an unknown expiry** — every
  connection made before 241. That refresh is what moves each row out of
  the clear.
- **A failed refresh is recorded** through `recordHealth` (the owner told
  once). **A successful one is not recorded as "working"**: it proves the
  token, not the webhook or the account id, and overwriting the health
  check's "not set up" would hide a real problem.
- **The connect callback now records the token's real life** — including
  the one-hour life of a short-lived token when the long-lived exchange
  failed, which it used to store silently.

**A guard now walks `src/`** and fails on any file other than
`oauthSecrets.ts` naming the plaintext column. The Page token's own
comment claims `metaTokenSelect.test.ts` does this for it — **that file
does not exist**. Not fixed here (out of scope); flagged separately.

**A stale comment corrected:** `secretCrypto.ts` still said both Meta
tokens were "STILL PLAINTEXT". Neither is now.

**Two existing tests needed their setup, not their assertions, changed:**
`instagramAccountId.test.ts` gained the throwaway encryption key every
secret-touching test uses (the callback now refuses to store a token it
cannot encrypt), and `webhookDeliveryLog.test.ts`'s `oauthSecrets` mock
gained the two Instagram helpers in the same shape as its Page-token one.

**Deployed in two steps, on purpose.** A query naming the new columns
fails whole in production until 241 is run — including the DM routing
just made to work. The migration went first; the code waits for it.

Eight mutations, each anchor matching once, all caught.

Gates: `tsc` 0, `vitest` 0 (**449 files, 8274 passed**), `next build` 0.

---

## 2026-11-28 — Instagram no longer asks for the comment permission

**The founder's decision, before App Review.** The Instagram connect
screen asked for `instagram_business_manage_comments` and the webhook
subscription asked for `comments` — but **replying to Instagram comments
is not built**: the reply handler answers comments on Facebook only.
Meta's reviewers commonly reject a submission that requests a permission
the app does not visibly use.

- The connect scope is now `instagram_business_basic,
  instagram_business_manage_messages`.
- `IG_WEBHOOK_FIELDS` is `["messages"]`. The health probe reads it, so a
  messages-only subscription is "working".
- **Two existing assertions changed, on the founder's sign-off (Rule 7)**
  — `tests/subscribeWebhooks.test.ts` pinned "messages AND comments" and
  "asks for manage_comments". They now pin the opposite, and keep the
  old lesson for the day comments return: `comments`, never `feed`.
- **A tie, so the two only move together:** while the handler answers
  comments on Facebook alone, Instagram asks for neither the permission
  nor the field. Building Instagram comment replies without adding them
  fails the suite — mutation-checked.

Existing connections keep the scope they were granted until they
reconnect; nothing reads it.

Three mutations, all caught. Gates: `tsc` 0, `vitest` 0 (**449 files,
8275 passed**), `next build` 0.


---

## 2026-11-28 — F4: the Seller Mode switch, and the seller's UPI ID

**Migration 242** carries all of Seller Mode's schema, as the plan
bundled it: `dealerships.instagram_selling_enabled`,
`dealerships.seller_upi_vpa` (format-checked), `orders.channel` (default
`website`, which is true of every order before it) and
`orders.upi_reference`.

**One rule for when it may switch on** (`src/lib/dm/sellerMode.ts`),
used by all three doors — the dashboard, the chat tool, and the approval
that carries the chat tool's request out: **Instagram connected, a UPI
ID saved, DM auto-reply on**, the most fundamental missing one named
first. The approval checks again **at the moment it is applied**,
because the UPI ID may have been cleared in between. The dashboard
checks against the state the change would leave, so switching DM replies
and Seller Mode on together works.

**Off is never refused, and two things take Seller Mode off with them:**
DM auto-reply switched off (it answers through those replies) and the
UPI ID cleared (nowhere left to pay).

### Judgment calls

1. **The UPI ID is not encrypted.** It is a payment address customers are
   given, not a secret.
2. **The switch can be saved before order-taking exists**, and the screen
   says so in plain words. `SELLER_MODE_TAKES_ORDERS` is `false` until
   the order pieces ship; a switch that claimed to do what it does not
   would be the lie the integration-health work removed.
3. **Registered as `critical`** in `AUTOMATION_TOGGLES`: it asks customers
   for money with nobody reading first.
4. **The format is checked twice** — the app and a database CHECK — and a
   test holds the two regexes identical.

### Three things fixed on the way, each a way the card misled

- **An Instagram-only business could not switch DM auto-reply on**: the
  card required a Facebook Page. Seller Mode is for exactly that business.
- **A switch flipped before the server answered and never read the
  answer**, so a refused change looked done.
- **Every DM was labelled "Comment"** in the log (`dm_instagram` was
  compared with `"dm"`).

### The tool-schema fingerprint

`set_automation_toggle` gained `instagram_selling`, which changes the
chat's prompt-cache prefix. `tests/toolSchemas.test.ts` is a tripwire
for exactly that: its own instruction is to update the fingerprint in the
same commit and say why — done, with the reason recorded beside the
earlier ones. One cache warm; no new tool.

### Verification

Ten mutations. **One survived first**: the chat tool's check wrapped in
`if (false)` passed, because the test looked for the call's text and the
text was still there — the trap the rule-8 notes describe. The test now
anchors on the condition, the call and the early return together, and
the mutation fails it.

Gates: `tsc` 0, `vitest` 0 (**450 files, 8291 passed**), `next build` 0.

**Deployed in two steps**, as F3 was: the code reads the new columns, so
it waits for migration 242.


---

## 2026-11-28 — WA-T: the seller is told about an order on WhatsApp

Seller Mode asks the customer to pay the seller's own UPI ID, and only the
seller can say the money arrived. `notifySellerOfOrder`
(`src/lib/dm/sellerOrderNotice.ts`) is that question: an in-app
notification for every order, and a WhatsApp **template**
(`order_payment_check`) with **Yes, received / Not yet** buttons whose
payloads carry the order's id (`pay_yes:<id>` / `pay_no:<id>`), so two
waiting orders can never be confused.

**The template sender is restored** from `49cf3d8f^` (deleted 24 Nov with
H3), with one change: several quick-reply buttons, each at its own index.
The facade's Gupshup path still **refuses** rather than falling back to
free-form text.

### Judgment calls

1. **Always a template, never a guess at the window.** Inside 24 hours a
   template is still accepted; outside, free-form is refused. Guessing
   the window could only be wrong in the direction that fails.
2. **Off until Meta approves.** `WHATSAPP_ORDER_TEMPLATE` names the
   approved template; unset means no WhatsApp leg at all, because a send
   against an unapproved template fails every time. The in-app
   notification is written regardless, and **first**.
3. **Only a verified number.** The same check the inbound webhook makes
   before acting as the owner. An unverified number's "yes" would confirm
   a payment.
4. **A failed send is returned, never thrown.** The order already exists;
   a notice must not undo or hide it.
5. **The result does not claim the in-app notification was written.**
   `emitNotification` swallows its own errors, so "written: true" would be
   a claim nothing checked. Dropped from the return value.
6. **`notify_seller_order` is `send / low / automatic`**, as the
   owner-approved plan's Rule 6 rows say. It joins
   `approvalCoverage`'s explained exceptions with that reason. It goes only
   to the business's own verified number, about its own order.

### The rule that came back with it

`channelRules` names its free-form senders by hand, so a template sender
is invisible to it (the hole H3-c found). **The second list is back**, in
`tests/sellerOrderNotice.test.ts` §5 rather than in `channelRules`: that
file reads source through `code()` (Rule 8), and `channelRules` is still
on the raw-source allowlist. The only permitted caller is
`lib/dm/sellerOrderNotice.ts`, which sends no free-form. `channelRules`
carries a pointer. `sendWhatsAppTemplate` and `notifySellerOfOrder` also
joined the sender lists in `approvalCoverage` and `stateChangeDoor`, so no
chat tool can reach either.

Three tripwires fired and were answered rather than loosened:
`.env.example` documents `WHATSAPP_ORDER_TEMPLATE`; `measures.ts` names
`notify_seller_order` as not collected yet ("orders the seller confirmed
as paid" — it becomes measurable with O4′); `stateChangeDoor` watches the
new senders.

### Verification

**Thirteen mutations, all caught**: the verified-number check removed, the
notification skipped, sending with no template named, every button at
index 0, Gupshup falling back to text, variables not sanitised, a second
template caller, a send failure thrown, buttons without the order id, the
registry entry dropped, variables reordered, a blank customer name, and a
chat tool calling the notice.

Gates: `tsc` 0, `vitest` 0 (**451 files, 8316 passed**), `next build` 0.

**UNVERIFIED AGAINST A LIVE SEND.** `order_payment_check` has not been
submitted or approved yet. Nothing calls `notifySellerOfOrder` yet either:
the order pieces (O2/O1) will.


---

## 2026-11-28 — UPI: the payment request a customer is sent

`src/lib/payments/upiRequest.ts` composes the request, and
`/api/public/pay/upi-qr/[orderId]` serves its QR. **Three ways to pay, so
one always works**: the UPI ID and amount as copyable text, a
`upi://pay` link, and a QR image. Hawlai never holds money: the payee is
the seller's own saved UPI ID.

### Judgment calls

1. **The order reference is derived, not stored**: `#` plus the first six
   characters of the order id. Orders have no number column and this
   needs no migration. Everything a machine acts on (WhatsApp buttons, the
   QR route) carries the full id, so a clash between two references
   cannot confuse two orders.
2. **The link's shape**: `pa`, `pn`, `am` (two decimals), `cu=INR`, `tn`.
   **`pa` is not percent-encoded** (some UPI apps fail on `%40`; the ID is
   already format-checked). Spaces are `%20`, never `+`. **No `tr`**: it
   is meant for merchant accounts, and some apps refuse it on a personal
   UPI ID. The `#` in the note is encoded, otherwise the rest of the link
   would be a fragment.
3. **The QR route is public, and refuses in one voice.** Instagram fetches
   an image with no session, and the URL holds a random UUID. It serves
   only an **unpaid, not-cancelled DM order at a business with Seller Mode
   on and a UPI ID saved**, read at request time. Everything else gets the
   same 404, so the route cannot be used to learn which ids exist. A
   failed database read is a 500, never "no such order". **Not cached**:
   a changed UPI ID must never keep receiving money through a stored
   image.
4. **The text never says the payment arrived**, because nothing here can
   know. It says the seller will check and confirm. Hinglish is the
   default, as for the DM holding line, with English and Hindi following
   the owner's setting.
5. **One new dependency, `qrcode@1.5.4`** (plus `@types/qrcode`), as the
   plan said. It added no audit findings: the 19 reported were there
   before.
6. **`send_upi_request` is NOT registered yet.** This piece composes and
   serves; it sends nothing. The registry entry, the Instagram image send
   and the 24-hour check arrive with O1, the code that actually sends,
   so the "automatic" exception sits beside the send it excuses.
7. `formatRupees` moved here, and the seller's notice re-exports it. The
   seller and the customer must see the same amount written the same way.

### Verification

**Fourteen mutations, all caught**: the UPI ID percent-encoded, a zero
amount allowed, spaces as `+`, the note unencoded, a bad UPI ID passing,
the QR line shown when no QR is coming, a paid / website / cancelled order
offered a QR, Seller Mode off still served, a failed read passed off as
"no order", the QR cached, the signup handle shown as payee, and `tr`
added to the link.

One test was wrong first, and it was the test: it assumed English as the
default language, and the product's default is Hinglish. Corrected to
pass English explicitly and to pin the real default.

Gates: `tsc` 0, `vitest` 0 (**452 files, 8341 passed**), `next build` 0.

**UNVERIFIED LIVE**: whether Instagram makes `upi://` tappable in a DM,
and how real UPI apps read this exact link and QR. No DM order exists
yet, so the route answers 404 to everything until O2.


---

## 2026-11-28 — O2: one way to write an order, and the Instagram order

**One function writes every order row**: `insertOrder`
(`src/lib/orders/insertOrder.ts`). The storefront's cash-on-delivery path
and its Razorpay verify path each had their own copy of the same twenty
columns. Both now call it, and a test walks `src/` (comments stripped) to
hold that nothing else does `from("orders").insert(`. It writes the row
only. When `applyOrderSideEffects` runs stays each caller's decision.

**`createDmOrder`** (`src/lib/orders/createDmOrder.ts`) is what O1 will call
after the customer's "yes" to the read-back. It writes an `instagram`
order, `upi`, `pending`, `new`, with the UPI reference in the same
insert. **Nothing else happens**: no stock, no discount count, no email,
no Purchase event. In this flow only the seller can say the money arrived,
so stock moves when they confirm it (O3/O4′).

### Judgment calls

1. **Pricing is split, not copied.** `resolveOrderPricing` (by storefront
   slug) and the new `resolveBusinessOrderPricing` (by business) share one
   core: catalog price, stock, discount, shipping. A business with no
   website can sell in DMs.
2. **Shipping is the business's own rule**, read from its website row
   (one per business), published or not. **No website means no shipping
   rule, so none is charged.** A shipping read that fails refuses the
   order rather than pricing it as free. **Open for the owner:** a
   DM-only seller has nowhere to set shipping today.
3. **Seller Mode is read when the order is written**, not when it was
   quoted. Switched off, UPI ID cleared, or DM replies off in between:
   refused, nothing written.
4. **Quantities are whole numbers from 1 to 99.** The storefront's pricing
   passes a fractional quantity through (a documented gap, left alone),
   and a conversation is exactly where "1.5" would appear.
5. **The id is chosen before the insert** (`crypto.randomUUID()`), so the
   UPI reference goes in the same write. A second write could fail and
   leave an order the seller cannot match to a payment.
6. **The Orders tab can no longer mark an Instagram order paid or
   confirmed** (409, said in plain words). That route only flips a status,
   and for these orders confirming is the moment stock moves. The confirm
   step that does both arrives with O3. Website orders are untouched, and
   notes and cancelling still work.
7. **The Orders panel now reads the server's answer.** Its status dropdown
   and "Mark as paid" changed the screen and never looked at the reply,
   the same fault F4 fixed on the auto-reply switches. A refused change
   now shows its reason and reloads. Instagram orders carry an
   **Instagram** label, and their "Mark as paid" button is hidden.

### Verification

**Fourteen mutations, all caught**: side effects run at creation, Seller
Mode off still taking orders, the precondition check skipped, a fractional
quantity allowed, the channel written as `website`, no UPI reference, the
chosen id dropped, a shipping read error priced as free, the business's
shipping rule ignored, the Orders tab marking an Instagram order paid, a
channel read error letting it through, website orders blocked too, the
phone check removed, and pricing not scoped to the business.

The panel's read-the-answer change is UI and has **no test**. The server
refusal it displays does.

Gates: `tsc` 0, `vitest` 0 (**454 files, 8368 passed**), `next build` 0.

**UNVERIFIED LIVE**: no Instagram order is created until O1. The
storefront checkout's insert moved into the shared function with the same
columns (plus an explicit `channel: 'website'`, already the default), and
**a real checkout has not been placed since**. **Before O1**, the live
`orders` CHECK constraints must be read, to confirm nothing refuses
`payment_method = 'upi'`. The query is in the report.


---

## 2026-11-28 — Seller Mode's delivery fee (migration 243)

**The founder's decision**, after O2 reported that a DM-only seller had
nowhere to set shipping: no hardcoded ₹0. Instead, **one optional flat fee
on the Seller Mode card**, default ₹0, and explicitly **not** the website
builder's shipping system.

`dealerships.seller_shipping_fee` (migration 243, CHECK 0–1,00,000).
`normaliseShippingFee` accepts what sellers type ("₹1,200", "49.50", empty
for free delivery) and refuses anything else rather than rounding it,
because the customer is quoted this number.

### Judgment call: it is the ONLY shipping rule for DM orders

O2's first version read the business's website shipping rules. That gave
two screens for one decision: a seller with a website would have DM
shipping set by a page that says nothing about Instagram. **So DM orders
use the Seller Mode fee, whether or not the business has a website**, and
the website row is no longer read for them. Website checkout is unchanged.
A fee that is stored but not a valid amount refuses the order instead of
pricing it as free.

`seller_shipping_fee` is **not** in `SELLER_MODE_COLUMNS`, so the chat tool
and the approval path do not read a column they have no use for. It is
read by the settings route and `createDmOrder` only.

### Verification

Seven mutations, all caught: the fee never charged, a bad fee priced as
free, three decimals accepted, no ceiling, the card's fee not saved, an
empty box refused, and the DM order ignoring the stored fee.

Gates: `tsc` 0, `vitest` 0 (**454 files, 8375 passed**), `next build` 0.

**Deployed in two steps**: the code reads the new column, so it waits for
migration 243.


---

## 2026-11-28 — O1: taking an order inside an Instagram DM

`src/lib/dm/orderConversation.ts` gathers the product, quantity, name,
phone and address over a few messages. It **reads the whole order back**
with the catalog's prices and the Seller Mode delivery fee, and only the
customer's own **"yes" to that read-back** places the order (O2's
`createDmOrder`), sends the UPI payment request (text, then the QR image)
and tells the seller (WA-T). Anything that is not the order (a question,
a greeting), or an order step that fails, falls through to the ordinary
reply, unchanged.

**It is dormant.** The webhook runs it only when `SELLER_MODE_TAKES_ORDERS`
is true, the channel is Instagram, and the business has Seller Mode on
and a UPI ID saved. The global switch stays **false** until the seller can
confirm a payment (O3/O4′). An order nobody can mark paid should not be
taken.

### Judgment calls

1. **The model reads; code writes.** One small Haiku call
   (`dm_order_extract`) turns the customer's words into fixed fields, and
   `readExtraction` accepts that exact shape or nothing. Every message the
   customer sees in the order flow is written by code from the records.
   A number in a read-back is never the model's. Listed in `oneDoorForCopy`'s
   `NOT_COPY` with that reason.
2. **The claims guard is not run over the read-back.** It exists for words
   a model wrote. These come from the same request's catalog read and the
   pricing function the order is written with, and the delivery fee is not
   in the facts it checks against, so it would strip a true line. The
   ordinary reply still passes through the guard as before.
3. **A table, against the plan** — migration 244 `dm_order_drafts`. The
   plan expected the order to be rebuilt from the message log, which holds
   only prose. The yes must place **exactly the quote shown**, so that
   quote is stored as data. One row per conversation; owner may read, only
   the service client writes.
4. **A yes places exactly what was shown, once.** It is claimed with a
   conditional update on `readback_sent_at` before anything is written, so
   the same yes delivered twice places nothing the second time. The order
   is re-priced first: if the price moved, the customer gets the new
   read-back instead. `createDmOrder` refuses a total that differs from
   the one confirmed (`expectedTotal`), which closes the gap between those
   two steps.
5. **"Yes" is the whole message.** "yes but in blue" is a change, read by
   the model and read back again. It never places the old quote. A yes is
   never sent to the model.
6. **A product must match exactly one catalog name** (ignoring case).
   None: the customer is asked for the exact name. Two products sharing a
   name: the customer is told there is more than one, and the seller sees
   it in the log, because that is theirs to fix.
7. **A conversation quiet for 24 hours starts over**, and an old read-back
   is not answered by today's yes. The name, phone and address are kept,
   and they are always read back before anything is placed.
8. **The webhook sends the text first, then the QR.** A refused image is
   recorded and the order stands, because the text carries the UPI ID and
   link. **A payment request that never arrived is told to the seller**:
   the customer is waiting for a UPI ID nobody sent.
9. **`send_upi_request`** is registered: send, **high**, automatic. The
   customer's own yes to the exact quote is the approval, as the plan's
   Rule 6 rows say. It joins `approvalCoverage`'s explained exceptions.
10. **The send-and-log block is its own function** (`sendOrderTurn`).
    `dmConversationMemory` reads the DM loop up to its first log insert,
    and an inline insert would have come first. The code moved, the guard
    did not.

### Known limits, said plainly

- **A stock or pricing refusal is in English** whatever the owner's
  language: it is the pricing function's own message.
- **One product per line, catalog names only.** No variants (V1).
- **The QR image send is unverified** against the live Instagram API.

### Verification

**Twenty-one mutations first; one survived (M4).** Matching the first of
two same-named products passed, because no test had two. A test was
added, and ambiguity now gets its own message and log note. M4 and two
mutations on the new branch are all caught. After the send block moved,
seven handler mutations were re-run, all caught. **Thirty mutations, all
caught in the end.**

Two tripwires fired and were answered, not loosened: `dmConversationMemory`
(the code moved) and `oneDoorForCopy` (listed with its reason).

Gates: `tsc` 0, `vitest` 0 (**457 files, 8422 passed**), `next build` 0.

**UNVERIFIED LIVE: all of it.** It cannot run until the global switch is
on. Migration 244 must be run before then.


---

## 2026-11-28 — O3 + O4′: the seller confirms the payment

`confirmDmPayment` (`src/lib/orders/confirmDmPayment.ts`) is **one
function behind four doors**: the WhatsApp **"Yes, received"** button,
**"haan CODE"** typed on WhatsApp, the **approval card** on the dashboard,
and **"Payment received"** on the Orders tab. Whichever comes first does
it, and the rest find it done.

1. **The order is claimed** with one conditional update: paid and
   confirmed, only if it is still an unpaid, new Instagram order of this
   business.
2. **`applyOrderSideEffects` runs here**, so stock moves at payment
   confirmation, as the founder decided. Its email now says "in your
   Instagram DMs" and "UPI … confirmed by you", not "website" and "Cash
   on Delivery".
3. **A text invoice goes to the customer**, and only inside Meta's
   24-hour window. Outside it, the seller is told to send it themselves.

**One approval card per order**, raised when O1 places the order
(`confirm_dm_payment`: edit, high, requires approval). The template's
buttons carry the order id. **"Not yet" is an answer**: the order is
unchanged and no reminder follows. **One reminder after 15 minutes** of no
answer: the event dispatcher calls a sweep every two minutes as a
function, never a fetch. It claims `orders.payment_reminder_sent_at`
before messaging and covers the last 24 hours only.

**Migration 245**: `orders.instagram_sender_id` (the draft row of 244 is
reused for the customer's next order, so the order must remember whose DM
it was) and `orders.payment_reminder_sent_at`.

### Judgment calls

1. **A branch in decide.ts, not a dispatcher.** Built first as a
   dispatcher. `toolFamilies` then asked which chat tool raises it, and
   none does. The registry's dispatchers are outbound sends raised by
   chat tools (a call, a video). This is an edit (the order, the stock)
   raised by Seller Mode, like the toggle and page branches. Moved rather
   than given an exception in the test.
2. **Button taps get their own parser** (`lib/whatsapp/paymentButton.ts`).
   `tests/whatsappInbound` pins `button` as a type `readInbound` skips;
   that stays true, and a tap (a decision about one order) never becomes
   a Master Chat sentence. A dated line was added to that test's
   comment; the assertion is unchanged.
3. **"Yes, received" goes through the order's own card** when it has one,
   so the card, the audit trail ("whatsapp:<number>") and the decision
   record agree. Without a card, the same confirmation runs directly.
4. **Only the business's own verified WhatsApp number** may tap; anyone
   else's tap is ignored. **Not plan-gated**: confirming one's own
   customer's payment is open on the dashboard on every plan.
5. **The thread reader now dates Meta's window from the customer's own
   last message**, not the newest log row. The invoice is a row the
   business starts, and would otherwise make a closed window look open.
   This is a fix to F1, with a test.
6. **The Instagram transport moved** to `lib/instagram/dm.ts`, unchanged,
   because the invoice needs it outside the webhook.
7. **The Orders tab's "Mark as paid" on an Instagram order is the
   confirmation** (O2 refused it "until O3"). A bare "confirmed" is still
   refused. O2's own interim test was rewritten to the new behaviour.
8. **"haan CODE" replies now pass on what the action did** (`produced.note`).
   This applies to every approval: the seller learns whether the invoice
   went.
9. **`dm_order_update`** (the invoice) is registered: send, medium,
   automatic. It goes only after the seller's own confirmation, which is
   itself approval-gated.

### A miss in O1, found here

`tests/noGreedyJsonParse` walks `git ls-files`. When O1's gates ran,
`orderConversation.ts` was still untracked, so the suite was green
**without that guard ever reading it**. The model-reply parse there did
not log its cause. **O1 went out with that gap** (harmless while dormant).
It is fixed here, with a mutation proving the guard now sees it. From now
on the gates run after `git add`.

### Verification

**Twenty-eight mutations, all caught on the first run**: 23 on the claim,
side effects, invoice window, card closing, the window date, the button,
"not yet", payload parsing, the reminder (claim, timing, once), the Orders
tab and the email wording, and 5 on the decide.ts branch and the parse log.

Gates **with every new file staged**: `tsc` 0, `vitest` 0 (**460 files,
8468 passed**), `next build` 0.

**UNVERIFIED LIVE: all of it.** Migrations 244 and 245 are not run.
`SELLER_MODE_TAKES_ORDERS` is still false. The WhatsApp template is not
approved, so its button has never been tapped. No business has Seller Mode
on.


---

## 2026-11-28 — Seller Mode takes orders: the switch is on

`SELLER_MODE_TAKES_ORDERS` is now **true**. It was false from F4 until
the seller could confirm a payment (O3/O4′). It flipped after migrations
244 and 245 were confirmed live, and after the exact reads the new code
makes (reminder sweep, draft row, payment card by order id, the claim's
columns, the settings and webhook column sets) were run read-only against
the live database without error.

**It changes nothing for any business until that business** switches
Seller Mode on, saves a UPI ID, has Instagram connected and DM auto-reply
on. The webhook checks all of these on every message. On the day it
flipped, **no business had Seller Mode on** and no UPI ID was saved
(read-only count).

The two tests pinning `false` were written to change at exactly this
step. They now pin `true`, with the date and the reason.

Gates with every file staged: `tsc` 0, `vitest` 0 (**460 files, 8468
passed**), `next build` 0.

**UNVERIFIED LIVE until the founder's first test order.** The WhatsApp
template is still unapproved, so the first test confirms from the
dashboard card or the Orders tab.


---

## 2026-11-28 — The UPI ID that could never be saved (migration 246)

**Found by the founder's first live save**: "invalid regular expression:
invalid repetition count(s)", and zero rows with a UPI ID. Migration
242's CHECK used `{2,256}`. **PostgreSQL caps a regex repetition bound at
255** (`RE_DUP_MAX`) and compiles a constraint's regex when it is used,
not when it is created. So 242 ran cleanly, and every non-null UPI ID was
then refused. JavaScript accepts `{2,256}`, so the app approved what the
database refused, and the test pinning "app regex = database regex" was
green the whole time: identical text, and one side could not run it.

**242's verification could not have caught it.** It checked that the
constraint existed. My "no-match update" proved nothing (recorded that
day). **246's verification writes a real UPI ID** inside a `do` block that
always rolls back, and expects a bad one to be refused.

### The fix

- **Migration 246**: `char_length(seller_upi_vpa) <= 255` and
  `~ '^[a-z0-9._-]{2,}@[a-z][a-z0-9]{1,63}$'`. The length cap moves out of
  the regex, which keeps only small bounds. The app checks the same two
  things (`MAX_VPA_LENGTH`).
- **A new guard**: no regex in any migration may use a repetition count
  over 255. 242 is allowlisted with its reason and date, and the test
  checks that 246 really drops and re-adds that constraint. A probe proves
  the scan would see one, and removing 242 from the allowlist fails it.

### The "Saved." the founder saw

The founder read it as "the UI never checked the server's answer". **The
code says otherwise**: `save()` returns false on any non-OK answer, and
"Saved." is set only on true. The mechanism that fits what was on screen:
**each field cleared only its own note**. After saving the delivery fee,
a failed UPI save showed its error **beside the fee's old "Saved."**.
`save()` now clears every note first. That is the likely cause, not a
confirmed one, so the founder is asked which "Saved." it was.

The route now says **which** save failed, in the owner's words, before the
raw database text: "Your UPI ID wasn't saved: …".

### Verification

**Seven mutations, all caught**: the migration or the app back to
`{2,256}`, either length cap removed, the card keeping the fee's note, the
route returning only the raw error, and 242 removed from the allowlist.
The card has no DOM tests in this repo, so its fix is pinned by a bounded
`code()` read of `save()`.

Gates with every file staged: `tsc` 0, `vitest` 0 (**460 files, 8473
passed**), `next build` 0.

**Saving a UPI ID works only once migration 246 has run.** The code is
safe to deploy before it, since it reads no new column.


---

## 2026-11-28 — V1: variants as separate products

**No schema.** A seller with a kurta in two colours and three sizes adds
six products, named like **"Kurta – Red – M"**, each with its own price
and stock. `src/lib/catalog/variants.ts` reads the names: the part before
the first **spaced** separator (` – `, ` - `, ` — `, ` | `, ` / `) is the
item. So "T-shirt" stays one product.

- **The order flow asks which one.** When a customer names only the item
  ("ek kurta") and the shop sells two or more of its options, the reply
  lists them **from the catalog, exactly as spelled** (up to ten), and
  prices nothing. The order reader is told to return the exact variant
  when the customer's words pick one, and the bare item when they don't.
- **The DM reply is told how to read such names**, only when the catalog
  really has variants: answer an option question **only** from the
  product with that exact option; never assume an option exists.

### Judgment calls

1. **Two options or none.** An item with a single option ("Vase – Tall")
   is not a choice, so the customer gets the ordinary "which product?".
2. **Ten options at most** in the list, so a DM stays readable.

### Verification

Six mutations, all caught: a hyphen inside a word splitting, one product
counted as a choice, any named product counted as variants, the options
never listed, the reply never told, and options listed only on a near
match.

Gates with every file staged: `tsc` 0, `vitest` 0 (**461 files, 8482
passed**), `next build` 0. **Unverified live**: no business has Seller
Mode on yet. The founder's live test is waiting on migration 246.


---

## 2026-11-28 — FU1: one nudge to a customer who was quoted and went quiet

`src/lib/dm/orderNudge.ts`. When an order is read back (or read back
again because its price moved), a task is scheduled on `agent_tasks`
(migration 130). When the 2-minute dispatcher runs it, it sends **one**
message, "your order (₹950) is ready to place, reply YES…", **only if
all of this is still true at that moment**: Seller Mode is still on with
a UPI ID; that same read-back is still waiting; the customer has not
written since; and Meta's 24-hour window, from the customer's own last
message, is still open. Otherwise it does nothing and says why.

### Judgment calls

1. **Four hours after the read-back.** That is long enough to be a nudge
   rather than pressure, and well inside Meta's 24. A constant
   (`NUDGE_AFTER_MS`) if the founder wants it changed.
2. **At most one a day per customer.** A nudge is not scheduled while
   another for the same customer was scheduled in the last 24 hours. If
   that history cannot be read, none is risked. The plan said "never
   more than one per conversation"; this reads it per Meta window, so a
   returning customer next week can be nudged again.
3. **Claimed before it sends.** The dispatcher has no claim of its own
   (pending stays pending until done), so the executor moves its task
   pending → processing with a conditional update first. Two overlapping
   runs cannot both send. A refused send throws, so the dispatcher's
   retry runs, and the retry re-checks everything.
4. **Logged with no incoming text**, like the invoice: the business
   started it, so it never reopens the window (thread.ts).
5. **`dm_order_nudge`** is registered: send, medium, automatic, as the
   plan's "one automated nudge inside the 24 hours" says.
6. **The owner's language**, like the rest of the order flow on main. The
   customer-language work is paused on `wip/dm-multilingual`.

### Verification

Twelve mutations, all caught: not claimed, Seller Mode not re-checked, an
answered quote nudged, a newer quote nudged, a customer who wrote since
nudged, the window not checked, more than one a day, unreadable history
treated as none, the read-back not scheduling, the executor or the
registry entry dropped, and the nudge logged as if the customer wrote.

Gates with every file staged: `tsc` 0, `vitest` 0 (**462 files, 8500
passed**), `next build` 0. **Unverified live.**

---

## 2026-11-28 — T1, step one: record what a text-less DM looks like

T1 ("a DM that points at a post": a shared post, a story reply) is to be
built **on a real payload**. The plan says the shape is unverified, and
the Shopify adapter's four post-launch corrections are why that matters.
Until now a DM with no text was skipped **silently**, so nothing could
be checked.

`src/lib/dm/messageShape.ts` describes such a message's **structure** for
`webhook_deliveries.detail`: attachment types (only short words, so
anything else prints as `?`), and the **names** of the keys present, for
example `attachments[share{payload:title,url}]` or `reply_to{story:id,url}`.
**Never a value**: no URL, id, title, caption or text. A test feeds it
URLs, ids, captions and an email and asserts none comes out.

**What this does not do: read the post.** T1 itself is built once one
real share and one real story reply have been recorded.

Five mutations, all caught. Gates with every file staged: `tsc` 0,
`vitest` 0 (**463 files, 8507 passed**), `next build` 0.


---

## 2026-11-28 — O5 + FU2: messages the seller sends

**One function, `src/lib/dm/sellerMessage.ts`, and Meta's rule decides
what it may do**, counted from the customer's own last message: within
24 hours an ordinary message; **24 hours to 7 days only a person's,
tagged `HUMAN_AGENT`**; after 7 days nothing, and the seller is told to
use the customer's phone. **It is the only place the tag is set** (a test
walks `src/`). It is reached only when the seller sent the message
themselves.

**O5: the Orders tab.** Each Instagram order has "Message customer".
The server says what Instagram allows now and offers a draft written by
code for the order's status ("Your order #… has been shipped / delivered.
Thank you for ordering from …"). The seller reads it, may change it, and
presses Send. The panel shows the server's answer, never a hope.

**FU2: the follow-up card.** With each read-back, a second task is
scheduled a day and an hour later. It **sends nothing**. If the customer
is still silent then, the same quote still waits, Seller Mode is on, the
window is past 24 hours but not past 7 days, and no such card is already
waiting, it raises a **`dm_human_message` approval card** with a drafted
"your order (₹950) is still waiting…". Approving it (dashboard or "haan
CODE") sends it through `sellerMessage.ts`, which **re-reads the window at
that moment**: a card approved on day 8 sends nothing and says why.

### Judgment calls

1. **`dm_human_message`: send, high, requires approval.** On the Orders
   tab the owner pressing Send on their own dashboard is the decision, as
   with every control there. For FU2 the approval card is the decision.
2. **Plain drafts in the owner's language**, written by code, with no AI
   and no numbers beyond the order's own.
3. **The plan's "unverified" stands**: whether Meta counts a seller's tap
   on a drafted message as a human agent. The seller sees and sends the
   exact text, which is the closest honest reading; Meta's review is the
   answer. The tag's API shape is also unverified live.
4. **The card is approve-or-reject.** To change the words, the seller
   rejects it and writes from the Orders tab (for an order) or Instagram
   itself.

### Verification

Fifteen mutations, all caught: the 7-day limit removed, never tagged,
always tagged, a closed window still sending, "never wrote" treated as
open, the transport dropping the tag, a follow-up card inside 24 hours,
a duplicate waiting card, an unclaimed task, a customer who wrote since,
the decide.ts branch skipped or reporting a failed send as done, the
route messaging a website order, the follow-up task not scheduled, and
the registry entry dropped.

One test was wrong first, and it was the test: its "inside 24 hours" case
had the customer writing after the quote, which the code rightly reported
as "written since".

**`OrderMessageBox.tsx` (UI) has no test**; the route and the function
behind it do.

Gates with every file staged: `tsc` 0, `vitest` 0 (**465 files, 8534
passed**), `next build` 0. **Unverified live.**

---

## 2026-11-28 — Stats: the order summary by channel, on the Orders tab

`src/lib/orders/summary.ts`, shown at the top of the existing Orders tab
(no new page): **Website** and **Instagram**, each with orders placed,
**paid** (count and ₹), **awaiting payment** (count and ₹) and
**cancelled**.

### Judgment calls

1. **The last 30 days, said on screen.** A total with no period is a
   number nobody can act on, and "all time" quietly mixes test orders into
   real ones.
2. **One meaning per number.** Paid is money the seller has
   (`payment_status = paid`, not cancelled). **A cash-on-delivery order is
   "awaiting payment" until the seller marks it paid.** A cancelled order
   is counted as placed and as cancelled, never as money. An order with no
   channel is a website order, which is true of every order before
   migration 242.
3. **Its own query, over the period**, not the 200 orders the list shows,
   so the summary is not quietly capped. A summary that can't be read is
   `null`, the card says so, and the list still shows.

Seven mutations, all caught. **The table itself (UI) has no test**; the
function and the route do. Gates with every file staged: `tsc` 0, `vitest`
0 (**466 files, 8541 passed**), `next build` 0.
