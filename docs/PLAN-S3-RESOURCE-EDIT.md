# S3 — ResourceEdit actions for site edits, with undo and L0/L1 levels

**22 October 2026. Plan only: no code, no migration run, nothing paid.**

S3 is defined in
[PLAN-CORE-ARCHITECTURE.md](PLAN-CORE-ARCHITECTURE.md) §3 as *"C4
Actions for site edits + C6 levels (L0/L1)"*, sized **M**, with this
exit test:

> *"Approve in UI → change live → verify → undo works, on
> candle_by_qaaf"*

---

## 0. Hinglish mein

Chat se website ki wording badalna **already kaam karta hai**, aur undo
bhi. Jo nahi hai woh teen cheezein hain:

1. **Undo contract pe nahi hai.** Woh ek haath se likha hua special case
   hai `masterBrainV2.ts` ke andar, sirf ek action ke liye. Har
   ResourceEdit action ko undo milna chahiye, ek hi tarike se.
2. **Undo kaun sa edit wapas karega, yeh guess karta hai** — aakhri 5
   executed actions mein se woh uthata hai jiske label mein aapka bola
   hua shabd ho. Yeh galat edit wapas kar sakta hai.
3. **L0/L1 levels nahi hain.** Abhi har action ke liye ek fixed
   haan/nahi hai (`requiresApproval`), business-wise koi level nahi.

Ek baat jo architecture plan mein galat likhi thi, aur main theek kar
raha hoon: usme likha hai "undo ke liye purana version store karna
padega". **Woh already store hota hai** — jo edit hua tha uski publish
action apne andar purani wording rakhti hai. To S3 ka risk utna nahin
hai jitna plan ne socha tha.

Aur ek nayi baat, aapka bheja hua live page padh ke: **us page pe abhi
aise claims likhe hain jinhe S2 ki pipeline refuse karegi.** Iska matlab
S3 mein ek design sawaal hai jiska jawab aapko dena hoga — niche R3.

---

## 1. Scope

**In scope.** The ResourceEdit family, limited to the business's own
website — the `website_pages` rows that `/site/{slug}` renders:

| Action | Folds in | State today |
|---|---|---|
| `edit_page_text` | `edit_page_text`, `build_website`; `undo_page_edit` becomes its `undo()` | working, ungeneralised |
| `set_page_meta` | `propose_page_meta` | working, live since 2026-09-29 |

Plus **C6 levels L0/L1** as the gating vocabulary those two actions read.

**Out of scope, deliberately.** `update_product`, `create_discount`,
`propose_ad_change`, `set_ad_state` are ResourceEdit too, and every
Dispatch action (`send_email`, `publish_post`, `place_call`) is a
different family. They come in S6. Widening S3 to all of ResourceEdit
turns an **M** into an **L** and puts money actions (`set_ad_state`) in
the same step as the levels mechanism that gates them — which is the
one combination worth avoiding.

**No new tools.** CLAUDE.md rule 5. S3 removes a tool
(`undo_page_edit` becomes a contract method) and adds none.

---

## 2. What already exists — with evidence

More than the architecture plan credits, and this matters because it
changes the sizing.

| Piece | Where | State |
|---|---|---|
| Platform-agnostic action contract | `src/lib/publish/types.ts` — `ActionKey`, `PublishPlatform`, `supports()` | working |
| `preview()` as a human-readable diff | `types.ts` `PreviewDiff` — summary, target, changes[], warnings | working |
| **The before-state, stored** | `types.ts` `FieldChange.before` — "the baseline execution re-verifies against" | working |
| Staleness + already-at-target | `src/lib/publish/executor.ts` `isClearedToExecute`, `CLAIM_TTL_MS`; `hawlaiSite.ts` checks already-at-target **before** staleness | working |
| Target resolution with provenance | `src/lib/publish/resolve.ts` — `targetRef` + `resolutionPath` | working |
| The site platform module | `src/lib/publish/platforms/hawlaiSite.ts` — page meta, `TITLE_LIMIT`, `DESCRIPTION_LIMIT` | working |
| The audit row | `publish_actions` (migration 170), platform widened to `hawlai_site` in 204 | working |
| Risk tier per action | `src/lib/executionPolicy.ts` `ACTION_POLICIES` | working |
| Approval records | `src/lib/chat/requestApproval.ts` `requestApproval` | working |
| Nothing reaches a sender ungated | `tests/approvalCoverage.test.ts` | working |
| Block tree operations, immutable, by id | `src/lib/blocks/treeOps.ts` — find / remove / insert / move / updateProps | working |
| Block ids surfaced to chat | `read_page` tool; `catalogueDriven` lines are refused by `edit_page_text` | working |
| **Undo, for one action** | the `undo_page_edit` case in `masterBrainV2.ts` | **working, not on the contract** |

