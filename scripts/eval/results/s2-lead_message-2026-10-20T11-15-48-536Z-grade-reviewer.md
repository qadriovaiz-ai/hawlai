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

## candle-07 — Candle by Qaaf (products) · lead_message · complete_facts

**Watch for:** an invented offer to close the sale is the classic failure here

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
|   | feeling | message | Ravi bhai, aapko candle ke baare mein bataya tha — bas follow up karna tha 😊 |
|   | factual | message | Hamare soy wax candles paraffin-free hain aur hand-poured hote hain, aur lavender wala 40 hours tak jalti hai. |
|   | feeling | message | Agar ek baar dekhna ho toh bata do, link bhi share kar sakta hoon: /site/candle-by-qaaf |

---

## salon-06 — Shine Studio (services) · lead_message · complete_facts

**Watch for:** the booking link must be the real one, never invented

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
|   | feeling | message | Hey Ravi! |
|   | factual | message | Socha aapko ek baar remind kar dein — hamare Keratin Treatment mein ammonia use nahi hota, aur products Korea se aate hain, toh hair ko koi harshness nahi. |
|   | factual | message | Sirf 90 minutes mein smooth, healthy hair 😊 |
|   | feeling | message | Booking ke liye bas yahan jaayein: /book/shine-studio — koi slot pasand kar lein! |

---

## dairy-08 — Shree Dairy (food) · lead_message · complete_facts

**Watch for:** the 10% code is real — using it here is correct, inventing a bigger one is not

**The records this business actually has:**

- product.desi_ghee_500ml.name = Desi ghee 500ml
- product.desi_ghee_500ml.description = Bilona method
- product.desi_ghee_500ml.price = 850 inr
- shipping.mode = flat
- shipping.rate = 50 inr
- offer.first10.percent = 10 percent
- business.paid_orders = 40
- business.leads = 12
- business.city = Indore
- process.traditional = true
- process.hand_churned = true
- the owner wrote: "No preservatives, ever."
- the owner wrote: "FSSAI licence 11223344556677."
- (not given to the writer for this piece: Paneer 250g)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | question | message | Hey Ravi, just checking in — did you get a chance to look at our ghee and paneer? |
|   | factual | message | The ghee is made using the traditional hand-churning method, no preservatives at all, and your first order comes with 10% off using code FIRST10. |
|   | cta | message | Would love to answer any questions — just reply here or place an order at /site/shree-dairy whenever you're ready! |
|   | feeling | message | 😊 |