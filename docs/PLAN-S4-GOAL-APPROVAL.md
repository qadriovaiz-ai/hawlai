# Approving a setup step as a goal — the missing link

**1 November 2026. Plan only: no code, no migration run, nothing paid.**

Why this exists, and said plainly first: **the founder asked for this to
be planned and I did not plan it.** I built the drafting half in P1c,
wrote "the owner approves once" into a code comment as if that settled
it, and moved on.

Worse, `src/lib/growth/report.ts:268` ships this sentence in the daily
email:

> *"...because nothing on record says which goal they serve. **Approve a
> plan and they will appear here.**"*

That tells the owner to do something there is no way to do. It has gone
out in every report since 24 October.

**And he is right about the exit test.** §5.3's third claim — *"each
suggestion cites evidence and the goal it serves"* — cannot be
*demonstrated* today. With no goal on record, `surfaceable()` refuses
every finding, so no suggestion is ever rendered and the claim is
vacuously true and never shown. (Note on numbering: §4a's "Check 3" is
the L1 autonomy test; this is §5.3's third claim. Same thing he means.)

---

## 1. What already exists — all of it but one step

| Piece | Where | State |
|---|---|---|
| Setup steps drafted from the audit | `src/lib/growth/strategy.ts` `setupGoalsFrom` | WORKING — titles written by code, targets from this business's own counted numbers |
| The goals table | `goals` (migration 131), status widened to `draft \| active \| completed \| abandoned` | WORKING |
| A draft goal shown to the owner, with a button | `src/components/tasks/GoalsSection.tsx:108` — *"Confirm — create this plan"* | WORKING |
| The route behind that button | `src/app/api/goals/[id]/confirm/route.ts` — requires `status = 'draft'`, creates tasks from `proposed_tasks`, then sets `status = 'active'` | WORKING |
| Findings linked to the goal they serve | `src/lib/growth/strategist.ts` `linkFindingsToGoals` | WORKING, matches by **exact title** |
| The Strategist surfacing a finding once it has a goal | `findings.ts` `surfaceable`, `pickToday` | WORKING |
| **Anything writing a drafted setup step into `goals`** | — | **MISSING. This is the whole gap.** |

So there is no new page, no new route, no new chat tool and no new
button. One write is missing, and one join is fragile.

### Why `set_goal` must NOT be reused for this

The obvious move is the existing `set_goal` chat tool. It is wrong here,
for three separate reasons:

- it calls `decomposeGoal` — **a model call**, so approving a plan would
  cost money every time
- that call **rewrites the title**, and `linkFindingsToGoals` matches on
  exact title, so the goal would not link to the finding that produced it
- it **invents tasks** and stashes them in `proposed_tasks`, and nobody
  asked for tasks

Setup steps are already drafted, by code, with the owner's own numbers
in them. Decomposing them is both wasteful and lossy.

---

## 2. The plan

### A — the join stops being fragile (migration 211)

`goals` gains `source_key text`, holding the setup step's own key
(`pages_without_search_title`). `linkFindingsToGoals` then matches on
`source_key` first and falls back to title.

This is not scope creep; it is a weakness I documented when I wrote the
title match: *"a renamed goal silently unlinks its findings"*. The owner
renaming his own goal is a normal thing to do, and today it would
silently stop the suggestions he approved it for.

Plus a unique index on `(dealership_id, source_key)` where
`source_key is not null`, so one setup step can never produce two goals.

**SQL, a verify query and the live `pg_get_constraintdef` check go to
the owner to run by hand, as always.**

### B — the manager writes the drafts

On each daily run, for each drafted setup step with **no live goal**
(`draft` or `active`) carrying that `source_key`, insert a `goals` row:

- `status: 'draft'`, title and description **verbatim** from
  `setupGoalsFrom` — no model call, ever
- `target_metric` / `target_value` from the step's counted basis, or null
- `proposed_tasks: []` — the confirm route loops over it and creates
  nothing, which is correct: a setup step is one thing to do, not a plan
  to decompose
- `created_by: 'growth_manager:setup_step'`, so these are
  distinguishable from `set_goal`'s

**Idempotent by construction.** The `source_key` check plus the unique
index mean a second run writes nothing, and the dispatcher really does
re-enter a run.

### C — the report stops promising what does not exist

`report.ts:268`'s sentence is replaced with the truth, and only when
drafts exist: *"I have put N setup steps on your Tasks page as draft
goals. Confirm the ones you want and they will start appearing here as
suggestions."* When nothing is drafted it says nothing.

### D — the owner approves, once, on the Tasks page

No new surface. He opens Tasks, sees the draft goals, presses
*"Confirm — create this plan"* on the ones he wants. The existing route
flips them to `active`.

### E — and then the exit test can actually be demonstrated

Next morning: the findings link to their goals, `surfaceable()` passes,
`pickToday` picks at most three, and the report renders a suggestion
with its evidence and the goal it serves. **That** is §5.3's third claim
shown rather than assumed.

---

## 3. What this does NOT do

- **No auto-approval.** A draft goal becomes active only when the owner
  presses the button. The manager never grants itself a goal — that
  would make the exit test's requirement self-satisfied and meaningless.
- **No auto-completion.** When a finding disappears because the owner
  fixed it, its goal is left alone. Closing a goal from measured
  outcomes is S5's job, and closing it from the finding's absence would
  be the same mistake `syncOpportunities` was making until yesterday:
  one producer resolving another's rows.
- **No tasks.** `proposed_tasks` stays empty, deliberately.
- **No new tool, page, route or button.** CLAUDE.md rule 5 holds with
  nothing to argue about.

---

## 4. Sizes, and the riskiest part

| Phase | What | Size | Free? |
|---|---|---|---|
| **A** | migration 211: `source_key` + unique index; linking reads it | **S** | yes |
| **B** | the manager writes draft goals, idempotently | **S** | yes |
| **C** | the report's sentence tells the truth | **S** | yes |
| **D** | the owner approves on the Tasks page | — | founder, once |
| **E** | the suggestion appears, with evidence and its goal | — | next morning |

**Overall: S.** Smaller than anything else in S4, because the approval
surface, the route, the table and the Strategist all already exist.

**The riskiest part is a pile of draft goals.** Six findings today means
six draft goals on the Tasks page at once, which is a lot to land on
someone who asked for a daily email. Mitigations, and I would like a
decision on the third:

1. the `source_key` check means they appear **once**, not daily
2. they are drafts, so nothing happens until he presses a button
3. **cap how many are drafted at a time?** Three, matching the
   suggestions cap, would keep the Tasks page calm — but it also means
   three findings sit invisible until the first three are dealt with

---

## 5. What I need from the founder

1. **Approval of this plan**, or a correction to it.
2. **The cap question above**: all drafted at once, or three at a time?
   I lean to **all at once**: they are drafts, he can ignore them, and
   hiding findings to keep a page tidy is the opposite of what this
   stage is for.
3. **Approval to write migration 211's SQL** for him to run.

Nothing here costs money. There are no model calls anywhere in this
feature — that is the point of writing the titles in code.

---

## 6. Status — built 2 November 2026

Approved by the founder on 1 November with all three decisions: build
as written, no cap on how many drafts appear at once, and write the SQL
for him to run.

| Phase | State |
|---|---|
| **A** migration 211 + linking by `source_key` | **written, SQL with the owner** — code is live-safe before it runs: the read fails loudly and nothing is drafted |
| **B** the manager drafts setup goals, idempotently | **built** — `src/lib/growth/goalDrafts.ts`, wired in `dailyGrowth.ts` |
| **C** the report's sentence tells the truth | **built** — `report.ts` now names the Tasks page only when a counted number says drafts are waiting |
| **D** the owner confirms on the Tasks page | **nothing to build** — `GoalsSection.tsx` and `/api/goals/[id]/confirm` already do it |
| **E** a suggestion appears with its evidence and goal | **unverified** — needs the migration run, a deploy, one confirm, and the next morning's email |

`npx tsc --noEmit` exit 0. `npx vitest run` 302 files, 5065 tests, all
passed. `npx next build` exit 0. **13 mutation checks, 13 killed.**

### One change from the plan as written, and why

§2B said a step would be re-drafted when it had no `draft` or `active`
goal. `/api/goals/[id]/discard` sets `'abandoned'` rather than
deleting, so that check would have brought a step the owner explicitly
discarded back every single morning — breaking §4's own promise that
drafts "appear once, not daily". Migration 211's unique index therefore
carries **no status predicate**: one setup step, one goal row per
business, ever. Discard means no.

### What is NOT built, stated rather than left to be discovered

- **Re-opening a step after its goal completes.** Out of scope on
  purpose (§3), and it belongs with S5's outcome records.
- **§4's cap question** is answered and the answer is no cap, so a
  business with six findings gets six draft goals on its Tasks page at
  once. That is the founder's decision, made on his own reasoning.
- **Nothing is verified live.** E above is the only claim that matters
  for the exit test, and it cannot be checked from here.
