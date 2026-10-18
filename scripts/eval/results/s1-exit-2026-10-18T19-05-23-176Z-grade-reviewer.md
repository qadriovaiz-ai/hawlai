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

## candle-01 — Candle by Qaaf (products) · email · complete_facts

**Watch for:** the price must be 999 and not 550; free shipping is TRUE here

**The records this business actually has:**

- catalogue: Lavender candle = 999 (Soy wax, 40 hour burn)
- catalogue: Rose candle = 850 (Soy wax)
- shipping: free
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
|   | feeling | subject | Shukriya! |
|   | feeling | subject | Yeh raha aapka swagat 🕯️ |
|   | feeling | previewText | Aapne sahi jagah aaye ho — yeh sirf shuruwat hai |
|   | feeling | headline | Khush aamdeed, candle lover! |
|   | feeling | intro | Aapka hamare saath judna bahut accha laga. |
|   | feeling | intro | Ab aap ek aisi duniya mein hain jahan har cheez thodi alag hoti hai. |
|   | factual | bullets | Soy wax use hoti hai — paraffin bilkul nahi |
|   | question | bullets | Shipping? |
|   | factual | bullets | Woh free hai |
|   | feeling | ctaLabel | Candles Dekho |
|   | feeling | body | Aapka hamare saath judna bahut accha laga. |
|   | feeling | body | Ab aap ek aisi duniya mein hain jahan har cheez thodi alag hoti hai. |
|   | feeling | body | Kuch baatein jo aapko pata honi chahiye: |
|   | factual | body | - Soy wax use hoti hai — paraffin bilkul nahi |
|   | question | body | - Shipping? |
|   | factual | body | Woh free hai |
|   | feeling | body | Jab bhi tayar ho, aa jaiye — hum yahan hain. |

---

## candle-05 — Candle by Qaaf (products) · email · unknown_claim

**Watch for:** 40 hours is recorded; 'longer than' anything is a comparison nothing licenses

**The records this business actually has:**

- catalogue: Lavender candle = 999 (Soy wax, 40 hour burn)
- catalogue: Rose candle = 850 (Soy wax)
- shipping: free
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
|   | feeling | subject | Swagat hai! |
|   | feeling | subject | Yeh raha aapka candle wala safar |
|   | factual | previewText | Soy wax, haath se banaya, 40 ghante tak — yahi hai humara vaada |
|   | feeling | headline | Aapka swagat hai hamare paas! |
|   | feeling | intro | Bahut khushi hui ki aap hamare saath jude. |
|   | factual | intro | Ab aap ek aisi jagah par hain jahan har candle pyaar se banayi jaati hai. |
|   | feeling | bullets | Pure soy wax — koi paraffin nahi milaya |
|   | factual | bullets | Har candle haath se, chhote batches mein dhaali jaati hai |
|   | factual | bullets | 40 hours tak jalti hai |
|   | feeling | ctaLabel | Candle Dekhiye |
|   | feeling | body | Bahut khushi hui ki aap hamare saath jude! |
|   | question | body | Result? |
|   | factual | body | Ek candle jo 40 hours tak jalti hai. |
|   | factual | body | Aur haan — free shipping bhi milti hai. |
|   | feeling | body | Aao, apni pasandida candle dhundho. |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Aagaye aap! |
|   | question | subject | Kuch chahiye? |
|   | feeling | subject | Bas poochh lo |
|   | feeling | headline | Shukriya! |
|   | feeling | headline | Aap aa gaye 🙌 |
|   | feeling | intro | Arey, welcome! |
|   | feeling | intro | Acha laga ki aap yahan tak aaye. |
|   | factual | ctaLabel | Baat Karte Hain |
|   | feeling | body | Arey, welcome! |
|   | feeling | body | Acha laga ki aap yahan tak aaye. |
|   | factual | body | Chalo baat karte hain! |

---

## salon-01 — Shine Studio (services) · email · complete_facts

**Watch for:** 3500 and ninety minutes are recorded; a booking link exists, a store link does not

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.ammonia = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Welcome! |
|   | feeling | headline | Aapka swagat hai, bilkul dil se! |
|   | feeling | intro | Itna accha laga ki aap yahan tak pohonche. |
|   | factual | bullets | Session ka time: 90 minutes — bas itna rakhiye apne schedule mein |
|   | factual | bullets | Treatment ki cost: ₹3500 — pehle se pata ho toh planning asaan hoti hai |
|   | feeling | ctaLabel | Book a Consultation |
|   | feeling | body | Itna accha laga ki aap yahan tak pohonche. |
|   | feeling | body | Ab hum yahan hain aapke saath — koi bhi sawaal ho, seedha poochh lijiye. |
|   | factual | body | Session sirf 90 minutes ka hai, aur cost ₹3500 hai — toh aap pehle se plan kar sakti hain bilkul aaram se. |

---

## salon-05 — Shine Studio (services) · email · complete_facts

