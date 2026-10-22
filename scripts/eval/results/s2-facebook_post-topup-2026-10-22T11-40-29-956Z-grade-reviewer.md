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
|   | feeling | text | A lot of people assume ghee adds weight, but that is a conversation worth having honestly. |
|   | factual | text | Our desi ghee is available in 500ml jars at ₹850, and if it is your first order, use code FIRST10 for 10% off. |
|   | factual | text | Shipping is ₹50 flat. |
|   | factual | text | FSSAI licence 11223344556677, if you would like to check. |
|   | cta | text | Visit us at /site/shree-dairy to place an order. |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #BilonaGhee |
|   | factual | hashtags | #DesiGhee |

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
|   | factual | text | Our ghee is made by hand, churned the traditional Bilona way, and our paneer is made fresh every morning. |
|   | feeling | text | If you want to know what goes into your kitchen, that is exactly what goes into ours. |
|   | feeling | text | Come have a look at what we make: /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #FSSAILicensed |
|   | factual | hashtags | #BilonaGhee |