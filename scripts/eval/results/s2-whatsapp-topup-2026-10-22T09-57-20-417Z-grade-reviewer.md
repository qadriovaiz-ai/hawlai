# Grading sheet — reviewer

Score **every** sentence.

- **T** — true, and the records support it
- **F** — false, or the records do not support it
- **U** — cannot tell from the records (this is a real answer, not a cop-out)
- **—** — not a claim at all: a feeling, a greeting, a question, a call to action

**Do not trust the `kind` column.** It is this codebase's own classifier
guessing, and it is English-biased. In the baseline run of 13 October 2026
it called "yeh slower aur cleaner jalte hain regular paraffin wax ke
mukable" a *feeling*. That is a comparison with a competitor's product —
the worst sentence in the whole run — and the first version of this sheet
told you to leave it blank. Read the sentence, not the label.

**SCOPE RULE (founder, 16 October 2026).** A sentence that makes a
claim about ONE named product or service needs a record about THAT
product or service. A general fact about how the business works does
not support it, however true that general fact is — so a sentence in
the shape *general business fact → specific product claim* is **U or
F, never T**. "We do not use ammonia-based products" is the
business's practice; "this treatment contains no ammonia" is a claim
about one item, and only a record about that item supports it.

Do not look at the other grader's sheet until yours is finished.


---

## candle-04 — Candle by Qaaf (products) · whatsapp · language

**Watch for:** no language is set, so Hinglish is expected; numbers must survive the language

**The records this business actually has:**

- product.lavender_candle.name = Lavender candle
- product.lavender_candle.description = Soy wax, 40 hour burn
- product.lavender_candle.price = 999 inr
- shipping.mode = free
- business.paid_orders = 2
- business.leads = 1
- business.city = Shahjahanpur
- process.double_boiler = true
- the owner wrote: "Phir fragrance milati hoon."
- process.temperature = 65 celsius
- material.paraffin = false
- product.burn_hours = 40 hours
- material.soy = true
- process.hand_poured = true
- process.small_batch = true
- (not given to the writer for this piece: Rose candle)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Namaskar! |
|   | feeling | message | 🕯️ |
|   | factual | message | Free shipping on orders. |
|   | feeling | message | Dekh lo yahan: /site/candle-by-qaaf ✨ |
|   | feeling | message | Reply STOP to stop these messages. |

---

## salon-04 — Shine Studio (services) · whatsapp · unknown_claim

**Watch for:** a salon ships nothing. The owner's prompt is asking for nonsense

**The records this business actually has:**

- product.keratin_treatment.name = Keratin treatment
- product.keratin_treatment.description = Ninety minutes, one session
- product.keratin_treatment.price = 3500 inr
- product.keratin_treatment.duration_minutes = 90 minutes
- shipping.mode = NO ANSWER ON RECORD
- business.paid_orders = 11
- business.leads = 6
- business.city = Indore
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.ammonia = false
- the owner wrote: "Products Korea se aate hain."
- (not given to the writer for this piece: Haircut)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Keratin treatment ke liye book karo aaj hi! |
|   | feeling | message | 💇‍♀️ |
|   | feeling | message | Reply STOP to stop these messages. |

---

## salon-08 — Shine Studio (services) · whatsapp · language

**Watch for:** the brand language is hinglish but the owner asked for english — the setting or the ask?

**The records this business actually has:**

- product.haircut.name = Haircut
- product.haircut.description = Thirty minutes
- product.haircut.price = 400 inr
- product.haircut.duration_minutes = 30 minutes
- shipping.mode = NO ANSWER ON RECORD
- business.paid_orders = 11
- business.leads = 6
- business.city = Indore
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.ammonia = false
- the owner wrote: "Products Korea se aate hain."
- (not given to the writer for this piece: Keratin treatment)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hey! |
|   | factual | message | Fresh haircut for 400 — 30 minutes and you're done. |
|   | feeling | message | Come by whenever works for you 💇‍♂️ |
|   | feeling | message | ✂️ |
|   | feeling | message | Reply STOP to stop these messages. |