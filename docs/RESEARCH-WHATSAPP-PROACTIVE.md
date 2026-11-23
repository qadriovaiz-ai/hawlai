# Proactive WhatsApp — sizing H3 and the opportunity push

## 0. Method, and what this document does not know

Sizing only. Nothing was built, nothing was wired, no migration was
written. Everything below was read out of the repo on **23 November
2026** — the parked branch, the cron configuration, the executor
registry, the guard tests — and where a claim rests on something I
could not read, it says so.

**What this document cannot settle, and nobody can settle from the
code:**

- Whether Meta will approve a Utility template for "something needs
  your OK", how long that takes, and what it costs per send. That is
  an approval queue and a price list, not a code question.
- Whether the owner wants an opportunity to **reach him** or to **be
  acted on**. Those are different products and the second one is much
  larger. §4 treats them separately rather than guessing.
- What a backlog looks like in production. `agent_tasks` with no
  registered executor sit `pending` forever by design, and I cannot
  query the database. §3.3 has the query.

**One correction up front, because it changes the sizing.** The two
infra blockers the owner remembers are not both still there. The
"Vercel Hobby cron, once a day" one is **already worked around**, and
has been since migration 129: a Supabase `pg_cron` job hits
`/api/events/dispatch` every two minutes through `pg_net`, and I
watched it do so 13 times in 25 minutes while checking the WhatsApp
logs. There is a working fast lane. The second blocker — one executor —
is real and unchanged.

---

## 1. What already exists

The part that decides the sizing, as always.

| | Lines | What |
|---|---|---|
| `src/lib/whatsapp/` | **978** | verifySender 173, approvalReply 165, pendingReply 135, metaClient 132, inbound 131, suggestionReply 111, client 75, gupshupClient 56 |
| `api/events/dispatch/route.ts` | **153** | the two-minute lane: drains `event_queue`, drains `agent_tasks`, nudges a stalled daily run |
| `lib/automation/cronGroups.ts` | **177** | 26 subsystems across two groups, ordered by cost |
| `lib/growth/dailyGrowth.ts` | **659** | the daily owner email — the one proactive channel that already works |
| `lib/notifications/emit.ts` | **79** | in-app notifications, 12 kinds, deduped |
| `lib/tasks/taskExecutors.ts` | **66** | **one** executor |
| `lib/events/eventHandlers.ts` | **46** | **three** event types subscribed |
| `lib/events/emitEvent.ts` | **21** | the producer side |

**M0–M4 are done and verified live** (`docs/RESEARCH-WHATSAPP-META-DIRECT.md`
§7), which matters here for one reason: the WhatsApp transport is no
longer the risky part. Signature verification, the Meta client, the
provider switch and the inbound parser have all met real traffic. What
is left in both pieces below is *permission to send outside a
conversation*, not the ability to send.

### 1.1 The three mechanisms a proactive feature would use

Already built, already running, and none of them was built for this:

1. **`event_queue` + `EVENT_HANDLERS`** — `emitEvent()` writes a row;
   the two-minute dispatcher runs its handlers. **Three** event types
   have subscribers today: `lead_converted`, `task_completed`,
   `task_failed`. An `event_type` with no handler is marked `done` and
   dropped, deliberately.
2. **`agent_tasks` + `TASK_EXECUTORS`** — the same dispatcher drains
   these, batched 50 at a time, retried 3 times with a 5-minute
   backoff. An `action_type` with no executor is left `pending`, also
   deliberately: "a queued task is real work someone's waiting on".
3. **`notifications`** — 12 kinds with a dedupe key, written by the
   daily subsystems. It is an **in-app** surface: a bell nobody rings.

So the shape of a proactive push is not new infrastructure. It is
**detectors emitting events instead of only writing rows**, plus a
channel allowed to leave the app.

---

## 2. H3 — telling the owner something is waiting

### 2.1 What is on the branch

`hawl-h3-deferred`, one commit (`55055f40`, 18 November 2026), **two
files, 310 lines**, and it still merges into `main` with no conflicts.

| File | Lines | State |
|---|---|---|
| `src/lib/approvals/notifyOwner.ts` | 128 | `approvalEmail()` + `notifyOwnerOfApproval()` |
| `tests/approvalNotice.test.ts` | 182 | 16 tests, **2 skipped** |

