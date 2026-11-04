# S6 — one door for everything that changes something

**4 November 2026. Plan only: no code, no migration, nothing deployed.**

S6's row in `docs/PLAN-CORE-ARCHITECTURE.md:601`:

> *Remaining tools into Actions; retire duplicate agents; autopilot
> through C2+C6* — **L** — exit test: *"Tool count falls; no surface
> writes copy outside C2"*

Every number below was read out of the code today, not copied from the
architecture doc, which has drifted (it says 58 tools; there are 59).

---

## 0. Hinglish mein

**S6 kya hai:** aaj chat ke 59 tools hain. Unme se jo cheezein **badalti**
hain — paisa kharch, email bhejna, page ka text, product ka daam — unke
liye do raaste hain: kuch `publish/` wale "Action" layer se jaate hain
(preview → approve → execute → verify → undo), aur kuch apna-apna code
likhte hain. S6 ka kaam: **sab ek hi darwaaze se jaayein**, aur jo 8
jodi duplicate agents hain woh retire ho jaayein (67 agent files hain,
kaafi do-do baar wahi kaam karte hain).

**Jo pehle se bana hua hai (kaafi zyada):** `publish/` layer, approval
registry, aur ek tool registry (18 entries) — S6 inhe **jodta** hai, naya
kuch banata nahi.

**Asli risk code nahi, route hai.** Har duplicate agent ko ek-do live
route import karte hain. Usko hatana "production route change" hai, dead
code delete karna nahi. Isliye **ek agent, ek commit, ek live check** —
aur live check sirf aap kar sakte hain.

**Paisa:** S6 mein ek bhi naya model call nahi hai. Kharcha zero. Risk
operational hai.

**Jo main poochhunga (§7):** chaar sawaal, aur unme do aise hain jo aapne
pehle defer kiye the.

---

## 1. The exit test is wrong, and this is the second time it has been said

*"Tool count falls"* can be satisfied by **deleting reads**. Of the 59
tools, a large share change nothing — they fetch analytics, read a page,
research a competitor, diagnose the funnel. Deleting those makes the
number fall, costs the owner capability, and buys no safety at all.

The architecture doc already recorded the fix (§4.3) and nothing has
acted on it:

> **Replace S6's first clause with "nothing that changes state is
> reachable except through an Action."**

**S6 adopts that, and P0 builds the test for it first** — before any
retirement, because building toward an unmeasured goal is how the wrong
thing gets optimised.

### The second half of the exit test already exists, and so does its gap

*"No surface writes copy outside C2"* is
[tests/oneDoorForCopy.test.ts](tests/oneDoorForCopy.test.ts), live since
11 October. Four `MIGRATING` entries remain (§5, P5).

But the **state-change** door has a gap I verified today, and it is
worth stating precisely because it is NOT a live vulnerability:

[tests/approvalCoverage.test.ts](tests/approvalCoverage.test.ts) greps
each tool's `case` body in `executeTool` for sender symbols. Two tools'
case bodies are **two lines long**:

```ts
case "activate_meta_campaign":
  return switchMetaCampaign("activate", ctx, supabase, input);
```

`switchMetaCampaign` is where the money step lives, and it **is** gated
— it goes through `createPublishAction` (`masterBrainV2.ts:4049`). I
checked. But that grep cannot see it, so **the test is not what is
keeping it gated.** Delete the `createPublishAction` call tomorrow and
`approvalCoverage.test.ts` stays green while chat spends money unasked.

A one-hop grep is defeated by a one-line delegation. That is exactly
what a *reachability* test fixes, and it is why P0 comes first.

---

## 2. What already exists — and it is most of an Action layer

