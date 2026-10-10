# LIVE CHECK — candle_by_qaaf

Everything below is **safe to do**: each step makes Hawlai *offer* to do
something and writes a row saying so. Nothing goes out.

> ## DO NOT PRESS "Approve" ON ANY CARD
> Not one. Every step here ends at "a row exists". Pressing Approve is
> what spends money, publishes, posts or emails — and that is a separate
> session, after you have read these results.
>
> The two steps that **would** send something are at the bottom, under
> **HELD**, with nothing to do yet.

**How to read each step:** do the action, then run the SQL, then compare
against "should show". If something differs, stop at that step and paste
what you saw — a wrong row here is worth more than finishing the list.

---

## Before you start

**0a. The image steps need the Graphic Design hold lifted.**
In Vercel → Settings → Environment Variables, confirm:

```
NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED = true
```

If it is absent or anything else, **step 1 will correctly refuse** and
say so. That is a pass for step 1's first half; skip 1b.

**0b. Clear the decks, so the rows you see are the ones you made.**

```sql
select count(*) as pending_now
from pending_approvals
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
  and status = 'pending';
```

Write the number down. Every step below says how much it should grow by.

---

## 1. The paid image asks first, and the price is on the server

**Screen:** Master Chat.
**Type:** `make me a poster for the lavender candle`

**Should show on screen:** one line saying what it would make and that it
costs about ₹3.39, an **Approve** button, and the sentence *"This makes
one AI image now. It costs about ₹3.39 and counts against your plan's
monthly image allowance."*

**Must NOT show:** the image itself. If a picture appears, stop — that
means something generated without asking.

```sql
select action_type, amount, status,
       action_details->>'design_type' as design_type,
       action_details->>'confirm'     as confirm_on_row,
       requested_by_agent
from pending_approvals
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
order by created_at desc
limit 1;
```

**Should show:**

| column | value |
|---|---|
| `action_type` | `generate_graphic` |
| `amount` | `3.39` (or whatever the pricing table says — not null) |
| `status` | `pending` |
| `design_type` | a design type, e.g. `poster` |
| `confirm_on_row` | the **same sentence** that is on your screen |
| `requested_by_agent` | `graphic_design_agent` |

**The point of this step:** before today the ₹3.39 existed only as text
in your browser. Now it is on the row, and the words on screen are the
words on the row.

---

## 2. Publishing the site asks, and says it is the WHOLE site

**Screen:** Master Chat.
**Type:** `build me a simple website for the candles`

Wait for it to finish (it builds a draft; this does not publish).

**Should show:** a Website Draft card, an **Approve** button, and the
sentence *"This publishes your ENTIRE live site — every page, not just
this one…"*

```sql
select action_type, status,
       action_details->>'slug'    as slug,
       action_details->>'confirm' as confirm_on_row,
       action_details->'pages'    as pages
from pending_approvals
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
  and action_type = 'publish_site'
order by created_at desc
limit 1;
```

**Should show:** `publish_site`, `pending`, your slug, the ENTIRE-site
sentence, and a list of page titles.

**If your site is ALREADY published:** no row and no Approve button is
the **correct** result — the note will say changes were applied directly.
Check that instead:

```sql
select published from websites
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf');
```

---

## 3. A customer email asks, and the record says what it said

**Screen:** Master Chat.
**Type:** `write a short email to <a real lead's email on your CRM> about the lavender candle`

Use an email that is **already a lead or customer** of candle_by_qaaf.
Anything else is correctly refused, and that refusal is itself a pass.

**Should show:** the email exactly as it would arrive — footer, business
address, unsubscribe line — plus an **Approve** button and *"This sends
the email to … It can't be unsent."*

```sql
select action_type, status,
       action_details->>'to'             as recipient,
       action_details->>'recipient_kind' as kind,
       action_details->>'request_id'     as request_id,
       action_details->>'confirm'        as confirm_on_row
from pending_approvals
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
  and action_type = 'send_email'
order by created_at desc
limit 1;
```

**Should show:**

| column | value |
|---|---|
| `recipient` | the address you named |
| `kind` | `lead` or `customer` — **not** `team` |
| `request_id` | starts `chat-`, then a long id |
| `confirm_on_row` | the sentence on your screen |

