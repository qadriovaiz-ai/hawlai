# PLAN — G-3: INLINE CARDS ONTO A SERVER-SIDE APPROVAL RECORD

**PLAN FIRST. No code written.**
**Baseline:** `main` @ `dc6296e`

---

## 1. The problem, stated exactly

Hawlai has **two** approval mechanisms, and only one of them is real.

| | The queue | The inline card |
|---|---|---|
| Row in `pending_approvals` | yes | **no** |
| Who checks the approver | the server, on PATCH | **the browser** |
| Audit trail | the row, with `reviewed_by` | **nothing** |
| Replayable by a crafted request | no | **yes** |

The inline card is `PublishAction` in `src/lib/chat/publishActions.ts`: a
`{endpoint, method, payload}` the chat message hands the browser, and
`MasterChatPage.tsx` `fetch`es when the button is pressed. The
`confirm` sentence, the destination name, the cost quote — all of it
lives client-side. A request sent straight to the endpoint with the same
payload skips every one of them.

**What is NOT wrong with it:** each card points at an endpoint the
department page already uses, and each endpoint re-runs its own rules at
execution time — plan caps, opt-out, business address, connection check.
So the card cannot do something the dashboard could not. The gap is
**authorisation and record**, not capability. That distinction decides
the whole plan.

---

## 2. The four endpoints, with the risk on each

| # | Endpoint | Lines | Authz | Approval row | Callers |
|---|---|---|---|---|---|
| 1 | `/api/graphic-design/generate` | 102 | 2 checks | none | `GraphicDesignView.tsx:40`, `publishActions.ts:85` |
| 2 | `/api/website-builder/publish` | 41 | 1 check | none | `WebsiteBuilderView.tsx:198`, `publishActions.ts:108` |
| 3 | `/api/email/send` | 100 | 1 check | none | `GenerateMessageButton.tsx:47`, `publishActions.ts:51` |
| 4 | `/api/social/post` | 232 | 1 check | none | `dashboard/social/page.tsx:66`, `publishActions.ts:153` |

### 1. `graphic-design/generate` — money, recoverable
**What a bypass gets you:** a paid Gemini image generated against the
business's monthly allowance. **Cost:** real but bounded — the plan cap
runs inside the endpoint, so the worst case is the month's allowance
burned, not an unbounded spend. **Reaches a customer:** no. Nothing is
published; the image lands in the gallery.
**This is the least delicate of the four**, and the only one whose
failure is purely internal.

### 2. `website-builder/publish` — public, instantly reversible
**What a bypass gets you:** `websites.published = true` — the entire
site public at once (there is no per-page publish).
**Reaches a customer:** yes, but passively: a stranger must visit.
**Reversible:** completely, with the same flag, from Website Builder.
No notification fires, no third party is told.

### 3. `email/send` — leaves the building, cannot be recalled
**What a bypass gets you:** a real email, from the business's own Gmail
or the platform Resend account, to a real person.
**Reversible:** no. **Already partly guarded:** opt-out, business
address and the unsubscribe footer run inside the endpoint, and Phase 2B
added the duplicate-suppression window.
**Why it still matters most of the four:** everything the endpoint
checks is about *form*. Nothing checks that a human agreed to **this
text, to this recipient** — the approval the `confirm` sentence only
pretends to collect. `masterBrainV2.ts:3009` already carries a comment
saying exactly this.

### 4. `social/post` — public, fast, and already the best-guarded
**What a bypass gets you:** a public Facebook or Instagram post.
**Reversible:** via unpublish, with a delay and whoever already saw it.
**Already guarded, more than the other three combined:** the destination
is resolved *before* the button exists (`destinations.ts`), an
unconnected destination gets **no button at all**, the confirm names the
Page, the payload carries `expect_text` and the endpoint **reads the
post back** and compares.

**So #4 is where I would stop and think rather than convert.** Its card
already does five things a generic `pending_approvals` row does not. If
converting it means the owner sees a generic approval card instead of
"Publish to your Facebook Page: <their Page>" with a read-back, the
change **reduces** safety while improving the audit trail. That trade is
yours to make, and I will not make it quietly.

---

## 2a. THREAT MODEL — what this closes, and what it does not

Written before the work, so it cannot be written to flatter the result.
**The attacker in every row below is already signed in as this business's
owner or an active team member**, because every one of these endpoints
already checks that. G-3 is not about keeping strangers out.