| Piece | Where | State, and what it becomes |
|---|---|---|
| The `ResourceEdit` family, in full | `src/lib/publish/` — 10 `ActionKey`s, `PublishPlatform` with `preview`/`execute`/`verify`/`undo`, a platform registry, an executor, a reject path, a release path | **WORKING. This IS S6's Action type for edits** — S3 built it. Nothing here is redesigned |
| Risk and approval per action | `executionPolicy.ts` — 27 `ACTION_POLICIES` + 6 `AUTOMATION_TOGGLES`; `requestApproval.ts`; `pending_approvals` | **WORKING.** It becomes the `Dispatch` family's gate, with an envelope around it instead of per-tool code |
| A tool registry, with handler pointers | `src/lib/businessBrain/toolRegistry.ts` — **18 entries**, each with `channels`, `handlerRef`, `status`; plus `toolDispatcher.ts` | **WORKING AND HALF-FORGOTTEN.** Its own header says it exists so one definition can render into two schemas. This is the registry S6 extends — not a new one |
| Spend is always human | `executionPolicy.ts` `activate_ad_campaign` = spend / critical / `requiresApproval: true`, and `ALWAYS_REQUIRES_APPROVAL` in `publish/types.ts` | **WORKING.** Pinned by a test that must stay unsatisfiable any other way |
| Switching OFF is never gated | CLAUDE.md rule 6; `pause_meta_campaign` is direct by design | **WORKING, and it must survive S6.** The safe direction must not become the slow one |
| The copy door | `tests/oneDoorForCopy.test.ts` | **WORKING**, 4 `MIGRATING` left |
| The approval coverage test | `tests/approvalCoverage.test.ts` | **WORKING, and one hop deep** — see §1 |

**What is genuinely missing:** the `Dispatch` envelope (a send has no
`before` and no `undo`, so it cannot use the `ResourceEdit` shape — §4.2
of the architecture doc settled that), the registry covering more than 18
tools, and a reachability test instead of a grep.

---

## 3. What is new

### 3a. The `Dispatch` envelope

`publish/` is for *edits to a resource*: there is a `before`, execution
re-verifies against it, and `undo` is real. CLAUDE.md says it in one
line: *"NOT for one-shot sends"*.

A sent email has no `before`, cannot be re-read from the platform, and
cannot be undone. Migration 208 already models it the other way — rows
are claims written **before** the send. So `Dispatch` gets its own
shape:

| | `preview()` | `execute()` | `verify()` | `undo()` |
|---|---|---|---|---|
| `ResourceEdit` (exists) | before → after, per field | writes, re-verifying `before` | re-reads the platform | **real** |
| `Dispatch` (new) | the exact payload, and who receives it | with an **idempotency key** | acceptance by the platform | **none — and the owner is told so before approving** |

The honest "there is no undo" goes **on the approval card**. An owner
approving a WhatsApp send should not have to know which family it
belongs to in order to know it cannot be taken back.

### 3b. The registry covers every state-changing tool

`BUSINESS_BRAIN_TOOLS` gains `family: "ResourceEdit" | "Dispatch" |
"Internal"` and grows from 18 entries to every tool that changes
anything. `Internal` is the third family from §4.2 — assign a task, set
a goal, remember an insight: no platform, no undo question, still a
state change worth a record.

**A read stays out of the registry.** That is the whole point of the
restated exit clause: the registry is the list of things that CHANGE
something, so it can be the list the test reads.

### 3c. The reachability test (the exit test)

For every state-changing tool, the test follows the call graph from its
`executeTool` case — through one-line delegations, which is where the
current grep stops — and requires it to reach either `createPublishAction`
(a `ResourceEdit`) or the `Dispatch` envelope, or to be on an allowlist
**with a dated reason**, exactly as `oneDoorForCopy.test.ts` does it.

Three properties copied from the doors that already work:

1. **nothing new goes on the allowlist**, and
2. **a file that migrates fails the suite until its entry is deleted**,
   so the backlog can only shrink, and
3. the allowlist entries carry the date and the reason, because the next
   person to read it will otherwise assume it was arbitrary.

---

## 4. The four things that will go wrong, and what stops them

**1. Retiring an agent whose route is live.** This is the headline risk
and the architecture doc says so. All 8 duplicate pairs still exist, and
I counted their importers today:

| Keep | Retire | Importers (keep → retire) |
|---|---|---|
| one growth advisor | `growthAdvisorAgent` **or** `growthAdvisorV2` | 4 → 1, **and both are imported by the same route** |
| `croAgentV2` | `croAgent` | 1 → 1 |
| `videoMarketingAgent` | `videoAgent` | 1 → 1 (`videoAgent` has no API route at all) |
| `deepStrategyAgent` | `strategyAgent` | 1 → 1 |
| `contentMarketingAgent` | `contentAgent`'s copy half | 4 → 1 |
| `socialMediaAgent` | `socialManagementAgent`'s customer half | 5 → 2 |
| `websiteBuilderAgent` | `websiteAgent` | 4 → 1 |
| one SEO agent | two of `seoAgent` / `seoPageAgent` / `seoToolkitAgent` | 4 / 1 / 1 |

**What stops it:** one agent per commit, in that order — easiest and
most obviously duplicated first — each with a named live check that only
the owner can perform, and no second retirement until the previous one
is confirmed. A sweep that touched eight routes at once would be
unverifiable by exactly one person.

**2. A test that is too strict, or too loose.** Too loose proves
nothing; too strict blocks ordinary work and gets weakened in six weeks,
which is worse than not having it. **What stops it:** the allowlist
pattern that `oneDoorForCopy.test.ts` has already survived three weeks
of real work with — dated reasons, shrink-only, fails on migration.

**3. The 5,078-line move.** `masterBrainV2.ts` holds all 59 schemas and
their dispatch. Moving the schemas into the registry is an enormous diff
with no intended behaviour change — the shape of change that silently
drops one tool. **What stops it:** batches, each with a set-equality
test (the tool names and their required parameters before the move equal
the ones after), and the schema set asserted against a frozen list so a
dropped tool fails rather than disappearing.

**4. The chat is the product.** One live business, and chat is its main
surface: a broken tool is visible immediately, to him. **What stops
it:** P4's one-commit-one-check discipline, and the order above — the
tools with the most importers last.

---

## 5. Phases and sizes

| Phase | What | Size |
|---|---|---|
| **P0** | The reachability test for the restated clause, with an allowlist carrying today's reality and dated reasons. **The measure, before any of the work it measures** — **DONE 4 Nov**, see §8 | **M** |
| **P1a** | **DONE 4 Nov.** A live fault found while reading the paths P1 restructures: approving a card twice carried the action out twice — two real phone calls off one decision. One guard in the approvals route, before any branch runs. See §9 | **S** |
| **P1** | The `Dispatch` envelope: `preview` / `execute(idempotencyKey)` / `verify` / **no undo, said on the card** — **DONE 4 Nov**, two dispatchers moved, see §10 | **M** |
| **P2** | All 59 tools classified by family, re-checked against the call graph — **DONE 4 Nov**, see §11. **Deviation:** the 41 missing SCHEMAS are left to P3 rather than hand-copied here | **M** |
| **P2a** | The two campaign-edit tools routed through `requestApproval` — inline cards, policy and risk applied — **DONE 4 Nov**, see §12. It also closed a hole P1 had opened: the row stored different words from the card | **S** |
| **P3a** | The 59 schemas moved out of `masterBrainV2.ts` byte for byte into `businessBrain/toolSchemas.ts`; the brain keeps dispatch — **DONE 4 Nov**, see §13 | **M** |
| **P3b** | The registry's chat-tool parameter SHAPE derived from the schemas, wording kept as a per-channel override — **DONE 4 Nov**, see §14. Voice output pinned identical before and after | **M** |
| **P4** | The 4 approved retirements — **ALL FOUR WITHDRAWN 4 Nov: none is a duplicate.** Checked by reading what each file does; evidence in PLAN-CORE-ARCHITECTURE.md §4.2a. One real find: `/api/growth-report` has no callers | **L → S** |
| **P5** | `seoToolkitAgent`'s two customer-facing tasks through the door, entry deleted — **DONE 4 Nov**, see §16. The other three entries stay by the founder's decision | **S** |
| **P6** | Exit test: nothing that changes state is reachable outside an Action; the copy door's list is shorter; the tool COUNT is reported but not targeted | **S** |

