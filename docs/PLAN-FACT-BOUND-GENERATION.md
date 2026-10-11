# PLAN — fact-bound generation

**Status: design only. No code. Awaiting founder approval.**
Repo `main` at `141fdb8`. Every file and line cited was read on
2026-10-11. Anything unverified says so.

---

## 0. The pivot, and why it is the right call

**Founder, 2026-10-11:** whack-a-mole must stop. The root cause is
free-text generation policed by a denylist.

The evidence for that sits in this repo and is not an opinion:

- `claimCheck.ts` is ~1,263 lines and **48 regex literals**, and each
  one was added after a real sentence got through.
- Today alone: *"sleep better"*, *"the scent lasts"*, *"twenty
  minutes"*, *"cheap candles"*, *"fades after two days"*, *"goes out
  automatically"*, *"makes it last"*, *"centred by hand"*, *"added at
  exactly 65 degrees"*, *"sets for 24 hours"*. Ten shapes, four rule
  classes, and the list is not closed.
- 1a-i is the argument in miniature: **two words of regex took three
  iterations and a dry run** — my first version deleted honest copy
  about the business's own price, and my first fix for that broke a
  case it should have caught. For one sentence shape.
  (`scripts/pejorativeAndDurationDryRun.mjs`, `141fdb8`.)

A denylist can only ever be as complete as the last incident. **A
citation requirement inverts the burden**: instead of enumerating what
may not be said, the model must point at the record that makes each
sentence sayable.

### What this does NOT fix, stated up front

1. **A wrong record.** If the owner typed the wrong price, a citation
   makes the sentence *look* verified. Confidence must stay visible,
   and `owner_stated` must never be rendered as "verified". (§7.3)
2. **A model that cites badly.** Quality now depends on citation
   compliance, which is a new failure mode with its own metric. (§8.2)
3. **Judgement sentences.** "The scent is soft" is not checkable and
   must stay allowed, which leaves a channel for vagueness that the
   existing shape rules — not this — are what police. (§5.2)

---

## 1. Scope, per the founder's instruction

**Keep from the old plan (and nothing else):**

| | What | Why it survives the pivot |
|---|---|---|
| (a) | shipping `!said()` fix + both tests | it is not a new rule; it stops text overriding **checkout**, which no verifier can replace |
| (b) | hashtag dedupe at the compose layer | not a claims problem at all — two sources, no dedupe (`socialPost.ts:61-63`) |
| (c) | 1c story exclusion — 3 STORY titles + row 10's motive sentence | an **input** filter; it removes the health-claim seed before the model sees it |

**Dropped:** every other narrow rule, including 1a-i. Its dry run is
kept as the record and the rule is not enabled.

