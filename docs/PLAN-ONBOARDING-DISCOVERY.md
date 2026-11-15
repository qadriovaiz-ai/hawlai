# Three-bucket onboarding: discover, suggest, ask

**Plan only, 16 November 2026. No code written.**

The model, as approved: find what a site and an Instagram account can
tell us, turn it into a pre-filled draft the owner confirms with one
tap, and only *ask* the questions nobody writes down.

The whole plan rests on one line of it: **nothing discovered is a fact
until the owner says so.** Everything below is arranged so that rule is
structural rather than remembered.

---

## 1. What already exists, and is reused

| | Where | What it gives this |
|---|---|---|
| The 25 questions | `src/lib/onboarding/interview.ts` | 4 Tier-1 + 12 Tier-2 + **9 generated** from `OFFER_PROMISES` (`src/lib/claims/offerPromises.ts`). The registry is the single list; nothing here adds a question |
| Answer validation | `src/lib/onboarding/answerCheck.ts` | Splits an answer to fit, decides `weak`, raises the one follow-up. A confirmed suggestion goes through it unchanged |
| "What has been asked" | `src/lib/onboarding/interviewProgress.ts`, `interview_answers` (migration 222) | `answered` / `skipped` / `asked`, `attempts`, `weak`, `asked_at`, `answered_at`, **one row per question per business** |
| Where answers land | `business_listing_facts` (221) for Tier 1, `business_knowledge` for Tier 2 | Unchanged. **Suggestions never go here** — see §3 |
| The ask surface | `POST /api/interview { key, answer?, skip? }`, `InterviewCard.tsx`, `ListingFactsStep.tsx` | The confirm/edit/reject card is this card with two more buttons, not a new screen |
| One question at a time | `src/lib/onboarding/factGaps.ts` (Tier 3) | `nextGapToAsk` already returns exactly one and skips anything answered/skipped/asked. The same discipline applies here |
| WhatsApp, conversational | `src/app/api/webhooks/whatsapp/route.ts` → `runMasterBrainChat`, history in `whatsapp_chat_sessions` | One message in, one reply out, history kept — **pause and resume is already free**, no new state machine |
| The site's own words | `website_pages` + `pageText` / `READABLE_PROPS` (`src/lib/seo/technicalAudit.ts`) | Reads the business's **Hawlai-built** site with no network call at all |
| The catalogue | `gatherBusinessFacts` (`src/lib/claims/businessFacts.ts`) | Cheapest and dearest product, which is half of `price_range` |
| Provenance as an idea | `src/lib/claims/narrativeProvenance.ts` | "Does this sentence trace to a record" already exists as a concept and a vocabulary to borrow |

**No new agent, no new department, no new page, no new chat tool.**

---

## 2. The three buckets, counted

From the 25 questions, measured against what a source can actually say:

| Bucket | Count | Questions |
|---|---|---|
| **Discoverable** — a source states it | **4** | `public_phone`, `opening_hours`, `street_address` (the address itself), `price_range` (the two numbers) |
| **Inferable** — a source hints, the owner decides | **17** | `delivery_time`, `damaged_in_transit`, `ready_or_made`, `appointment_length`, `enquiry_response`, `materials_used`, `certifications`, `returns_policy`, and **all 9 `promise_*`** |
| **Owner only** — written nowhere | **4** | `areas_served`, `materials_avoided`, `common_doubt`, `why_not_cheaper` |

**Two questions are compound and must be split in the UI, not in the
registry.** `street_address` and `price_range` each carry a fact *and a
choice* — "do you want it shown publicly?", "do you want a range
shown?". The fact can be pre-filled; **the choice can never be**, and
the card must ask it separately rather than treating a confirmed
address as permission to publish it.

**The 9 promises are one-directional.** A page saying "gift wrapping
available" supports a yes. A page that does not mention workshops
supports **nothing** — absence is not a no. So discovery may propose
`yes` and must never propose `no`, and a test should say so.