**Overall: L**, and P4 is most of it. P0–P3 are structural and testable
offline; P4 is eight production route changes that need a person.

Each phase: tests with mutation checks, `npx tsc --noEmit`,
`npx vitest run`, `npx next build` with exit codes pasted, one commit.

**Cost: zero.** S6 adds no model call anywhere. Its risk is operational,
not financial — the opposite of S2's.

---

## 6. What this does NOT do

- **No autonomy levels.** C6's missing half — L0/L1/L2 per action per
  business, promotion from measured data, automatic demotion — is S7.
  S6 touches `requiresApproval` only to move it behind an envelope, not
  to make anything automatic.
- **No new capability, tool, page or department.** Rule 5. S6 only
  reduces: fewer agents, fewer places that change state.
- **No deleting reads to make a number fall.** §1.
- **No change to what the owner sees.** Every approval card, every
  preview, every chat answer should be identical after S6. If something
  looks different, that is a bug, not progress — and P4's live checks are
  phrased that way.
- **No migration.** Nothing in S6 needs a schema change. If P1 finds
  that `pending_approvals` cannot carry a `Dispatch` payload honestly, it
  comes back to the owner as a question before any SQL.

---

## 8. P0, as built — 4 November 2026

All four decisions came back as recommended: the new clause; both
deferred agents stay deferred; `websiteBuilderAgent`'s door is left for
later with its reason; and only the four unambiguous retirements are in
scope.

**What landed:**

| Piece | Where |
|---|---|
| The walk, with what it can and cannot see written down | `tests/helpers/reachability.ts` |
| The measure: no tool reaches the outside world without an Action | `tests/stateChangeDoor.test.ts` — 15 assertions |
| The money path split from the free one | `masterBrainV2.ts` — `resolveCampaignForSwitch` / `pauseMetaCampaign` / `activateMetaCampaign` |
| The clause itself, withdrawn and replaced with his date | `PLAN-CORE-ARCHITECTURE.md` §3 and §4.3 |

**Doors are walls.** The walk never enters an Action, so a sender it can
still reach is a sender reachable without one. The platform factories
are walls too, and a separate assertion licenses that: a platform's
`preview`/`execute` is invoked ONLY inside `src/lib/publish/`. Without
that invariant the walls would hide the very call this is for.

**Two ungated paths, both by a recorded decision**, and the list is
frozen so a third is a visible edit: `pause_meta_campaign` (rule 6) and
`send_email`'s team path (approved 2026-09-14). An entry whose path
closes **fails the suite until it is deleted**, the same rule
`oneDoorForCopy.test.ts` has, so the list can only shrink. The money
step is not on it and a test asserts it never will be.

**The split was not in the plan**, and it is the one deviation: without
it the walk could not tell `activate_meta_campaign` from
`pause_meta_campaign`, and the only alternative was allowlisting the
money step. `docs/DECISIONS.md` has the whole of it.

**Verified:** 18 new assertions across a new test and a new helper, 11
mutation checks all killed, `tsc` 0, 5,439 tests green, `next build` 0.
**Unverified:** nothing here changes runtime behaviour, so there is
nothing live to check — the split is covered by the three test files
that run those functions against a fake Meta and a database double.

## 9. P1a — the fault, and why it came first

**Reproduced before it was claimed.** A `place_outbound_call` card
approved twice placed two real calls; a video card uploaded twice; team
mail sent twice. Both requests answered 200.

**`src/lib/publish/release.ts` already said so in a comment** and
defended the publish family with a compare-and-set. The Dispatch paths
had no equivalent — which is the argument for the envelope, stated by
the bug rather than by me.

**The guard:** a card whose status is not `pending` is refused (409,
with a reason the owner can read) before any branch runs. It does not
block a retry after a genuine failure, because a failed branch returns
without marking the row.

**Why before P1 and not inside it:** the S6 plan's own rule — a fault on
a live surface is fixed before that surface is rebuilt. The envelope will
add a per-dispatch idempotency key on top, as defence in depth, but the
broad fix belongs where every branch passes.