**Kept running as a second net:** the whole existing claim layer
(founder's point 5). Narrow rules are deleted **only** after the new
verifier beats them on the eval set — not before, and not by
judgement.

---

## 2. The FactRecord

```ts
type FactRecord = {
  id: string;            // "f_7a3c" — opaque, stable, tenant-scoped
  key: string;           // "product.lavender.burn_hours" | "shipping.free"
  value: string | number | boolean | null;   // null = known-unknown
  unit?: "hours" | "minutes" | "days" | "inr" | "percent" | null;
  source: "catalogue" | "shipping_config" | "measured"
        | "owner_stated" | "site_owner_written" | "site_schema_org"
        | "derived";
  sourceRef: string;     // table+id, or page slug + block id, or URL
  confidence: "counted" | "observed" | "inferred";
  observedAt: string;
  expiresAt?: string | null;
  /** What a sentence citing this may assert. §4.3 */
  licenses: ("value" | "existence" | "policy" | "process" | "benefit" | "safety")[];
};
```

`confidence` reuses the vocabulary already in
`src/lib/signals/signals.ts:26` (`counted | observed | inferred`).
**Not a second scale.**

### 2.1 Sources and what each may license

| source | from | confidence | licenses |
|---|---|---|---|
| `catalogue` | `products` (`CATALOG_COLUMNS`) | counted | value, existence |
| `shipping_config` | the store's shipping settings, through `computeShippingAmount` — the same function checkout uses (`src/lib/shipping.ts:14`) | counted | policy, value |
| `measured` | `page_events`, `orders`, `leads` | counted | value |
| `owner_stated` | `business_knowledge` rows | **observed** | existence, policy, process — **never** benefit or safety |
| `site_owner_written` | page props `ownerWritten()` keeps (`businessFacts.ts:300`) | observed | existence, policy, process |
| `site_schema_org` | JSON-LD on the live site | observed | value, existence |
| `derived` | computed **in code** from other records (§5.3) | counted | value |
| Hawlai-generated page text | — | — | **not a source. No id is minted for it.** |

**No source licenses `benefit` or `safety`.** "Sleep better" and "safe
for babies" cannot be cited into existence by anything the current
system can read; they would need a test or a study, and there is no
`source` for that. So they are refused by the *absence of a licence*
rather than by a regex — which is the whole point of the pivot.

### 2.2 Ingesting the `business_story` FACT rows first

Per the agreed order, this is the first deliverable. The nine FACT rows
(`docs/PLAN-AGENCY.md` A.4a) become `owner_stated` records, **per
sentence**, before the category is retired. Rows 11–13 (STORY) and row
14 (PRIVATE) mint no records at all — which is how "story text does not
go into customer copy" becomes mechanical: there is nothing to cite.

---

## 3. The structured output contract

The model returns sentences, not prose. **One shape for every surface**;
fields differ, the sentence object does not.

```ts
type Sentence = {
  text: string;
  kind: "factual" | "feeling" | "cta" | "question";
  /** Required when kind === "factual". Ignored otherwise. */
  factIds?: string[];
};

type CopyDraft = {
  /** Keyed by the surface's own field names: body, subject, headline… */
  fields: Record<string, Sentence[]>;
  hashtags?: string[];
};
```

Example the verifier accepts:

```json
{
  "fields": {
    "subject": [{ "text": "Your evenings, a little quieter", "kind": "feeling" }],
    "body": [
      { "text": "Evenings in Shahjahanpur get loud.", "kind": "feeling" },
      { "text": "The lavender candle is soy wax with a 40 hour burn.",
        "kind": "factual", "factIds": ["f_12", "f_18"] },
      { "text": "It is 999, and shipping is free.",
        "kind": "factual", "factIds": ["f_03", "f_07"] },
      { "text": "Order on the store page.", "kind": "cta", "factIds": ["f_21"] }
    ]
  },
  "hashtags": ["#candlebyqaaf"]
}
```

### 3.1 What goes into the prompt

Instead of today's prose facts block (`formatFactsForCopy`), the
available records, **with their ids**:

```
FACTS YOU MAY CITE. Every factual sentence must carry the id(s) it rests on.
  f_03  price of Lavender candle = 999 INR            (catalogue)
  f_07  shipping is free on every order               (checkout settings)
  f_12  Lavender candle is made of soy wax            (your own words)
  f_18  Lavender candle burn time = 40 hours          (your own words)
  f_21  store link = /site/candle-by-qaaf             (your website)
There are no records for: ingredients beyond wax, scent longevity, health effects.
```

Three deliberate choices:

- **Ids are opaque.** A model cannot infer `f_99` exists.
- **The absences are listed** — the `unreadable` idea already in
  `BusinessFacts.unreadable` (`businessFacts.ts:148`), extended. Naming
  the gap is what stops a model filling it; the same reasoning as
  `withheldNote` (`personalStories.ts`).
- **Capped and selected.** A business with 200 products cannot list
  them all. Relevance-selected, with the cap stated in the prompt so
  the model knows the list is partial and must not infer absence.

### 3.2 Failure of the shape itself

A reply that is not valid `CopyDraft` is an **error, not a draft** —
the F-22 rule already in the codebase (`parseModelJson`,
`src/lib/ai/modelJson.ts:166`, which reports the real cause rather than
a shrug). One repair retry is allowed (§4.6), then it fails honestly.

---

## 4. Validation — all deterministic, all in code

In order. Each step can only remove, never rewrite (founder's rule).

**4.1 Schema.** Valid `CopyDraft`, every sentence non-empty,
`kind` in range.

**4.2 Citation presence.** `kind: "factual"` → at least one factId.
Missing → the sentence is unsupported.

**4.3 Citation resolution, and TENANT SCOPE.** Every factId must
resolve to a record **belonging to this dealership**. A factId that
resolves to another tenant's record is not a bad citation, it is a
**cross-tenant leak**, and it fails the whole draft rather than one
sentence. Ids are minted per tenant and never reused.

**4.4 Licence match.** The sentence's assertion type must be in the
cited record's `licenses`. Derived from the sentence deterministically:
a number → `value`; a policy word (free, returns, delivery) → `policy`;
a process verb → `process`; a comparison → **no licence exists, always
refused**; a benefit or safety assertion → `benefit`/`safety`, which
nothing licenses (§2.1).

**4.5 Value verification — the step that makes citation mean
something.** Citation alone is necessary and **not sufficient**: a model
can cite `f_18` (40 hours) beside the words "50 hour burn".

So every number, price, duration, percentage and date in the sentence is
extracted and must match a cited record's `value`, unit-aware:

- reuse `moneyAmounts()` (`claimCheck.ts:567`) for prices;
- durations compared in a normal form (hours/minutes/days);
- a number present in the sentence and in **no** cited record →
  unsupported.

This is also where **"₹999" vs "₹550" can never again disagree with the
catalogue**, because the comparison is arithmetic, not lexical.

**4.6 One repair retry, citations only.** If sentences are unsupported
*only* for missing or mismatched citations, ask once — "add the ids, or
drop the sentence; change no wording". A retry that rewrites text is
rejected by comparing the sentence set. This separates *model
non-compliance* from *untrue copy*, which §8.2 measures apart.

**4.7 Removal.** An unsupported sentence is removed **whole**, and the
existing one-sentence note tells the owner what went and what record
would bring it back. Never reworded.

**4.8 The old layer, second.** The existing claim layer then runs over
the surviving text, unchanged. Two nets; the new one first.

**4.9 Re-verify after every transformation.** Tightening, subject
fixes, hashtag appends and the shape retries all run **before** 4.1-4.8,
or the pass is redone. Today `generateCopy` re-measures shape after a
retry but the claims pass runs once, last — that gap must not survive.

### 4.10 The obvious bypass, and how it is closed

A model that marks everything `"kind": "feeling"` would need no
citations. So **feeling sentences are scanned too**: if one contains a
number, a price, a superlative, a comparison, or a benefit/safety
assertion, it is reclassified `factual` with no citation — and removed.

**That scan is a denylist.** It is the one place the old approach
survives, and deliberately: it guards the classification, not the
content, and its false-positive cost is a sentence the model should have
labelled factual anyway. Narrow and bounded, unlike policing all prose.

---

## 5. Multi-language — Hinglish and Hindi

### 5.1 Records are language-neutral, which is the whole fix

A `FactRecord` is `key` + `value`, not a phrase. `material.paraffin =
false` is cited identically by:

- "Paraffin-free, soy wax only."
- "Paraffin nahi, sirf soy wax."
- "पैराफिन नहीं।"

**No synonym table is needed for licensing.** This retires the gap found
on 2026-10-11: `CLAIM_SYNONYMS` (`claimCheck.ts:222-243`) has 16 pairs,
**all English**, so a Hinglish record licensed nothing and true copy was
being stripped. Under fact-binding that failure mode disappears, because
nothing is matched phrase-to-phrase.

### 5.2 What still needs language work: extraction, not licensing

Value verification (4.5) reads numbers out of the sentence, and that is
language-dependent:

- **Devanagari digits.** `०१२३४५६७८९` — **verified absent from the
  codebase**: no range `[०-९]` anywhere in `src/lib`. Must be
  normalised before extraction.
- **Hinglish number words** — "chalees" (40), "pachas" (50), "ek", "do",
  "teen".
- **Hinglish units** — "ghante" (hours), "din" (days), "mahine"
  (months), "rupaye"/"rupees"/"₹".
- **`\b` DOES NOT WORK ON DEVANAGARI.** JS word boundaries are defined
  over `[A-Za-z0-9_]`. This is written down because it has cost this
  codebase four separate incidents, three of them in one day, and the
  rule in `CLAUDE.md` exists because of it. Use explicit
  whitespace/punctuation classes.

### 5.3 Derived facts, computed in code only

"Ten evenings from one candle" is true arithmetic on a 40-hour burn, and
no single record says it. A `derived` record is computed **in code**
(`40h ÷ 4h per evening`), carries `source: "derived"` with its inputs in
`sourceRef`, and may be cited like any other.

**The model never derives.** If it wants a number no record holds, the
sentence is unsupported. This is the line between arithmetic and
invention.

---

## 6. Capability claims — from a registry, never the model

Founder's point 3. "Goes out automatically" and "I've scheduled that"
are the same failure: prose about what something *will do by itself*.

```ts
type Capability = {
  id: string;                  // "cap.autopost"
  what: string;                // owner-facing, written by us
  state: "available" | "connected" | "enabled" | "needs_approval" | "unavailable";
  requiresApproval: boolean;
};
```

- The registry is **code**, assembled from what already exists:
  `executionPolicy.ACTION_POLICIES`, `AUTOMATION_TOGGLES:170`, the
  connection checks, and `dataState.Loaded<T>` (`dataState.ts:34`) for
  "not connected" vs "no data" vs "error".
- A sentence about what Hawlai or the product will do must cite a
  `capId`, and **its wording is rendered from the registry**, not
  generated. The model chooses *whether* to mention a capability; it
  does not get to describe one.
- Nothing may be described as done unless the action's row says it
  completed. This is the F-X1 shape, and `tests/inlineApprovalWording.test.ts`
  already proves the lesson: that bug was "fixed" twice by changing one
  string while a sibling survived, because the wording came from a tool
  description and a system prompt rule, not from the one line someone
  edited.

---

## 7. What honest copy this will wrongly remove

The founder asked for this explicitly. Five categories, in the order I
expect them by volume.

**7.1 True facts that are not yet records.** The largest by far. "The
wick is cotton" is true, the extractor has no `material.wick` record,
the sentence goes. Mitigations: ingest `business_knowledge` first
(§2.2); the note names what to add; the one-question rule asks for a key
missing fact once, and records "I don't know" as an answer so it is
never re-asked.

**7.2 Correct inference across two records.** §5.3's `derived` covers
arithmetic. It does **not** cover reasonable-but-unstated inference —
"soy wax, so it burns cooler" is physics, not a record. **These will be
removed and they are often true.** Accepted cost; measured in 8.1.

**7.3 A record that is itself wrong.** Citation makes a wrong price look
verified. Not a removal failure but the inverse, and the mitigation is
that `owner_stated` stays `observed`, is never rendered as "verified",
and the extraction of a Hinglish reading is confirmed with the owner
once before it licenses anything.

**7.4 Hinglish numerals and units missed by extraction.** A true "चालीस
घंटे" rejected because the normaliser missed it. Fixable, and 5.2 is
where the work sits.

**7.5 Model under-citation.** The sentence is true and correctly
written; the model forgot the id. §4.6's repair retry exists for this,
and 8.2 measures it separately — it is a compliance failure, not a truth
failure, and conflating them would make the verifier look worse than it
is.

---

## 8. How it is measured

### 8.1 A labelled set, and a baseline FIRST

3 tenants × ~10 cases (founder's point 4). Each case's output is graded
**per sentence** — true / false / not-checkable — once, by the founder,
and that labelling is the asset.

**The current system is baselined on the same set before the verifier
is built.** Without that, "the verifier removes 9% of honest copy" means
nothing. With it, the only question that matters is answerable: *is it
better than what we have?*

| Metric | Definition | Target |
|---|---|---|
| unsupported-claim rate | false sentences surviving into publish-mode output | **0** |
| exact-value errors | price/duration/percentage disagreeing with a record | **0** |
| capability errors | wrong claim about what Hawlai or the product does | **0** |
| **wrongly-removed rate** | true sentences removed / true sentences | **≤ the current system's** |
| unknown handling | "no record" said rather than guessed | 100% |
| citation compliance | factual sentences with a valid id, first try | reported, not targeted |
| tenant leakage | a factId resolving across tenants | **0, and it fails the draft** |
| latency, INR per piece | measured against today | reported before/after |

### 8.2 Compliance is measured apart from truth

Citation compliance is a *model* metric; unsupported-claim rate is a
*product* metric. A verifier that removes correct sentences because the
model under-cited is fixable by prompt or retry. One that passes false
sentences is not. Reporting them together would hide which.

### 8.3 Cost and latency, honestly

Structured output costs more tokens than prose — sentence objects plus
ids, plus a facts list with ids in the prompt. **Rough estimate,
unverified: 1.3–1.6× output tokens**, plus the repair retry on some
share of calls. The real number comes from the first eval run, and
**the INR estimate is printed before any paid run, with the founder's
written go required** (point 4).

### 8.4 The honest limit

Passing 30 cases does not mean zero production failures. It means the
rate is **measured instead of assumed**, which is the thing that has
been missing all along: today there is no real-model evaluation in the
repo at all — 77 of 254 test files stub `fetch`, and the model's actual
output is never graded.

---

## 9. How it ships without breaking what works

- **Behind a per-surface flag**, inside `generateCopy` — the one door
  already exists and 15 generators pass through it, so there is one
  place to switch.
- **Email first**, as in Phase 3.5, for the same reason: it already has
  claims and provenance, and the send is approval-gated.
- **The old path stays** until the eval says otherwise. Both nets run;
  the new one first.
- **Rollback is the flag.** No migration, no schema change, no data
  move.

### 9.1 Order

1. FactRecord type + extractor, `business_knowledge` FACT rows first
   (§2.2) — no generation change yet, so it can be verified in
   isolation.
2. The labelled eval set + **baseline the current system** (§8.1).
3. The capability registry (§6) — self-contained, and it fixes "goes
   out automatically" without touching generation.
4. The structured contract + verifier behind the flag, email only.
5. Eval; compare to baseline; decide.
6. Widen surface by surface. Delete narrow rules only where the
   verifier beats them.

### 9.2 Files likely touched

| Phase | Files |
|---|---|
| 1 | new `src/lib/facts/*`; `src/lib/claims/businessFacts.ts` (read, not replaced) |
| 2 | new `tests/eval/*`; a script that prints the INR estimate and refuses to run without the flag |
| 3 | new `src/lib/capabilities/*`; `executionPolicy.ts` (read) |
| 4 | `src/lib/content/generateCopy.ts`; `src/lib/agents/emailMarketingAgent.ts` |
| 5–6 | the other 14 generators, one at a time |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Copy becomes stilted — all facts, no feeling | the `feeling` kind exists precisely for this, and the customer-first shape rules already police structure |
| The facts list bloats the prompt | capped and relevance-selected, with the cap stated so absence is never inferred |
| The model cites plausibly but wrongly | 4.5 value verification is arithmetic, not trust |
| A `feeling` label used as a bypass | 4.10, and it is the one denylist that stays |
| Over-removal makes the product feel broken | 8.1's baseline is the gate; if it is worse than today it does not ship |
| This becomes a rewrite | it is additive: one new type, one new verifier, one flag. The claim layer, the door, provenance, approvals and the shape rules all stay |

---

## 11. Decisions I need

1. **Go on this design**, or changes first.
2. **The eval budget** — an INR ceiling per run. Nothing paid runs
   without it, and §8.1's baseline run is the first cost.
3. **Which 3 tenants** for the eval set, and who grades the sentences.
   The grading is the asset and it cannot be automated.
4. **7.2 is the real trade: inference.** "Soy wax, so it burns cooler"
   is true and will be removed. Accept, or allow a narrow
   `physics/common-knowledge` licence? I recommend **accept and
   measure** first — adding that licence is the kind of exception that
   grows.
5. **Confirm (a), (b), (c) ship first**, independently of this, since
   none of them is a narrow rule.
