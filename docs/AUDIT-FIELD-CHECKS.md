# Which checks reach which field — the full audit

**22 October 2026. No money spent: this is code reading plus free
probes against the real fixtures.**

The founder's reading was that the three "unsupported claim leak"
findings are one bug, not three, and that chasing them one paid run at a
time was waste. That is correct. His other guess — that the checks are
applied field by field — is not what the code does, and the real answer
matters more, because it says where the next leak will come from.

---

## 1. Every field goes through one path

`generateCopy.ts` has a single function, `runFactChecks`, that builds
**one** list of sentences and hands the **same** list to every check:

```
const sentences = copySentences(parsed);     // every field of the output
   -> notCopySentences(...)                  // placeholders, slots, meta
   -> withheldNames(...)                     // NEW, 22 Oct
   -> introducedWords(...)                   // intensifiers, minimisers, ranks, names
   -> extractClaims(...) + extractUnlicensable(...)
   -> verifyClaims(...)                      // the judge, and the scope filter
```

`copySentences` walks **every key** of the generated object except
`_`-prefixed ones, at any nesting depth. It does not know or care
whether a field is called `text`, `title`, `hashtags`, `highlights`,
`message` or `description`. It runs twice — once at step 4 and again
after the retries, but only when the copy actually changed.

So there is **one shared path**, and that answers question 4: the bugs
are not appearing in different places because the paths differ.

The fields that actually carry generated copy, measured from every run
on disk:

| surface | fields |
|---|---|
| email | `subject` `previewText` `headline` `intro` `body` `bullets` `ctaLabel` `product` `text` |
| whatsapp | `message` (older runs also `subject` `body` `text`) |
| facebook_post | `text` `hashtags` `cta` |
| lead_message | `message` |
| product_description | `title` `description` `highlights` |

---

## 2. Field × check

Every cell is "yes" for the field dimension. The honest table is
therefore **not** field × check — it is check × *what actually gates it*,
and that is where the "no"s are.

| check | runs on every field? | what really gates it | gap |
|---|---|---|---|
| `notCopy` (placeholders, slots) | yes | nothing | — |
| `introducedWords` — intensifiers, minimisers, rank phrases | yes | nothing | — |
| `introducedWords` — **invented names** | yes | needs a **capital letter**, and abstains on a mostly-Title-Cased line of ≤6 words unless the field is `hashtags` | **a lower-case name is invisible; every `title` is invisible** |
| hashtag expansion (what feeds all the above) | `hashtags` only | a **lower-to-upper** case boundary | **an acronym tag has none → one opaque token** |
| `extractClaims` + the second net | yes | the **model's** reading of the sentence | **rule 3 exempts greetings, invitations, questions and calls to action wholesale** |
| `verifyClaims` — the judge | yes | only claims the extractor **reported** | nothing reported → nothing judged |
| `verifyClaims` — the **scope filter** (`sameProductName`) | yes | only claims the extractor reported | **same** |
| "does this name a withheld subject?" | — | — | **did not exist** |

### The root cause, in one sentence

Whether a sentence is claim-checked at all depends on **the model
typing it as a claim**, and a call to action, a question or a bare label
is exempted by grammar — product names inside it included. The scope
filter is downstream of that, so it never sees them.

That is why it looks like a new field each time. The real variable is
the **shape of the sentence**, and each new field happened to contain a
new shape: a CTA in `message`, a Title-Cased fragment in `title`, an
acronym in `hashtags`.

---

## 3. The three findings, confirmed free

Probed against the real sliced records, before any fix:

| finding | names a withheld record? | flagged by any existing check? |
|---|---|---|
| salon-08 `message` — "Book your keratin treatment or haircut in Indore today" | **YES** (Keratin treatment withheld) | **no** |
| salon-11 `title` — "Keratin Treatment — Ek Session, Smooth Finish" | no | **no** (Title-Case abstention) |
| dairy-06 `hashtags` — "#FSSAICertified" | no | **no** (expanded to the single token `FSSAICertified`) |

All three confirmed. The founder's suspicion about salon-11 was right:
it is the same check-missing pattern.

---

## 4. What was fixed, and what was measured

**a. `src/lib/content/withheldNames.ts` — new.** Asks the one question
nothing asked: of the records this business has, which were kept back
from this piece, and does the copy name one anyway? Field-blind,
kind-blind, no model, no money. A withheld name is reduced to the words
that appear **nowhere** in what the writer was given, and the sentence
must contain **all** of them — so a shared word or measurement can never
delete a true sentence. Only runs when the slice narrowed on purpose:
unreadable records mark a piece unverified, they never condemn its copy.

**b. The acronym boundary in `expandHashtags`.** `FSSAI|Certified` now
splits, so the tag reaches the checks as words. With it came **stem
tolerance** for the name check only (`licence`/`licensed`,
`candle`/`candles`), because the split would otherwise have deleted a
*true* `#FSSAILicensed`.

**c. `isLabelField`, and one enumeration for the grading sheet.**
`toGradedRows` had its own flattening — `pieces()` on every field — so
the door checked `#ShreeDairy`, `#BilonaGhee` and `#FSSAICertified` as
three sentences and the sheet showed the founder **one row**. Same B18
shape as the records box and the output gate's own arithmetic. The sheet
now enumerates with `copySentences`, and every label row — tags **and
titles** — is put to the grader as a claim instead of being labelled
"feeling".

**d. What was tried and rejected, with the number.** Widening the name
check to every label field is the obvious fix for "Smooth Finish". Swept
over the 127 sentences the current runs shipped, it removed four lines
and **one was true copy**:

```
"Keratin Treatment - Ek Session, Smooth Finish"      right
"Class 10 Maths Batch - Small Group, Focused ..."    right
"2 BHK Flat at Sunrise Heights"                      WRONG
```

"flat" is on no record, and a 2 BHK in a housing project is a flat.
Nothing in code separates it from "Smooth Finish" without a list of
quality words, which is trade vocabulary and barred by rule 3. In a
Title-Cased label capitalisation carries no information — which is what
the abstention always said. **Narrowed back, and the gap is recorded in
the door's own comment rather than pretended away.**

### Net effect, measured

127 shipped sentences from the three current runs, old verdict vs new:

| | |
|---|---|
| changed verdicts | **2** |
| newly removed | salon-08's CTA naming the withheld product; `#FSSAICertified` |
| true sentences newly lost | **0** |

---

## 5. Still open

- **`title` holding an unlicensed benefit claim** ("Smooth Finish",
  "Focused Learning"). Not fixable in code without trade vocabulary. It
  now reaches the grader as a claim; whether the second net can be made
  to type a bare Title-Cased fragment as `benefit` needs one paid run to
  see.
- **Rule 3's exemption** is still correct for real CTAs and still the
  widest hole. `withheldNames` closes the part of it that can be closed
  deterministically — a product name. A *benefit* promised inside a CTA
  still depends on the second net.
- **Lower-case invented names** remain invisible to the name check. Not
  observed as a failure; stated rather than discovered later.
- **`isContentKey`'s known residual gap**: an invented all-lowercase
  snake_case key passes. Older runs show `note_for_owner`,
  `conflict_surfaced`, `required_clarification` reaching the sheet as
  copy rows. No current surface emits them.
