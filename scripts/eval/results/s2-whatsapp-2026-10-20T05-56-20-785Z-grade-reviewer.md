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
|   | feeling | message | Hey! |
|   | factual | message | Har ek hand-poured, small batches mein. |
|   | factual | message | Ab order karo aur free shipping paao! |
|   | feeling | message | 💫 |
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
|   | feeling | message | 🕯️ |
|   | factual | message | Naye candles aa gaye — soy wax se hand-poured, har batch mein care. |
|   | factual | message | Plus free shipping on all orders! |
|   | feeling | message | Check them out → [link] |
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
|   | question | message | Keratin treatment ke liye ready ho? |
|   | factual | message | ₹3500 mein apke baal soft aur shiny ho jayenge 💇‍♀️ |
|   | cta | message | Indore mein hum hain — aaj hi book karo! |
|   | feeling | message | 📱 |
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
|   | question | message | Getting a fresh haircut? |
|   | factual | message | We've got you sorted — 400 for a clean cut, takes about 30 minutes. |
|   | factual | message | Come by whenever you're free ✂️ |
|   | cta | message | Just message to let us know you're on the way! |
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
|   | factual | message | ₹120 for 250g. |
|   | factual | message | Flat ₹50 shipping. |
|   | factual | message | Use FIRST10 for 10 percent off your first order. |
|   | feeling | message | FSSAI: [LICENSE NUMBER NEEDED]. |
|   | feeling | message | Reply to order or for details. |
|   | feeling | message | Reply STOP to stop these messages. |
|   | question | notes | Cannot finalize without: (1) FSSAI licence number to include; (2) Confirmation that bilona/hand-churned applies to Paneer 250g specifically; (3) Status of FIRST10 offer (active? |
|   | feeling | notes | order or product level?) |
|   | factual | notes | ; (4) Shipping coverage area. |

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
|   | factual | message | Fresh *desi ghee* and *paneer* now in Indore with flat ₹50 delivery anywhere in the city. |
|   | factual | message | Get 10% off your first order. |
|   | feeling | message | 🥛 |
|   | cta | message | Order now! |
|   | feeling | message | 📦 |
|   | feeling | message | Reply STOP to stop these messages. |