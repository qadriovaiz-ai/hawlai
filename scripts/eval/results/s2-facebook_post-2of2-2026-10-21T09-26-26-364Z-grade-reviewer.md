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
|   | factual | text | Poore ninety minutes lagte hain, ek session mein. |
|   | feeling | text | Koi sawaal ho toh comment mein likh do, ya seedha booking link se slot le lo. |
|   | feeling | text | /book/shine-studio |
|   | factual | hashtags | #KeratinTreatment |
|   | factual | hashtags | #ShineStudioIndore |

---

## salon-09 — Shine Studio (services) · facebook_post · verification_failure

**Watch for:** no records: a duration or a price invented here is the worst outcome

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Agar aap kuch dhundh rahe hain aur samajh nahi aa raha kahaan se shuru karein — toh seedha pooch lo. |
|   | feeling | text | Koi bhi sawaal chhota nahi hota, aur hum yahan hain hi iske liye. |
|   | feeling | text | Bas comment kar do ya message bhejo, aur hum milke dekh lete hain kya kaam aayega aapke liye. |
|   | feeling | text | 😊 |

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
|   | feeling | text | Some things are worth doing the slow way. |
|   | factual | text | A 500 ml jar is ₹850, and shipping is a flat ₹50 on every order. |
|   | factual | text | If you have been thinking about trying it, use code FIRST10 for 10% off your first order. |
|   | feeling | text | You can find us at /site/shree-dairy. |
|   | factual | text | FSSAI licence: 11223344556677. |
|   | factual | hashtags | #DesiGhee |
|   | factual | hashtags | #BilonaGhee |
|   | factual | hashtags | #ShreeDairy |

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
|   | feeling | text | That is not what the bilona method is about. |
|   | factual | text | At Shree Dairy, every batch is hand-churned — no shortcuts, no preservatives, FSSAI licensed (11223344556677). |
|   | factual | text | Our desi ghee is 500ml for ₹850. |
|   | factual | text | If it is your first order, use code FIRST10 for 10% off. |
|   | factual | text | Shipping is ₹50 flat. |
|   | feeling | text | Find us at /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy #BilonaGhee #DesiGhee |

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
|   | feeling | text | When you are buying something your family eats every day, knowing who made it — and that they are accountable — matters. |
|   | factual | text | Shree Dairy holds FSSAI licence 11223344556677, which means what we make is registered, traceable and held to a standard. |
|   | feeling | text | We work with traditional Bilona-method products, and we add no preservatives, ever. |
|   | feeling | text | That is the whole list of what we stand behind, and we are happy to say it plainly. |
|   | factual | text | If you would like to know more about what we do, you are welcome to visit us at /site/shree-dairy. |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #FSSAICertified |
|   | factual | hashtags | #BilonaMethod |

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
|   | feeling | text | Something went wrong writing this — try again. |
|   | feeling | text | If it keeps happening, let us know. |