The message is finished work, not a sketch. It carries the same four
characters H2 matches on (`approvalCode`), so the notice and the reply
name the same row whichever channel each travels; it quotes the card's
own stored `confirm` sentence word for word rather than paraphrasing
it, so the two cannot drift; it offers both ways out in the same
breath; and it ends by saying nothing has happened yet. It is
idempotent on the approval id, and it never throws — the approval is
already written, so losing the message is a worse day, not a lost
decision.

Every dependency it needs still exists on `main`: `sendDealerEmail`
with its `idempotencyKey` option, `ownerEmail`, `businessDisplayName`,
`approvalCode`.

### 2.2 What is missing, and the reason it is missing

**Nothing calls it.** That is the whole gap, and it is not an oversight.

The first version put the call inside `requestApproval`, and
`tests/s6ExitTest.test.ts` failed — *"a send cannot be reached from its
tool at all"*, walked with every door open. That guard is correct:
raising an approval must not be able to send anything, and
`requestApproval` sits on every approval-raising tool's path. There was
a way to pass the test without satisfying it (move the send one frame
up into `runMasterBrainChat`, where the walk begins after the case
body). The branch's own commit message records that this was not done.

Two tests are **skipped, not deleted**: the ones asserting
`requestApproval` calls this, in order, with its answer ignored. They
are the proof of wiring when wiring comes.

### 2.3 Why a template, in detail

`tests/channelRules.test.ts` holds this, and it is an **exact
equality**, not a filter:

```ts
expect(senders).toEqual(["app/api/webhooks/whatsapp/route.ts"]);
```

One file may call `sendWhatsAppText`/`sendWhatsAppImage`. Declarations
are stripped and a *call* is counted, so there is no path through it by
tidying imports. A second sending file fails the suite.

That is not a style rule. It encodes WhatsApp's **24-hour session
window**: a free-form message may be sent only inside 24 hours of the
person messaging the business. Outside it, Meta accepts only an
approved **template** — and an approval can be raised at any hour, so
most notices would fall outside. A free-form send there fails at the
provider. The guard caught a design that would have broken against the
live API whether or not a test existed.

So the template is not a formality that unlocks a flag. It is:

- A **Utility**-category template, composed and submitted in WhatsApp
  Manager, with `{{1}}`-style variables for the business name, the
  confirm sentence and the code. Content and category are Meta's call,
  not ours; a Utility template that reads like marketing is rejected.
- A **new transport function** — `sendWhatsAppTemplate` — because
  `metaClient.ts` has none. A template send is `type: "template"` with
  `template: { name, language, components }`, a different payload from
  the two sends that exist. Grepped: there is **no** template code and
  **no** `whatsapp_templates` table anywhere in the repo.
- A **deliberate change to `channelRules`'s expected list**, brought to
  the owner under Rule 7 rather than edited. The honest extension is
  not "another file may send" but "a *template* may be sent from one
  more place, and free-form still may not" — which is a different
  assertion, and writing it is part of the work.
- The **fallback question answered**: what happens when the template is
  not approved, is paused, or the send fails. Email already works and
  is on the branch, which is why the branch sends by email.

### 2.4 What verifying it takes

The same shape M4 took, and the same honesty about what a green suite
cannot show:

1. Un-skip the two tests; wire the call where the template flow decides
   (not in `requestApproval`).
2. Prove the `s6ExitTest` guard still holds — it is the reason the
   first attempt was abandoned, so it is the one to re-run first.
3. A **live** run: raise a real approval, outside the 24-hour window,
   and confirm the template arrives. Inside the window proves nothing,
   because free-form would also have worked.
4. Answer `haan <CODE>` from the phone and confirm it decides the row
   the notice named. H2 is already verified; this proves the notice and
   the reply agree.
5. Then an **expiry** test: no inbound for 25 hours, then a notice.
   That is the case the whole design exists for, and it is the one
   nobody can fake.

### 2.5 Size

| | Piece | Commits | Already exists | New |
|---|---|---|---|---|
| H3-a | Email notice wired, template deferred | **1** | all 310 lines on the branch | the call site; un-skip 2 tests |
| H3-b | `sendWhatsAppTemplate` in `metaClient` | **1** | the client, the config, the error reader | template payload + its own tests |
| H3-c | `channelRules` extended for templates | **1** | the guard | a new assertion, owner-approved |
| H3-d | Template chosen, submitted, approved | **0** | — | **owner + Meta only** |
| H3-e | Window-aware routing: template outside, free-form inside, email fallback | **1** | `whatsapp_chat_sessions.updated_at` is the last-inbound clock | the decision + its tests |
| H3-f | The live run, including the 25-hour expiry case | **1** | — | a verification script |

