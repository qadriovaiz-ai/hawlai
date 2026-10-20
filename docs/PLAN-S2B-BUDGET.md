# S2b and beyond — a budget request, with eight runs of evidence

Written 2026-10-20. The Rs 500 eval budget is spent: **Rs 496.95**.

This is the request the founder asked for after run 8, and the honest
case for it is not "S2a nearly worked". It is that **eight runs taught
me something specific about where the money should go**, and I would
rather spend the next tranche on that than repeat the last one.

---

## 1. Where Rs 496.95 went

| | Runs | Spent | Per run |
|---|---|---|---|
| S1 — email | 11 exit runs + gates | Rs 396.41 | ~Rs 26 |
| S2a — WhatsApp | 8 exit runs | Rs 90.48 | ~Rs 11.30 |
| Extractor gates (new, 20 Oct) | 5 | Rs 10.06 | **Rs 2.01** |

S1 passed on run 11 with zero F on the founder's blind grading. S2a has
not passed. Eight runs, and what each one cost is not the interesting
number — **what each one bought is.**

---

## 2. The eight S2a runs, and what each actually found

| Run | Cost | The fault it exposed | Where the fault lived |
|---|---|---|---|
| 1 | 10.71 | a recorded property typed as a `benefit` | my licence table |
| 2 | 11.02 | "suits you best" removed as a boast | my superlative check |
| 3 | 10.85 | a required `unit` field forced `<UNKNOWN>` | my schema |
| 4 | 11.40 | step 4 never read the records for a figure | my architecture |
| 5 | 11.23 | a claim and its record agreed and were refused | my figure check |
| 6 | 11.99 | **"[LICENSE NUMBER NEEDED]" in a customer's message** | nothing was looking |
| 7 | 11.71 | a benefit claim reworded past my verb list | my own word list |
| 8 | 11.64 | a failed case read as a clean one; an empty extraction read as approval | **my measurement** |

**Not one of these was the model inventing a fact.** Every single one
was a guard of mine refusing something true, or a gap where nothing was
looking at all. That is the finding, and it is worth more than S2a's
pass would have been.

---

## 3. What I would do differently, concretely

### The gate is ~6x cheaper than a run and found more

On 20 October I stopped testing prompt rules with Rs 12 runs and wrote
`scripts/eval/gradedF.eval.ts`: the graded sentences sent to the live
extractor with controls beside them.

| | Cost | Found |
|---|---|---|
| Full exit run | Rs 11.30 | one fault, after 100s and 24 calls |
| Extractor gate | **Rs 2.01** | three claim-typing fixes verified, 6 controls clean, and the proof that run 8's miss was NOT the extractor |

The gate is also what showed that Haiku **does** catch the salon-04
benefit claim in the exact batch the door sent — which is how I found
that run 8's problem was an empty extraction reading as approval, not a
prompt weakness. A Rs 12 run would have told me the sentence survived
and nothing about why.

**So: gates first, runs last.** A run is for grading, not for debugging.

### Over-firing is my failure mode, and controls are the fix

Six separate times a check of mine deleted something true: totality
words, scope on store-level policy, exact slug matching, Title-Cased
button labels, bullet markers, a Hinglish greeting — and then "suits
you best". Every gate I write now carries controls, and the control
line is reported as prominently as the result.

### My rules drift back into word lists

Run 7 reworded past a verb list I had added *one commit after being
told to stop building word lists*. The fix is in how a rule is written:
lead with the test, and make the examples illustrations of it. Rule 6c
now says `THE TEST IS THE SUBJECT OF THE CHANGE, NEVER THE VERB`.

---

## 4. What I am asking for

### Rs 60, and what it buys

| | Cost | Why |
|---|---|---|
| S2a closing gate | Rs 4 | the two run-8 fixes, verified cheaply, with controls |
| **S2a exit run → your blind grading** | Rs 12 | the gradeable result S2a still owes you |
| S2b (lead message) gate | Rs 3 | the lead's NAME in the vocabulary — a certainty, named in PLAN-S2 §2 |
| S2b exit run | Rs 6 | 3 cases |
| One spare exit run | Rs 12 | because my own data says one is never enough |
| Reserve | Rs 23 | unspent unless a gate says a run is needed |

**Rs 60 finishes S2a properly and S2b with it.** At the rate S1 ran
(Rs 26/run, 11 runs) that would have been Rs 286. The difference is the
gate.

### What I am NOT asking for

**S2c (social, 12 cases, Rs 44/run).** My own plan priced it at
Rs 90–135 and I no longer believe a run-driven approach is the right way
to spend that. If S2a and S2b close cleanly on Rs 60, S2c should be
costed again from gate-first numbers, not from S1's.

---

## 5. What is already paid for

Everything below is committed, tested and pushed, and none of it needs
another rupee:

- `notCopy.ts` — a placeholder or a note about writing the message never
  reaches a customer. **This is the one I would not have found without
  run 6, and the one that mattered most.**
- the fact-bound writer carries the real store and booking addresses, so
  it has no reason to invent a hole
- `_incomplete` propagates on WhatsApp **and** on the surface S2c will
  use, pinned by a test that asks every surface the same question
- an empty extraction marks a piece unverified instead of clean
- rules 6a–6d and 11a in the extractor, each with the incident recorded
- `gradedF.eval.ts`, the gate pattern itself

---

## 6. The thing I would say if asked only one question

S1 took eleven runs. S2a has taken eight and has not passed. Both
numbers are mine: I reach for the widest version of a rule, a run
pushes back, and I narrow it. The gate does not change that instinct —
it makes it cost Rs 2 instead of Rs 12 to find out, and it puts the
controls in front of me before I spend anything.