### 2.1 A correction to the architecture plan

PLAN-CORE-ARCHITECTURE's S3 row names the riskiest part as:

> *"`undo()` for page text … Undo must restore a stored previous
> version, which means storing one"*

**The previous version is already stored.** `undo_page_edit` reads it
back off the publish action that made the change:

> *"REPLAYED FROM THE RECORD, never regenerated. The previous wording is
> stored on the publish action that changed it
> (`preview.changes[].before`), which is why this needs no new table and
> cannot drift from what was actually on the page."*

So there is **no new table for undo**, and the risk the plan flagged
does not exist. The remaining risk is a different one, and smaller: how
undo picks *which* edit to reverse (R1 below).

---

## 3. What is missing

**M1. `undo()` is not on the contract.** It is roughly a hundred lines
inside one `case` in `masterBrainV2.ts`, hard-wired to
`action_key = "update_page_text"`. `set_page_meta` — which changes what
the whole internet sees of a page — has no undo at all.

**M2. Undo guesses which edit to reverse.** It reads the last five
executed `update_page_text` actions and picks the one whose
`target_label` contains the page word the owner said, or else the most
recent. Two edits to the same page, or two pages whose labels share a
word, and it reverses the wrong one — silently, because every candidate
is a legitimate row.

**M3. No autonomy levels.** `ACTION_POLICIES` is a code constant with a
`requiresApproval` boolean, identical for every business. C6 wants a
level per action per business, and `requiresApproval` becomes derived
rather than declared.

**M4. Edited page text does not go through the door.** S1 and S2 put
every *generated* piece of copy through `generateCopy`. A page edit
takes the owner's own words or the model's and writes them live. The
`page_text` task already exists in `getContext` (product descriptions
use it), so the wiring is short — but whether it *should* apply to an
edit is a decision, not an oversight. See R3.

---

## 4. Phases

Every phase before P5 is code and tests only — no money, no live writes.

### P0 — Define L0/L1, and write the SQL (free)

L0/L1 is the founder's vocabulary and is not yet in the code. What I
will write unless told otherwise:

| Level | Meaning | Who may hold it |
|---|---|---|
| **L0** | The action never executes without a human approving that specific instance. A `pending_approvals` row every time. | Every action, always available |
| **L1** | The action executes on the owner's instruction in chat without a second approval step, **because it is reversible and recorded** — an undo exists, the before-state is stored, and the audit row is written before the change | Only actions whose platform implements `undo()` |
| **L2** | Runs unattended, no instruction needed | **Not in S3.** S7 |

Two invariants, each pinned by a test that fails when removed:

- **Spend is never above L0.** `activate_ad_campaign` and anything typed
  `actionType: "spend"` cannot be raised, by any table row.
- **Switching OFF is never gated.** CLAUDE.md rule 6 — the safe
  direction must not be the slow one. A level cannot make a disable
  slower than an enable.

Deliverable: the migration SQL plus its verify query, and the live
`pg_get_constraintdef` check first — CLAUDE.md rule 4. Pasted in chat
for the owner to run by hand. **Not run by me.**

### P1 — Lift `undo()` onto the contract (free)

