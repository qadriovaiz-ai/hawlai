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
|   | factual | text | Baal achhe dikhein, toh poora din thoda better lagta hai. |
|   | factual | text | Shine Studio mein keratin treatment ka process seedha hai — pehle hair wash, phir treatment lagate hain. |
|   | factual | text | Poore 90 minute lagte hain, koi shortcut nahi. |
|   | factual | text | Ammonia wale products hum use nahi karte, aur jo products lagate hain woh Korea se aate hain. |
|   | factual | text | Haircut ₹400 mein, 30 minute mein ho jaata hai. |
|   | factual | text | Keratin treatment ₹3500 mein, ek session. |
|   | feeling | text | Apna slot lo /book/shine-studio pe. |
|   | feeling | hashtags | #ShineStudio |
|   | feeling | hashtags | #IndoreSalon |
|   | feeling | hashtags | #KeratinTreatment |

---

## salon-09 — Shine Studio (services) · facebook_post · verification_failure

**Watch for:** no records: a duration or a price invented here is the worst outcome

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Agar har subah uthke pehla kaam yeh hota hai ki baalon ko tame karne ki koshish karo — toh samajh sakte hain woh frustration. |
|   | feeling | text | Frizz, poofiness, aur woh stubborn waves jo kisi bhi style mein settle nahi hote. |
|   | feeling | text | Keratin treatment exactly iska kaam karta hai. |
|   | question | text | Baalon ke andar se smoothness aati hai, bahar se ek soft, silky finish — aur sabse bada fark? |
|   | factual | text | Getting ready mein woh extra 30-40 minute waste nahi hote roz roz. |
|   | feeling | text | Results kuch hafte nahi, kaafi time tak rehte hain. |
|   | factual | text | Aur straight ya wavy — dono types of hair ke liye yeh equally well kaam karta hai. |
|   | factual | text | Agr hair ko thoda rest dena hai is daily struggle se, toh ek baar try karne layak hai. |
|   | factual | text | DM karo ya call karo appointment ke liye — baat karte hain. |
|   | feeling | hashtags | #KeratinTreatment |
|   | feeling | hashtags | #ShineStudio |
|   | feeling | hashtags | #SmoothHairDays |

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

**Already removed by the guard (not yours to score):**

- "different from the" — a comparison with another product that nothing on record supports

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | There is a quiet assumption that ghee adds weight and should be avoided. |
|   | feeling | text | That is worth questioning. |
|   | feeling | text | No preservatives, nothing added, just what the milk gives you. |
|   | factual | text | At Shree Dairy, this is exactly how we make our desi ghee: the bilona method, churned by hand, in small batches. |
|   | factual | text | It carries FSSAI certification (licence 11223344556677), so you know what you are getting is straightforward and accountable. |
|   | factual | text | A 500 ml jar is priced at ₹850, with a flat ₹50 shipping on every order. |
|   | question | text | First time ordering with us? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | feeling | text | Find us at /site/shree-dairy |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #ShreeDairy |

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

**Already removed by the guard (not yours to score):**

- "different from the" — a comparison with another product that nothing on record supports

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | A lot of people assume ghee adds weight and is hard on the stomach. |
|   | factual | text | At Shree Dairy, our desi ghee is made using the Bilona method, churned by hand, exactly as the process has always been done. |
|   | feeling | text | No preservatives, ever. |
|   | feeling | text | FSSAI licensed. |
|   | factual | text | 500 ml is priced at ₹850, with flat ₹50 shipping. |
|   | question | text | First order? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | cta | text | Order here: /site/shree-dairy |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #ShreeDairy |

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
|   | factual | text | When you buy food for your family, you want to know it has been checked by someone other than the seller. |
|   | factual | text | Shree Dairy holds a valid FSSAI licence (11223344556677), which means our food safety practices have been verified by the regulatory authority. |
|   | factual | text | Our desi ghee is made using the bilona method, churned by hand, with no preservatives added — ever. |
|   | feeling | text | Our paneer is made fresh every morning. |
|   | feeling | text | The licence does not make the food; the care in how it is made does. |
|   | feeling | text | But it means there is a body holding us accountable, and we think that is worth knowing. |
|   | factual | text | Desi ghee 500ml at ₹850, paneer 250g at ₹120. |
|   | question | text | First order? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | cta | text | Order here: /site/shree-dairy |
|   | feeling | hashtags | #FSSAILicensed |
|   | feeling | hashtags | #ShreeDairy |
|   | feeling | hashtags | #KnowWhatYouEat |

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
|   | feeling | text | A lot of people avoid ghee thinking it makes them gain weight. |
|   | factual | text | It is one of the most persistent food myths, and it is worth setting straight. |
|   | factual | text | Ghee made the traditional way — curd churned slowly by hand, then clarified — contains no fillers, no water, and no preservatives. |
|   | feeling | text | A small amount used in cooking is a very different thing from eating in excess. |
|   | feeling | text | The problem is rarely the ghee itself. |
|   | factual | text | At Shree Dairy, every batch is made using the Bilona method, churned by hand, with no preservatives — ever. |
|   | feeling | text | FSSAI licensed. |
|   | feeling | text | It is what ghee is supposed to taste and smell like. |
|   | factual | text | 500 ml jar at ₹850. |
|   | question | text | First order? |
|   | factual | text | Use code FIRST10 for 10% off. |
|   | factual | text | Flat ₹50 shipping. |
|   | cta | text | Order here: /site/shree-dairy |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #ShreeDairy |