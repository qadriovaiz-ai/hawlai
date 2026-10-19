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
|   | feeling | subject | Aapka swagat hai humari candle family mein |
|   | feeling | previewText | Kuch warm aur khushboodar cheezein aapka intezaar kar rahi hain |
|   | feeling | headline | Welcome to the family! |
|   | feeling | intro | Itni khushi ho rahi hai ki aap yahan hain! |
|   | feeling | intro | Hum chahte hain ki aapka pehla experience hamare saath ekdum sahi rahe. |
|   | factual | bullets | Har candle 40 hours tak jalti hai |
|   | factual | bullets | Shipping bilkul free hai |
|   | feeling | ctaLabel | Shop the collection |
|   | feeling | body | Itni khushi ho rahi hai ki aap yahan hain! |
|   | feeling | body | Hum chahte hain ki aapka pehla experience hamare saath ekdum sahi rahe. |
|   | factual | body | Har candle 40 hours tak chalti hai, aur price hai sirf 999 INR. |
|   | factual | body | Aur haan — shipping free hai. |
|   | feeling | body | Koi confusion ho toh humein seedha message karein, hum hamesha available hain. |

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
|   | feeling | subject | Yeh lo, sab kuch jo aapko pata hona chahiye |
|   | feeling | previewText | Hamari candles ke baare mein sab kuch — ekdum seedha. |
|   | feeling | headline | Aapka swagat hai hamari family mein! |
|   | feeling | intro | Itna pyaar dene ke liye shukriya! |
|   | feeling | intro | Hum bahut khush hain ki aap hamare saath hain. |
|   | feeling | bullets | Hamare candles soy wax se bane hain — koi paraffin nahi milaya. |
|   | factual | bullets | Har candle haath se, small batches mein pour ki jaati hai. |
|   | feeling | ctaLabel | Candles explore karo |
|   | feeling | body | Itna pyaar dene ke liye shukriya! |
|   | feeling | body | Hum bahut khush hain ki aap hamare saath hain. |
|   | feeling | body | Hamari candles soy wax se bani hain — koi paraffin nahi milaya. |
|   | factual | body | Har candle haath se, small batches mein pour hoti hai, aur fragrance add karte waqt temperature 65 celsius tak precisely control kiya jaata hai. |
|   | factual | body | Hamare candles 40 hours tak jalte hain. |
|   | factual | body | Aur haan — free shipping bhi hai. |
|   | feeling | body | Koi sawaal ho toh seedha poochho. |
|   | feeling | body | Hum yahaan hain! |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Aapka swagat hai — hum yahan hain |
|   | feeling | previewText | Koi bhi sawaal ho, seedha poochh lijiye |
|   | feeling | headline | Acha kiya jo aaye — hum sun rahe hain |
|   | feeling | intro | Aapne contact kiya, toh lagta hai kuch dhundh rahe hain. |
|   | feeling | intro | Jo bhi ho, hum batane ke liye yahan hain. |
|   | factual | ctaLabel | Baat karte hain |
|   | feeling | body | Aapka swagat hai! |
|   | feeling | body | Aapne humse connect kiya — yeh sunke accha laga. |
|   | feeling | body | Jo bhi aap dhundh rahe hain ya jitne bhi sawaal hain, seedha humse poochh lijiye. |
|   | feeling | body | Hum aapki baat sunne ke liye bilkul ready hain. |
|   | feeling | body | Bas ek message karo — hum yahan hain. |

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
|   | factual | subject | Yahan se shuru hoti hai aapki hair journey |
|   | feeling | previewText | Kuch important baatein jaan lo pehle — simple aur clear |
|   | feeling | headline | Acha hua aap aa gayi! |
|   | feeling | intro | Bahut khushi hui aapko yahan dekhke. |
|   | feeling | intro | Chaliye thoda bata dete hain aage kya hoga. |
|   | factual | bullets | Session ke liye 90 minutes apne paas rakho |
|   | factual | bullets | Price hai 3500 — koi hidden surprise nahi |
|   | factual | bullets | Hum ammonia-free products use karte hain |
|   | feeling | ctaLabel | Book a Consultation |
|   | feeling | body | Bahut khushi hui aapko yahan dekhke. |
|   | feeling | body | Chaliye thoda bata dete hain aage kya hoga. |
|   | factual | body | Session ke liye 90 minutes apne paas rakho. |
|   | factual | body | Price hai 3500 — koi hidden surprise nahi. |
|   | factual | body | Aur haan, hum ammonia-free products use karte hain. |
|   | feeling | body | Koi bhi sawaal ho toh bilkul poochho — hum yahan hain. |
|   | feeling | body | Jab ready ho, booking kar lo! |

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
|   | feeling | subject | Swagat hai! |
|   | feeling | previewText | Kya expect karein, kya jaanna chahiye — sab yahan hai |
|   | feeling | headline | Aap aa gaye, aur hum ready hain! |
|   | feeling | intro | Bahut khushi hui ki aapne humse connect kiya. |
|   | factual | bullets | Ammonia-based products hum use nahi karte — yeh jaanna zaroori tha |
|   | feeling | ctaLabel | Book a Consultation |
|   | feeling | body | Bahut khushi hui ki aapne humse connect kiya. |
|   | feeling | body | Ab hum chahte hain ki aapko pehle se hi pata ho ki aage kya hoga. |
|   | factual | body | Ammonia-based products hum use nahi karte — yeh jaanna zaroori tha. |

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
|   | feeling | subject | Hum yahaan hain aapke liye |
|   | feeling | previewText | Koi sawaal ho toh seedha poochh lo — hum ready hain |
|   | feeling | headline | Aapka swagat hai, dil se! |
|   | feeling | intro | Itna time nikaalkar humse jude, bahut achha laga. |
|   | feeling | intro | Keratin treatment ho ya simple haircut — jo bhi chahiye, hum sun rahe hain. |
|   | feeling | ctaLabel | Appointment lo |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Itna time nikaalkar humse jude, bahut achha laga. |
|   | feeling | body | Keratin treatment ho ya simple haircut — jo bhi dhundh rahe ho Indore mein, seedha poochho, hum yahaan hain. |
|   | feeling | body | Koi bhi cheez unclear lage toh jhijhko mat, bas ek message karo. |
|   | factual | body | Hum milke dekh lete hain ki aapke liye kya best rahega. |

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
|   | factual | subject | Welcome — here is what to know before your first order |
|   | factual | previewText | Bilona-method ghee, flat 50 INR shipping, and 10% off your first order. |
|   | feeling | headline | Glad you are here |
|   | feeling | intro | Thank you for joining us. |
|   | factual | intro | Here is everything you need to know before you place your first order. |
|   | factual | bullets | A 500 ml jar is priced at 850 INR, with flat shipping of 50 INR. |
|   | factual | bullets | Use code FIRST10 at checkout for 10 percent off your first order. |
|   | feeling | ctaLabel | Shop our ghee |
|   | factual | product | Desi ghee 500ml |
|   | feeling | body | Thank you for joining us. |
|   | factual | body | Here is everything you need to know before you place your first order. |
|   | factual | body | A 500 ml jar is priced at 850 INR. |
|   | factual | body | Shipping is a flat 50 INR. |
|   | factual | body | Use code FIRST10 at checkout for 10 percent off your first order. |
|   | feeling | body | We are licensed by FSSAI. |
|   | feeling | body | If you have any questions, simply reply to this email — we are happy to help. |

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
|   | feeling | subject | Welcome — you are in the right place |
|   | feeling | previewText | Glad to have you here. |
|   | feeling | previewText | Here is what to expect next. |
|   | feeling | headline | Welcome, and thank you for joining us |
|   | feeling | intro | We are really glad you found us. |
|   | factual | bullets | Flat shipping at ₹50 on your orders |
|   | feeling | bullets | We are FSSAI licensed — food safety matters to us |
|   | factual | bullets | Products priced from ₹120, with select items at ₹850 |
|   | feeling | ctaLabel | Browse our products |
|   | feeling | body | We are really glad you found us. |
|   | feeling | body | A few things worth knowing: |
|   | factual | body | - Flat shipping at ₹50 on your orders |
|   | feeling | body | - We are FSSAI licensed |
|   | factual | body | - Products from ₹120, with select items at ₹850 |
|   | feeling | body | If you have any questions, just reply to this email. |
|   | feeling | body | We are happy to help. |

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
|   | feeling | subject | Welcome — here is what happens next |
|   | factual | previewText | A small gift waiting on your first order of pure desi ghee or fresh paneer |
|   | feeling | headline | Good to have you with us |
|   | feeling | intro | Thank you for signing up — we are glad you are here. |
|   | feeling | intro | We make pure clarified butter and fresh cottage cheese, right here in Indore. |
|   | factual | ctaLabel | Claim your discount |
|   | factual | product | desi_ghee_500ml |
|   | feeling | body | Thank you for signing up — we are glad you are here. |
|   | feeling | body | We make pure clarified butter and fresh cottage cheese in Indore, and we are glad to have you with us. |
|   | factual | body | When you are ready to place your first order, your welcome discount of 10 percent is waiting. |
|   | feeling | body | We look forward to having you as a customer. |