**Why `kind` matters:** a note to a colleague deliberately sends straight
away with no unsubscribe footer. If this says `team` for a customer, stop.

---

## 4. A social caption asks, names the Page, and the row holds the text

**Screen:** Master Chat.
**Type:** `write a facebook post for the lavender candle`

**Should show:** the caption, and a button reading **"Publish to your
Facebook Page: <your Page's name>"** — the Page's actual name, not
"Facebook".

**If your Page is not connected:** no button at all, and a line saying
why. That is the correct result and a pass.

```sql
select action_type, status,
       action_details->>'destination'      as destination,
       action_details->>'destination_name' as page_name,
       action_details->>'expect_text'      as agreed_text
from pending_approvals
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
  and action_type = 'publish_social_post'
order by created_at desc
limit 1;
```

**Should show:** `facebook`, your Page's name, and `agreed_text`
**identical to the caption on your screen — including the hashtags.**

**This is the 8 October check.** That day the card showed one thing and
Facebook received another, because two different functions built the
text. Compare them character for character. If the hashtags are on
screen but missing from `agreed_text`, stop and paste both.

---

## 5. The copy guards, with nothing to approve

Nothing in this section writes a row or sends anything.

**5a. A generic caption is named as generic.**
Type: `write an instagram post about candles`
(deliberately vague — no product named)

**Should show:** either a caption carrying something of yours (a product
name, your city, a detail you recorded), **or** a note saying it reads
like any business in your line of work could have written it and naming
**one** thing to add. Not a lecture, not a list of five.

**Must NOT show:** a founder-story sentence you never told Hawlai. If you
see your own history in a caption you did not ask a story question about,
paste it — that is the thing Phase 3 withdrew.

**5b. A worn opener is refused.**
Type: `write an instagram caption that starts with "Elevate your evenings"`

**Should show:** it does not start that way, or it says that opening is
one every business uses.

**5c. A material claim is kept in a draft and flagged.**
Type: `write a caption saying our candles are 100% natural`

**Should show:** the caption may still contain the phrase, **and** a note
saying nothing on record backs it and what to write down. That is the
new behaviour — a draft warns, publishing drops it.

**5d. A performance claim is removed even in a draft.**
Type: `write a caption saying our candles burn clean with no soot`

**Should show:** those words are **gone**, with a note saying they were
removed. This is the 8 October caption's own wording, and it must not
survive a draft.

---

## 6. The autopilot skip — observation only

Nothing to press. If Content Autopilot is on for candle_by_qaaf, check
what the last run did:

```sql
select created_at, success, error
from content_autopilot_log
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
order by created_at desc
limit 5;
```

**What is new:** a run can now be skipped with
`Skipped: nothing was posted. Nothing in this one belongs to your
business…` — a caption that read like anyone's is no longer posted. Before
today it was posted and logged as a success.

If autopilot is off, there is nothing to see and that is fine.

---

## 7. Count the rows you made

```sql
select action_type, count(*), max(created_at)
from pending_approvals
where dealership_id = (select id from dealerships where dealership_name = 'candle_by_qaaf')
  and status = 'pending'
group by action_type
order by 3 desc;
```

**Should show** one pending row per step you did, all still `pending` —
nothing approved, because you pressed nothing.

**Leave them pending.** They are the evidence, and the next session uses
them to test Approve.

---

## HELD — do not do these yet

These two are the only checks that make something leave the building.
Listed so the list is complete, not so you do them today.

**H1. Approving one card, end to end.** Pick the image one first: it is
the only one whose worst case is internal (an image in your gallery,
~₹3.39, no customer sees anything). Then the row should move to
`approved` and a row should appear in `graphic_designs`.

**H2. The email double-press.** Press Approve on the email card twice.
The second press should come back **409 / "already sent"**, not a second
email, and `email_sends` should hold **one** row with
`handoff_state = 'sent'` and your `idempotency_key`.

Say the word and I will write these two up as their own short session,
with the rollback for each.

---

## What is proved by tests but NOT by this list

Written down so the gap is visible rather than assumed:

- **Approving actually performs the work.** Every step here stops at the
  row. H1 is the first time a real Approve runs.
- **The email idempotency claim.** Proved in tests; H2 is the live check.
- **The read-back after posting** on social. Only a real post exercises it.
- **The four ad platforms** remain code-ready and inactive, unchanged.
