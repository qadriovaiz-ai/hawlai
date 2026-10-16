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
|   | feeling | subject | Welcome! |
|   | feeling | previewText | Hum bahut khush hain ki aap hamare saath hain — yeh raha aage ka plan |
|   | feeling | headline | Aagaye aap! |
|   | feeling | headline | Shukriya choose karne ke liye |
|   | feeling | intro | Bahut achha laga ki aap yahan tak pahunche. |
|   | feeling | ctaLabel | Candle explore karo |
|   | feeling | body | Bahut achha laga ki aap yahan tak pahunche. |
|   | factual | body | Pure soy wax use karte hain hum, koi paraffin nahi, aur har candle haath se pour hoti hai small batches mein. |
|   | factual | body | Ek candle aapko 40 hours tak saath deti hai. |
|   | factual | body | Aur delivery pe koi extra charge nahi lagta. |

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
|   | feeling | subject | Aa gayi aap ki favourite jagah — welcome to the family! |
|   | feeling | headline | Welcome! |
|   | feeling | headline | Khush hai hum aap ko yahan dekh ke |
|   | feeling | intro | Aap ne humse connect kiya — yeh sunke dil khush ho gaya. |
|   | feeling | ctaLabel | Explore our candles |
|   | feeling | body | Aap ne humse connect kiya — yeh sunke dil khush ho gaya. |
|   | factual | body | Yahaan aapko milenge asli haath se bane candles, jo ghar ko roshan bhi karein aur mehak bhi bharein. |
|   | factual | body | Fragrance bilkul 65 celsius par add kiya jaata hai, aur har candle small batches mein haath se pour hoti hai. |
|   | factual | body | Aur haan — free shipping bhi hai. |
|   | feeling | body | Toh ab ek achi chai banaiye aur collection explore karein! |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Aapka lavender candle almost ready hai ✨ |
|   | feeling | previewText | Ek chhota sa unboxing ritual jo aapka din badal de |
|   | feeling | headline | Kuch slow down karne wala aaya hai |
|   | feeling | intro | Shukriya — aap Candle by Qaaf family mein aa gaye hain. |
|   | factual | intro | Yeh lavender candle sirf ek candle nahi hai, yeh woh 20 minute hain jo din mein sirf aapke hote hain. |
|   | factual | bullets | Pehli baar jalate waqt, do se teen ghante ke liye burn karein — wax ka pura pool set ho jaata hai |
|   | factual | bullets | Khushbu dheere dheere failti hai, poori room mein nahi, aapke paas aati hai |
|   | feeling | bullets | Jab bhi mood bhaari lage ya bas kuch peaceful chahiye — yahi waqt hai is candle ka |
|   | feeling | ctaLabel | Candle dekhein |
|   | feeling | product | Lavender Candle |
|   | feeling | body | Shukriya — aap Candle by Qaaf family mein aa gaye hain. |
|   | factual | body | Yeh lavender candle sirf ek candle nahi hai, yeh woh 20 minute hain jo din mein sirf aapke hote hain. |
|   | factual | body | Pehli baar jalate waqt do se teen ghante burn karein taaki wax achhe se set ho. |
|   | factual | body | Khushbu dheere aati hai, overwhelm nahi karti. |
|   | feeling | body | Jab din bhaari lage ya bas kuch apna moment chahiye — bas ise jalayein, baaki sab ruk jaata hai. |
|   | feeling | body | Koi sawaal ho toh hum yahan hain. |

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

**Already removed by the guard (not yours to score):**

- "no harsh chemical" — this says other products have that fault, which is a claim about them, not about yours

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Welcome! |
|   | factual | subject | Yahan se shuru hoti hai aapki hair journey |
|   | feeling | previewText | Itna accha decision liya hai aapne — hum bata dete hain aage kya hoga |
|   | feeling | headline | Aagaye aap — bilkul sahi jagah! |
|   | feeling | intro | Bahut khushi hui ki aapne reach out kiya. |
|   | feeling | intro | Ab hum milke aapke baalo ka khayal rakhenge, properly aur pyaar se. |
|   | factual | bullets | Session hoti hai 90 minutes ki — toh aaram se aana, koi jaldi nahi |
|   | factual | bullets | Service ki value hai 3500 INR — sab kuch clear, koi hidden surprise nahi |
|   | feeling | ctaLabel | Book a Consultation |
|   | feeling | body | Bahut khushi hui ki aapne reach out kiya. |
|   | feeling | body | Ab hum milke aapke baalo ka khayal rakhenge, properly aur pyaar se. |
|   | feeling | body | Kuch important baatein: |
|   | factual | body | - Session 90 minutes ki hoti hai, toh aaram se plan karo |
|   | factual | body | - Hum sirf ammonia-free products use karte hain — baalo ke liye safe |
|   | factual | body | - Service ki value hai 3500 INR — sab transparent hai |
|   | factual | body | Consultation book karo aur baat karte hain — aapke baalo ke liye kya best rahega, woh milke decide karenge. |

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
|   | feeling | text | Something went wrong writing this — try again. |
|   | feeling | text | If it keeps happening, let us know. |

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
|   | feeling | text | Something went wrong writing this — try again. |
|   | feeling | text | If it keeps happening, let us know. |

---

## dairy-01 — Shree Dairy (food) · email · complete_facts

**Watch for:** 850 and bilona are recorded; FIRST10 is a REAL 10% offer and may be stated

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Something went wrong writing this — try again. |
|   | feeling | text | If it keeps happening, let us know. |

---

## dairy-04 — Shree Dairy (food) · email · stale_or_conflicting

**Watch for:** the real code gives 10%, not 20%. The owner's prompt conflicts with the record

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Something went wrong writing this — try again. |
|   | feeling | text | If it keeps happening, let us know. |

---

## dairy-07 — Shree Dairy (food) · email · unknown_claim

**Watch for:** the owner asked for a comparison. Nothing licenses one

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Something went wrong writing this — try again. |
|   | feeling | text | If it keeps happening, let us know. |