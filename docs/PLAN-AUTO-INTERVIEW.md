# The interview, without a person in it

Replacing the manual sitting in [INTERVIEW-A3-L1.md](INTERVIEW-A3-L1.md)
with something Hawlai runs itself: a new business signs up, Hawlai asks
the questions, judges the answers, and writes them where the facts layer
can read them — with nobody sitting in the middle.

**Written 7 November 2026.** Audit first, then the size, then the plan.
Nothing is built yet.

---

## 1. The assessment, up front

**Size: L overall — about six pieces**, in the rhythm we work in (one
commit each, tests and mutations green before the next). But it
decomposes cleanly, and the first two pieces are useful on their own
even if the rest never ships.

**Two findings that make it smaller than it looks:**

1. **The conversational question machinery already exists.**
   `src/components/dashboard/WelcomeChatCard.tsx` is a 586-line chat-style
   flow that already asks the owner questions on the dashboard, with
   choice chips, a progress bar and one combined save at the end. It
   already asks four judgment questions — formality, language mixing,
   personality words, words to avoid. **This is the same job.** Nothing
   new has to be invented about how to ask, where it lives, or how it
   saves. CLAUDE.md rule 5 is satisfied without argument: no new page,
   no new tool, no new department.

2. **The step order is already a registry.** `src/lib/onboarding/steps.ts`
   is pure data and pure functions — a built order, a target order, a
   conditional step, and every count derived rather than written down.
   Adding questions means adding to a list that was designed to be added
   to, and a test already holds that the built order cannot drift from
   the target.

**One finding that makes it bigger than it looks, and it is the real
cost:** `WelcomeChatCard` is **hand-rolled per question** — one
`useState`, one handler and one JSX branch each, about 145 lines per
step across ten steps. The interview adds roughly thirteen question
groups (B4 alone is nine yes/no promises). Adding them the same way
means another ~1,900 lines of near-identical code, thirteen more pieces
of state, and no way to test the question set without rendering it.

**So the first real piece of work is not a question. It is making the
questions declarative** — the same move `steps.ts` already made for the
step order, applied to the questions themselves. After that, adding a
question is a row in a list and a test, not a component branch.

---

## 2. The three problems this has to solve, and only one is plumbing

### 2.1 A 23-step wizard will be abandoned

Onboarding is **ten steps today**. The interview is about thirteen more.
Nobody finishes a 23-step wizard, and the owner is least able to answer
at the moment he is most likely to be asked: minute one, before he has
seen what Hawlai does with an answer.

**And an abandoned interview is worse than no interview**, which is the
part that matters here rather than in a normal product: a half-filled
record **looks complete to a generator**. `knownText` reads what is
there and has no way to know what the owner never got to. Six answers in
and abandoned means the facts layer confidently writes from a sixth of
the truth.

### 2.2 Judging a vague answer is NOT a job the claims guard can do

The founder's requirement — *"vague/adjective jawab pe follow-up"* — is
the hardest part, and the obvious reuse does not work.

`claimCheck` decides whether a claim is supported **by the records**.
Here the answer *is* the record. There is nothing behind it to check it
against, so the guard would pass "we have the best quality in the city"
without complaint — it is the owner's own words about his own business,
which is exactly the category the guard is built to respect.

What is needed is a different and much smaller test: **does this answer
contain anything falsifiable?** A number, a unit, a duration, a material,
a place, a named thing — versus only adjectives. That is deterministic,
cheap, pure, and testable without a model call. A model pass can be
added later as a second opinion; it is not needed to start, and starting
with one would mean a model call per answer per owner.

### 2.3 Nobody can be asked thirteen questions about facts they have not
needed yet

"What is your delivery time, really?" is a question an owner answers
well **when something is about to use the answer** and badly when a form
demands it. The product already knows how to ask at the right moment: the
approval cards, the daily email, the Strategist.

---

## 3. The shape: three tiers, not one wizard

### Tier 1 — in onboarding, and only four questions

Only facts the owner certainly knows at minute one, that need no
judgment, and without which the site cannot say anything true about how
to reach him. These are **L1's**, and they are deliberately the boring
ones:

| Asked | Why it is safe to ask at minute one |
|---|---|
| Public phone, and whether to publish it | He knows his number. The *publish* half is a yes/no. |
| Opening hours | He knows them. Seven rows of two times, no prose. |
| Areas he actually serves | A list of places, not a judgment. |
| Publish the street address, or city only | A yes/no with a real privacy consequence. |

