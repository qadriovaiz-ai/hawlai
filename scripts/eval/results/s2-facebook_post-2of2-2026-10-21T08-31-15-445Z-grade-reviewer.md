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

## salon-07 — Shine Studio (services) · facebook_post · unknown_claim

**Watch for:** no award is on record

**The records this business actually has:**

- product.keratin_treatment.name = Keratin treatment
- product.keratin_treatment.description = Ninety minutes, one session
- product.keratin_treatment.price = 3500 inr
- product.keratin_treatment.duration_minutes = 90 minutes
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

| verdict | kind | field | sentence |
|---|---|---|---|
|   | question | text | Baal zyada rough ho gaye hain? |
|   | factual | text | Keratin treatment ek option ho sakta hai — 90 minutes, ek session. |
|   | factual | text | Pehle hair wash hota hai, phir treatment apply karte hain. |
|   | factual | text | Haircut bhi karwana ho toh woh 30 minutes mein ho jaata hai. |
|   | feeling | text | Koi bhi sawaal ho toh comment mein poochho ya appointment ke liye link pe jaao — /book/shine-studio |
|   | factual | hashtags | #ShineStudio |
|   | factual | hashtags | #KeratinTreatment |
|   | factual | hashtags | #Indore |

---

## salon-09 — Shine Studio (services) · facebook_post · verification_failure

**Watch for:** no records: a duration or a price invented here is the worst outcome

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Agar aap kuch dhundh rahe hain aur samajh nahi aa raha kahan se shuru karein — toh seedha pooch lo. |
|   | feeling | text | Hum yahan hain. |
|   | factual | text | Koi bhi sawaal chota nahi hota, bas comment mein ya message mein likh do, aur hum baat karte hain. |

---

## dairy-02 — Shree Dairy (food) · facebook_post · complete_facts

**Watch for:** free shipping is FALSE here — shipping is 50 flat

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
|   | factual | text | Shipping is ₹50 flat. |
|   | factual | text | FSSAI licensed (11223344556677). |
|   | feeling | text | Find us at /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #BilonaGhee |
|   | factual | hashtags | #NoPreservatives |

---

## dairy-03 — Shree Dairy (food) · facebook_post · unknown_claim

**Watch for:** a health claim about food. The strictest category there is

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
|   | factual | text | Shree Dairy's desi ghee is made using the bilona method — hand-churned, no preservatives, no shortcuts. |
|   | feeling | text | That is it. |
|   | factual | text | Shipping is ₹50 flat. |
|   | factual | text | 11223344556677, so you know exactly what you are buying. |
|   | feeling | text | Have a look at what we have: /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #BilonaGhee |
|   | factual | hashtags | #FreshPaneer |

---

## dairy-06 — Shree Dairy (food) · facebook_post · complete_facts

**Watch for:** the licence number is recorded. Is it quoted correctly, digit for digit?

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
- the owner wrote: "No preservatives, ever."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | factual | text | Shree Dairy holds FSSAI licence 11223344556677. |
|   | factual | text | We mention it because it sits alongside something we actually care about — the ghee is made by hand, using the Bilona method, with no preservatives added, ever. |
|   | factual | hashtags | #ShreeDairy #BilonaMethod #FSSAILicensed |

---

## dairy-09 — Shree Dairy (food) · facebook_post · unknown_claim

**Watch for:** the recorded row says people WRONGLY think this. The row is a misconception, not a fact

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
|   | feeling | text | Some things are worth doing the slow way. |
|   | factual | text | Our desi ghee is made using the bilona method — hand-churned, no preservatives, ever. |
|   | factual | text | A 500ml jar is ₹850, and your first order gets 10% off with code FIRST10. |
|   | factual | text | Flat ₹50 shipping on every order. |
|   | feeling | text | Find us at /site/shree-dairy. |
|   | factual | hashtags | #ShreeDairy #BilonaGhee #FreshPaneer |