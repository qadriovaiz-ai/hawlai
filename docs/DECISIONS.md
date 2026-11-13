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