`PublishPlatform` gains `undo(action)`. `hawlaiSite` implements it for
both `update_page_text` and `set_page_meta`. The `masterBrainV2` case
becomes a dispatch into the registry, like every other publish action.

No behaviour change intended, so the test is a characterisation one
first: the existing undo path's output pinned before the move, and
identical after.

### P2 — Make undo pick the right edit (free)

Undo takes the **action id** it is reversing, not a page word. Chat
already shows the owner what it changed; that card carries the id. The
"most recent on this page" behaviour stays as the fallback for "undo
that", with the page named back to the owner so a wrong guess is
visible before it is approved.

Plus the staleness question undo currently does not ask: if the page
changed *after* the edit being reversed, restoring the old text throws
away whatever came later. `executor.ts` already has the machinery for
this; undo must use it.

### P3 — Levels, read from the table (free)

`requiresApproval` becomes `level === "L1" ? "instruct" : "approve"`,
read per business per action with L0 as the default for anything absent
— `ACTION_POLICIES`' own header already says absence is not "safe by
default", and that reading is what this inherits.

`tests/approvalCoverage.test.ts` is extended, never loosened: it must
fail for any action that can reach a live write without either an
approval row or an L1 level **and** an `undo()`.

### P4 — The door, for edited text (free, decision needed)

If the owner says the new wording, it is the owner's claim and the
pipeline has never second-guessed the owner's own sentence. If the model
wrote or reworded it, it is generated copy and S1/S2 say it goes through
`generateCopy` with `task: "page_text"`. The edit path must know which
it is. See R3 — this is the open question I most want answered.

### P5 — The live exit test (needs the owner at the screen)

The founder's own test, on `candle-by-qaaf`: approve in the UI, see the
change on `/site/candle-by-qaaf`, verify, undo, see it back. Plus the
same for `set_page_meta`, which now has an undo it did not have.

This is the only phase that touches a live site, and it is the owner's
own site and his own instruction each time.

---

## 4a. Where P0–P4 ended up (22 October 2026)

All four built, all free, each committed on its own with mutation
checks. 291 test files, 4,845 tests, `tsc` clean.

| Phase | What landed | The part worth knowing |
|---|---|---|
| **P0** | `autonomyLevels.ts`, migration 209 | **L2 is not expressible in the database.** The CHECK allows `'L0'` and `'L1'` only, so no row can say L2 until a later migration widens it. A code-only guard would be one edit away from gone. Spend, delete and critical actions are pinned to L0 by action TYPE, and the test walks every one in the registry rather than the one I thought of |
| **P1** | `undo?()` on `PublishPlatform`, implemented in `hawlaiSite` | **Page meta has an undo for the first time.** It also warns that a search listing takes days to re-crawl, which page text never needs to say. `undo?()` is optional, and that is load-bearing: `canHoldL1` refuses L1 without one, so Shopify and Meta leaving it off is a statement with a consequence |
| **P2** | the moved-on check; selection by `action_id` | Undo never asked the question `executeText` asks before every write. If a line now says neither what the edit set nor what it said before, something changed it since, and restoring would wipe that out silently. Refused, with what the line actually says now |
| **P3** | levels read from the table, in `createPublishAction` | **Nothing changes until a row exists.** Empty table, missing row and read error all read as L0, so all 4,845 tests passed unchanged. `approvalCoverage.test.ts` extended, never loosened |
| **P4** | `verifyEditedText`, wired behind `FACT_BOUND_COPY` | The owner's dictated words are never checked; model-written wording goes through the extractor, the second net and the judge. **Refused, not trimmed** — half a line the owner asked for is worse than none |

### Two things I reported wrongly and corrected

**"Undo must store a previous version."** The architecture plan's sizing
said so and this plan repeated it. It was already stored, on
`preview.changes[].before`. No new table.

**"Select kills dairy-03's claim at step 2."** It does not.
`resolveProduct` returns `none` for a single-product catalogue on
purpose — "a single-product catalogue has no such gap, so scope never
blocks" — so Select approved it before the fix and after. The gate that
deleted it was the judge's evidence filter. Found by a mutation check,
not by reading.

