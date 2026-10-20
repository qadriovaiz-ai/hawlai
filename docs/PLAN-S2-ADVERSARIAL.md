# PLAN-S2-ADVERSARIAL — stop discovering bugs one paid run at a time

Written 2026-10-20, on the founder's direction after fourteen WhatsApp
exit runs. No code until this is approved.

**The honest summary of why this plan exists.** S1 took eleven paid runs
and S2a has taken fifteen. Twenty-six runs, Rs 604, and **not one of
the faults they found was the model inventing a fact.** Every single one
was a guard of mine refusing something true, or a gap where nothing was
looking. I found them one at a time because I was discovering them one
at a time: write a guard, pay Rs 12–16, read one failure, fix it, pay
again.

That loop ends here. The faults have **shapes**, the shapes repeat
across surfaces, and a shape can be provoked on purpose for nothing.

---

## 1. The known bug-shapes

Fourteen, drawn from the commit record rather than from memory. Each is
a *shape*, not an incident — the incidents are listed under it so the
claim can be checked.

### The ones in the truth layer

**B1 — The licence does not match what the record IS.**
Every claim type demands a licence (`value`, `existence`, `policy`,
`process`), and every record source grants a set. When they disagree, a
true recorded fact is unsayable.
*Incidents:* `duration` needed `value`, so the candle's 40-hour burn was
refused (S1, 16 Oct) · a product description carried the catalogue's
licences, so "made fresh every morning" was refused (S2a run 1) ·
`availability` needed `policy`, so **a salon could not say it does
haircuts** for five consecutive runs (S2a runs 7–12).

**B2 — A type that cannot say "there is none" makes the model invent
one.** A required field with nothing to put in it gets a placeholder,
and the placeholder is then read as a contradicting value.
*Incidents:* a boolean stringified to `"false"` and read as "the claim
is untrue" (S1) · `unit` was required, so "Shipping costs 50." produced
`<UNKNOWN>` and a true ₹50 was cut (S2a run 3).

**B3 — Scope applied in the wrong direction.**
A claim about one named product needs a record about that product; a
collective reference is the range; store-level policy covers
everything; and a product record does **not** cover the range.
*Incidents:* the rule over-fired on store-level policy and on
collective references, deleting 8 true claims (S1 runs 4–6) · a
business-level 40-hour record read as one product's (S2a run 4) ·
correctly refused "fresh ghee" from the paneer's record (run 12) and
"desi ghee is available" from paneer facts (run 13).

**B4 — The judge is shown a paraphrase instead of the record.**
*Incidents:* the Select model's `intent` was shown in place of the
owner's own sentence, and the judge refused a true claim on the summary
(S1) · `describeScope` wording told the judge to refuse (S1).

**B5 — A check measured against text a model wrote.**
The model marks its own work.
*Incidents:* `c.intent` in the allowed vocabulary, so "pure" authorised
itself (S1) · a string `c.value` in the vocabulary doing the same (S2a
run 5).

**B6 — A figure checked against the wrong authority.**
*Incidents:* step 4 compared figures only with the approved claims and
never with the records, so 250 inside the name "Paneer 250g" was
unverifiable (S2a run 4) · a claim and its record agreed word for word
and were refused, because `value` held prose (run 5).

**B7 — Claim typing: the right rule applied to the wrong type.**
The licence table is only as strong as the type the model picks.
*Incidents:* "we don't use ammonia" typed `safety` instead of `material`
(S1) · "we are here to help" typed `capability` (S1) · a recorded
product property typed `benefit` (run 1) · "we offer keratin treatment"
typed `capability`, which nothing can license (run 10) · **"you will
get 10% off" typed `benefit` by my own second net** (run 12).

**B8 — Curation mistaken for gatekeeping.**
A true recorded fact refused because Select did not choose it for this
piece.
*Incidents:* "The paneer is fresh." (run 12) · the `!approved.length`
short-circuit refusing "The business is located in Indore" with no
judge call at all (run 13).

### The ones in the guards