### Closed by G-3

| # | The attack | How it works today | Why the record stops it |
|---|---|---|---|
| T1 | **Replay the card's payload** | Read the `PublishAction` out of the chat response (it is in the page's own JSON), POST it to the endpoint directly. The `confirm` sentence never renders, nobody agrees to anything | The endpoint is no longer the button's target. The only path is `PATCH /api/approvals/{id}`, and there is no id until the server made a row |
| T2 | **Press without reading** | The owner can click past the confirm; nothing records what the words said | The `confirm` text moves into `action_details`. What the owner approved is stored server-side, in the words they were shown |
| T3 | **No audit trail at all** | A sent email, a published site, a paid image — none leaves a row saying who decided | `pending_approvals` carries `reviewed_by`, `reviewed_at`, `action_details`. "Who approved this and what did it say" becomes answerable |
| T4 | **A compromised or buggy client sends N times** | The browser owns the decision, so a loop in the client is a loop in production | The row is single-use: the PATCH flips `pending` to `approved` under the existing conditional-UPDATE row mutex. A second PATCH finds nothing pending |
| T5 | **A prompt-injected chat turn builds its own button** | Content the model read (a web page, a lead's message) persuades it to emit a `PublishAction` with an attacker's payload — and the card renders as if Hawlai meant it | `requestApproval()` refuses an action that is not in `ACTION_POLICIES`, and the rupee threshold in the approvals route applies. The injected action still has to be a classified action the owner then approves on a server-rendered card |
| T6 | **The agreed rupee amount is unverifiable** | `imageGenerateAction`'s price is a string in a browser label. Nothing server-side knows what the owner was quoted | `pending_approvals.amount` holds it, where the authority threshold reads it |

### NOT closed by G-3 — stated plainly

| # | Still open | Why G-3 does not touch it | What would |
|---|---|---|---|
| U1 | **A signed-in owner doing it on purpose** | They are authorised. An approval record documents the decision; it does not veto it | Nothing should. This is the product working |
| U2 | **Direct calls from the dashboard components** | §3: the four endpoints keep their no-row dashboard callers on purpose. A replay of *the dashboard's* request still works | Making the row mandatory — rejected in §3, with the reason |
| U3 | **A stolen session or token** | Every mechanism here, old and new, trusts the session | Session security, 2FA, device binding. Out of scope and not pretended otherwise |
| U4 | **Bad content the owner approves** | The record captures agreement, not correctness. An approved email full of invented claims still sends | The claims guard and Phase 3 — a different layer, which is why both exist |
| U5 | **A team member inside their authority** | The threshold gates by rupees; a free action is free to anyone active | Per-action role permissions. Not in G-3 |
| U6 | **`social/post` until step 4** | It is a decision, not a conversion, and it needs your sign-off | Step 4 |
| U7 | **The three endpoints stay reachable after conversion** | Nothing is removed from them — that is what makes this safe to ship incrementally. T1 closes for the **chat path**; the endpoint itself is as reachable as it was | U2's answer, if ever |

**The honest summary in one line:** G-3 converts *the browser decided* into
*the server recorded the owner deciding*. It does not make an authorised
person less powerful, and it does not make approved content true.

---

## 3. The approach: add the record, touch no endpoint

The obvious move — make each endpoint demand an approval row — is the
wrong one, and the reason is in the caller column: **every endpoint has
a legitimate dashboard caller that has no approval row and should not
need one.** A press on the Website Builder page *is* the owner's
decision, made on a page that shows them the thing. Requiring a row
would either break those four components or force a bypass flag, and a
bypass flag in an authorisation check is how authorisation checks die.

So instead:

```
NOW:   chat message -> PublishAction{endpoint, payload} -> browser fetch -> endpoint
                                                      ^ the confirm lives here

PLAN:  chat tool -> requestApproval() -> pending_approvals row (server)
                                      |
                                      v
                 a card whose only button is PATCH /api/approvals/{id}
                                      |
                                      v
             approvals route: re-reads the row, checks who is asking,
             then performs the SAME work server-side
```

**This is exactly the Phase 2B mechanism, already built and tested.**
`requestApproval.ts` creates the row; `/api/approvals/[id]` PATCH holds
the server-side authz (owner or active team member) plus the rupee
threshold, and already has nine execute-on-approve branches, five of
them added in 2B. `activate_ad_campaign` already carries a
`publish_action_id` in its `action_details`, so an approval row pointing
at a prepared piece of work is a shape the route already knows.

**Nothing in the list of four endpoints changes. No dashboard component
changes. The hardened spine is not touched — it is reused.**

### What each conversion actually is
1. An `ACTION_POLICIES` entry (`send_email` is already classified; three
   new keys for the others).
2. The chat tool calls `requestApproval()` instead of returning a
   `PublishAction`.
3. One new branch in the approvals PATCH that performs the work by
   calling the endpoint's **extracted logic** — not by `fetch`ing the
   endpoint. (A route calling its own app over HTTP is the Vercel-508
   self-call pattern this codebase already got burned by and rebuilt
   away from.)
4. An `approvalCoverage.test.ts` case, which fails for anything new that
   sends directly.

**Step 3 is the one real cost of this plan.** Three of these four
endpoints keep their logic inline in the route handler. To call it from
the approvals route it has to move into `src/lib/...`, with the route
becoming a thin caller. That is a refactor of a working publish path —
the thing every instruction so far has told me not to touch. So each
conversion is: **extract, prove the extraction changed nothing, then add
the approval branch** — two commits per endpoint, not one.

---

## 4. The order, least delicate first

> **APPROVED SCOPE (2026-10-09):** steps 1 and 2 only — `graphic-design`
> then `website-builder` — **then stop and report.** Steps 3 and 4
> (`email/send`, `social/post`) wait for Ovaiz's review of that report.

### Step 1 — `graphic-design/generate`
**Why first:** the only one whose worst case is internal. If the
extraction is wrong, an image fails to generate. Nothing reaches a
customer, nothing goes public, nothing is unrecallable.
It also carries the **cost quote**, which is the clearest case for a
server-side record: right now the rupee figure the owner agreed to
exists only in a browser string. After this, the agreed amount sits in
`pending_approvals.amount`, where the authority threshold can see it.
Commits: `extract generateDesign()` then `image generation asks on the record`

### Step 2 — `website-builder/publish`
**Why second:** 41 lines and a single boolean — the smallest extraction
in the set — and fully reversible if the conversion misbehaves.
Commits: `extract setSitePublished()` then `publishing the site asks on the record`

### Step 3 — `email/send`
**Why third and not first, despite being the highest risk:** by here the
pattern has been proven twice on paths where a mistake is cheap. Doing
the unrecallable one first means learning the pattern on the only
endpoint where getting it wrong means a real email to a real person.
The `send_email` branch in the approvals route **already exists** —
Phase 2B wrote it and labelled it unreached-for-now. This step is what
reaches it. The real idempotency key lands here too; see §6.
Commits: `extract the send path` then `the email card asks on the record`

### Step 4 — `social/post` — **a decision, not a conversion**
I bring you a side-by-side first: what the owner sees today versus what
they would see on a generic approval card, and what is lost. My
recommendation, written now so it is on the record before I am invested
in the work:

> **Keep the card. Add the record beside it.** Write a `pending_approvals`
> row at the moment the card is *shown*, and have the endpoint require a
> matching row id in its payload. The owner's experience does not change
> — destination name, confirm, `expect_text`, read-back, unpublish all
> stay — and a crafted request with no row id is refused. This is the
> only one of the four where the card is better than the generic
> alternative, so it is the only one that should keep its card.

This is a **different mechanism** from steps 1–3 (a row that is
*required* rather than a row that *executes*), which is exactly why it
goes last: it needs the other three done to be judged fairly, and it
needs your sign-off because it modifies `social/post`.

---

## 5. What could go wrong, and what catches it

| Risk | Catch |
|---|---|
| An extraction silently changes publishing behaviour | Each extraction is its **own commit with no behaviour change**, proven by the existing tests on that path before any approval branch is added |
| The approvals branch and the dashboard path drift apart | Both must call the same extracted function, asserted by execution rather than by grep |
| A card loses its `confirm` wording in translation | The `confirm` sentence moves into `action_details` and renders from there. The words the owner reads become the words stored server-side — better than today, where they are a client string |
| `social/post` gets worse | Step 4 is a decision with a side-by-side, not a conversion |
| Three endpoints untouched but three tools rewritten | Extend `approvalCoverage.test.ts` to fail for a tool that returns a raw `PublishAction` for a classified action, not only for one that sends directly |

**Floor:** if any step makes the owner's screen less clear about what is
about to happen, the audit trail is not worth it and the step is
reverted.

---

## 6. Email idempotency — the real key (SQL PREPARED, NOT RUN)

### Why the Phase 2B window is not enough
`duplicateSend.ts` says so itself: it is a 5-minute suppression window
over `email_sends`, it is **not atomic**, and it cannot tell a
double-submit from a deliberate second send of the same subject.
Worse for a real key: `sendDealerEmail` inserts the `email_sends` row
**after** the send succeeds (`sendDealerEmail.ts:49` and `:60`), so a
unique constraint on that table cannot prevent the race — the row only
exists once the email is already gone.

### The design
A **claim before the send**, keyed on a client-supplied request id:

1. The card generates one `requestId` per composed email. A retry of the
   same press reuses it; a deliberate second send is a new press and a
   new id. This is what the content hash cannot distinguish.
2. `email_sends` gets `idempotency_key` plus a **unique index**, and the
   insert moves **before** the send, as a claim. `via` is already known
   before sending (`dealership.gmail_email` is read first), so that
   NOT NULL CHECK column can be filled at claim time — this is why the
   claim is possible without a second table.
3. A unique violation means the send is already claimed: return the
   prior outcome, send nothing.
4. On send failure the claim is marked `failed` and **nothing is
   deleted**. The unique index excludes failed rows, so the same request
   id can be retried; the failed row stays on record to be diagnosed.
   *(This replaces an earlier "delete the claim on failure" step — see
   decision (a) below. A delete can fail; an index predicate cannot.)*
5. `handoff_state` keeps `email/stats` honest: `api/email/stats/route.ts:17`
   counts rows as sends, so a `claimed` or `failed` row must not count —
   while **`null` must**, because the old code only ever wrote on
   success. See decision (b).

The content-hash window **stays**, as the belt for any caller that sends
no key.

### Step A result (live, 2026-10-09) — and what it changed

Your output: **15 columns, 3 indexes, 3 constraints, 8 rows.** No name
collision with `idempotency_key`, `handoff_state`,
`uq_email_sends_idempotency`. The live `via` CHECK is exactly the repo's
(`gmail`/`resend`), so a claim written before the send can satisfy it.

**Two things in that output changed my design**, both in the direction of
less machinery:

1. **8 rows.** The backfill is a plain `update`. No batching, no
   `where id in (...)` paging, nothing to be careful about.
2. **`delivery_status` / `delivery_error` / `delivered_at` already
   exist** — and that is a naming hazard, which is your next question.

### Who fills the three existing status columns, and why they cannot be confused

| | Existing `delivery_status` | New state column |
|---|---|---|
| **Written by** | `resendWebhook.ts` `applyResendEvent` **only** — nothing else in the codebase writes it on this table | Hawlai's own send path, in `sendDealerEmail` |
| **Written when** | minutes to hours *after* the send, when Resend fires a webhook | *before* the send (claim) and immediately after (outcome) |
| **Source of truth** | **Resend**, a third party | **Hawlai** |
| **Covers which sends** | **resend only.** It is keyed on `resend_message_id`, which is null for every Gmail send — a real platform limitation migration 088 already documents | **every** send, both `via` values |
| **Answers** | "what did the recipient's mail server do with it?" — delivered, bounced, complained, suppressed | "did Hawlai hand this off at all?" |
| **Can be absent on a successful send** | **yes, always, for Gmail** | no |

They are orthogonal: a Gmail send that worked perfectly has
`delivery_status = null` forever, and a resend send can be `delivered`
while Hawlai's own handoff record says `sent`. Neither can substitute
for the other.

**So I am not calling the new column `send_state`.** Two columns named
`send_state` and `delivery_status` on one table, meaning different
things, with one of them null-by-design for half of all rows, is a
future bug with a comment in front of it. The migration below uses
**`handoff_state`** — it names Hawlai's side of the boundary, which is
the only thing it knows about. (`delivery_status` is already an
overloaded word in this codebase: `analyticsAgent.ts:392` and
`campaignHistory.ts` use it for campaign snapshots on a different
table.)

### Your three decisions, resolved

**(a) `'failed'` state, or delete the claim on failure — one, not both.**
**Chosen: `'failed'`, and no delete.** The index is made partial on it:

```sql
where idempotency_key is not null and handoff_state is distinct from 'failed'
```

Why this beats deleting:
- **A delete can fail.** My earlier plan said a failed delete would
  leave the retry blocked and the owner told "we cannot confirm" — which
  is safe, but it is a bad state reachable by a second database error.
  There is no delete here, so that state does not exist.
- **The record survives.** A failed send is the thing you most want to
  see later. Deleting it throws away the diagnosis.
- **The retry is unblocked anyway**, because `is distinct from 'failed'`
  takes the row out of the unique index. Same requestId, retry proceeds.

`is distinct from` rather than `<>` deliberately: `<> 'failed'` is NULL
for a NULL state, which silently drops those rows from the index.

**(b) The deploy window — rows the OLD code writes between the migration
and the code. Counted as SENT.**
The migration adds a column; the old `sendDealerEmail` does not set it,
so it keeps inserting rows with `handoff_state = null`. Those are
**successful sends**, because the old code only inserts *after* the send
returns success (`sendDealerEmail.ts:49`, `:60`).

So the rule is **`null` means sent**, and `email/stats` counts
`handoff_state is null or handoff_state = 'sent'`.

**The important consequence, said plainly: the backfill does not make
`null` impossible.** More nulls appear after it, for as long as the old
code is live. So the *code rule* is what makes the numbers right; the
backfill only makes the eight historical rows explicit. Anyone who reads
the backfill and concludes "null now means unresolved" would be wrong,
and my earlier plan said exactly that — it is corrected here.

**(c) 8 rows → a plain `update`.** No paging.

### Step A — the query that produced the above (kept for the record)
Repo migrations drift from prod, so I will not write the ALTER until I
have seen this output:

```sql
-- 1. What is on the table right now, and does the column already exist?
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'email_sends'
order by ordinal_position;

-- 2. The live constraints, verbatim — not the repo's copy.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'email_sends'::regclass;

-- 3. Existing indexes, so I do not collide with one.
select indexname, indexdef from pg_indexes where tablename = 'email_sends';

-- 4. How many rows the backfill would touch.
select count(*) from email_sends;
```

### Step B — the final migration, adjusted to the live schema

**Next number is 208.** Repo latest is 207, and your output confirms no
name collision. **Not yet run, and not yet in `supabase/migrations/`.**

```sql
-- ============================================================
-- 208_email_send_idempotency.sql
--
-- A real idempotency key for /api/email/send.
--
-- Phase 2B shipped a 5-minute duplicate-suppression window over this
-- table and said plainly what it was not: not a key, and not atomic.
-- The reason it could not be atomic is in sendDealerEmail — the
-- email_sends row is inserted AFTER the send returns success
-- (sendDealerEmail.ts:49 and :60). Two requests landing in the same
-- instant therefore both read "no duplicate" and both send, and no
-- unique constraint on this table can prevent it, because at the moment
-- that matters the row does not exist yet.
--
-- So the row becomes a CLAIM, taken BEFORE the send, keyed on a request
-- id the client generates once per composed email. A retry reuses the
-- id and is refused; a deliberate second send is a new press with a new
-- id and goes through. That is the distinction a content hash cannot
-- make, and it is why the 5-minute window stays as a belt rather than
-- being replaced.
--
-- Checked against the LIVE schema on 2026-10-09 (15 columns, 3 indexes,
-- 3 constraints, 8 rows) rather than against this repo's migrations,
-- which have drifted from production before.
-- ============================================================

-- The client's request id. One per composed email; a retry reuses it.
alter table email_sends add column if not exists idempotency_key text;

-- WHY handoff_state AND NOT send_state: this table already has
-- delivery_status, written only by resendWebhook.ts from Resend's own
-- events, and null forever on every Gmail send because it is keyed on
-- resend_message_id. That column answers "what did the recipient's mail
-- server do with it". This one answers "did Hawlai hand it off at all",
-- for every send, from Hawlai's own code. Two columns a reader could
-- mistake for each other, one of them null-by-design for half the rows,
-- is a future bug — so the name says whose side of the boundary it is.
alter table email_sends add column if not exists handoff_state text;

alter table email_sends drop constraint if exists email_sends_handoff_state_check;
alter table email_sends add constraint email_sends_handoff_state_check
  check (handoff_state is null or handoff_state in ('claimed', 'sent', 'failed'));

-- THE KEY. Partial, for two separate reasons:
--
--   idempotency_key is not null
--     Every row written before this migration has a null key, and so
--     does every row the CURRENT code writes until the new code
--     deploys. Null keys must not collide with each other.
--
--   handoff_state is distinct from 'failed'
--     A failed send must not block the retry of itself. Taking the
--     failed row out of the index unblocks the same request id without
--     deleting anything — which is why there is no "delete the claim on
--     failure" step anywhere in this design. A delete can fail; an
--     index predicate cannot, and the failed row stays on record where
--     it can be diagnosed.
--     `is distinct from` and not `<>`: `<> 'failed'` evaluates to NULL
--     for a null state, which would silently drop those rows from the
--     index.
create unique index if not exists uq_email_sends_idempotency
  on email_sends (dealership_id, idempotency_key)
  where idempotency_key is not null and handoff_state is distinct from 'failed';

-- The 8 existing rows are historical sends that DID succeed — the old
-- insert only ran on success. 8 rows, so a plain update.
update email_sends set handoff_state = 'sent' where handoff_state is null;

-- READ THIS BEFORE TRUSTING THE BACKFILL. It does NOT make null
-- impossible. Between this migration and the code deploy, the old
-- sendDealerEmail keeps inserting rows with no handoff_state, and those
-- rows are successful sends. So null means SENT, permanently, and
-- api/email/stats counts `handoff_state is null or handoff_state =
-- 'sent'`. Only 'claimed' and 'failed' are excluded from send volume.
-- The backfill makes the eight historical rows explicit; the code rule
-- is what keeps the numbers right.

comment on column email_sends.idempotency_key is
  'Client-supplied request id, one per composed email. Unique per business while the send has not failed. A retry reuses it and is refused.';
comment on column email_sends.handoff_state is
  'Hawlai''s own side of the send: claimed (written before the send) -> sent | failed. NULL means sent, by rows written before the claim mechanism deployed. Not to be confused with delivery_status, which is Resend''s verdict and is null for every Gmail send.';
```

### Step C — the verify query

```sql
-- 1. Columns, index and constraint all present?
select
  (select count(*) from information_schema.columns
     where table_name='email_sends' and column_name='idempotency_key')      as has_key_col,
  (select count(*) from information_schema.columns
     where table_name='email_sends' and column_name='handoff_state')        as has_state_col,
  (select count(*) from pg_indexes
     where tablename='email_sends' and indexname='uq_email_sends_idempotency') as has_unique_index,
  (select count(*) from pg_constraint
     where conrelid='email_sends'::regclass
       and conname='email_sends_handoff_state_check')                       as has_state_check;
-- expect: 1, 1, 1, 1

-- 2. The backfill touched all 8 and invented nothing.
select handoff_state, count(*) from email_sends group by handoff_state;
-- expect exactly one row: sent | 8

-- 3. The index predicate is BOTH conditions, not just one. This is the
--    assertion that matters most: a non-partial index here would make
--    every pre-208 row collide, and a predicate missing the 'failed'
--    clause would block the retry of a failed send forever.
select indexdef from pg_indexes
where tablename='email_sends' and indexname='uq_email_sends_idempotency';
-- expect the definition to end with:
--   WHERE ((idempotency_key IS NOT NULL) AND (handoff_state IS DISTINCT FROM 'failed'::text))

-- 4. Nothing lost, and no key written yet (the code has not deployed).
select count(*) as total, count(idempotency_key) as keyed from email_sends;
-- expect: total = 8, keyed = 0

-- 5. The existing columns are untouched — this migration must not have
--    gone near Resend's side of the boundary.
select count(*) as resend_status_rows from email_sends where delivery_status is not null;
-- expect: whatever it was before this migration (compare against Step A)
```

**Still not run.** The SQL above lives in this document only; nothing has
been written to `supabase/migrations/`. When you say go: you run it, you
paste Step C, and only then do I write the code that depends on
`idempotency_key` — in that order, because a column the code needs must
exist before the code does.

**One deploy-order note, since it bites exactly once:** the migration is
safe to run while the current code is live (it only adds nullable
columns and a partial index that current rows cannot violate). The code
that writes the claim must deploy *after* it. Doing it the other way
round means every send tries to write a column that does not exist.

---

## 7. Not in G-3

Converting the other inline descriptors (the discard/DELETE paths) ·
moving the queue onto `publish_actions` · touching `destinations.ts`,
`socialPost.ts`, `postConfirm.ts` or `publish/platforms/meta.ts` ·
anything in Phase 3.