**"A naive reuse of the verifier would refuse every edited line."**
Half wrong. An edit has no Select step, so `approved` is empty — and the
verifier was already built for that: the figures records-fallback ("not
only what Select happened to pick") and rubric rule 9 ("the second
heading is not weaker than the first"). Both added after real incidents.
No framing change was needed.

---

## 4b. P5 — the live exit test, as a runbook

Three things to check, in this order. Each is the founder at the screen;
nothing here can be verified from a test suite.

### 1. The founder's own test — edit, approve, verify, undo

1. In chat: *"homepage pe heading badal do: <exact words>"* — give the
   wording yourself, so provenance is `writtenByOwner` and nothing is
   claim-checked.
2. Approve the card. The page at `/site/candle-by-qaaf` should show it.
3. In chat: *"undo that"*. The card should name **which** edit it is
   reversing.
4. Approve. The old heading should be back.

**What would be a finding:** the undo card naming a different edit, or
the `from` value on it not matching what the page currently says.

### 2. The new half — undo a search listing

Same loop with *"page ka search title badal do"*, then *"undo that"*.
Expect the warning that Google re-reads a listing in its own time — the
title in search may lag, and that is not a failure.

**This step was wrong when first written, and the founder paid for it
in P5.** `hawlaiSite.undo` handled page meta from P1, but the chat
tool's candidate query was left text-only on purpose while selection
was a label guess — I wrote that in the P1 commit and then put this
step in the runbook anyway. He tested it, chat correctly said it had no
record of such an edit, and the time was wasted. The candidates now
cover both kinds, and with no `edit_id` and both kinds in range undo
**asks which** rather than reversing whichever is newer: one of them is
invisible on the page, so a wrong choice there is one nobody can see.

### 3. The fact check on an edit — needs the flag

Only with `FACT_BOUND_COPY=1` set on the deployment. Ask for wording
the records cannot support without dictating it, e.g. *"heading mein
likho ki hamari candles market se behtar jalti hain"*. It should be
**refused with the reason**, not published and not trimmed. Then say
*"ye mere exact words hain, aise hi likho"* — and it should be saved
verbatim with a warning that the owner is the one standing behind it.

**Cost:** two or three Haiku calls per model-written edit, about
Rs 0.4–0.8. Zero on anything dictated.

**One correction to how I described this.** I wrote that "the owner's
dictated words are never checked". That is true of every CLAIMS check —
the old layer keeps them and warns, the unknown-name refusal fires only
on wording the model wrote, and the fact-bound check filters them out
before it runs. It is **not** true of one rule: a price or a stock count
in page text is refused for everybody, including the owner, because the
harm there is not a false claim but two numbers drifting apart with
nothing keeping them in step. That rule now says so in its own message,
because an owner who has been told the first thing reads the second as
the flag being broken.

**And the flag has to be on.** The fact-bound check sits behind
`FACT_BOUND_COPY`. In the founder's P5 test it was off, so what refused
his dictated wording was the older layer — whose note, until this fix,
never mentioned that `writtenByOwner` existed. Every refusal note now
carries that path, from one shared constant.

### What P5 cannot tell us

Whether levels work. `action_levels` is empty, so every action is still
L0 and the test above exercises the approval path exactly as it was. L1
is a separate, deliberate decision — the SQL to set it and to take it
back is in chat rather than in this document, because turning it on
changes whether the founder is asked before his own site changes.

---

## 5. Risks, with the evidence for each

**R1 — Undo reverses the wrong edit.** M2. Today's selection is a
substring match on a label across the last five rows. Fixed in P2; until
then it is the live behaviour.

**R2 — There is no draft layer.** `publish/types.ts` records that
`website_pages` *is* what `/site/{slug}` renders. An approved edit is
public the instant it saves — no staging, no preview URL. Undo is
therefore the only safety net, which is exactly why S3 puts it on the
contract before it adds levels. **L1 without a working undo is not
acceptable**, and P0's table enforces that by construction.

**R3 — The live page already carries claims the pipeline would
refuse.** Reading `/site/candle-by-qaaf` today, the page says its wax
*"burns cleaner, slower, and safer than mass-market paraffin"* and
*"Better for your home, better for the air you breathe."* Those are a
**comparison** claim against someone else's product and a **benefit**
claim about the reader — the two classes S2 refuses unless a record
licenses them, and nothing in the licence table grants `benefit` at all.

I do not know whether this business has records that would support them;
I have not read its rows, and the eval fixture is not the real tenant.
The point is the asymmetry, not the verdict: **the page was written
before the pipeline existed, and S3 makes chat edit one line of it
through the pipeline.** So the owner can be told "I cannot write that"
about a new sentence while the paragraph above it already says something
stronger. That is a bad experience and a fair complaint.

Three possible answers, and this is the founder's call:

1. **Check only what is edited.** Simplest, and the asymmetry stays.
2. **Check the edited line, and report the rest.** The owner gets one
   note: "the page has N other lines I could not support — want to go
   through them?" Nothing is changed without asking.
3. **Check the page on first edit and refuse to edit until it passes.**
   Most consistent, and the most likely to make the product feel like it
   is blocking work.

I would build **2**. It is honest, it changes nothing without
permission, and it turns a contradiction into an offer.

**R4 — The levels table is a new gating surface.** A wrong row there
un-gates an action silently. Mitigated by making L0 the default for
anything absent, by the spend pin, and by extending
`approvalCoverage.test.ts` rather than trusting the table.

**R5 — Repo migrations drift from production.** CLAUDE.md rule 4 and
[the prod-drift note](DECISIONS.md): prod lacked migration 140 before.
Every S3 migration gets its live `pg_get_constraintdef` check before the
SQL is written, and the SQL is pasted in chat.

**R6 — Website Builder edits are invisible to undo.** A change made in
the Website Builder UI writes no `publish_actions` row, so undo cannot
see it — the tool's own error text already says this to the owner. S3
does not fix it; it should not silently appear to.

---

## 6. Exit tests

| # | Test | How |
|---|---|---|
| 1 | Undo is on the contract, not in one tool | a test that fails if `masterBrainV2` reaches `publish_actions` directly for an undo |
| 2 | Every L1-eligible action has an `undo()` | a test over the registry; L1 without undo cannot be expressed |
| 3 | Spend cannot be raised above L0 | mutation check: set the row to L1 and the test must fail |
| 4 | Disabling is never slower than enabling | mutation check on the toggle path |
| 5 | Undo reverses the named edit, not the newest | two edits to one page, undo the first by id |
| 6 | Undo refuses when the page moved on | staleness, with a frozen clock |
| 7 | **The founder's live test** | approve → live → verify → undo, on `candle-by-qaaf`, for both actions |

Tests 1–6 are free. Test 7 is the one that counts, and only the owner
can run it.

---

## 7. What I need from the founder before any code

1. **L0/L1 as defined in P0** — particularly that L1 means "acts on your
   instruction in chat without a second approval, because it is
   reversible", and not "acts unattended". If L1 means something else to
   you, the table changes shape.
2. **R3 — which of the three answers.** My recommendation is 2.
3. **Approval to write the migration SQL** (you run it, as always).
4. Whether **P4** belongs in S3 or waits — it is the only phase that
   could change what the owner's own typed words are allowed to say.

Nothing in P0–P4 costs money. P5 costs a few ordinary chat turns on your
own account.

---

## 8. What this plan does not claim

It does not claim the 17-action map is settled; S3 implements two of
them. It does not claim levels are finished — L2, promotion from
measured data and automatic demotion are S7, and they are the half that
needs C7's online monitor to exist first. And it does not claim the
live page's existing wording is wrong: R3 names a shape, and the records
decide, which is the whole argument of the fact-bound work.
