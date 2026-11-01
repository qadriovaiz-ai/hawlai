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
