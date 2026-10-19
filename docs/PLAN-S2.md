# PLAN-S2 — the fact-bound pipeline on the remaining surfaces

Written 2026-10-19, after S1 passed on the founder's independent blind
grading of run 11: **130 sentences, 9 cases, zero F.** Both of the
numbers I could not count myself came back 0.

S2 is `docs/PLAN-CORE-ARCHITECTURE.md`'s second migration step: C2 on
every customer-facing surface. No code until the founder approves this,
and no paid run beyond what he approves here.

---

## 0. What S1 actually cost, because it sets the expectation

| | |
|---|---|
| Exit runs to reach a clean one | **eleven** |
| Spent | **Rs 396.41 of Rs 500** |
| Left | **Rs 103.59** |

Eleven runs is the number that matters for planning. Nine of them failed
on faults in the guards I had just added, not on the model: a licence
table, a unit string, an inverted boolean, a paraphrase shown in place
of a record, a scope rule that over-fired, button labels, bullet
markers, a model marking its own work, and a Hinglish greeting.

**So the realistic planning figure is three to four runs per surface,
not one.** Anyone budgeting S2 at one run per surface is budgeting for a
result I have not once achieved first time.

---

## 1. The order, and why

Cheapest and least dangerous first, so the expensive surface inherits
fixed guards rather than discovering them.

| Step | Surface | Cases in the eval | Per piece | One run |
|---|---|---|---|---|
| **S2a** | WhatsApp | 6 | Rs 1.81 | **Rs 12.47** |
| **S2b** | Lead message | 3 | Rs 1.67 | **Rs 5.75** |
| **S2c** | Social (Facebook/Instagram) | 12 | Rs 3.23 | **Rs 44.52** |
| **S2d** | Product description | **0 — none exist** | unknown | needs cases first |

Per-piece figures are modelled on the measured shape of an S1 email and
then **calibrated by x1.42**, which is how much my model under-estimated
the real email cost (Rs 2.12 modelled against Rs 3.01 measured). An
estimate that comes in under the actual is the one that misleads.

---

## 2. What will cost runs on each surface

These are not guesses. Each is a mechanism in the code that S1 never
exercised, and naming them now is the only way the per-surface run count
comes down.

### S2a — WhatsApp

| Hazard | Why |
|---|---|
| **The opt-out line** | "Reply STOP to stop these messages" is required and is not a claim. It must survive `copySentences`, the extractor, the verifier and `introducedWords`. ALL CAPS escapes the name check by luck rather than by design, which is not good enough for a line that must never be dropped |
| **The model is routed** | WhatsApp passes its own `req.model` (Haiku, via the task router). The door honours it for the WRITE step; Select stays on Sonnet, which is right and should be asserted rather than assumed |
| **Length** | A broadcast is two or three sentences. Removing one is proportionally far more damaging than in an email, so a single false refusal reads as a broken message |

### S2b — Lead message

| Hazard | Why |
|---|---|
| **The lead's name** | "Hey Ravi" — a proper noun in no record. `introducedWords` would flag it the moment it appears in a place position, and the lead's name must be added to the allowed vocabulary explicitly. **This one is a certainty, not a risk** |
| **One-to-one, not broadcast** | `customer_state` is the whole surface's temptation: "you asked about the keratin" is a claim about the reader, and here there IS a lead row that could license it. The founder's `NEEDS_RECIPIENT_RECORD` rule says no record supports it today; this is the surface where that becomes worth revisiting |

### S2c — Social

| Hazard | Why |
|---|---|
| **Hashtags** | `#ShahjahanpurMade` is not a sentence. The extractor may read one as a claim; `introducedWords` tokenises it into one word that escapes the place-position test by accident. Hashtags need their own handling, not luck |
| **The word cap** | Social has `WORD_CAPS`. Sentences are removed by the verifier and then tightened for length, and the two interact: tightening protects the price and link lines, the verifier does not know that |
| **Twelve cases** | Four times WhatsApp's cost per run. This is the surface to run on a SUBSET while iterating — two cases per tenant, six in all, about Rs 23 — and in full only for the exit run |

### S2d — Product description

Different in kind from the other three, and the reason it is last:

- **No eval cases exist.** Writing them is free and must happen first.
- **It publishes to the live storefront.** `src/lib/publish/` owns that
  path with previewDiff, targetRef and staleness, and the verify step
  must run BEFORE the preview is built — an owner approving a preview is
  approving what they were shown, so unverified text must never reach a
  preview card.
- **It is a resource edit, not a send.** So it belongs to the
  `ResourceEdit` family in §4.2 of the core plan, with `undo()`.

---

## 3. What Rs 103.59 buys

| Option | Cost | Leaves |
|---|---|---|
| S2a + S2b, one run each | Rs 18.22 | Rs 85.37 |
| S2a + S2b at the realistic **four runs each** | Rs 72.88 | Rs 30.71 |
| S2c, one run | Rs 44.52 | Rs 59.07 |
| S2c at four runs | Rs 178.08 | **over budget** |
| All three, one run each | Rs 62.73 | Rs 40.86 |

**What fits: S2a and S2b, properly — to the standard S1 was held to.**
That is the honest answer. Rs 103 covers WhatsApp and the lead message
with four iterations each and a little spare.

**What needs new approval: S2c and S2d.** Social alone wants Rs 90–135
at the S1 iteration rate, and the product description needs its cases
written before anything can be costed at all.

### Three ways to make S2c affordable, in order of how much I trust them

1. **Iterate on a subset.** Two cases per tenant instead of four, so
   Rs 23 a run instead of Rs 44.52, and the full twelve only for the
   exit run. Cuts the iteration cost by half with no loss of signal on
   the mechanisms — the hazards above are per-mechanism, not per-case.
2. **Prompt caching on Select.** The records block is identical across
   every case of the same tenant, and Select's input is the largest
   single cost in the pipeline. This is a real lever and I have not
   measured it; I would want a free stub run first to confirm the cache
   actually holds across cases before claiming a number.
3. **Haiku for Select on short surfaces.** Cheaper, and I am wary of it:
   under-selection deletes true claims, and 0-of-34 wrongly removed is
   the number S1 was hardest to protect. I would not do this without a
   graded run proving it.

---

## 4. The order of work in S2a, concretely

The same shape that eventually worked for S1, with the free steps first:

1. **Free:** opt-in `factBound` on the WhatsApp surface, add the opt-out
   line and the lead name to the allowed vocabulary, write the wiring
   tests and the mutation checks. No paid call.
2. **Free:** a stub run of the 6 WhatsApp cases to catch wiring faults
   before spending — this is what caught `server-only` breaking all 30
   cases before a rupee was spent.
3. **Rs 12.47:** the exit run. Three numbers, third first, then the
   grading sheet for the founder's blind pass.
4. Repeat 1–3 until the third number is 0 and his grading agrees.

Then S2b the same way, at Rs 5.75 a run.

---

## 5. What I am asking for

1. **Approval for S2a + S2b within the remaining Rs 103.59**, at the
   iteration rate S1 actually needed rather than the one I would like.
2. **A separate decision on S2c**, with the subset-iteration plan above
   — and on whether to spend a free stub run first on measuring prompt
   caching, which is the only lever that lowers the per-run cost without
   lowering the standard.
3. **S2d deferred** until its eval cases exist, which costs nothing to
   write and should happen before it is costed.

I would also rather say this plainly: **S1 took eleven runs because I
reached for the widest version of every rule and narrowed only when a
run pushed back.** The hazards in §2 are my attempt to pay that debt
forward — each one is a mechanism I know S1 never tested, written down
before it costs a run rather than after.