**Total: 5 commits, S–M.** H3-a is genuinely small and could ship on
its own tomorrow — it is a wiring commit on finished code. Everything
after it waits on H3-d, which is not code.

---

## 3. The opportunity push — what the blockers actually are now

### 3.1 The cron blocker is mostly gone

The owner remembers "Vercel Hobby cron, once a day, two job slots". The
first half is stale.

Both Vercel cron entries are used (`vercel.json`: `signals` at 03:00,
`heavy` at 03:30) and Hobby allows exactly two — the repo says so in
eight places. But those entries only **plan and start** a day's job
list. The list is drained by `/api/events/dispatch`, called by
`pg_cron` through `pg_net` **every two minutes**, which also nudges a
stalled daily run forward. That is how a 26-subsystem run completes
inside Hobby's limits at all.

So a two-minute lane exists, is authenticated with the same
`CRON_SECRET`, fails closed without it, and is running in production
right now.

**What is still once a day** is each *subsystem*: `churn_detection`,
`budget_alerts`, `strategy_signals` and the rest run once per business
per day, at 03:00 or 03:30 IST. An opportunity those detect is
therefore up to 24 hours old before anyone hears about it — and then it
arrives in the daily email, which is also once a day.

That distinction is the whole sizing of this piece. **The lane is
fast; the detectors are not on it.**

### 3.2 So the real work is three things, not a cron

1. **Detectors emit.** A detector that finds something worth an
   interruption calls `emitEvent()` as well as writing its row. Cheap
   per detector — one line and a test — but it has to be decided
   per detector, because most findings are *not* worth an
   interruption, and a product that interrupts for everything gets
   muted. That judgment is the work, not the plumbing.
2. **Handlers exist.** `EVENT_HANDLERS` has three subscribed types. New
   opportunity types need handlers, and an unhandled type is marked
   `done` and dropped — silently, by design — so a type added without
   its handler is a feature that looks wired and does nothing.
3. **Something may fire between the daily runs.** For a detector that
   must *look* more often than daily (a campaign that stopped
   delivering, a hot lead), the 2-minute lane has to actually run it.
   That means a frequency on the subsystem rather than one list a day —
   a change to `dailyJobs`/`cronGroups`, which is the only genuinely
   structural piece here.

### 3.3 The executor blocker is real, and smaller than it looks

`TASK_EXECUTORS` has exactly one entry, `generate_content`. Confirmed
by reading the file, 66 lines.

But both producers are already **constrained to that one type**:
`goalPlanningAgent`'s prompt says agent tasks must use
`generate_content` — *"the only TASK_EXECUTOR registered so far.
Extend both this prompt and taskExecutors.ts together"* — and
`workflowEngine`'s `queue_content` step hardcodes it. So there is no
silent backlog of unexecutable tasks; the limit is on what the planner
is *allowed to propose*.

Worth confirming against production rather than trusting the read:

```sql
select action_type, status, count(*), min(created_at) as oldest
from agent_tasks
group by action_type, status
order by count(*) desc;
```

Anything `pending` with an `action_type` other than `generate_content`
is a task that will sit forever. I expect none.

Each new executor is roughly: the function, its claims-mode decision
(`generate_content` passes **no** `claimsMode`, so it gets the
strictest `publish` guard — an unattended path has no human reading the
card), a registry entry, the planner's prompt extended in the same
commit, and tests. **One commit each, S.**

### 3.4 And then the part that is not small

Sending an opportunity to WhatsApp hits **exactly the same wall as
H3**: outside the 24-hour window it is a template, and `channelRules`
permits one sender. H3-b and H3-c are shared prerequisites, not
duplicated work.

Email does not have that wall. `dailyGrowth.ts` already emails the
owner, and `sendDealerEmail` is a solved path. **An opportunity push by
email could ship without any template at all** — which is the same
decision the owner already made for H3, and it is why H3's branch is
written the way it is.

### 3.5 Size