---

## 3. The spine: where an unconfirmed thing lives

**A suggestion must be unable to reach a customer, not merely unlikely
to.** The way to get that is to keep it out of the stores the claims
layer reads:

```
discovered / inferred  ->  interview_answers (new columns)   NOT read by the facts layer
owner confirms         ->  business_knowledge / business_listing_facts
                           which is what gatherBusinessFacts reads
```

`gatherBusinessFacts` reads `business_knowledge` and
`business_listing_facts`. If a suggestion never lands there, **no
generator, no chat reply and no published page can state it** — C2's
`stripUnsupported` will delete it as unsupported, because there is
genuinely no record behind it. That is the guarantee working as
designed rather than a new guard.

### The four states, kept apart

The ask is that discovered / inferred / owner-confirmed / unknown never
mix. They are **two orthogonal facts** and must be stored as two
columns, because one field cannot hold both:

| | `source` | `status` |
|---|---|---|
| unknown | *(no row)* | *(no row)* |
| discovered, waiting | `discovered` | `suggested` |
| inferred, waiting | `inferred` | `suggested` |
| owner confirmed a suggestion | `discovered` / `inferred` *(kept)* | `answered` |
| owner typed it himself | `owner` | `answered` |
| owner rejected a suggestion | `discovered` / `inferred` *(kept)* | `rejected` |
| owner skipped | *(either)* | `skipped` |

**`source` is never overwritten on confirmation.** "He confirmed
something we found on his Instagram" and "he told us" stay different
facts forever — which is the whole point of the ask, and is what lets a
later audit ask *how many of this business's facts started as guesses*.

`rejected` is a new status and is **not** `skipped`: skipped means "do
not ask me", rejected means "that suggestion is wrong" — and a rejected
suggestion should let the question be asked properly, where a skip
should not.

---

## 4. Database

**One migration. No new table.**

```
alter table interview_answers
  add column if not exists source text,            -- owner | discovered | inferred
  add column if not exists suggested_value text,   -- what we think the answer is
  add column if not exists evidence jsonb;         -- where it came from
```

- **`suggested_value` is on `interview_answers` and not in `business_knowledge`** because a suggestion is not an answer. `interview_answers` is already "the state of each question for this business"; a pending suggestion is a state of a question.
- **`evidence`** holds `{ source_kind, url, quote }` — the page and the sentence it came from. Without it the owner is being asked to confirm something with no way to check it, which is the friction this is supposed to remove. It is also what makes a wrong suggestion diagnosable later.
- **No CHECK constraints**, reusing migration 170's recorded reasoning: the vocabularies are code, they move faster than migrations, and a mismatch belongs in a test rather than a failed insert.
- `status` already has no constraint, so `suggested` and `rejected` need no migration of their own.

**What this does NOT need:** no change to `business_knowledge`, none to
`business_listing_facts`, and nothing new for WhatsApp — `whatsapp_chat_sessions`
already carries the conversation, so "pause and resume" costs nothing.

---

## 5. The pieces

