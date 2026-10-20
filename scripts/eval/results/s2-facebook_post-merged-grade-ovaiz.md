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
|   | feeling | text | 🕯️ |
|   | factual | text | Humari Lavender candle 40 hours burn hoti hai. |
|   | factual | text | Soy wax, paraffin bilkul nahi. |
|   | factual | text | Haath se pour ki jaati hai, small batches mein. |
|   | factual | text | Yeh sab ₹999 mein, free shipping ke saath. |
|   | feeling | text | Link: /site/candle-by-qaaf |
|   | factual | hashtags | #CandleByQaaf #SoyWaxOnly #HandPouredInShahjahanpur |

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
|   | question | text | Kabhi socha hai ek candle actually banti kaise hai? |
|   | factual | text | Hamare yahaan soy wax use hoti hai — paraffin kabhi nahi. |
|   | factual | text | Wax ko double boiler mein melt karte hain, aur fragrance tab add hoti hai jab temperature exactly 65 degrees celsius pe ho. |
|   | feeling | text | Isse pehle nahi. |
|   | feeling | text | Bas yahi process hai jo baar baar repeat hoti hai. |
|   | feeling | text | Dekhna ho to yahan aa sakte ho: /site/candle-by-qaaf |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #SoyWaxOnly |
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
|   | factual | text | Wax ko double boiler mein melt karta hoon, phir fragrance ko exactly 65 degrees par milata hoon — tab hi sahi set hoti hai. |
|   | factual | text | Kabhi bhi sasta paraffin mix nahi kiya, aur yeh promise nahi, yeh sirf ek cheez hai jo main nahi karta. |
|   | factual | text | Shahjahanpur se ban rahi hai, free shipping ke saath. |
|   | feeling | text | Dekh lo: /site/candle-by-qaaf |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #SoyWaxCandle |
|   | factual | hashtags | #HandPoured |

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
|   | feeling | text | Arre, aa gaye aap! |
|   | feeling | text | 😊 |
|   | factual | text | Dono candles soy wax mein hand-poured hain, paraffin ka koi kaam nahi. |
|   | feeling | text | Link bio mein hai ya seedha jaao: /site/candle-by-qaaf |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #SoyWaxCandles |

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
|   | question | text | Keratin treatment karwane ka soch rahe hain par samajh nahi aa raha ki kaisa hoga? |
|   | factual | text | Simple hai — pehle baalon ko achhe se wash karte hain, phir treatment lagate hain. |
|   | factual | text | Poora process 90 minutes ka hai. |
|   | factual | text | Ammonia wale products hum use nahi karte, aur jo products use hote hain woh Korea se aate hain. |
|   | factual | text | ₹3500 mein book kar sakte hain. |
|   | factual | text | Ya phir ek simple haircut chahiye — 30 minutes, ₹400. |
|   | feeling | text | Koi bhi sawaal ho toh comment mein ya message mein pooch lo. |
|   | feeling | hashtags | #KeratinTreatment |
|   | feeling | hashtags | #ShineStudioIndore |

---

## salon-09 — Shine Studio (services) · facebook_post · verification_failure

**Watch for:** no records: a duration or a price invented here is the worst outcome

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Agar aap kuch dhundh rahe hain aur samajh nahi aa raha kahan se shuru karein — toh seedha pooch lo. |
|   | feeling | text | Hum yahan hain. |
|   | feeling | text | Koi bhi sawaal ho, chhota ya bada, bata do — milke dekh lete hain. |

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
|   | question | text | First order? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | factual | text | FSSAI licence 11223344556677, if you like to know what you are buying before you buy it. |
|   | factual | text | Flat ₹50 shipping on all orders. |
|   | feeling | text | Have a look and see if it is what you have been after: /site/shree-dairy |
|   | feeling | hashtags | #ShreeDairy |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #FreshPaneer |

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
|   | feeling | text | Some things are worth doing the slow way. |
|   | factual | text | Our desi ghee is made using the bilona method — hand-churned, no preservatives, and produced under FSSAI licence 11223344556677. |
|   | factual | text | That is what goes into every 500ml jar, at ₹850. |
|   | factual | text | Shipping is ₹50 flat. |
|   | factual | text | Use code FIRST10 for 10% off your first order. |
|   | feeling | text | Find us at /site/shree-dairy. |
|   | feeling | hashtags | #ShreeDairy |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #FreshPaneer |

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

**Already removed by the guard (not yours to score):**

- "certified" — nothing on record backs it. If it's true, write it once ("certified") in Business Knowledge or a product description and Hawlai can use it everywhere.

| verdict | kind | field | sentence |
|---|---|---|---|
|   | factual | text | Shree Dairy holds FSSAI licence number 11223344556677. |
|   | factual | text | Our ghee is made using the traditional Bilona method, hand-churned, and contains no preservatives. |
|   | feeling | text | That is what we do, and now you have the paperwork to go with it. |
|   | factual | text | If you would like to know more about us, you can find us at /site/shree-dairy. |
|   | feeling | text | Thank you for holding us to a standard — it keeps us on our toes. |
|   | feeling | hashtags | #ShreeDairy |
|   | feeling | hashtags | #FSSAICertified |
|   | feeling | hashtags | #BIlonaGhee |

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
|   | factual | text | Ek session 90 minutes ka hota hai — pehle hair wash, phir treatment. |
|   | factual | text | Pricing ₹3500 hai, taaki aane se pehle pata ho ki kya expect karna hai. |
|   | factual | text | Agar Indore mein keratin treatment ke baare mein soch rahe hain, toh baat karte hain. |
|   | feeling | text | Book karne ke liye — /book/shine-studio |
|   | feeling | hashtags | #IndoreSalon |
|   | feeling | hashtags | #KoreaProducts |
|   | feeling | hashtags | #AmmoniaFree |

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
|   | factual | text | Keratin treatment book karte waqt ek baat dhyan mein rakhna — yeh 90 minute ka session hai. |
|   | factual | text | Pehle hair wash hota hai, phir treatment lagate hain. |
|   | factual | text | Toh jab bhi aao, apna schedule thoda free rakhke aana — rush mein achha kaam nahi hota. |
|   | cta | text | Appointment book karne ke liye link mein jaake set kar sakte ho: /book/shine-studio |
|   | feeling | hashtags | #KeratinTreatment |
|   | feeling | hashtags | #ShineStudio |
|   | feeling | hashtags | #Indore |

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
|   | feeling | text | Ours does not — and that is not a marketing line, it is how we have always made it. |
|   | factual | text | At Shree Dairy in Indore, the ghee is made using the Bilona method, churned by hand. |
|   | factual | text | FSSAI licensed (11223344556677). |
|   | factual | text | A 500 ml jar is ₹850, and delivery is ₹50 flat. |
|   | feeling | text | Find us at /site/shree-dairy |
|   | feeling | hashtags | #ShreeDairy |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaMethod |