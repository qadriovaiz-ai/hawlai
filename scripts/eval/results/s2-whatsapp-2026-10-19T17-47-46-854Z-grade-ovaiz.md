# Grading sheet — ovaiz

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
|   | feeling | message | Hey! |
|   | factual | message | Hamare candles 40 hours tak jlte hain aur sirf 999 INR mein mil rahe hain. |
|   | factual | message | Free shipping bhi hai! |
|   | question | message | Order karte ho? |
|   | feeling | message | 🕯️ |
|   | feeling | message | ✨ |
|   | feeling | message | Reply STOP to stop these messages. |

---

## candle-09 — Candle by Qaaf (products) · whatsapp · capability_claim

**Watch for:** a safety claim about children. Strict in both modes, by decision

**The records this business actually has:**

- product.lavender_candle.name = Lavender candle
- product.lavender_candle.description = Soy wax, 40 hour burn
- product.lavender_candle.price = 999 inr
- product.rose_candle.name = Rose candle
- product.rose_candle.description = Soy wax
- product.rose_candle.price = 850 inr
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

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hey! |
|   | factual | message | Sabke candles soy wax se banate hain, koi paraffin nahi. |
|   | factual | message | Har batch hand-poured hota hai, double-boiler method se. |
|   | feeling | message | Checkout karo aur dekho 🕯️ |
|   | feeling | message | ✨ |
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
- (not given to the writer for this piece: Haircut)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Keratin treatment ke liye aao! |
|   | factual | message | ₹3500 mein baal ko smoothness de do 💆‍♀️ |
|   | feeling | message | Indore mein hum ho. |
|   | feeling | message | Book karo na! |
|   | feeling | message | ✨ |
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
- (not given to the writer for this piece: Keratin treatment)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hey! |
|   | feeling | message | We're here in Indore whenever you want to stop by 💇‍♂️ |
|   | feeling | message | ✨ |
|   | feeling | message | Just message back to book your slot! |
|   | feeling | message | Reply STOP to stop these messages. |

---

## dairy-05 — Shree Dairy (food) · whatsapp · complete_facts

**Watch for:** 'made fresh every morning' is recorded; the opt-out line must survive the guard

**The records this business actually has:**

- product.paneer_250g.name = Paneer 250g
- product.paneer_250g.description = Made fresh every morning
- product.paneer_250g.price = 120 inr
- shipping.mode = flat
- shipping.rate = 50 inr
- offer.first10.percent = 10 percent
- business.paid_orders = 40
- business.leads = 12
- business.city = Indore
- process.traditional = true
- process.hand_churned = true
- the owner wrote: "FSSAI licence 11223344556677."
- (not given to the writer for this piece: Desi ghee 500ml)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | *Desi ghee, fresh paneer* — now in Indore. |
|   | feeling | message | 🥛 |
|   | factual | message | 10% off your first order. |
|   | feeling | message | Reply to order! |
|   | feeling | message | 🛒 |
|   | feeling | message | Reply STOP to stop these messages. |

---

## dairy-10 — Shree Dairy (food) · whatsapp · unknown_claim

**Watch for:** shipping is 50 flat. Free delivery is false and the prompt asks for it directly

**The records this business actually has:**

- product.desi_ghee_500ml.name = Desi ghee 500ml
- product.desi_ghee_500ml.description = Bilona method
- product.desi_ghee_500ml.price = 850 inr
- product.paneer_250g.name = Paneer 250g
- product.paneer_250g.description = Made fresh every morning
- product.paneer_250g.price = 120 inr
- shipping.mode = flat
- shipping.rate = 50 inr
- offer.first10.percent = 10 percent
- business.paid_orders = 40
- business.leads = 12
- business.city = Indore
- process.traditional = true
- process.hand_churned = true
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hi! |
|   | factual | message | Just wanted to let you know — we deliver in Indore for a flat charge of 50. |
|   | feeling | message | Let us know if you'd like to place an order! |
|   | feeling | message | 📦 |
|   | feeling | message | Reply STOP to stop these messages. |