**Verified:** 3 new tests, 5 mutation checks all killed, `tsc` 0, 5,442
tests green, `next build` 0. **Unverified live** — but the owner can see
it: approving an already-decided card now answers with a reason instead
of a silent repeat.

## 10. P1, as built — 4 November 2026

`src/lib/dispatch/`: `types.ts` (the envelope), `call.ts`, `video.ts`,
`registry.ts`. The approvals route asks the registry and deletes the two
branches it used to carry out itself.

| Property | How it is held |
|---|---|
| There is no undo | `undoable` is the literal `false` — the compiler refuses `true`, and the mutation check for it runs against `tsc` |
| The owner is told before he approves | `requestApproval` composes the dispatcher's `cannotBeTakenBack` onto the card, so a new dispatcher cannot omit it |
| One action, one path | a registered send has no branch left in the route, asserted both ways |
| The subject is re-read before the send | a test on the ORDER in each dispatcher, plus behavioural tests for an opt-out, a missing number, a deleted video, a disconnected channel |
| A preview reads, it never sends | P0's own call-graph walk, applied to each `preview` body |
| What it cannot claim | neither Vapi nor YouTube takes an idempotency key, so `once` cannot be handed on; each dispatcher says so, and the no-repeat rule is P1a's route guard |

**Two moved, eight to go**, each with its reason in `registry.ts`.
`send_email` is last on purpose: two paths (team and customer) and
migration 208's idempotency claim. The resource edits — discount code,
page meta, budget, targeting, activation — are not sends and belong to
`publish/`; wrapping them in this envelope would be the
one-type-for-everything mistake §4.2 rejected.

**Verified:** 22 new assertions, 17 mutation checks all killed (one by
the compiler), `tsc` 0, 5,464 tests green, `next build` 0. The old
`approvalExecution` tests pass unchanged, which is what shows the move
did not change behaviour. **Unverified live** — approving a real call or
a real upload is a real call and a real upload, so this is covered by
tests and by the owner's next genuine approval, not by a rehearsal.

## 11. P2, as built — 4 November 2026

All 59 chat tools now carry a family in
`src/lib/businessBrain/toolRegistry.ts`, and
`tests/toolFamilies.test.ts` re-checks every label against the call
graph rather than trusting it.

| Family | Count | Means |
|---|---|---|
| `read` | 23 | returns information; changes nothing outside |
| `Internal` | 22 | only this product's own rows |
| `ResourceEdit` | 11 | a platform or site resource, through `publish/` |
| `Dispatch` | 3 | a one-shot send; no undo |

**A tool with no family fails the suite by default.** That is the hole
the old clause left open: a tool nobody classified was invisible to the
exit check, and the next one added in a hurry is exactly the one that
would be.

**What the measure found** (both recorded, neither fixed in this
commit): the two campaign-edit tools raise their own approval rows and
therefore send the owner to `/dashboard/approvals` instead of showing
the card in chat — **P2a**; and `read_page` shares one body with
`edit_page_text`, so its label is asserted by reading rather than by
walking, recorded with its reason.

**The deviation, again, because it matters:** the plan said this
registry would grow to hold every state-changing tool's definition.
Hand-copying 41 schemas that `masterBrainV2.ts` already holds would
have created a second place to be wrong, two days before P3 moves them
properly. P2 did the classification; P3 moves the definitions.

**Verified:** 18 new assertions, 12 mutation checks all killed, `tsc`
0, 5,484 tests green, `next build` 0. Nothing here changes runtime
behaviour.

## 12. P2a, as built — 4 November 2026

**What the owner sees:** asking chat to change a campaign's budget or
targeting now produces a card with **Approve and Reject in the same
message**. Before this, both tools ended by telling him to go to
`/dashboard/approvals`, because they had no approval id to put on a
card — they wrote the row themselves.

**What it gains underneath:** the `ACTION_POLICIES` check (which refuses
an action nobody has classified), the risk level, and
`requestApproval`'s note that stops the model narrating a draft as done.
The budget call still passes `amount`, which the approval threshold
reads.