| | Piece | Size | The riskiest part |
|---|---|---|---|
| **D1** | **The suggestion store** — the migration above, plus reading/writing it through `interviewProgress`, and the four states kept apart | **S/M** | That `suggested` never counts as `answered` anywhere. `nextGapToAsk`, `progressFor` and `isComplete` all read these rows today, and a suggestion that counts as progress would tell the owner he has finished an interview he has not started |
| **D2** | **Discovery from the Hawlai site** — `website_pages` through `pageText`, plus the catalogue for `price_range`. No network call | **M** | Confusing *what the page claims* with *what is true*. Every suggestion carries its quote, and nothing is written outside `interview_answers` |
| **D3** | **The confirm / edit / reject card** — `InterviewCard` gains a suggestion mode: the value, the quote, the source, and three buttons | **M** | The compound questions. A confirmed address is not permission to publish it |
| **D4** | **WhatsApp onboarding** — one suggestion per message, "haan / badlo / nahi", through the existing Master Chat path | **M** | Ambiguity. The same lesson as H2: a bare "haan" must attach to exactly one question, and the question has to be restated in the message so it cannot drift |
| **D5** | **Discovery from an external website** (`dealerships.external_website_url`) | **M/L** | **Nothing in this codebase fetches an arbitrary public page today.** It needs a fetcher, a timeout, a size cap, robots handling and a failure mode. It is the only piece that adds a new outbound dependency |
| **D6** | **Discovery from Instagram** | **?** | **Blocked, and not by code.** Today only the IG business account *id* is reachable (`socialMediaAgent.ts:298`, via the connected Facebook Page). Reading a bio or posts needs permissions that are still in App Review. Sized when the permission exists, not before |

**Order: D1 → D2 → D3 → D4.** D1 before anything, because the four
states are what every other piece writes into. D2 before D3 so the card
has something real to show. **D5 and D6 are deliberately last** — the
Hawlai-built site is free to read and needs no permission from anybody,
and D2 alone already covers the four discoverable questions for any
business that has built its site here.

---

## 6. Friction — the thing being optimised

For a shopkeeper who is not technical, the ask is: **confirm, don't
compose.**

- **Dashboard: one card, several suggestions, a tap each.** Six taps beats six text fields. The card shows *what we found* and *where*, so confirming is reading, not remembering.
- **WhatsApp: one at a time**, as asked. Each message restates the question, gives the suggested answer, and takes `haan` / a correction / `nahi`. A correction *is* the edit — the owner types the right answer instead of pressing a button, which is the lowest-friction edit that exists on WhatsApp.
- **Owner-only questions come last**, after the cheap confirmations. Finishing twelve things in a minute makes the four that need thought feel like the end of a job rather than the start of a form.
- **Nothing is mandatory.** `skipped` already exists and is already honoured forever.

---

## 7. Tests

**The spine:**

1. A `suggested` row is **not** an answer — `readProgress` does not count it as answered, `isComplete` stays false, `progressFor` does not include it.
2. `gatherBusinessFacts` **never reads `suggested_value`** — asserted against the real function, with a suggestion present in the fixture and absent from the output.
3. A suggestion that is never confirmed **cannot reach a customer**: a generated reply containing it is stripped by `stripUnsupported`, because no record supports it. Behavioural, not a grep.
4. `source` survives confirmation — a confirmed discovery still reads `discovered`, never `owner`.
5. `rejected` ≠ `skipped`: a rejected question is still asked; a skipped one is not.

**Discovery:**

6. A promise is only ever suggested as **yes**; a page that does not mention it yields no suggestion at all.
7. Every suggestion carries `evidence` with a quote; one without evidence is not stored.
8. A compound question suggests the fact and **not** the choice — a discovered address never arrives pre-set to "show publicly".
9. Discovery is **idempotent**: running it twice does not overwrite an `answered` row, and does not re-suggest a `rejected` one.

**Conversation:**

10. WhatsApp confirms **one** question per message, and the message names the question.
11. An interrupted onboarding resumes at the same question — asserted through the existing session history, not a new field.
12. Rule 3: no suggestion text, prompt or label contains a trade, product or category word.

---

## 8. What I would check before building

1. **Does the pilot business have a Hawlai-built site?** If not, D2 finds nothing and the first useful discovery is D5 — which changes the order and the size of what ships first.
2. **`enquiry_response` via Instagram** is tempting (IG shows "typically replies within an hour") and I would leave it out: it measures the *Instagram inbox*, not the business, and a wrong number here is a promise made to customers about reply times.
3. **Confirm the `rejected` status is wanted.** It is my proposal, not the ask — the ask said confirm/edit/reject, and reject could equally mean "skip". I have read it as a distinct state because the two behave differently next time.