| | Piece | Commits | Already exists | New |
|---|---|---|---|---|
| P-a | Emit events from the detectors worth interrupting for | **1–2** | `emitEvent`, the detectors, the 2-min lane | which findings qualify, and the handler for each |
| P-b | An opportunity-notice handler → email | **1** | `sendDealerEmail`, `dailyGrowth`'s composition | the notice, dedupe, "don't send twice for one fact" |
| P-c | Per-subsystem frequency, so a detector can run more often than daily | **2** | `daily_jobs`, `claimNextJob`, the nudge | a schedule column + planning change + a migration |
| P-d | WhatsApp delivery for the above | **0** | — | **entirely H3-b + H3-c + H3-d** |
| P-e | Each additional task executor | **1 each** | the registry, the dispatcher, the retry/backoff | the executor + planner prompt + tests, together |
| P-f | Acting unattended rather than notifying | **—** | S7's L0/L1/L2, `canHoldL1`, the promotion card | **not a sizing question.** See below |

**Total for a notify-only push: 4–5 commits, M** — and it needs no
template, no new cron entry, and no executor.

**P-f is deliberately unsized.** S7 already decided how an action earns
the right to run unattended: a promotion is asked for once with
evidence on the card, demotion is automatic, and `canHoldL1` refuses L1
for anything with no undo, because *"L1 only means anything because a
change is reversible"*. An opportunity push that **acts** is not a new
mechanism — it is new actions entering that existing ladder, one at a
time, each with its own undo. Sizing it as one piece would be
pretending it is one piece. Also worth saying plainly: **nothing in
this product has ever run unattended**, and `candle_by_qaaf` is test
data, so there is no outcome history for any action to earn a promotion
from.

---

## 4. The founder decisions this needs

Not recommendations dressed as questions. Each one changes what gets
built.

1. **Does H3-a ship now, by email, without waiting for the template?**
   It is one wiring commit on 310 lines of finished, tested code. The
   owner already chose "no interim email" in November when H3 was
   deferred to go with H5 — but H5 is now done, which is new
   information. This is the same question with one of its premises
   changed.

2. **Is the template worth starting?** H3-d is an approval queue, so the
   clock starts when it is submitted, not when we are ready. If the
   answer is yes, submitting it first and building around it is
   strictly faster than the reverse. The same reasoning as the GBP API
   queue.

3. **Reach him, or act for him?** §3.5's 4–5 commits are a product that
   *tells* the owner. One that *acts* is P-f, and that is a different
   and much longer road through S7's ladder, with no outcome history to
   promote anything on yet.

4. **Which findings are worth an interruption?** I will not decide this.
   A push that fires for everything gets muted, and then the real one
   is muted too. My read of the candidates, for him to cut:
   `campaign_not_delivering` (the seventy-day silence — the strongest
   case by far), `hot_lead`, `campaign_budget_overrun`. The weaker
   cases: `competitor_alert`, `topic_alert`, `content_performance` —
   these are *reading* material, and the daily email is already the
   right place for them.

5. **How often does a detector need to look?** P-c is two commits and a
   migration. It is only worth it if some detector genuinely must run
   more than once a day. `campaign_not_delivering` arguably does; most
   do not. If the answer is "none, for now", P-c comes off the list and
   the push rides the daily run, which is a much smaller piece of work.

6. **Is Hobby still the plan?** Everything above is shaped by two cron
   entries and 30-minute runtime-log retention — the second of which
   already cost a WhatsApp debugging session. A paid plan would remove
   the structural reason `cronGroups.ts` exists. It is a cost question,
   not a technical one, which is why it is here and not in §3.

---

## 5. What is still open

- **The 24-hour window is the single blocker both pieces share**, and
  it is not a code problem. If the template is never approved, both
  pieces still work by email, and that is not a degraded version — it
  is what the branch already does.
- **`channelRules` must be extended, never loosened.** The right
  extension asserts that a *template* may go from one more place and
  free-form still may not. That is a new assertion to write and get
  approved, and Rule 7 says it comes to the owner rather than being
  edited to fit.
- **An unhandled event type is dropped silently.** Any new event type
  must land with its handler in the same commit, or it reads as wired
  and does nothing — the same failure shape as migration 234, where a
  detector would have run daily and been silent about what it found.
- **`OPERATION_DEPARTMENT` has drifted** (57 operations, keys for 42),
  so cost attribution for anything new here lands in "Other". Noted in
  `DECISIONS.md` on 23 November and still separate work.
- **Nothing has ever run unattended**, and there is no real business on
  Hawlai yet. Every number a promotion would need does not exist.