**The defect list deleted itself**, which is what a shrink-only list is
for: the fix landed, the list went stale, the suite went red, and the
two entries were removed. Both assertions are now universal — no tool
writes its own approval row, no tool sends the owner elsewhere to
approve.

**And it closed a hole P1 had opened.** P1's composed "cannot be taken
back" sentence reached the card but not the row, so the record kept
different words from the card. `requestApproval` now composes BEFORE the
insert and stores the composed sentence, and the guard was restated to
assert the one place that holds it — with a test that runs the writer
rather than grepping for a key.

**Verified:** 3 new assertions, 8 mutation checks all killed, `tsc` 0,
5,488 tests green, `next build` 0. **Unverified live** — the next real
campaign-budget request will show the inline card; nothing here was
rehearsed against Meta.

## 13. P3a, as built — 4 November 2026

658 lines of schema out of a 5,180-line file, **byte for byte**,
verified against the committed version before the move. `TOOLS` is
re-exported from `masterBrainV2.ts`, so nothing that imports it changed.

**The fingerprint.** These schemas are the Anthropic prompt-cache
prefix. `toolSchemas.test.ts` holds a SHA-256 of the array, so a change
is deliberate rather than accidental — and the test says, in its
failure message, what changing it costs and what to do about it.

**The plan's P3 would have been lossy, and this is the deviation.** The
registry's parameter shape is `string | number | boolean`; 24 of the 59
schemas use an `enum` and four use an array. The definition therefore
lives as the Anthropic schema, and the simpler shapes are derived from
it — never the reverse. Written into the new file's header so the next
person does not have to re-derive it.

**What P3b now has to do**, with the measurement already taken: four
registry entries disagree with their schema today (`trigger_call`'s
`leadId` vs `leadName`, `send_email`'s `to` vs `recipient`, and a
missing field each on `propose_price_change` and `launch_meta_campaign`).
None is call-enabled, so none is live — but the voice definitions for
the two that ARE call-enabled must be pinned identical before the
derivation changes how they are built.

**Verified:** 9 new assertions, 8 mutation checks all killed, `tsc` 0,
5,497 tests green, `next build` 0. Nothing here changes runtime
behaviour.

## 14. P3b, as built — 4 November 2026

**The shape has one source; the wording has two audiences.**
`callParametersFor(entry)` takes the keys, the types and `required`
from `toolSchemas.ts` when the tool has a chat schema, and the
description from the registry when it offers one. A call-only tool
(seven of them) keeps its own map, because there is no schema and that
map IS the definition.

**Why not derive the descriptions too**, which is what "stop the
duplicate" first looked like: the schema's wording is written for the
chat model and shouts at it; the registry's is read by a voice
assistant in a function list. Same argument, two audiences. Measuring
before building is what caught it.

**The four drifts cannot exist now**, and the two overrides that named
arguments the tools do not take were deleted. A test refuses a new one.

**The live voice list is byte-identical** before and after — the
snapshot was taken first, and it is the only thing that justifies
touching a path that runs on real calls.

**Verified:** 10 new assertions, 10 mutation checks all killed, `tsc`
0, 5,507 tests green, `next build` 0. **And three tests that P3a's
commit had left red** are fixed here — they read `git show HEAD:`, so
they went red one commit after the schemas moved and my pre-commit
gates could not see them.

## 15. P4 — what the verification found, 4 November 2026

**All four approved retirements are withdrawn, and nothing was
deleted.** Each pair was checked by reading what the two files DO:

- **growthAdvisor** — `generateGrowthReport` is a shared service with
  **five** importers (the overview page, the report bundle, the chat
  tool, `/api/growth-report`, and V2's own `expansion_strategy` task,
  which passes its health score in as context). One is an INPUT to the
  other; they share a route for that reason.
- **cro** — `croAgent.analyzeCro` is the model-free Page Health Check
  (`/api/cro`); V2 is the model path (`/api/cro/generate`). Retiring the
  first deletes the free half.
- **video** — `videoAgent` is the Veo API transport; `videoMarketingAgent`
  is the department. A driver and a department.
- **strategy** — two routes, two output shapes, two products.

