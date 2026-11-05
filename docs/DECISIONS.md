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
