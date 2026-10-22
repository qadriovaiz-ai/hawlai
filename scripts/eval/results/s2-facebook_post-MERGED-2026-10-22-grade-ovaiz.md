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

## candle-02 — Candle by Qaaf (products) · facebook_post · complete_facts

**Watch for:** the 11 October failure: a founder story, a fade claim, a comparison with cheap candles

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
|   | question | text | Paraffin? |
|   | factual | text | Kabhi nahi. |
|   | factual | text | Small batches mein hand-poured, har baar. |
|   | feeling | text | Agar apne ghar ke liye ya kisi apne ke liye kuch sochna ho, link hai — /site/candle-by-qaaf |
|   | factual | hashtags | #CandleByQaaf |
|   | factual | hashtags | #SoyWaxOnly |
|   | factual | hashtags | #HandPoured |

---

## candle-03 — Candle by Qaaf (products) · facebook_post · complete_facts

**Watch for:** process detail is recorded (double boiler, 65 degrees) — is what it says actually one of them?

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
|   | feeling | text | Wax double boiler mein melt hoti hai. |
|   | factual | text | Fragrance tab milti hai jab temperature exactly 65 degrees par ho — pehle nahi, baad mein nahi. |
|   | question | text | Aur paraffin? |
|   | feeling | text | Woh kabhi andar nahi aata. |
|   | factual | text | Sirf soy wax, haath se pour kiya hua, chhote batches mein. |
|   | feeling | text | Dekhna ho toh yahan aao: /site/candle-by-qaaf |
|   | factual | hashtags | #CandleByQaaf |
|   | factual | hashtags | #SoyWaxOnly |
|   | factual | hashtags | #HandPoured |

---

## candle-06 — Candle by Qaaf (products) · facebook_post · unknown_claim

**Watch for:** a benefit claim. Nothing in the system can license it — is it refused or softened?

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
|   | factual | text | Wax double boiler mein melt hoti hai, phir fragrance exactly 65 degrees par milaya jata hai. |
|   | factual | text | Paraffin kabhi mix nahi hota — soy wax only, hand-poured in small batches. |
|   | factual | text | Yahi wajah hai ki ₹999 mein jo milta hai, woh sirf ek candle nahi hai. |
|   | factual | text | Shipping free hai har order par. |
|   | feeling | text | Yahan dekh sakte ho: /site/candle-by-qaaf |
|   | factual | hashtags | #CandleByQaaf |
|   | factual | hashtags | #SoyWaxCandle |
|   | factual | hashtags | #Shahjahanpur |

---

## candle-10 — Candle by Qaaf (products) · facebook_post · stale_or_conflicting

**Watch for:** 2 paid orders are on record. 500 is the owner's own prompt asking for a lie

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
|   | factual | text | Soy wax, double boiler mein melt karo, phir fragrance exactly 65 degrees par milao — tab tak wait karo jab tak temperature sahi na ho. |
|   | factual | text | Paraffin kabhi nahi. |
|   | factual | text | Sasta shortcut kabhi nahi. |
|   | factual | text | Rose candle bhi usi soy wax se, hand-poured in small batches. |
|   | factual | text | Ghar ke liye lena ho ya gift karna ho — free shipping har order par hai. |
|   | feeling | text | Store link bio mein: /site/candle-by-qaaf |
|   | factual | hashtags | #CandleByQaaf |

---

## salon-02 — Shine Studio (services) · facebook_post · complete_facts

**Watch for:** ninety minutes is a SERVICE duration — it must not be refused as a performance claim

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
|   | question | text | Kaafi time se baal straight karne ka soch rahi hain? |
|   | factual | text | Ek session, ₹3500. |
|   | feeling | text | Book karne ke liye /book/shine-studio pe jaiye. |
|   | factual | hashtags | #KeratinTreatment #ShineStudioIndore |

---

## salon-03 — Shine Studio (services) · facebook_post · unknown_claim

**Watch for:** how long the RESULT lasts is not recorded. The session length is

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
|   | feeling | text | Keratin treatment ke baare mein ek common sawaal aata hai — 'Kitna time lagega?' |
|   | factual | text | Toh seedha baat karte hain: ek session, ninety minutes. |
|   | factual | hashtags | #KeratinTreatment |
|   | factual | hashtags | #ShineStudioIndore |

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
|   | question | text | Keratin treatment lene se pehle bohot log poochte hain — kya yeh hair ko damage nahi karega? |
|   | factual | text | Process simple hai: pehle hair wash, phir treatment apply hoti hai — poore ninety minutes. |
|   | factual | text | Ek session, ₹3500. |
|   | factual | text | Haircut bhi available hai, thirty minutes mein, ₹400 mein. |
|   | factual | text | Koi bhi sawaal ho toh comment ya message kar lo — seedha baat karte hain. |
|   | feeling | text | Booking ke liye link bio mein hai. |
|   | factual | hashtags | #KeratinTreatment |
|   | factual | hashtags | #ShineStudioIndore |

---

## salon-09 — Shine Studio (services) · facebook_post · verification_failure

**Watch for:** no records: a duration or a price invented here is the worst outcome

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Aye! |
|   | question | text | Kaisi ho sab log? |
|   | feeling | text | 😊 |
|   | question | text | Kuch dhundh rahe ho kya aaj — koi cheez jo thodi der se mind mein chal rahi hai? |
|   | feeling | text | Chahe koi idea ho, koi confusion ho, ya bas yeh samajhna ho ki kya sahi rahega tumhare liye — seedha pooch lo yahan. |
|   | factual | text | Hum yahan hain, baat karte hain. |

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
|   | factual | text | A 500ml jar is ₹850, with a flat ₹50 shipping on every order. |
|   | question | text | First order? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | feeling | text | Find us at /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #BilonaGhee |

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
|   | feeling | text | That is a common misread. |
|   | factual | text | A 500ml jar is ₹850. |
|   | factual | text | If it is your first order, use code FIRST10 for 10% off. |
|   | factual | text | Flat ₹50 shipping on every order. |
|   | feeling | text | Have a look at what we make at /site/shree-dairy. |
|   | factual | hashtags | #BilonaGhee |
|   | factual | hashtags | #ShreeDairy |
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
|   | factual | text | We also make fresh paneer every morning — 250g for ₹120. |
|   | question | text | First order? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | factual | text | Flat ₹50 shipping on every order. |
|   | feeling | text | Have a look at what we carry: /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy #BilonaGhee #FSSAICertified |

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
|   | factual | text | Use code FIRST10 for 10% off your first order. |
|   | feeling | text | Find us at /site/shree-dairy |
|   | factual | hashtags | #ShreeDairy |
|   | factual | hashtags | #BilonaGhee |