**B9 — A code check over-firing on legitimate copy.**
My dominant failure mode: **six separate times in S1, twice more in
S2a.**
*Incidents:* totality words emptied "We never use cheap paraffin wax" ·
Title-Cased button labels · bullet markers "har" and "ek" · the Hinglish
greeting "Khush Aamdeed" · exact slug matching ("ghee" vs "Desi ghee
500ml") · "Book your slot whenever suits you **best**" — a whole call to
action.

**B10 — A word list pretending to be a rule.**
Expressed as surface forms, defeated by rephrasing.
*Incidents:* "pure" fixed three times after "asli" and "premium" (S1) ·
**I added a list of Hinglish verb endings one commit after being told
not to, and run 7 reworded past it** ("ho jayenge" → "pa jaao" → a bare
noun phrase).

**B11 — Recall failure in context.**
A rule that holds on a specimen and fails in a real message. No retry
fixes it: temperature is 0, so two identical calls are two bills and one
answer.
*Incident:* salon-04's benefit claim survived runs 6, 7, 8 and 10 while
the extractor reported and refused it every time I sent it on its own.

**B12 — Something that is not copy at all reaching the customer.**
No claim in it, so no claim check can see it.
*Incidents:* **"FSSAI: [LICENSE NUMBER NEEDED]"** in a customer's
message (run 6) · the model's own four questions, "Cannot finalize
without: (1)…", in the message body (run 6) · "Order now → [link]"
(run 11).

**B13 — Silence read as approval.**
Everything must fail closed, including the pipeline's account of itself.
*Incidents:* F-01, `facts ? guard() : skip` (Sept) · an empty extraction
meant no verdicts, so run 8 printed zero removals and looked clean ·
`_incomplete` never propagated on WhatsApp, so a case that failed closed
was counted as a case that ran (run 8) · the same on
contentMarketingAgent, found by the test for the first (run 8) ·
`_malformed` carrying it on no surface at all (run 9).

**B14 — The copy changes after the checks have run.**
Three steps replace the copy with new model output: the specificity pass
(**every draft**), the anti-generic retry and the shape retry. Before
20 Oct nothing they wrote was ever checked by anything.
*Incident:* run 11's "[link]" went out through a guard whose own test
proves it catches that string.

### And the fifteenth, which is not a product bug

**B15 — The instrument tells a false story.**
Listed separately because it damages the *evidence*, not the copy — and
it has cost more of this budget than any product fault.
*Incidents:* the first recall gate measured the OLD prompt's sentences
and cleared a pipeline that then let 13 claims through · a `\b` in a
heredoc became BACKSPACE, so "0 causal joins" was evidence of nothing ·
a fixture had `ownerFacts: []`, so Business Knowledge reached neither
model nor guard while the sheet showed those rows to graders · the
grading sheet pre-filled a dash for 224 of 329 rows, and both Hinglish
failures were in the skipped set · a judge stub that entailed only
index 0, making the pipeline look like it deleted true copy · my
second net's control set contained **no offer sentence**, which is why
a guard built to stop over-firing over-fired.

---

## 2. Six business types

Three exist. Three are new, and each is chosen because it provokes
shapes the current three cannot.

| | Type | What it exposes |
|---|---|---|
| T1 | **Candle by Qaaf** — products | B3 (two products, one description), B9, B10 ("pure soy") |
| T2 | **Shine Studio** — services | B1 (`availability`), B7 (courtesy, selling), B11 (outcome claims) |
| T3 | **Shree Dairy** — food | B6 (FSSAI digits), B3 (ghee vs paneer), B8 |
| **T4** | **Bright Minds Academy** — coaching | **B11 at its most dangerous.** Every natural sentence is an outcome claim about the reader's child: "your child will score 90%", "guaranteed improvement". Testimonials are third-party claims no record can license. Batch size is a count. "Our results beat every institute in town" is B7/comparison. **Nothing physical is sold, so shipping must never appear** |
| **T5** | **Spice Junction** — restaurant | **B3's hardest case: a menu is twenty products.** "Everything is fresh" over twenty items from one item's record. **Allergens are `safety` claims, which nothing can license — and the one place a false claim could physically hurt somebody.** Dine-in vs delivery is B1/availability. "Made fresh today" is time-bound: true at noon, false at midnight |
| **T6** | **Sunrise Properties** — real estate | **B6 at scale.** Figures in lakhs and crores, written "1,20,00,000", "₹1.2 Cr", "1.2 crore" — three spellings of one number, and B2's unit table has never seen them. **RERA registration is a credential exactly like FSSAI.** Possession date is a *future commitment*, which is B7/capability wearing a date. "Starting from ₹45L" is the `startingFromPrice` guard. Sq ft and BHK are units |

**The multi-tenant rule is not relaxed for any of this.** Every fixture
is data; no business name, category, product or trade word enters code
or a prompt. `multiTenantVocabulary.test.ts` and
`multiTenantRender.test.ts` stay green and get extended.

---

## 3. The adversarial cases

~280, written free, each one aimed at a numbered shape.

| Surface | Cases | Why that many |
|---|---|---|
| WhatsApp | 65 | 6 types × ~11; the shortest copy, where one false removal breaks the message |
| Lead message | 55 | 6 types × ~9; the lead's NAME (B9, a certainty) and `customer_state` |
| Social | 85 | 6 types × ~14; hashtags, word caps, the most surface area |
| Product description | 75 | 6 types × ~12; publishes to the live storefront, so the verify step must run BEFORE the preview |
| **Total** | **280** | |

**What makes a case adversarial rather than just another case.** Each
carries, written down in the case itself:

- the **shape** it targets (B1–B14),
- the **records the business has**, chosen so the trap is real,
- **what the right answer is** — stated as *this sentence must survive*
  or *this sentence must be removed*, which is what the current cases
  do not have,
- and which **direction** a failure would be: a true claim removed, or
  an unsupported claim published.

That last field is the one that changes the work. Today a case produces
copy and a human decides. A case with an expected direction can be
scored by machine for most shapes, which is what makes 280 affordable.

**Generation is free and it is mine to do, with one honesty
constraint:** I write the cases from the *shapes*, never from a run's
output, because a case written from output I have already seen tests my
memory rather than the pipeline. B15 is what that mistake looks like.

---

## 4. The gate — and an honest correction to the cost

The founder's instruction was "a cheap gate, Rs 2–4, tests all 280 at
once". **I cannot hit Rs 2–4 for 280 model-tested cases and I would
rather say so now than discover it mid-run.** 280 cases is roughly 850
sentences; batched at a dozen per extractor call that is ~70 Haiku calls
at ~Rs 0.40, so **about Rs 28.**

But most cases do not need a model at all, and that is the real saving:

| Tier | What it tests | Cost | When |
|---|---|---|---|
| **1** | Every case whose answer is decided **in code**: licences (B1), the figure arithmetic (B6), scope (B3), `notCopy` (B12), `introducedWords` (B9, B10), the fail-closed paths (B13), the ordering (B14) | **Rs 0** | in `npx vitest run`, forever |
| **2** | Only the cases whose answer needs a **model**: claim typing (B7), extractor recall in a real batch (B11), judge entailment (B4, B8) | **Rs 3–5** | one batched run, before any paid run |
| **3** | The paid exit run, per surface | Rs 12–17 | **confirmation only, never debugging** |

I expect roughly **200 of the 280 to land in tier 1** — because B1, B3,
B6, B9, B10, B12, B13 and B14 are all decided in code, and those eight
shapes account for most of the twenty-five runs. Tier 2 is the ~80 cases
where a model's judgement is the thing under test.

**Tier 1 is the prize.** It runs on every commit forever, it costs
nothing, and it would have caught eight of the fourteen shapes before a
rupee was spent.

---

## 5. Fixing across all four surfaces at once

The rule, stated so it can be held to: **a shape is fixed in the layer
that owns it, never in the surface where it was noticed.**

Every one of the fourteen lives in shared code — `src/lib/facts/`,
`src/lib/content/` — so a fix is cross-surface by construction. What
went wrong before was the *discovery* being per-surface, not the fix.
Two concrete things change:

1. When a shape is found, its case is added for **all six types and all
   four surfaces**, not just the one that failed. `_incomplete` is the
   cautionary tale: I fixed WhatsApp, and the test I wrote for it found
   the same hole in the surface S2c was going to use.
2. The surface wiring itself gets a shared test, which already exists
   in one form: `evalIncompleteSurfaces.test.ts` asks every surface the
   same question, so the next surface added cannot quietly skip it.

---

## 6. The old clean sheets become regression tests

**S1 run 11: 130 sentences, 9 cases, zero F on the founder's blind
grading.** That is the only fully graded clean result this project has,
and today it protects nothing.

As a fixture it protects a great deal. Stored with each graded sentence:
the records the piece was written from, the sentence, and the founder's
verdict. Then, for free, on every commit:

- **no sentence the founder graded T may be removed** by the code-level
  checks. This is a direct guard against B9 and B10 — my dominant
  failure mode — and it fails loudly the next time I widen a rule.
- **every sentence he graded F must still be caught**, where the catch
  is a code-level one.

What it cannot do is replay the model steps for nothing, so it pins the
code checks only. That is the right half to pin: over-firing is where
eight incidents came from.

Any surface that grades clean from here joins the same fixture, so the
set grows and **nothing already graded is ever graded twice.**

---

## 7. Order of work, and what I am asking

1. **Free, now:** the fourteen shapes (this document) · the three new
   fixtures · the 280 cases with their expected directions · tier 1 as
   real tests · run 11 as a regression fixture.
2. **Rs 3–5:** tier 2, once, across all 280.
3. **Fix everything tier 1 and tier 2 find, in shared code, for all six
   types and four surfaces.** Expect this to be the bulk of the work,
   and expect tier 1 to go red in places the twenty-five runs never
   reached.
4. **Then, and only then, Rs 12–17 per surface** for a confirmation run,
   graded blind.

**What I need from the founder:** approval of this plan, including the
corrected gate cost (Rs 3–5, not Rs 2–4) and the tier-1/tier-2 split.
Nothing paid happens in step 1.

**And one thing I would rather put plainly.** This plan is good
engineering and it is also me paying back a debt. Twenty-five runs went
on discovering, one failure at a time, what a few hundred free
adversarial cases would have shown at once — and B15 says the
instruments I measured with were wrong six times. The tier-1 suite is
the part that makes that unrepeatable.
