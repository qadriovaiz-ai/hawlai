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
| **P1** | The `Dispatch` envelope: `preview` / `execute(idempotencyKey)` / `verify` / **no undo, said on the card**. The existing senders move onto it; `approvalCoverage`'s grep becomes a property of the envelope | **M** |
| **P2** | `BUSINESS_BRAIN_TOOLS` gains `family` and grows from 18 entries to every state-changing tool. The registry becomes what the P0 test reads | **M** |
| **P3** | The 59 schemas move out of `masterBrainV2.ts` into the registry, in batches, each with set-equality. The brain keeps dispatch only | **M** |
| **P4** | The 8 retirements. One agent, one commit, one live check, in the §4.1 order | **L** |
| **P5** | `oneDoorForCopy`'s remaining `MIGRATING` entries: `seoToolkitAgent`'s two customer-facing tasks, and `websiteBuilderAgent` **only if** the owner answers the block-door question (§7.3) | **S** |
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
