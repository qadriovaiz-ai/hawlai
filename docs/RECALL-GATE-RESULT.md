# The Hinglish recall gate — result

For the reviewer. 16 October 2026. Four runs, `scripts/eval/recallGate.eval.ts`.

## What was being tested, and why it is the one thing worth testing first

The pivot replaces a denylist ("these phrases may not be said") with an
allowlist ("a factual sentence must point at the record that makes it
sayable"). The whole scheme rests on one step: **claim extraction** —
finished copy in, the claims it makes out, in English canonical form,
whatever language the copy was in.

That step is the riskiest part of the design, because its failure mode is
silent. A claim it does not enumerate is never judged, so a miss *passes*
a false sentence. The denylist at least left its failures visible in the
output; this one would not.

So: of the 33 sentences a human reviewer graded FALSE in the 13 October
baseline — 20 of them Hinglish — how many does the extractor even notice?
A sentence it notices can be refused by the licence table. One it does
not notice cannot be refused by anything.

The 30 cases, 329 sentences and 33 F / 72 T verdicts are the **saved
baseline data**, reused unchanged across all four runs. No new copy was
generated.

## The four runs

| Run | F noticed | T noticed | Cost | What changed |
|---|---|---|---|---|
| 1 | 31 / 33 | 69 / 72 | Rs 12.15 | first measurement |
| 2 | 31 / 33 | 70 / 72 | Rs 12.75 | prompt rewritten with no trade vocabulary |
| 3 | 31 / 33 → **32** corrected | 70 / 72 | Rs 13.12 | `customer_state` type + vague-promise rule |
| 4 | **33 / 33** | 70 / 72 | Rs 13.49 | `temperature: 0` + duplicate scoring fixed |

Gate total **Rs 51.51**. Running total across all paid work
**Rs 79.37 of Rs 500**.

## Four root causes, in the order they were found

**1. The prompt carried one trade's vocabulary (run 1 → 2).**
The system prompt used candle and salon words — paraffin, appointment,
burn time — as the examples shown to *every* business. This repo's own
`multiTenantVocabulary` test caught it; rule 3 says that test is extended
and never loosened, so the prompt was rewritten to describe claim
*shapes*, naming no product, material or trade. No allowlist entry.

*The finding worth keeping:* the generic prompt was **not worse**. Same F
recall, and true-claim recall went from 69 to 70. The guard improved the
prompt rather than costing anything.

**2. Two claim shapes had no type and no rule (run 2 → 3).**
Both misses in runs 1 and 2 were claims made by *implication* rather than
by predication:

- `"Aapka lavender candle aa raha hai"` — "your lavender candle is on its
  way". Asserts that an order exists; phrased as a greeting. None of the
  twelve claim types fitted, so nothing was reported. Fixed with a
  **`customer_state`** type: a claim about the reader's own order,
  booking or status. It is deliberately *not* in the unlicensable list —
  a benefit claim can never be supported by anything, while this one
  becomes supportable the day a send carries the recipient's own order
  row. `NEEDS_RECIPIENT_RECORD` records the real constraint:
  `business.paid_orders = 2` does not establish that *this reader* has
  one of them.
- `"Bas ek baar aayein, baaki hum sambhal lete hain"` — "just come once,
  we handle the rest". The capability claim with nothing named, skipped
  while five plainer siblings in the same email were caught. Fixed with a
  rule: a vague promise *is* the promise, and never skip a sentence
  because a neighbour says the same thing more plainly — each sentence
  may be sent, posted or read on its own.

**3. A measurement bug in the harness, not a miss (run 3).**
`candle-05` carries the paraffin comparison **twice**, in bullets and in
the body, differing by a full stop. The model enumerated it once and
attributed it to one sentence index, which is correct. The gate counted
per index and read the twin as unnoticed. The claim had in fact been
caught, with both halves. A claim reported once now covers every sentence
that makes it. Run 3 was really 32 of 33.

**4. `temperature` was never set (run 3 → 4).**
`dairy-09`'s hedge — *"that idea deserves a closer look"* about ghee and
weight gain — was enumerated in runs 1 and 2 and missed in run 3. Same
sentence, same prompt family, three draws, two hits. The default
temperature of 1.0 was sampling.

This step enumerates; it does not compose. Variation here is not flair,
it is a claim that is checked on Monday and shipped on Tuesday — and no
gate can certify a stochastic reader on a single draw. `temperature: 0`,
pinned by a test and a mutation.

## What the extractor actually does with the sentences no regex caught

```
"Hamare candles soy wax se bante hain — yeh slower aur cleaner
 jalte hain regular paraffin wax ke mukable"

  -> material/own_product    the candles are made from soy wax
  -> comparison/own_product  burn slower than regular paraffin wax
  -> comparison/own_product  burn cleaner than regular paraffin wax
```

```
"hum har mahine automatically aapki appointment rebook kar dete hain"

  -> capability/own_business  automatically rebooks appointments
                              every month
```

`comparison` and `capability` are licensed by **no source** in the record
table, so both are refused by the *absence of a licence* rather than by a
pattern. The English forms of these were caught by regex; the Hinglish
forms were not, by any of four separate dry runs.

## Two things this result does NOT say

**It is recall, not precision.** The gate asks whether a false sentence
is noticed, not whether the verdict on it is right. Judging is step 4b
and it is not built yet.

**2 of 72 true claim sentences produced no claim.** That is a precision
cost, not a safety one: an unenumerated true claim is not refused, only
unconfirmed. The harness did not record which two, so they cannot be
named here — it now does, from the next run on.

## One honest caveat about the number

Runs 1–3 measured an extractor that was sampling, and run 3 also measured
against a harness that mis-scored duplicates. Only **run 4** measured the
code that is in the repo. The claim being made is therefore narrow and
exact: *on this data, with this prompt, at temperature 0, every sentence
a human called false is enumerated.* Whether that holds on copy the
baseline never produced is unknown, and the gate is cheap to re-run —
about Rs 13 — which is the point of keeping it.

Commits: `82b6b6c`, `5de1001`, `e93a8db`, `d9fe120`.
