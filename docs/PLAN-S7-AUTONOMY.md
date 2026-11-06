# S7 — Autonomy levels, promotion from data, automatic demotion

Written 5 November 2026, at the founder's request, while S6's fixes wait
on tomorrow morning's email.

**What this plan covers:** the autonomy half of the S7 row in
[PLAN-CORE-ARCHITECTURE.md](PLAN-CORE-ARCHITECTURE.md) §3 — L0/L1/**L2**,
promotion from measured data, and automatic demotion.

**What it deliberately leaves out.** That same row also lists
*experiments* and *local/GBP and AI-visibility*. Neither belongs in this
plan: an experiment framework is a second measurement system beside S5's
outcome loop, and local/GBP is a new surface, which CLAUDE.md rule 5
says needs a written reason from the owner. They get one line each in
§12 and nothing more.

**The exit test, as §3 already states it — unchanged:**

> *"Promotion and demotion both tested; spend never auto (test)"*

---

## 1. The short version

Three sentences, so the rest can be skipped if they are enough.

1. **Most of the structure already exists.** L0 and L1 are built,
   tested, and live in `src/lib/publish/create.ts`; `action_levels`
   (migration 209) is the table; every unclear case already resolves
   downward to "ask". S7 adds **one level**, **one promotion rule**, and
   **one demotion trigger** to a frame that is standing.
2. **The blocker is real and it is not the levels.** Automatic demotion
   has to fire on an unsupported claim reaching the public. **Nothing in
   this product records what reached the public, and nothing records
   what the claim check said about it.** Those verdicts exist for a few
   milliseconds inside `generateCopy` and are then thrown away.
3. **So the first thing to build is not L2. It is the record.** Two
   pieces before any level moves: a row per customer-facing output that
   actually went out, and a monitor that reads those rows. The monitor
   itself is mostly written already — it is `scripts/eval/
   outputGate.eval.ts` pointed at live output instead of a saved eval
   run.

---

## 2. What already exists, and it is more than the §3 row suggests

Measured in the repo on 5 November 2026, not recalled.

| Piece | Where | State |
|---|---|---|
| L0 and L1, as a type and as rules | `src/lib/autonomyLevels.ts` | **WORKING** |
| The table | migration `209_action_levels.sql`, `CHECK (level in ('L0','L1'))` | **WORKING** |
| Reading a level, failing to L0 on any error | `src/lib/autonomyLevelsStore.ts` | **WORKING** |
| A level actually gating a real path | `src/lib/publish/create.ts:297` | **WORKING** |
| Spend and delete pinned to L0 by action TYPE | `autonomyLevels.ts` `PINNED_ACTION_TYPES` | **WORKING** |
| `critical` risk pinned to L0 | `PINNED_RISK_LEVELS` | **WORKING** |
| L1 refused where no undo exists | `canHoldL1`, and `undo?()` optional on `PublishPlatform` | **WORKING** |
| Switching off never gated | `effectiveLevel`: `direction === "disable"` returns before anything else | **WORKING** |
| The owner told when their setting was not honoured | `levelNote` | **WORKING** |
| 27 invariant tests, incl. "for EVERY spend action in the registry" | `tests/autonomyLevels.test.ts` | **WORKING** |
| Risk and action type per action, 33+ keys | `src/lib/executionPolicy.ts` `ACTION_POLICIES` | **WORKING** |
| Every unattended toggle, with its risk | `AUTOMATION_TOGGLES`, 6 toggles, 4 `critical` | **WORKING** |
| Approval history: approved / rejected / **modified** | `pending_approvals`, + `modified_details` (migration 127) | **WORKING** |
| Decisions and outcomes, with verdicts | migration `215`, `216` | **WORKING** |
| One door for state change | `tests/stateChangeDoor.test.ts` (S6) | **WORKING** |
| A mechanical claim gate on saved output | `scripts/eval/outputGate.eval.ts` | **WORKING, offline** |
| An on-demand claim review of the LIVE site | `src/lib/claims/siteClaimsReview.ts`, `/api/seo/claims-review` | **WORKING, owner-driven** |

**Only one platform implements `undo()`** — `src/lib/publish/platforms/
hawlaiSite.ts`. So today only the business's own site actions can hold
even L1. Shopify, Meta and the shop platform cannot. That is a fact
about what L2 can cover, and §8 uses it.

---

## 3. What L2 means, exactly

L0 and L1 are already written down in two places (the file header and
migration 209's comment) and they agree:

- **L0** — nothing happens until a human approves that instance. A
  `pending_approvals` row every time.
- **L1** — acts on **the owner's own chat instruction**, with no second
  approval click, *because the change is reversible*: a before-state is
  stored, an audit row is written, and an undo exists.

**L2 is the one where nobody instructed it.** The growth manager finds
something in the morning run and fixes it, and the owner reads about it
afterwards. That is the whole difference, and it is the difference that
matters: at L1 a human has looked at the thing and said do it. At L2 the
product acted on its own judgment.

**So L2 needs everything L1 needs, plus three things L1 does not:**

| L2 requires | Why | Exists? |
|---|---|---|
| An undo | same as L1 | yes, for the site platform |
| **Evidence that this action, for this business, has been right before** | there is no human in the loop to catch a bad one | §8 — rows exist, rule does not |
| **A record of what actually went out** | otherwise nothing can notice it was wrong | **NO — §5** |
| **A cap** | an unattended loop that is wrong is wrong at machine speed | no |

---

## 4. The founder's standing rule, and what it implies

> *"kabhi nuksaan na ho, sirf growth"*

Read strictly, that rule does **not** say "be careful". It says the
product must be able to **tell** whether harm happened. A level that
rises on measured data and never falls is not cautious; it is a one-way
ratchet with no instrument. **Demotion is the harder half of S7 and it
is the half that justifies the other.**

Hence the order in §7: the instrument first, the promotion last.

---

## 5. THE GAP — C7's online monitor, measured rather than assumed

§3's S7 row says it in one line: *"demotion must fire on the first
unsupported claim reaching the public, which means C7's online monitor
has to exist first"*. Here is what that actually means in this
repository today.

### 5a. What the claim check produces, and where it goes

`generateCopy` (`src/lib/content/generateCopy.ts`, 1,195 lines) returns
a `CopyResult` carrying `removed`, `substantiation`, `priceWarnings`,
`droppedSentences`, `publishable` and `blockedReason`. Every one of
those is exactly the signal a monitor would want.

**None of it is written anywhere.** `src/lib/claims/` contains nine
files; a grep for writes across all of them finds **reads only** —
`businessFacts.ts` queries fifteen tables and nothing inserts. The
verdict lives in memory for the duration of one request and is then
gone.

So the question *"how often did a sentence we could not support reach a
customer this month?"* cannot be answered today. Not approximately —
**at all**.

### 5b. What reached the public is only partly recorded

| Surface | Is the text stored? |
|---|---|
| email | **subject only.** `email_sends` (migration 088) has `to_email`, `subject`, `via`, open/click counts. No body |
| social post | yes, in `content_pieces` / `social_post_queue` |
| page copy | yes — `website_pages` IS the live page (no draft layer) |
| WhatsApp / DM reply | not checked for this plan; and see §5d |
| lead message | not checked for this plan |

A monitor cannot monitor what was never written down. **This is the
piece that has to be built, and it is a smaller job than it sounds:**
one table, one writer, called from the one door S6 built.

### 5c. The monitor itself is largely already written

This is the good news, and it is why the gap is an **M**, not an **L**.

`scripts/eval/outputGate.eval.ts` already does the hard part. Its own
header says what it is: it reads a finished run's **surviving**
sentences back out, asks the extractor about them **from scratch**, and
flags any claim of a type nothing can license — benefit, safety,
capability, comparison, customer_state. Its reason for existing is
exactly the one that applies here:

> *"THE RUN CANNOT BE THE JUDGE OF THE RUN."*

It costs about **₹3** against ₹12 for the run it gates. It operates on
**saved output** — which is precisely what §5b has to start saving.

`src/lib/claims/siteClaimsReview.ts` is the second half: it already
reads **live** pages and runs `findUnsupportedClaims` over them. It is
owner-driven today; the monitor would run the same check unattended.

**So the online monitor is not a new invention. It is these two pieces,
pointed at a table that does not exist yet, on a schedule.**

### 5d. And one standing safety flag that belongs in this plan

The auto-reply plumbing is broken while its toggles are ON —
`dm_auto_reply` and `comment_auto_reply` are `true` in production for
candle_by_qaaf and `auto_reply_log` has **zero rows, ever** (diagnosed
4 November, deferred by the founder). Both toggles are `critical` in
`AUTOMATION_TOGGLES`, so neither can ever be raised above L0 anyway —
but the shape of that fault is the exact shape S7 must not repeat: **a
switch that says "on" over a path that does nothing.** A level that
says L2 over a monitor that is not running would be the same thing, and
worse.

---

## 6. What has to be built first — the two pieces before any level moves

### M0. The record of what went out — `claim_checks`

One row per customer-facing output that **actually went out**, written
at the moment of the send, carrying what the gate said about it.

Not a new door: S6 put every state change behind an Action, so there is
one place per family to write from. Not a new model call either — the
figures are already computed.

Shape, for the founder to run when we get there (**not now**):
`dealership_id`, `surface` (email / social / page / whatsapp / lead
message), `action_id` (the Action it belongs to, nullable), `text_hash`,
`claims_total`, `claims_unsupported`, `removed_count`,
`published` (did it actually go out), `monitor_verdict` (null until the
monitor has looked), `created_at`.

**`published` is the load-bearing column.** A claim that was caught and
removed is the system working. A claim that went out is the system
failing. A table that cannot tell those apart would make the demotion
rule fire on its own successes.

### M1. The monitor — `outputGate` on live rows, on a schedule

A daily subsystem in the `signals` group (`src/lib/automation/
cronGroups.ts`), which already exists and already has a dispatcher
behind it — fixed yesterday, 401s and all.

It reads yesterday's `claim_checks` rows where `published = true`, runs
the same extractor pass `outputGate.eval.ts` runs, and writes
`monitor_verdict`. Cost is bounded by the same `BUDGET_INR` ledger the
eval harness uses and by a per-day row cap.

**It must be able to say "I could not check".** An unreachable extractor
is not a clean bill of health — that is F-01's lesson, which
`autonomyLevelsStore.ts` already applies to levels and which this
inherits: *a site that cannot read its own permissions must ask, not
act.* A monitor that could not run **suspends promotion** and, after a
threshold, **demotes**. Silence is not evidence.

---

## 7. The phases

| Phase | What | Size |
|---|---|---|
| **P0 — DONE 6 Nov, see §16** | **The exit test first**, red. It asserts promotion, demotion, "spend is never auto", and that the instrument exists | S |
| **P1 — DONE 5 Nov, see §16** | **M0: `claim_checks`** — migration 217, writer, wired at the publish door. Nothing reads it yet. One-shot sends are P1b | M |
| **P2 — DONE 6 Nov, see §17** | **M1: the monitor** — the daily subsystem, the verdict column, the "could not check" case, the cost cap | M |
| **P3 — DONE 6 Nov, see §18** | **Demotion** — fires on a published unsupported claim, instant, ungated, and tells the owner. **Built BEFORE promotion exists**, so the brake is in place before the accelerator | S |
| **P4 — DONE 6 Nov, see §19** | **L2 in the type and in the database** — migration 220 widens 209's CHECK and adds the allowlist constraint, `AutonomyLevel` gains `"L2"`, `canHoldL2` written with its own refusals. Nothing is promoted | M |
| **P5 — DONE 6 Nov, see §20** | **Promotion** — the evidence query over `pending_approvals` + `outcomes`, and the proposal (§8) | M |
| **P6 — DONE 6 Nov, see §21** | **The cap**, per business per day, the owner's screen, and the morning that asks | S |
| **P7 — DONE 6 Nov, see §22** | **Exit test green**, and the honest account of what is unverified live — an L2 action has by definition not run unattended for long when the stage closes | S |

**P3 before P5 is the whole shape of this plan.** Build the thing that
takes permission away before the thing that grants it.

---

## 8. Promotion — from which data, exactly

The §3 row says "promotion from data", and the data already exists. No
new tracking is needed for the promotion side — only for the demotion
side, which is §5.

**The evidence, per business per action key:**

| Signal | Row | Reading |
|---|---|---|
| Approved as requested | `pending_approvals.status = 'approved'`, `modified_details IS NULL` | the owner agreed with us, unchanged |
| Approved but changed | `modified_details IS NOT NULL` | we were close and still wrong. **Not** evidence for L2 |
| Rejected | `status = 'rejected'`, `rejection_reason` | we were wrong |
| Ignored | still `pending` well past its day | **not** agreement. Counted apart |
| Did it help | `outcomes.verdict`, `delta`, `attribution` | `worsened` disqualifies; `not_measurable` is not a pass |

**Four things worth stating now, because each is a place this could go
wrong quietly:**

1. **A modification is a failure, not a pass.** Migration 127 exists
   because the owner sometimes approves ₹3,000 where we asked for
   ₹5,000. Counting that as agreement is how a product promotes itself
   on evidence of its own inaccuracy.
2. **An ignored card is not consent.** A row nobody ever touched is the
   owner not looking, and reading it as approval is the single most
   dangerous mistake available here.
3. **`not_measurable` does not count.** S5 made that a first-class
   verdict precisely so "we could not tell" would stop being filed as
   "it was fine".
4. **Only actions whose platform can undo may be considered at all** —
   today that is `hawlaiSite` alone, which makes the realistic first L2
   candidate `update_page_meta`: a search title and description, fully
   reversible, nothing spends, nothing reaches a customer's inbox, and
   it is the thing the owner has been approving repeatedly since
   migration 203 shipped on 29 September.

**And promotion does not grant itself.** My recommendation, which is
one of the questions in §11: when an action earns L2, the product
**asks once** — an ordinary approval card, with the evidence on it:
"you have approved this 14 times without changing it, none were
rejected, and the two we measured both improved. Shall I do this on my
own from now on?" One click, recorded in `decisions` as kind
`approval_granted`, revocable from one screen.

That keeps "promotion from data" completely honest — the product earns
it and the owner grants it — and it costs nothing in capability. The
alternative, a product that silently widens its own permissions because
a counter crossed a threshold, is a different product from the one
CLAUDE.md describes.

---

## 9. Demotion — automatic, instant, and never slower than promotion

**The trigger:** one `claim_checks` row with `published = true` and the
monitor's verdict saying a sentence nothing licensed went out.

**What happens, in this order:**

1. The action that produced it → **L0**, immediately. Row updated, not
   deleted — the history of a revoked permission is part of the audit.
2. An entry in `decisions` (kind `automation_switched`) with the
   `claim_checks` row as its `why` pointer, so the demotion is itself a
   measurable decision rather than a silent correction.
3. The owner is **told**, in the next daily email and as a notification
   — in the words he uses, naming what went out and what has changed.
   The S6 pattern applies: a limit that lives only in a log is a limit
   nobody knows about.
4. The action cannot be re-promoted on the old evidence. The counter
   restarts.

**Three design rules, each from something already in the codebase:**

- **Demotion is never gated.** CLAUDE.md rule 6: *"Switching an
  automation off is never gated — the safe direction must not be the
  slow one."* `effectiveLevel` already returns before consulting
  anything when `direction === "disable"`. Demotion takes the same
  shape: no approval, no card, no wait.
- **It fires on the first one, not on a rate.** A rate needs a
  denominator and a window, and both are arguments to have while a
  wrong claim is live. One is the threshold.
- **A monitor that could not run is not a pass.** §6's M1: after a
  threshold of unchecked days, everything at L2 for that business goes
  back to L0, and the owner is told why. The alternative is an
  autonomous product whose supervisor quietly died.

---

## 10. What stays pinned to L0 for ever

Already enforced, and S7 **extends** these tests rather than touching
them:

| Pinned | By what | Why |
|---|---|---|
| anything `actionType: "spend"` | `PINNED_ACTION_TYPES` | the founder's standing rule. This is the exit test's own clause |
| anything `actionType: "delete"` | `PINNED_ACTION_TYPES` | an undo cannot restore what is gone |
| anything `riskLevel: "critical"` | `PINNED_RISK_LEVELS` | *"a public post cannot be unseen any more than a placed call can be unplaced"* |
| the four `critical` toggles | `AUTOMATION_TOGGLES` | dm_auto_reply, comment_auto_reply, auto_call_new_leads, content_autopilot |
| any action nobody classified | `pinnedToL0`'s first line | absence is never permission |
| any action whose platform cannot undo | `canHoldL1`, and `canHoldL2` will inherit it | reversibility is the entire justification |

The existing test *"FOR EVERY SPEND ACTION IN THE REGISTRY, not just the
one I thought of"* is the right shape and gets a second walk for L2.

---

## 11. Two tests stand in the way, by design — and that is rule 7

CLAUDE.md rule 7 says do not weaken an existing test to make a change
fit; bring it to the owner. **Two of them block this plan on purpose,
and both were written to block exactly this.**

1. **`tests/autonomyLevels.test.ts:73` — "AND THE DATABASE CANNOT EVEN
   SAY L2".** Migration 209's `CHECK` allows `L0` and `L1` only, and
   its own comment explains why: *"A code-only guard would be one edit
   away from gone; a row that cannot be written is not."*
2. **`tests/autonomyLevels.test.ts:162` — "THE TYPE AND THE CONSTRAINT
   CANNOT DRIFT APART".**

**What I propose, and it is stricter rather than looser.** The invariant
being protected is not "L2 cannot exist" — it is "a level cannot be
written that the code has not earned the right to honour". So when the
migration widens:

- the `CHECK` becomes `level in ('L0','L1','L2')`, and
- a **second** constraint or a trigger refuses `L2` for any action key
  not on an explicit allowlist, and
- the test is restated to walk every spend, delete and critical action
  and assert **the database refuses L2 for each**, not merely that L2 is
  unspellable.

Migration 209 pointed at the precedent itself: *"a later migration
widens this CHECK the way 179 and 204 widened
`publish_actions.platform` — one value at a time, as each is actually
earned."*

**I am not doing that without your word.** It is question 1 in §12.

---

## 12. What I need decided

Six questions. Each has my recommendation first, and each would change
what gets built.

**1. May the database learn to say L2 at all, and under the constraint
in §11?**
*Recommend: yes, with the allowlist constraint, restating the two tests
as described.* Without this the stage cannot start.

**2. Does promotion ask you once, or happen on its own?**
*Recommend: it asks once, with the evidence on the card (§8).* A
product that widens its own permissions silently is a different product
from the one this repo describes. The cost is one click per action per
business, ever.

**3. Which action is the first candidate for L2?**
*Recommend: `update_page_meta` alone* — the search title and
description. Reversible, undo-backed, nothing spends, nothing reaches an
inbox, and it is the action you have approved most often. Everything
else waits for its platform to implement `undo()`.

**4. How much evidence is enough?**
*Recommend, as a starting policy to be argued with:* **10** approvals
as-requested, **0** rejections, **0** modifications, over at least **30
days**, with at least one `outcomes` row that is not `worsened` and not
`not_measurable`. These are policy numbers in one file, with a test, not
constants scattered about.

**5. How wide does a demotion reach?**
*Recommend: the offending action → L0 instantly; and if the output was
PUBLIC (a page, a post) rather than one person's inbox, every L2 on that
business → L0.* A claim that is wrong on a public page is usually wrong
in the next email too.

**6. What is the daily cap at L2?**
*Recommend: 3 unattended actions per business per day, for the first
action, for the first month.* A cap that turns out to be too low is a
line in one file; a cap that turns out to be too high is a morning you
read about afterwards.

---

## 12a. ANSWERED — all six, 5 November 2026

The founder approved every recommendation in §12 as written:

| | Answer |
|---|---|
| 1 | The database learns L2, **with an allowlist rule in SQL** that refuses it for everything else. Both tests restated |
| 2 | **Promotion asks once**, with the evidence on the card. The product never writes its own permission |
| 3 | First and only L2 candidate: **`update_page_meta`** |
| 4 | **10** as-requested approvals, **0** rejections, **0** modifications, **30+** days, **≥1** outcome that is neither `worsened` nor `not_measurable`. In one file, with a test |
| 5 | Offending action → L0 instantly; **if the output was PUBLIC, every L2 on that business → L0** |
| 6 | **3** unattended actions per business per day |

Each of the six is now a number or a list in `tests/open/s7ExitTest.test.ts`
that cannot be edited without failing a test.

---

## 15. P0 — the exit test, written first — 5 November 2026

**Done.** `tests/open/s7ExitTest.test.ts`: 18 assertions, **1 green and
17 red**, run with `npm run test:open`.

### A correction to this plan, before anything else

The P0 row used to read *"The exit test first, red, **as S5 and S6 both
did**"*. That is **wrong about this repository's own history**, and I
wrote it. Checked after the founder approved the plan on the strength of
it:

```
ea8e7e7  S6/P6: the exit test, and the measure's own limit
010e12f  S5/P6: the exit test, and what it cannot prove
```

Both stages wrote their exit test at **P6 — last**. S6/P0 was the
*measure* (`stateChangeDoor.test.ts`), not the exit test. So writing it
first is a **new** practice in this codebase, not a continuation of one,
and the reason to do it stands on its own: written last, an exit test is
shaped by what was built. S6's own exit test records me finding that two
of its assertions were satisfiable by any occurrence in the file.

### The cost of writing it first, and what was done about it

An exit test written first is red for the length of the stage, and rule
1 is *"real exit codes, pasted"*. A default suite carrying one known-red
file means every commit for weeks pastes "1 failed" and asks the reader
to remember which failure was expected. **That is how a red suite stops
meaning anything.**

So it lives in `tests/open/` and runs under its own command — the same
arrangement the smoke tests have, for a related reason — and
`tests/stageOpen.test.ts` runs in the **default** suite to hold that
arrangement down:

- the exclusion exists and names that directory, **with its reason
  beside it**
- `vitest.open.config.mts` exists, covers exactly that directory, and
  refuses to pass on an empty run
- `npm run test:open` exists and points at that config
- every file in there carries a dated **`STAGE_OPEN`** marker naming the
  stage, the day it opened and the phase that closes it, and saying that
  **RED is the expected state**
- `tests/open` is not empty — if a stage closes and nothing replaces it,
  the config, the script and the guard should all be deleted rather than
  inherited

**"Excluded from the suite" must never quietly become "nobody runs it".**
That is the shape of the auto-reply fault still open in production: a
switch that says on, over a path that does nothing.

### One assertion is green, deliberately

*"THE REGISTRY STILL CONTAINS SPEND AND CRITICAL ACTIONS TO PIN"* passes
today. A file that is red from top to bottom proves nothing about
whether its assertions can ever pass, and a walk over an empty list is
the shape of a guard that has stopped guarding.

**And its number was wrong first.** I wrote "more than 8" and the real
count is **4** — `activate_ad_campaign`, `change_campaign_budget`,
`refund_approve` spend; `update_product_price` is critical; nothing
deletes yet. Counted now, and all four named, so an action losing its
classification fails rather than passing a loose threshold.

### 13 mutation checks, 13 killed

Against `tests/stageOpen.test.ts`, since the exit test itself cannot be
mutation-checked while it is red — that happens at P7. One of mine was
wrong first and the guard was right: a marker reading `2026-13-45` still
matches the date pattern, so the DATE assertion catches it, not the
marker assertion. The mutation named the wrong guard.

### What the exit test now fixes, that P1-P6 must satisfy

| Module | What it must export |
|---|---|
| `src/lib/autonomy/policy.ts` | `PROMOTION_EVIDENCE`, `L2_ALLOWLIST`, `L2_DAILY_CAP` |
| `src/lib/autonomy/promotion.ts` | `earnsL2`, `proposePromotion` — and it may **not** write `action_levels` |
| `src/lib/autonomy/demotion.ts` | `demoteAfter` — and it may **not** create an approval |
| `src/lib/autonomyLevels.ts` | `maxLevelFor`, `canHoldL2` (extends the existing file; no new door) |
| `src/lib/claims/claimChecks.ts` | `recordClaimCheck` |
| `src/lib/claims/outputMonitor.ts` | `runOutputMonitor`, `MONITOR_BLIND_DAYS` |
| a migration | `claim_checks`, with `published` and `claims_unsupported` and RLS |
| a migration | 209's CHECK widened to `L2`, plus the allowlist rule naming `update_page_meta` |
| `cronGroups.ts` | `output_monitor` in the `signals` group |
| this plan | a section headed **`### S7 EXIT — what this stage did not prove`** |

That last row is deliberate: the exit test reads the plan's exit section
by **heading**, not by section number, because this plan gains a section
per phase the way S6's gained §8 to §17.

---

## 16. P1 — the record of what went out — 5 November 2026

**Done.** Migration **217** (`claim_checks`), `src/lib/claims/
claimChecks.ts`, and one call site: `executePublishAction`, on
`executed`.

### Why the executor and not the tool

The counts come from the claim guard, which runs in the tool, hours or
days before anything goes live. `published` is only knowable in the
executor, which is *the only thing that runs a publish action*.

So the counts **ride on the action row**, in
`requested_changes.claimCheck`, and the executor writes the row.
Migration 216's lesson applied rather than re-learned: an action and the
record of it happen in the same instant, and anything reconstructed
afterwards is a guess.

**Structured, not prose.** `claimWarnings` already rides on the same row
and is sentences for the owner to read. Counting those would be a reader
grepping its own copy — CLAUDE.md rule 8's subject. The numbers travel
as numbers.

**After `finish`, not before.** The merchant's page edit is the real
work; the row is bookkeeping for P2's monitor. A slow or refused insert
must not sit between a successful platform write and the row that says
so, and a bookkeeping failure must never undo an edit that landed. Both
are tested.

### THE COLUMN THE PLAN DID NOT HAVE: `owner_words`

Found while reading the page tools rather than designing from the plan,
and without it **the demotion rule would have been wrong**.

Both page tools already have this branch: when the owner says he wrote
the line himself (`writtenByOwner`), an unsupported claim is **kept** and
he is told plainly that he is the one standing behind it. That is an
unsupported claim reaching the public — and it is **his sentence, not
ours**. Demoting an autonomy level for it would take away a permission
he never misused.

So the row carries two counts that mean opposite things, and a flag for
whose words they were:

| Column | Meaning |
|---|---|
| `claims_removed` | the guard took it out. It reached nobody. **A high number here is the system working** |
| `claims_unsupported` | kept and published. Expected 0, except the case above |
| `owner_words` | true only when something was kept AND it was his wording |

`owner_words` is forced false when nothing was kept. The dangerous
direction is the other one: a clean row marked as the owner's
responsibility would excuse a later escape that was ours.

### The text is stored, and the plan was wrong to say `text_hash`

The monitor's whole job is to read the surviving sentences back and ask
the extractor about them again from scratch. **A hash cannot be
re-read.** So `text` holds the copy as it went out, and P2 clears it once
a verdict exists, keeping only the sentences that were refused.

**And a question for the founder rather than a decision made for him.**
For the page surfaces this is the business's own marketing copy and
nothing about any person. When P1b widens it to emails and WhatsApp
replies, **the text will contain a customer's name**, and the retention
rule becomes a DPDP question rather than a tidiness one. Written into
migration 217's header so it cannot be lost.

### Unverified live

Migration 217 **has not been run** — the owner runs all SQL by hand.
Until he does, `recordClaimCheck` fails on every executed page edit and
says so, naming the migration, and **the edit still lands**: the row is
bookkeeping and cannot fail the work. The first live check is one page
edit in chat, approved, followed by one `select` on `claim_checks`.

### AND THE EXIT TEST ITSELF HAD THE FAULT IT WAS WRITTEN TO PREVENT

Two of its assertions went **green at P1 without the thing they assert
existing**. They look for the plan's exit section with
`plan.indexOf("### S7 EXIT — …")`, and §15's contract table above has a
row that NAMES that heading. A plain `indexOf` cannot tell a heading
from a sentence about one.

This is the same fault S6's exit test recorded twice — an assertion
satisfiable by any occurrence — and it is the reason writing the exit
test first is worth the quarantine: **it surfaced after one phase
instead of at the end of the stage**, because the plan grew underneath
it while it was still red. Anchored on a heading at the start of a line
now, and both are red again.

### 24 mutation checks, 24 killed — and one survived first

**M8 survived**: replacing `claims_unsupported: field.keptUnsupported`
with a hard `0` changed nothing any test could see, because **every
fixture had a kept count of zero**. The column that stops S7 demoting
for the owner's own sentences was unobserved by the whole file. The
assertion that catches it had to be written with a non-zero value.

**And one branch was unreachable.** `recordExecutedPublish` checked the
surface map before the registry, and since every mapped key is in
`ACTION_POLICIES` — pinned by its own test — nothing could ever arrive
mapped-but-unclassified. The test I wrote for that branch passed on the
*surface* check and proved nothing. The two checks are now in the other
order, so both are reachable with real keys: a key in neither place
lands on the registry check, and a key the registry knows but nobody
mapped (`update_product_name`) lands on the surface check.

**One test fixture was a test of nothing**, too: `tests/
pageClaimCheckField.test.ts` first mocked the facts gatherer, and
`factsFor` returns `ctx.facts` before it ever reaches the database — so
the guard was skipped and every assertion was about a path that did not
run. The log said `couldn't gather facts` and the tests failed for the
right reason by luck. Facts go on the context now.

---

## 17. P2 — the second judge — 6 November 2026

**Done.** `src/lib/claims/outputMonitor.ts`, wired as the
`output_monitor` subsystem.

### It is the eval gate, pointed at live rows

`scripts/eval/outputGate.eval.ts` already re-asks the extractor about a
finished run's surviving sentences, from scratch, and flags any claim of
a type nothing can license. The monitor reuses **its set** — imported,
not re-listed — **its splitter** (`copySentences`, with hashtags opened
out, which is the mistake that cleared a run on 20 October) and **its
free checks** (`notCopySentences`, so a placeholder costs nothing). Two
differently-worded judges would give one question two answers.

### Three decisions worth reading

**1. `heavy`, not `signals` — and the exit test was wrong.** P0 wrote
`GROUPS.signals` because this plan said so. `cronGroups.ts` settles it
the other way in its own words: signals is *"database-only and fast… so
it runs FIRST and never queues behind LLM calls"*, and the monitor calls
a model on every row.

Changing an exit test's expectation is exactly what writing it first was
meant to prevent, so it changed in **one direction only**: the assertion
is now **stricter**. It pins the group, pins that signals does *not*
contain it, and pins the **position** — `output_monitor` must come
before `daily_autopilot`, because `daily_autopilot` sends the daily
email and a monitor running after it would report today's escape
tomorrow. That entry is also the one that went unreached on 4 and 5
November when the dispatcher's secret went stale.

**2. A cap, not a flag.** A switch defaulting to off would recreate the
fault still open in production — `dm_auto_reply` reading "on" over a
path that does nothing — with the sides swapped: a monitor that says it
is running while it checks nothing. So it always runs and what bounds it
is arithmetic: **20 rows and ₹2** per business per run, a **14-day**
lookback, and a free code-only check first so a placeholder is never
paid for.

**And the cap is not a pass.** The rows it skips keep ageing, so
`blindDays` grows and P3 sees it. A budget that could quietly certify a
product as safe would be the worst kind of saving.

**3. Blindness is measured from the oldest thing still waiting**, not
from when the monitor last ran. A monitor that runs every morning and
fails every morning has run recently and seen nothing — measuring its
own activity would report that as healthy. `MONITOR_BLIND_DAYS = 2`,
because the dispatcher sent a stale secret for exactly two days and
nobody knew until the owner noticed a missing email.

**`null` is not zero.** A business that published nothing is not a
business whose monitor is working; it is one with nothing to monitor,
and P3 must not read the two the same way.

### What is kept, and the plan said otherwise

The plan said to clear `text` and keep only the refused sentences. On
building it: the copy of a row that was **wrong** is the evidence behind
a demotion the owner will be told about, and a row that **could not be
checked** has to be readable to be checked again. So the only copy
dropped is the copy nothing was wrong with, and `could_not_check` stays
in the monitor's own query beside `null` — writing it as a final verdict
would retire a row nobody has actually read.

### Unverified live

The monitor has **never run against the live database**. `claim_checks`
has 0 rows, so there is nothing for it to read until a page edit goes
through — and the first thing to check is not the monitor but P1: one
edit, one row. The monitor's first real run will be the morning after
that, inside the heavy group, and its cost will show in the usage log
like every other model call (it passes `logContext`).

**26 mutation checks, 26 killed**, with no survivors on the first pass —
the first stage in this project where that happened, and the reason is
that this file had a worked example to copy rather than a design to
invent.

---

## 18. P3 — the brake — 6 November 2026

**Done.** `src/lib/autonomy/demotion.ts`, plus migration **218** (one
notification kind) and `monitorAndDemote` joining it to P2's monitor in
the daily run.

### The rule, as the founder decided it

| | |
|---|---|
| One published unsupported claim | demotes. **Not a rate** — a rate needs a denominator and a window, and both are arguments to have while a wrong claim is live |
| A claim that was **caught** | demotes nothing. `claims_removed` is the system working |
| **The owner's own wording** | demotes nothing, ever. P1's `owner_words` |
| A **public** surface | every raised level on that business → L0 |
| One person's inbox | that action → L0 |
| An **unclassified** surface | treated as public. The safe direction is *more* demotion |
| **Two days** with nothing checked | demotes, business-wide. Silence is not evidence |
| Nothing published at all | demotes nothing. `null` is not a large number of days |
| A **failed** monitor run | demotes nothing. A database outage is not an escape |

**And it asks nobody.** Rule 6's shape, and three tests hold it there:
no `requestApproval`, no `pending_approvals`, and the file never writes
a level upward.

### The owner is told in three places, which fail in different ways

A `decisions` row (`automation_switched` — its first writer since
migration 215 declared the kind), a notification, and a log line. The
notification needs **migration 218**: `notifications.kind` is
CHECK-constrained and `emitNotification` swallows a refused insert, so
without it the brake would work, record itself, and tell him nothing.
The log line depends on no constraint at all.

**P3a** will put the same sentence in the daily email, which is the
surface he actually reads.

### A REAL BUG, FOUND BY A TEST FAILING FOR THE RIGHT REASON

The monitor's zeroed run was a module-level constant, and **spreading it
copies the array reference** — so every run pushed its escapes into the
same array the constant held.

The daily cron runs every subsystem for every business inside one
invocation. So one business's run would have carried another's escapes,
and **P3 would have taken a permission away from the second for
something the first published.** A cross-tenant decision, out of one
shared literal, and it would have been invisible until it happened.

Found because a test asserting the owner's-words flag on a *second* run
read the *first* run's escape. It is now a function, and the
cross-tenant case is a test of its own.

### 31 mutation checks, 31 killed — and five of mine were wrong first

Worth listing, because four are the same mistake:

- **`undefined ?? call()` evaluates `call()`.** Two mutations meant to
  delete a call left it running and changed nothing. Replacing the
  *import* with a local stub removes it — and also steps past the
  module mock.
- **One inverted a logging branch** and left the `return` it was about
  standing, so the behaviour was unchanged and a different test failed.
- **One reintroduced the shared array** by adding the key *before* the
  original, where the later key wins.
- **One produced code that did not parse**, so the run died with no
  failing test. "Non-zero exit" is not "the guard is tested" — the
  third time that has come up in this stage.

### An existing test caught the wiring, and the code moved

`tests/dailyRunOrder.test.ts` checks every runner entry against one
shape: `  <key>: (s, `. An inline async body broke it. **That test
catching this is the test working**, so the join became a named
function, `monitorAndDemote`, and the runner table went back to one
line per subsystem — which is what that file says it is for.

### Unverified live

Nothing has been demoted, because nothing can be promoted until P4/P5
and `action_levels` is empty. The rule, the write, the record and the
telling are all tested; **none has fired against the live database.**
The first real exercise needs an L2 row to take away.

**Migration 218 is not run yet.** Until it is, the notification lands
nowhere; the decision row and the log line still happen.

---

## 19. P4 — L2 exists, and nothing can grant it — 6 November 2026

**Done.** Migration **220**, `src/lib/autonomy/policy.ts`, and
`canHoldL2` / `maxLevelFor` in `autonomyLevels.ts`.

**Nothing is at L2.** The allowlist holds one key, no row has been
written, and promotion does not exist — so the type can express L2 and
nothing in the product can grant it. `tests/autonomyLevels.test.ts`
asserts `src/lib/autonomy/promotion.ts` is absent, which goes red the
moment P5 starts, deliberately.

### Two constraints, not one

Widening the level check alone would let any action key hold L2 the
moment the code allowed it. So migration 220 also adds
`action_levels_l2_allowlist`, naming the keys that may — and the
database refuses L2 for everything else: not by a bug, not by a
migration that forgets, not by an admin script.

**This does not contradict 209's "action_key has no CHECK
constraint".** 209 refused to enumerate every action key because the
policy table is code and moves faster than migrations — still true, and
L0 and L1 remain open to any key. What 220 enumerates is the far smaller
set **allowed to run with nobody watching**. That is a safety boundary,
not a catalogue, and it is meant to move slowly.

### The two tests, restated and stricter

**`"AND THE DATABASE CANNOT EVEN SAY L2"`** asserted 209's CHECK allowed
`L0` and `L1` only. The invariant it protected was never "L2 cannot
exist" — it was *"a level cannot be written that the code has not earned
the right to honour"*, and that was the strongest statement available
while L2 was unreachable. There is a stronger one now: the test walks
**every** spend, delete and critical action in the registry and asserts
the **database** refuses L2 for each, plus a new test pinning the code's
allowlist against the SQL one so they cannot drift.

**`"THE TYPE AND THE CONSTRAINT CANNOT DRIFT APART"`** named migration
209 and broke the moment 220 widened it. It now **finds** the newest
migration defining `action_levels_level_check` — the check is
drop-and-recreate, so only the highest-numbered one describes what the
database accepts, and naming a file means editing this test every time
the thing it guards changes. That is the edit that gets made carelessly.

**And two fixtures stopped being hypothetical.** Both
`autonomyLevels.test.ts` and `approvalCoverage.test.ts` used `"L2"` as
their example of *a level this build does not understand*. They now use
`"L3"`, which is the test they always were — and `approvalCoverage`'s is
stricter: it also asserts a level the build **does** understand comes
back, because "everything reads as null" would pass the old version
while making every level unreachable.

### THE EXIT TEST FOUND TWO REAL THINGS, which is why it was written first

**1. `set_automation_toggle` was not pinned.** It is classified `edit` /
`high` — not spend, not delete, not critical — so every rule let it
reach L1. ACTION_POLICIES' own comment says what it is: *"THE ONE THAT
TURNS OFF EVERY OTHER GATE. After this runs, content publishes and
emails send with nobody looking."* Four of the six `AUTOMATION_TOGGLES`
are critical. **An action whose effect is to start one of those cannot
be less gated than the thing it starts.** Now pinned by key, with the
reason recorded, and switching OFF is unaffected — rule 6 returns before
any of it.

**2. A positional boolean silently un-gated an action.** P4 wrote
`canHoldL2(key, hasUndo: boolean)` to match `canHoldL1`'s shape. The
exit test, written first, called it as `canHoldL2(key, { hasUndo: false
})`. The boolean parameter accepted that object, read it as **truthy**,
and answered `ok: true` for an action with no undo.

The failure mode of a bare boolean here is a **silent un-gating** — the
one direction this file exists to make impossible. Both functions now
take `{ hasUndo }`, so there is no caller it can be passed wrongly from.

### 21 mutation checks, 21 killed — and one equivalent mutant recorded

**Two survived first, and the gap was real:** the only assertion pinning
`set_automation_toggle` lived in `tests/open/`, which the default suite
does not run. A guard the exit test found would have gone unprotected
until P7 closed the stage. It is now asserted in the default suite too,
with a check that the REASON stays true: pinned because what it switches
on is critical, so if no toggle were critical any more the pinning would
need re-arguing rather than silently surviving.

**And one is recorded rather than fixed.** `!["L1","L2"].includes(level)`
and `level === "L0"` are the same function today, because those are the
only three levels. No test can tell them apart, and contorting one to
try would be testing the shape of an expression rather than its
behaviour. The list form becomes wrong the day an L3 exists; the comment
in `autonomyLevels.ts` says why the identity form is the one to keep.

### Unverified live

**Migration 220 is not run yet.** Until it is, nothing changes: the code
can express L2, `action_levels` is empty, and a row cannot be written at
L2 by anything. No action has ever held L2 anywhere.

---

## 20. P5 — the product asks, the owner grants — 6 November 2026

**Done.** `src/lib/autonomy/promotion.ts`, `PROMOTION_EVIDENCE` in
`policy.ts`, the `grant_autonomy` action, and the one branch in
`/api/approvals/[id]` that writes the level.

### Nothing new is collected for this

Promotion reads rows that already existed: `pending_approvals` has
carried status, `reviewed_at` and (since migration 127)
`modified_details` all along, and S5's `decisions`/`outcomes` carry
whether the work helped. **S7's new collection — `claim_checks` — is
for the demotion side**, which is the half that had no instrument.

### The four readings that would each be wrong in the same direction

| Reading | Why it is refused |
|---|---|
| A **modified** approval | Migration 127 exists because he sometimes approves ₹3,000 where we asked ₹5,000. That is us being wrong, not him agreeing |
| An **ignored** card | A row nobody touched is him not looking. **One is enough to disqualify** — not a threshold |
| `not_measurable` | S5 made it a first-class verdict so "we could not tell" would stop being filed as "it was fine" |
| Evidence from **before a demotion** | §9's rule: the counter restarts, or an action taken away for a real escape is re-promoted the same week on the approvals that preceded it |

And **volume cannot buy time**: forty approvals in three days is one
afternoon's enthusiasm, not a month of this working.

**Eligibility is checked before the evidence**, so the reason is the most
specific true one — "money is always a human decision" for an action no
amount of evidence could ever promote, rather than "not enough approvals
yet".

### The card, and the one thing it is for

```
You have approved "change a page's search title and description" 14
times over 46 days without changing what I asked for, none were turned
down, and the 2 times I could measure the result, none went backwards.
Shall I start doing this on my own? I will tell you every time I do, and
I will stop and ask again the moment anything I publish does not match
your records.
```

Every figure is a count of his own rows. **It never says "L2"** — he is
not choosing a letter — and it promises the two things that make the
answer safe, both of which are built: he is told each time, and S7/P3
takes it back by itself.

**The evidence goes on the row, not only in the sentence**, so "what did
this card claim" is answerable from the record rather than from a string
the browser once held — `sitePublishGuard`'s invariant, applied.

**And it does not ask twice.** A pending `grant_autonomy` card is
already the question; an action already at L2 does not need asking for.

### THE ONE PLACE A LEVEL IS RAISED is the approvals route

`promotion.ts` never writes `action_levels`, and a test asserts it never
will. The route re-checks the action key **against the allowlist** and
**re-checks the undo at the moment of granting** — the card may have sat
there a week, and a platform can lose its undo in a deploy. With
migration 220's constraint that is three gates, not one.

### Three test gaps the mutation checks found, all the same shape

Each assertion reached a refusal, but **not the refusal it was named
for**:

1. **The outcome filter.** The mock's `.in()` was a no-op, so every
   call got the same outcomes back and "is this decision about MY
   approvals" was invisible. Outcomes are keyed by decision now, with
   another business's among them.
2. **The undo check in `proposePromotion`.** The test used
   `update_product_name`, which the *evidence* rule refuses anyway, so
   the undo check was never reached. The only allowlisted action's
   platform *does* implement undo — so the only honest way to exercise
   it is to mock the registry and take the undo away.
3. **The same check in the route**, for the same reason, isolated the
   same way.

**And one "survivor" was my harness, not the guard:** vitest's verbose
reporter truncates a long `file > describe > name` path, so matching on
the full test name reported a killed mutant as a survivor. Worth knowing
for every mutation run in this project.

**32 mutation checks, 32 killed** once all four were honest.

### An existing test caught the new action, which is the rule working

`recordDecision.test.ts` asserts every action type is named in one of
`measures.ts`'s two lists. `grant_autonomy` is in the **not collected**
one, with its reason: what a granted permission did for the business is
not one number. The product *does* record what the action published
while running alone (`claim_checks`) — but the results job cannot read
that table, and naming it as a source would claim a measurability that
does not exist. P6 puts those counts on the owner's screen instead,
where they are read rather than scored.

### Unverified live

**No card has ever been raised**, because no business has ten
as-requested approvals of `update_page_meta` since its last demotion
with a measured outcome — which is the point of the threshold. The first
real card is weeks away by design, and nothing calls
`proposePromotion` on a schedule yet: **P6 wires it**, along with the
cap and the owner's screen.

---

## 21. P6 — the cap, the screen, and the morning that asks — 6 November 2026

**Done.** `L2_DAILY_CAP` enforced in `publish/create.ts`,
`autonomy_review` in the daily run, and a card on
`/dashboard/autopilot` backed by `/api/autonomy`.

### The cap closes rather than opens

Three a day, the founder's decision 6. Enforced **at the door that
reads the level**, because a cap checked anywhere else is one something
could get around by calling a different function.

**Reaching it ASKS — it does not fail.** The owner gets the ordinary
card and the work still happens on his word; nothing is lost but the
autonomy. And **an unreadable count means no room left**: a cap that
opens when the database hiccups is not a cap.

**An L1 action is not rationed.** It skips the question on the owner's
own instruction, and capping that would be rationing what he asked for.

**Counted from midnight IST**, not UTC — a cap that reset at 5:30am
local is one he would watch break at breakfast.

### The morning that asks

`autonomy_review`, in **`signals`** — it reads rows and writes a card,
and calls no model, which is that group's rule. The monitor is in
`heavy` and runs second, so **a card raised this morning rests on
yesterday's verdicts**. That is the honest ordering rather than a
compromise: evidence the second judge has checked beats evidence from an
hour ago that nothing has looked at.

**It says why it did not ask.** "Not approved often enough yet" is every
morning for weeks and belongs in the result; "the record could not be
read" is a fault and goes in the log. A subsystem reporting `asked: 0`
for both would hide the second for weeks.

### The screen, and the word it must not fold away

On `/dashboard/autopilot` — **not a new page**. That file's own header
calls it *"the one canonical automation control surface instead of one
of several partial ones"*, and rule 5 is depth over breadth.

It shows, per action: the level (as **"Runs on its own"** or **"Asks you
first"** — never a letter), why it is not higher, whether a question is
waiting, how many times it has acted alone today against the cap, and
what the second judge said about what it published.

**Three counts, and the middle one is not a kind of clean:**
`checked` · **`not checked yet`** · `did not match your records`. The
monitor runs the morning after, so today's work has no verdict — and
showing that as nothing-wrong is the confusion S7/P2 exists to prevent,
on a screen instead of in a table.

**`/api/autonomy` is read-only, and that is deliberate.** A level is
raised in exactly one place and lowered without asking anyone; a PATCH
here would be a third way to change a permission, which is the shape
every bypass in this codebase has had. It uses the **owner's own
client**, so RLS is the second gate on whose levels these are.

### 28 mutation checks, 28 killed — and four gaps found, all one shape

**The double ignored the filters it was given.** Dropping
`.is("approval_id", null)` from the cap's count and `.eq("published",
true)` from the screen's both changed nothing any test could see. A
double that returns the same rows whatever it is asked is not testing a
query — both fixtures now carry a row that the filter must exclude.

**And two assertions were satisfiable by an import.** "The cap consults
`capRemaining`" passed on the `import` line after the call was deleted;
"the card is on the page" passed on `import AutonomyLevelsCard` after
the JSX was removed. The cap is now tested **through the door** —
under the cap it acts, at the cap it asks, and an L1 action is not
rationed — and the page assertion reads the JSX.

**That shape has now appeared five times in this stage.** An assertion
satisfiable by any occurrence of its own subject.

### Flagged rather than changed: a name that is now misleading

`ALWAYS_REQUIRES_APPROVAL` in `publish/types.ts` lists
`update_page_meta`, which may now run unattended. **Nothing is actually
contradictory** — its doc comment says what it means ("whatever the
amount… separate from the rupee threshold") and
`approvalCoverage.test.ts` already allowed these keys to hold L1. But
the NAME is stronger than the rule, and it reads as a promise S7 breaks.
Renaming an exported constant used across several files is not this
phase's work; it is written here so the next reader is not misled.

### Verified live, and it was broken — 6 November 2026

The founder opened it. **The body was right and the action's name was
missing**: I wrote the card as `bg-slate-900` with a `text-slate-900`
title, and this repo's slate scale is INVERTED — `bg-slate-900` is
near-WHITE. White text on a white card.

Fixed by using the shared `.card` class, and
`tests/invertedSlateScale.test.ts` now catches the pair anywhere in
`src/`. **It found five more instances in two files**, including the
Accept button on the public storefront's cookie banner; all fixed.

**This is what "unverified live" was worth.** Every number behind the
card was tested and correct; the one thing no test covered was the one
thing that was wrong. The lesson is not "write a renderer test" — it is
that the layout is exactly the part a browser has to confirm, and
saying so is what got it confirmed.

And **nothing is at L2**, so the screen currently reads "Asks you first"
with a reason, and the cap has never been reached. The first real
exercise needs the first granted permission, which needs ten
as-requested approvals.

---

## 22. P7 — the stage closes — 6 November 2026

**The exit test is green**, and it has moved out of `tests/open/` into
the default suite, where it runs on every commit from now on. The
quarantine machinery that carried it while it was red —
`vitest.open.config.mts`, the `tests/open/**` exclusion, the
`test:open` script and `tests/stageOpen.test.ts` — is **deleted**,
because that guard said in its own words what to do when a stage closes
and nothing replaces it: *"the next person should delete the lot rather
than inherit it."* It is in git history if S8 wants it.

### What the criterion was, and what makes the green mean something

> *"Promotion and demotion both tested; spend never auto (test)"*

**Spend is never auto** is walked over the whole registry, in the code
AND in the database: every action that spends, deletes or cannot be
taken back is refused L2 by `canHoldL2`, and migration 220's
`action_levels_l2_allowlist` refuses it at the row.

**Promotion and demotion are both tested** — and the test asserts the
shape that matters about each: promotion never writes a level (the
owner's click does), and demotion asks nobody.

**And the measure can see.** The walk that reports no sender reachable
outside an Action is the same walk that, with the doors removed, *does*
arrive at the live Meta call. A green result from a blind instrument
looks exactly like a green result from a guarded product, so the exit
test asserts both directions.

### 25 MUTATION CHECKS AGAINST THE EXIT TEST ITSELF, AND IT FAILED FIVE

This is the first time it could be mutation-checked — a red test tells
you nothing when you break the thing it is about — and it was the most
useful hour of the stage. **Five of its own assertions were satisfiable
by something other than the thing they claimed**, all the same shape:

| What it asserted | What satisfied it |
|---|---|
| the database names which keys may be L2 | migration 220's **header comment**, which explains the allowlist and names the key |
| `claim_checks` has a `published` column | 217's header, which explains every column it creates |
| the same for `claims_unsupported` | the same header |
| the monitor reuses the eval gate's own set | the monitor's header, which names `outputGate.eval.ts` |
| the plan admits nothing ran unattended | the word "unattended", which appears several times in the section |

So: replacing the actual SQL constraint with `action_key is not null`
left it green. Renaming the `published` column left it green. Replacing
the monitor's imports with local stubs — **a second, differently-written
judge, which is exactly what that test exists to forbid** — left it
green.

**All five now read the thing rather than a word about it:** the SQL
through `sql()` and scoped to its own constraint, the columns as
declarations (`^\s*published boolean`), the monitor's actual import
line through `code()`, and the plan's admission as its own sentence.
Where an assertion really IS about a comment — "the reason is written
beside it" — it reads the raw file on purpose, and says so.

**This is rule 8's subject, in the file whose job is to say what is
true.** It is the fifth time in this stage, and the sixth counting S6's
exit test. The pattern is not carelessness about a particular file; it
is that a grep for a word is the easiest thing to write and the easiest
thing to satisfy.

**Four of my own mutations were aimed at S6's exit test rather than
this one** — the reachability walk and the copy door's backlog live
there, not here — and two more edited something the assertion did not
read. Corrected, and then 25 of 25 killed.

---

### S7 EXIT — what this stage did not prove

**Nothing has ever run unattended.** No `action_levels` row has been
written at L2, no promotion card has been raised, no demotion has
fired, and the daily cap has never been reached. Every rule in this
stage is proved by test and **none by a morning**.

That is not a gap to be closed before the stage shuts — it is
arithmetic. Promotion needs **ten** as-requested approvals of
`update_page_meta` over **thirty** days with a measured outcome, and
that threshold is the point. The first real card is weeks away by
design, and the first demotion needs something to go wrong after it.

**The monitor has not yet checked anything.** `claim_checks` holds its
first rows — written 6 November, verified by the founder — and
`monitor_verdict` is null on both, correctly: the monitor runs the
morning after. Its first real verdict is tomorrow.

**And it only sees what the extractor sees.** `outputGate.eval.ts`'s own
header says it plainly: *"It can only catch what the extractor sees; a
vague claim riding on a true fact still needs a person."* A clean
verdict is one mechanical reader finding nothing it can name — **it is
not a certificate.** The demotion rule is therefore only as sharp as claim
enumeration on Hinglish marketing copy, which S2 measured and did not
make perfect.

**The record covers the publish door, not every send.** S7/P1 records
page surfaces, because that is where the one allowlisted action writes.
Emails, WhatsApp replies, lead messages and social posts are **P1b and
not built** — so for those surfaces there is still no record of what
went out, and the demotion rule has nothing to fire on. The clause
"nothing acts unattended without a check behind it" is true of the only
action that can act unattended, and of nothing else yet.

**Unverified live, in full:**

| | |
|---|---|
| Migration **217** | run, confirmed by the founder |
| Migrations **219** and **220** | written and **not confirmed run**. Until 220 is run no row can say L2 at all; until 219 is run a demotion's notification lands nowhere, and its decision row and log line still happen |
| The owner's card on `/dashboard/autopilot` | opened, broken, fixed, re-opened, **confirmed working** |
| `proposePromotion` on the cron | wired and **never yet had evidence to act on** |
| The monitor against live rows | **tomorrow morning** |
| An L2 action acting alone | **never** |

**Two things stay flagged rather than fixed**, both recorded earlier:
`ALWAYS_REQUIRES_APPROVAL` names `update_page_meta`, which may now run
unattended — nothing is contradictory but the name is stronger than the
rule; and the stored copy in `claim_checks.text` becomes a DPDP question
the day P1b widens it to a surface carrying a customer's name.

**And one fault is still open in production, unrelated to this stage
and worth not losing:** `dm_auto_reply` and `comment_auto_reply` are ON
for candle_by_qaaf and `auto_reply_log` has never had a row. The toggles
say on over a path that does nothing. Deferred by the founder on
4 November; the standing flag stands.

---

## 13. Size, and the honest version of it

| | |
|---|---|
| §3's estimate for S7 | **M** |
| My estimate for the autonomy half alone | **M**, and **P1 + P2 are most of it** |
| The part that is genuinely new | the record and the monitor (§5, §6) |
| The part that is an extension of standing code | L2, promotion, demotion |

**And the part no plan can shorten.** An L2 action that has run
unattended for one day is not an L2 action that has been verified. S7's
exit test can be green with promotion and demotion both proved by test
and neither yet proved by a month of live mornings. That gap gets
written into the plan at P7 rather than discovered later — the same way
S5 recorded that its 28-day check was unfalsifiable until it elapsed,
and S6 recorded that its clause covers the chat surface and not every
route.

**Two things are also still unverified from yesterday**, and they sit in
front of this stage rather than inside it: tomorrow's email (the target
block and the subject), and the first real monthly review on 1 December.

---

## 14. What is not in this plan

- **Experiments.** A second measurement system beside S5's outcome loop.
  Worth having, and worth its own plan, after S7's instrument exists —
  an experiment framework with no online monitor measures the same
  nothing.
- **Local / GBP and AI-visibility.** New surfaces. CLAUDE.md rule 5:
  *"No new departments, tools or pages… A new tool needs a written
  reason from the owner."*
