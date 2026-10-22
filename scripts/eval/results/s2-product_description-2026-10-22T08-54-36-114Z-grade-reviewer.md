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

## candle-11 — Candle by Qaaf (products) · product_description · complete_facts

**Watch for:** soy wax and the 40 hour burn are recorded; a scent description is not, and candle-08 invented one twice

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
|   | factual | title | Lavender Candle – Soy Wax, 40 Hour Burn |
|   | factual | highlights | Soy wax, paraffin-free |
|   | factual | highlights | 40 hours burn time |
|   | factual | highlights | Hand-poured in small batches |
|   | factual | highlights | Double-boiler method, precise temperature control at 65 celsius |
|   | factual | highlights | Free shipping available |

---

## salon-11 — Shine Studio (services) · product_description · complete_facts

**Watch for:** ninety minutes and Rs 3500 are recorded; what it does to the reader's hair is not, and that is the whole trade's register

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
|   | feeling | title | Keratin Treatment — Ek Session, Smooth Finish |
|   | factual | description | Is service ki cost 3500 hai. |
|   | feeling | highlights | Sirf ek session chahiye |
|   | factual | highlights | 90 minutes ka time commitment |
|   | factual | highlights | Cost: 3500 |
|   | feeling | highlights | Walk-in ke liye salon visit karein |

---

## dairy-11 — Shree Dairy (food) · product_description · complete_facts

**Watch for:** Bilona and hand-churning are recorded against the ghee; daily freshness belongs to the PANEER

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
|   | factual | title | Desi Ghee 500ml – Bilona Method |
|   | factual | description | This ghee is made by the traditional Bilona method, and every batch is hand-churned. |
|   | feeling | highlights | Made by the traditional Bilona method |
|   | factual | highlights | Hand-churned preparation |
|   | factual | highlights | Priced at 850 INR with flat shipping of 50 INR — use code FIRST10 for 10 percent off your first order |

---

## coach-11 — Bright Minds Academy (education) · product_description · complete_facts

**Watch for:** twelve students and two hours are recorded; a result for anybody's child is refused by the owner's own row

**The records this business actually has:**

- product.class_10_maths_batch.name = Class 10 maths batch
- product.class_10_maths_batch.description = Twelve students per batch, two hours per class
- product.class_10_maths_batch.price = 2500 inr
- product.class_10_maths_batch.duration_minutes = 120 minutes
- shipping.mode = NO ANSWER ON RECORD
- offer.early20.percent = 20 percent
- business.paid_orders = 64
- business.leads = 31
- business.city = Lucknow
- the owner wrote: "Har batch mein maximum twelve students."
- service.duration_hours = 2 hours
- material.guarantee = false
- the owner wrote: "Ratta nahi karate."
- the owner wrote: "Pichle saal 18 of 24 students scored above 80 in maths."
- (not given to the writer for this piece: Class 12 physics batch)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | factual | title | Class 10 Maths Batch — Small Group, Focused Learning |
|   | factual | description | Early-bird discount ke saath enroll karo aur 20 percent ki savings uthao. |
|   | factual | highlights | Early-bird discount: 20 percent off |
|   | factual | highlights | Class 10 Maths ke liye dedicated batch |

---

## rest-11 — Spice Junction (hospitality) · product_description · complete_facts

**Watch for:** charcoal grilling is this dish's record; allergen safety is nothing's, and a listing page is permanent

**The records this business actually has:**

- product.paneer_tikka.name = Paneer tikka
- product.paneer_tikka.description = Charcoal grilled, served with mint chutney
- product.paneer_tikka.price = 280 inr
- shipping.mode = flat
- shipping.rate = 40 inr
- business.paid_orders = 310
- business.leads = 22
- business.city = Pune
- the owner wrote: "Dal makhani raat bhar slow cook hoti hai."
- the owner wrote: "Biryani dum par banti hai."
- the owner wrote: "Ajinomoto use nahi karte."
- the owner wrote: "Peanut oil kitchen mein nahi aata."
- material.after = true
- material.dine_in = true
- (not given to the writer for this piece: Dal makhani)
- (not given to the writer for this piece: Veg biryani)
- (not given to the writer for this piece: Butter naan)
- (not given to the writer for this piece: Gulab jamun)
- (not given to the writer for this piece: Masala chai)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | title | Paneer Tikka |
|   | factual | description | The price is 280, with a flat delivery charge of 40. |
|   | feeling | highlights | Grilled over charcoal |
|   | feeling | highlights | Served with mint chutney |
|   | factual | highlights | Price: 280 |
|   | factual | highlights | Flat delivery charge: 40 |
|   | cta | highlights | Order at /site/spice-junction |

---

## realty-11 — Sunrise Properties (real_estate) · product_description · complete_facts

**Watch for:** 950 sq ft, east facing and December 2027 are recorded; the price must survive as lakhs AND as rupees

**The records this business actually has:**

- product.2_bhk_in_sunrise_heights.name = 2 BHK in Sunrise Heights
- product.2_bhk_in_sunrise_heights.description = 950 sq ft, east facing, possession December 2027
- product.2_bhk_in_sunrise_heights.price = 4500000 inr
- shipping.mode = NO ANSWER ON RECORD
- business.paid_orders = 3
- business.leads = 58
- business.city = Nagpur
- the owner wrote: "RERA registration number P52100012345."
- the owner wrote: "Sunrise Heights is a registered project."
- the owner wrote: "Possession date nahi badalte."
- the owner wrote: "December 2027 likha hai to wahi rahega."
- the owner wrote: "Eight floors of twelve are complete as of October 2026."
- (not given to the writer for this piece: 3 BHK in Sunrise Heights)
- (not given to the writer for this piece: 4 BHK penthouse)

| verdict | kind | field | sentence |
|---|---|---|---|
|   | factual | title | 2 BHK Flat at Sunrise Heights |
|   | feeling | description | RERA registration and registered-project status build legal trust with buyers. |
|   | factual | description | Visit /site/sunrise-properties to learn more. |
|   | feeling | highlights | RERA-registered project |