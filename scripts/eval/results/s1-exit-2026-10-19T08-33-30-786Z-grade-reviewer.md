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
|   | feeling | subject | Yahan se shuru hota hai sab kuch |
|   | feeling | previewText | Aapka swagat hai — jaano aage kya hoga |
|   | feeling | headline | Aapka swagat hai, dil se! |
|   | feeling | intro | Itni khushi hui ki aap yahan tak pahunche. |
|   | feeling | intro | Hum chahte hain ki aap jaanein aap kahan aa gaye hain. |
|   | factual | bullets | Soy wax se bani har candle — paraffin bilkul nahi |
|   | factual | bullets | Har candle haath se, chhote batches mein pour ki jaati hai |
|   | factual | bullets | Free shipping milti hai aapko |
|   | feeling | body | Itni khushi hui ki aap yahan tak pahunche. |
|   | feeling | body | Hum chahte hain ki aap jaanein aap kahan aa gaye hain. |
|   | factual | body | Hamaari candles soy wax se bani hain — paraffin bilkul nahi. |
|   | factual | body | Har ek haath se, chhote batches mein pour hoti hai. |
|   | factual | body | Ek candle 40 hours tak chalti hai, aur price hai 999 INR. |
|   | factual | body | Aur haan — free shipping bhi milti hai. |
|   | feeling | body | Koi sawaal ho toh seedha poochho. |
|   | feeling | body | Hum yahan hain. |

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
|   | feeling | subject | Shukriya! |
|   | feeling | subject | Yeh lo apna welcome 🕯️ |
|   | feeling | previewText | Kuch khaas baat karni thi aapse — candles aur unke baare mein |
|   | feeling | headline | Aapka swagat hai is roshni mein |
|   | feeling | intro | Itna time diya, dil se shukriya. |
|   | factual | intro | Hum chahte hain aap jaanein ki hum kya banate hain aur kyun yeh alag hai. |
|   | factual | bullets | Soy wax use hota hai — paraffin kabhi nahi milaya jaata |
|   | factual | bullets | Har candle haath se, chhote batches mein pour ki jaati hai |
|   | factual | bullets | 40 hours tak jalti hai — yeh number seedha aapke haath tak pohonchta hai |
|   | feeling | ctaLabel | Collection dekhiye |
|   | feeling | body | Shukriya ki aapne hamse juda hue. |
|   | feeling | body | Hum chahte hain aap jaanein — yahan soy wax use hoti hai, koi paraffin nahi milaya jaata. |
|   | factual | body | Fragrance 65 celsius par add kiya jaata hai aur candle double-boiler mein melt hoti hai. |
|   | factual | body | Chhote batches mein, haath se pour ki jaati hai. |
|   | factual | body | Aur yeh sab 40 hours tak saath nibhata hai. |
|   | factual | body | Shipping free hai — toh bina kisi jhanjhat ke apni pasand chuniye. |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Shukriya! |
|   | feeling | subject | Aap aa gaye 🙏 |
|   | feeling | previewText | Aapka swagat hai — hum yahaan hain aapke liye |
|   | feeling | headline | Aapka bahut swagat hai! |
|   | feeling | intro | Itna accha laga ki aap tak pahunche. |
|   | feeling | intro | Jo bhi aap dhundh rahe hain, hum help karne ke liye yahaan hain. |
|   | feeling | ctaLabel | Humse baat karein |
|   | feeling | body | Itna accha laga ki aap tak pahunche. |
|   | feeling | body | Jo bhi aap dhundh rahe hain — koi sawaal ho, koi baat ho — bas poochh lijiye. |
|   | feeling | body | Hum yahaan hain aapke liye, seedha aur seedhi baat ke saath. |
|   | feeling | body | Koi bhi cheez samajhni ho toh jhijhkiye mat, humse connect karein. |

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
|   | feeling | headline | Swagat hai aapka! |
|   | feeling | intro | Itna accha laga ki aap aaye! |
|   | factual | bullets | Session ki duration 90 minutes hai — utna time rakhna apne paas. |
|   | feeling | bullets | Ammonia-based products use nahi hote — yeh Indore mein in-person service hai. |
|   | feeling | body | Itna accha laga ki aap aaye! |
|   | factual | body | Session 90 minutes ka hota hai, toh utna time apne paas rakhna. |
|   | feeling | body | Ammonia-based products use nahi hote hamare yahan. |
|   | feeling | body | Yeh ek in-person service hai, Indore mein. |
|   | feeling | body | Bas ab apna slot pakad lo — button neeche hai. |

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
|   | feeling | previewText | Glad you're here — yeh lo, sab kuch jo aapko pehle jaanna chahiye |
|   | feeling | headline | Acha hua aap aa gaye! |
|   | feeling | intro | Bahut khushi hui aapko yahan dekhke. |
|   | feeling | intro | Hum chahte hain ki aapko sab kuch pehle se pata ho — koi surprise nahi, koi confusion nahi. |
|   | factual | bullets | Keratin treatment sirf 3500 INR mein available hai |
|   | factual | bullets | Session ka time lagbhag 90 minutes hota hai — plan kar lijiye accordingly |
|   | factual | bullets | Hum ammonia products use nahi karte |
|   | feeling | body | Bahut khushi hui aapko yahan dekhke. |
|   | feeling | body | Hum chahte hain ki aapko sab kuch pehle se pata ho — koi surprise nahi, koi confusion nahi. |
|   | factual | body | Kuch baatein jaan lo: Keratin treatment sirf 3500 INR mein available hai aur session lagbhag 90 minutes ka hota hai. |
|   | factual | body | Aur haan — hum ammonia products use nahi karte. |
|   | factual | body | Koi bhi sawaal ho toh baat karte hain. |

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
|   | feeling | subject | Aagaye aap — welcome! |
|   | feeling | previewText | Koi bhi sawaal ho, hum yahan hain. |
|   | feeling | headline | Acha kiya jo aaye aap yahan! |
|   | feeling | intro | Bahut khushi hui ki aap humse jude. |
|   | feeling | intro | Keratin treatment se lekar simple haircut tak — jo bhi chahiye, hum sunne ke liye bilkul ready hain. |
|   | factual | ctaLabel | Baat Karte Hain |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Bahut khushi hui ki aap humse jude. |
|   | feeling | body | Keratin treatment se lekar simple haircut tak — ya sirf dekh rahe hain abhi tak — koi baat nahi. |
|   | feeling | body | Koi sawaal ho, kuch samajhna ho, ya bas shuru kahan se karein Indore mein yeh jaanna ho, toh seedha pooch lijiye. |
|   | feeling | body | Hum yahan hain. |

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
|   | factual | previewText | Traditional Bilona ghee, hand-churned, delivered to you. |
|   | feeling | headline | Glad you're here |
|   | feeling | intro | Thank you for signing up. |
|   | factual | bullets | Desi Ghee 500ml is priced at 850. |
|   | factual | bullets | Flat shipping of 50 on every order. |
|   | factual | bullets | Get 10 percent off your first order — look out for details in your next email. |
|   | feeling | ctaLabel | Book a consultation |
|   | factual | product | Desi Ghee 500ml |
|   | feeling | body | Thank you for signing up. |
|   | factual | body | Desi Ghee 500ml is priced at 850. |
|   | factual | body | Shipping is a flat 50. |
|   | factual | body | As a new subscriber, you are eligible for 10 percent off your first order — details coming your way soon. |
|   | feeling | body | We hold an FSSAI licence, so you can order with confidence. |
|   | factual | body | If you have any questions before you place your first order, just reply to this email. |

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
|   | feeling | subject | Welcome — here is what to know about us |
|   | feeling | headline | Glad you are here |
|   | feeling | intro | Thank you for signing up — we are happy to have you. |
|   | feeling | intro | Here is a quick look at what we make and how we work. |
|   | factual | bullets | Our ghee is made using the traditional Bilona hand-churning process. |
|   | factual | bullets | Shipping is a flat 50 INR, wherever you are. |
|   | feeling | ctaLabel | Browse our products |
|   | feeling | body | Thank you for signing up — we are happy to have you. |
|   | factual | body | Our ghee is made using the traditional Bilona hand-churning process. |
|   | factual | body | Shipping is a flat 50 INR on every order. |
|   | factual | body | We are FSSAI licensed — our number is 11223344556677. |
|   | feeling | body | If you have any questions at all, just reply to this email. |
|   | feeling | body | We look forward to hearing from you. |

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
|   | feeling | subject | Welcome — here is what comes next |
|   | feeling | previewText | Glad you are here. |
|   | factual | previewText | A little about us and a first-order offer inside. |
|   | feeling | headline | Good to have you with us |
|   | feeling | intro | Thank you for reaching out — we are happy you found us. |
|   | feeling | intro | Here is a quick look at what we do and how you can get started. |
|   | factual | bullets | Your first order comes with 10 percent off, and shipping is a flat ₹50. |
|   | factual | bullets | A 500 ml jar is priced at ₹850 — straightforward, no surprises at checkout. |
|   | factual | ctaLabel | Place your first order |
|   | factual | product | Desi Ghee 500ml |
|   | feeling | body | Thank you for reaching out — we are happy you found us. |
|   | factual | body | Our ghee is made using the Bilona method and is hand-churned. |
|   | factual | body | A 500 ml jar is priced at ₹850. |
|   | factual | body | Your first order gets 10 percent off, and shipping is a flat ₹50. |
|   | feeling | body | We would love for you to give it a try. |