**How the plan got it wrong**, mine included: §4.2's table was built
from **file-name similarity and importer counts**. A pair differing by
`V2` or `deep` was read as one job done twice. An importer count says
how many files reach a module and nothing about what it does.

**The one real find:** `/api/growth-report` has **no callers**. The
function behind it is alive — the overview page imports it directly as
a server component — so this is a dead HTTP surface, not a capability.
Offered to the founder rather than deleted, because every retirement in
this phase is his to check.

**S6's remaining real work is therefore small:** P5's one open
`MIGRATING` entry (`seoToolkitAgent`'s two customer-facing tasks — the
other three are deferred by his decision) and P6's exit test. The four
unchecked rows in §4.2 need the same read before anyone promises them.

## 16. P5, as built — 4 November 2026

`meta_tags` and `gbp_optimization` go through `generateCopy`, so they
now get the two steps they were missing: the **internal-key strip** —
the guard that failed in public on 11 October when a Facebook caption
carried the words "Concrete_details_used", a key the MODEL invented —
and the **genericness verdict**. The MIGRATING entry is deleted, which
is the only way that list is allowed to shrink.

**The eight owner-facing tasks stay out**, and the boundary is
asserted both ways: a customer-facing task's prompt now carries the
copy truth rules, an owner-facing one's does not, and an owner-facing
task keeps every field it was given — stripping a field from a keyword
table would delete the owner's data, not protect a customer.

**Cost unchanged:** no word cap (wrong unit for a meta description) and
no retry (`revise: false`), so the verdict is reported rather than
billed.

**Verified:** 12 new assertions, 10 mutation checks all killed, `tsc`
0, 5,509 tests green, `next build` 0. **Unverified live** — the next
`generate_seo` run for meta tags will be the first through the door.

**S6 now has one phase left: P6, the exit test.** Three MIGRATING
entries remain by the founder's own decision (`brandBuildingAgent`,
`chatbotAgent`, `websiteBuilderAgent`), and the four unchecked rows in
`PLAN-CORE-ARCHITECTURE.md` §4.2 are marked unverified rather than
promised.

## 7. What I need decided

1. **The restated first clause.** *"Nothing that changes state is
   reachable except through an Action"* instead of *"tool count
   falls"*. I think this is not close — a target that can be met by
   deleting the analytics tool is not a safety target. Agreed?

2. **`brandBuildingAgent` and `chatbotAgent`** — you deferred both on 11
   October. `oneDoorForCopy.test.ts` still carries them with their
   reasons. The open question for each is whether the **genericness
   verdict** should apply: to a tagline (where a fixed word cap would be
   wrong, which is exactly why it was deferred) and to a visitor-facing
   chat reply (which is not a marketing piece). **Stay deferred, or
   decide now?** I lean to staying deferred — nothing is unguarded, the
   claims and provenance checks already run on both — and S6 can close
   without them.

3. **`websiteBuilderAgent`'s block-aware door.** The door writes a JSON
   piece; this agent writes a tree of typed blocks. Its own comment from
   11 October says this is *"a design decision for the owner rather
   than a mechanical move"*, and that is still true. Two options:
   **(a)** teach the door to accept a block tree — more work, one door;
   **(b)** leave it on `MIGRATING` with its reason and close S6 with
   three entries instead of four. I lean to **(b)** this stage, because
   P4's eight route changes are enough risk for one stage.

4. **Retirement appetite.** All 8, or the four unambiguous ones
   (`growthAdvisor`, `croAgent`, `videoAgent`, `strategyAgent` — all 1→1
   importers) and leave the four with 4–5 importers for later? I lean to
   **the four unambiguous ones in S6**, and the SEO/social/content/site
   consolidations as their own stage, because those four are where a
   mistake shows up on a customer-facing surface rather than in an
   owner-facing report.

Nothing here spends money. Nothing here needs SQL. **Two live
verifications are still outstanding from S5** — tomorrow's target email
(P4) and 1 December's monthly review plus the 28-day run — and S6 does
not block on either, but a fault found in tomorrow's email gets fixed
before any of this starts.