**Four steps, not thirteen.** `steps.ts` grows by four and
`TARGET_ORDER` grows with it. Nothing goes on `TRANSITIONAL`, which that
file says may never grow again.

### Tier 2 — a resumable facts interview, entered when he chooses

A3's B1–B8 — delivery, timelines, materials, the nine promises, returns,
price framing, the doubt question. **Not in onboarding.** Reachable from
the Business Knowledge page, which already exists for exactly this data
and already shows what is on record.

**Resumable by construction**, and this is the answer to §2.1: progress
is stored per question, so leaving half-done is a *known* half rather
than a silent one. A generator can then be told "four of eight answered"
instead of reading six rows as the whole truth.

### Tier 3 — asked by the thing that needed the answer

The part that actually removes the person from the loop. When a
generator reaches for a fact that is not on record, the question goes to
the owner **through the surfaces that already ask him things** — a chat
card or the daily email — naming what it was about to write and could
not.

**The data for this almost exists.** `claim_checks` (migration 217)
already records that a claim was removed before an output went out. What
it stores is `claims_removed`, an **integer** — how many, not which. So
Tier 3 needs the removed phrases recorded, which is a small schema
addition, not a new system.

---

## 4. The pieces, in order

| | What | Size |
|---|---|---|
| **I1** | **The L1 columns.** A `business_listing_facts` table (phone, hours, areas, address, `sameAs`, geo, and a publish flag beside each value), RLS from the start, a pure validator for hours and URLs, and `businessNode` publishing them. | **S** |
| **I2** | **The question registry.** The interview as pure data: key, prompt, kind (choice / short text / long text / yes-no), where the answer is written, and whether it needs the falsifiability check. Industry-neutral by construction (rule 3) and asserted so. | **M** |
| **I3** | **The answer validator.** 200 characters — **split into two rows, never truncated**; a category the live CHECK accepts; and the falsifiability test with its one follow-up. | **S/M** |
| **I4** | **Tier 1 in onboarding.** Four steps, driven by I2's registry, writing I1's columns. | **M** |
| **I5** | **Tier 2, resumable.** The same registry rendered from the Business Knowledge page, with per-question progress, and the facts layer told how much is unanswered. | **M** |
| **I6** | **Tier 3, the on-demand ask.** Record which phrase was removed, turn a repeated gap into one question, deliver it through the existing card or email. | **M** |

**I1 and I2 are worth having even alone**: I1 gives every future business
somewhere truthful to put a phone number, and I2 turns the interview
document into code that a test can check for industry-neutrality.

---

## 5. What I need decided

1. **Four onboarding questions, or none?** *Recommend: four.* The
   alternative is a clean ten-step onboarding and an owner whose site
   cannot print a phone number until he finds the Business Knowledge
   page. The risk of four is that onboarding grows for the first time
   since the redesign closed.
2. **Does an unanswered question get asked again, and how often?**
   *Recommend: Tier 3 asks once per fact, ever, and records that it
   asked.* A product that asks the same question every week is a product
   the owner stops reading. The daily email already carries one ask at a
   time.
3. **Model pass on answer quality, or deterministic only?** *Recommend:
   deterministic only, to start.* It is testable, free, and the
   falsifiability test catches the case the founder named. A model second
   opinion can be added as its own piece if the deterministic one proves
   too blunt — and it would be a cost decision, not an engineering one.
4. **What happens to an answer that fails the check twice?**
   *Recommend: store it and mark it weak, do not block.* Refusing the
   owner's own words is worse than recording them with a flag the
   generators can read — and an owner who cannot get past a question
   abandons the interview, which §2.1 says is the expensive failure.

---

## 6. What this plan does NOT do

- **It does not verify anything the owner says.** An automated interview
  collects claims faster than a person would, and `knownText` treats a
  recorded note as evidence. Asking by machine does not make the answer
  truer, and the honest consequence is that a generous answer becomes a
  supported claim with nobody having heard it said out loud. The
  falsifiability check catches vagueness, **not untruth**.
- **It does not fill the gaps itself.** No question is answered from a
  model's guess about the category, ever. An unanswered question stays
  unanswered and the generators are told so.
- **It does not touch the external dependencies.** GBP (L4) and the
  local-SEO phases that need a real business's data stay where they are.
- **It cannot be tested end to end until a real business signs up.** The
  pieces can be unit-tested, the registry can be asserted
  industry-neutral, and the writes can be checked against the schema —
  but the first genuine run is the first real owner, and that is a thing
  to say out loud rather than discover.