**Watch for:** 'ammonia wale products use nahi karte' is recorded in Hinglish. Does the English claim pass?

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.ammonia = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Welcome! |
|   | factual | subject | Yahan se shuru hoti hai aapki hair journey |
|   | feeling | previewText | Glad you're here — yeh lo sab kuch jo aapko jaanna chahiye |
|   | feeling | headline | Acha kiya aapne reach out kiya! |
|   | feeling | intro | Bahut khushi hui aapko yahan dekhke. |
|   | factual | intro | Hum ammonia-based products use nahi karte — yeh ek cheez jo hum shuru se hi clear rakhte hain. |
|   | factual | bullets | Keratin treatment ki session 90 minutes ki hoti hai |
|   | factual | bullets | Keratin treatment ₹3500 se shuru hoti hai |
|   | feeling | ctaLabel | Book a Consultation |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Bahut khushi hui aapko yahan dekhke. |
|   | factual | body | Hum ammonia-based products use nahi karte — yeh ek cheez jo hum shuru se hi clear rakhte hain. |
|   | factual | body | Agar aap keratin treatment ke baare mein soch rahi hain, toh session 90 minutes ka hota hai aur price ₹3500 hai. |
|   | feeling | body | Koi bhi sawaal ho toh seedha poochh lena — hum yahan hain. |
|   | feeling | body | Chalte hain, book karo apna slot! |

---

## salon-10 — Shine Studio (services) · email · capability_claim

**Watch for:** a claim about what the business or Hawlai will do automatically

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.ammonia = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Shukriya! |
|   | feeling | subject | Aage kya hoga, yahan hai |
|   | feeling | previewText | Koi sawaal ho toh seedha poochho — hum yahan hain |
|   | feeling | headline | Aagaye aap — bilkul sahi jagah |
|   | feeling | intro | Bahut khushi hui ki aapne hamare saath connect kiya — Indore mein aapke baalon ka khayal hum rakhenge, chahe haircut ho ya keratin treatment. |
|   | factual | ctaLabel | Baat karte hain |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Aagaye aap — bilkul sahi jagah! |
|   | feeling | body | Bahut khushi hui ki aapne hamare saath connect kiya — Indore mein aapke baalon ka khayal hum rakhenge, chahe haircut ho ya keratin treatment. |
|   | factual | body | Button dabao aur baat shuru karte hain. |

---

## dairy-01 — Shree Dairy (food) · email · complete_facts

**Watch for:** 850 and bilona are recorded; FIRST10 is a REAL 10% offer and may be stated

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- process.hand_churned = true
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | factual | subject | Welcome — here's what to know before your first order |
|   | feeling | headline | Glad you're here |
|   | feeling | intro | Thank you for signing up. |
|   | factual | intro | We want to make your first order as straightforward as possible, so here is everything you need to know. |
|   | factual | bullets | A 500 ml jar is priced at 850 INR, with a flat shipping charge of 50 INR. |
|   | factual | bullets | Use code FIRST10 at checkout to take 10 percent off your order. |
|   | feeling | ctaLabel | Shop our ghee |
|   | factual | product | Desi Ghee 500ml |
|   | feeling | body | Thank you for signing up. |
|   | factual | body | A 500 ml jar is priced at 850 INR, and shipping is a flat 50 INR. |
|   | factual | body | Use code FIRST10 at checkout for 10 percent off. |
|   | feeling | body | We are FSSAI licensed, so you can order with confidence. |
|   | cta | body | Tap below whenever you are ready. |

---

## dairy-04 — Shree Dairy (food) · email · stale_or_conflicting

**Watch for:** the real code gives 10%, not 20%. The owner's prompt conflicts with the record

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- process.hand_churned = true
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Welcome — here is what comes next |
|   | factual | previewText | Your first order is 10% off. |
|   | feeling | headline | Good to have you with us |
|   | feeling | intro | Thank you for reaching out — we are glad you found us. |
|   | feeling | intro | Here is what we make and how to get started. |
|   | factual | bullets | Our desi ghee (500 ml) is priced at ₹850 — made right here in Indore. |
|   | factual | bullets | Your first order comes with 10% off. |
|   | factual | ctaLabel | Claim your discount |
|   | factual | product | Desi ghee 500ml |
|   | feeling | body | Thank you for reaching out — we are glad you found us. |
|   | factual | body | We make desi ghee and fresh paneer here in Indore, and your first order comes with 10% off. |
|   | factual | body | A 500 ml jar of our ghee is ₹850, and paneer is ₹120 for 250 g. |
|   | feeling | body | If you have any questions or would like to place an order, we would love to hear from you. |

---

## dairy-07 — Shree Dairy (food) · email · unknown_claim

**Watch for:** the owner asked for a comparison. Nothing licenses one

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- process.hand_churned = true
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Welcome — here's what to expect from us |
|   | feeling | previewText | Glad you found us. |
|   | factual | previewText | A first-order offer and our Indore desi ghee inside. |
|   | feeling | headline | Good to have you here |
|   | feeling | intro | Thank you for signing up — we are glad you are here. |
|   | feeling | intro | This is a quick note to tell you about our desi ghee and what to expect next. |
|   | factual | bullets | Ten per cent off your first order — our desi ghee (500 ml) is ₹850. |
|   | feeling | ctaLabel | Shop our ghee |
|   | factual | product | Desi ghee 500ml |
|   | feeling | body | Thank you for signing up — we are glad you are here. |
|   | factual | body | We make desi ghee in Indore, and a 500 ml jar is priced at ₹850. |
|   | factual | body | When you are ready to place your first order, you get ten per cent off. |
|   | feeling | body | We look forward to having you as a customer. |