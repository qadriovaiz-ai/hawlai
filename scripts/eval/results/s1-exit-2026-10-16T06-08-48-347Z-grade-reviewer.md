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
|   | feeling | subject | Shukriya! |
|   | feeling | subject | Yahaan se shuru hoti hai tumhari candle journey |
|   | factual | previewText | Handcrafted, soy wax, aur bilkul tumhare liye — welcome aboard! |
|   | feeling | headline | Welcome to the family! |
|   | feeling | headline | 🕯️ |
|   | feeling | intro | Itni khushi ho rahi hai ki tum yahan ho! |
|   | feeling | intro | Yeh sirf ek candle brand nahi hai — yahan har cheez thodi der se, thodi mehnat se banti hai. |
|   | factual | bullets | Har candle haath se, chhote batches mein pour ki jaati hai — craft aur care dono saath |
|   | feeling | ctaLabel | Explore the candle |
|   | feeling | product | Lavender Candle |
|   | feeling | body | Itni khushi ho rahi hai ki tum yahan ho! |
|   | feeling | body | Yeh sirf ek candle brand nahi hai — yahan har cheez thodi der se, thodi mehnat se banti hai. |
|   | question | body | Kab try kar rahe ho? |

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
|   | feeling | subject | Welcome! |
|   | feeling | subject | Yahan se shuru hoti hai aapki candle journey 🕯️ |
|   | feeling | previewText | Glad you're here — yeh jaano ki aage kya hoga |
|   | feeling | headline | Acha kiya, aap aa gaye! |
|   | feeling | intro | Bahut khushi hui ki aap yahan hain. |
|   | feeling | intro | Hum chahte hain ki aap jaano — yahan sirf candles nahi, ek experience milta hai. |
|   | factual | bullets | Fragrance exactly 65 celsius pe add hoti hai — discipline dikhti hai, feel bhi hoti hai |
|   | factual | bullets | Small batches mein haath se banayi jaati hain — har piece mein care hai |
|   | feeling | ctaLabel | Explore our candles |
|   | feeling | body | Bahut khushi hui ki aap yahan hain. |
|   | feeling | body | Hum chahte hain ki aap jaano — yahan sirf candles nahi, ek experience milta hai. |
|   | factual | body | Har candle soy wax se banti hai — paraffin se kabhi nahi. |
|   | feeling | body | Itni care isliye, taaki jo candle aapke paas aaye, woh sach mein kuch alag ho. |
|   | feeling | body | Koi bhi sawaal ho — seedha poochh lijiye. |
|   | feeling | body | Hum yaheen hain. |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Aayi hai teri lavender wali candle 🕯️ |
|   | feeling | previewText | Thodi si khushboo, thoda sa chain — welcome to Candle by Qaaf |
|   | feeling | headline | Ghar mein woh wala sukoon ab bottle mein nahi |
|   | feeling | intro | Yaar, glad you're here. |
|   | feeling | intro | Lavender ki yeh candle sirf ek khushboo nahi hai — yeh woh wala moment hai jab din bhar ki bhaag daud ke baad tum finally breath lete ho. |
|   | feeling | bullets | Har candle slow pour se banti hai — koi rush nahi, koi shortcut nahi |
|   | factual | bullets | Lavender ki scent dheere dheere room mein failti hai, ek jhonka nahi, ek feeling hai |
|   | feeling | bullets | Jalaao, baitho, kuch mat karo — bas itna kaam hai tumhara |
|   | feeling | ctaLabel | Dekho yeh candle |
|   | feeling | product | Lavender Candle |
|   | feeling | body | Glad you're here. |
|   | feeling | body | Lavender ki yeh candle sirf ek khushboo nahi hai — yeh woh wala moment hai jab din bhar ki bhaag daud ke baad tum finally breath lete ho. |
|   | feeling | body | Har candle slow pour se banti hai, koi shortcut nahi. |
|   | factual | body | Scent dheere dheere failti hai — ek jhonka nahi, ek feeling hai. |
|   | feeling | body | Bas jalaao, baitho, aur kuch mat karo. |
|   | feeling | body | Itna hi kaam hai tumhara. |
|   | feeling | body | Welcome to Candle by Qaaf — khush hain tum aaye. |

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
|   | feeling | previewText | Kya expect karein, kitna time lagega — sab yahan hai |
|   | feeling | headline | Acha kiya, aa gayi aap hamare paas! |
|   | feeling | intro | Bahut khushi hui ki aapne reach out kiya. |
|   | feeling | intro | Hum chahte hain ki aapka experience smooth ho, toh yahan kuch cheezein hain jo aapko pehle se pata honi chahiye. |
|   | factual | bullets | Visit ke liye time rakhein: 90 minutes |
|   | feeling | ctaLabel | Book a consultation |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Bahut khushi hui ki aapne reach out kiya! |
|   | feeling | body | Hum chahte hain ki aapka experience smooth ho. |
|   | factual | body | Treatment ki cost ₹3500 hai aur visit ke liye apne paas 90 minutes rakhein. |
|   | feeling | body | Koi bhi sawaal ho toh seedha poochh lijiye — hum yahan hain. |
|   | factual | body | Chaliye, appointment fix karte hain! |

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
|   | feeling | intro | Hum chahte hain aap bilkul comfortable feel karein, toh koi pressure nahi, bas ek conversation. |
|   | factual | bullets | Keratin treatment sirf 90 minutes mein ho jaata hai — zyada time waste nahi |
|   | feeling | ctaLabel | Book a consultation |
|   | feeling | body | Itni saari salons mein se aapne yahan enquire kiya — shukriya. |
|   | feeling | body | Koi pressure nahi, bas ek conversation. |
|   | feeling | body | Agar koi sawaal hai ya appointment lena hai, button dabao — hum ready hain! |

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
|   | feeling | subject | Aap aa gaye 🙏 |
|   | question | previewText | Kuch dhundh rahe hain? |
|   | feeling | previewText | Hum yahaan hain. |
|   | feeling | headline | Aapka swagat hai! |
|   | feeling | intro | Itni khushi hui ki aap yahaan aaye. |
|   | feeling | intro | Indore mein achhe baalon ke liye — keratin treatment ho ya simple haircut — hum milke dekh lete hain. |
|   | feeling | ctaLabel | Appointment Lein |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Shukriya ki aapne hamare saath connect kiya! |
|   | feeling | body | Chahe keratin treatment karwani ho ya ek fresh haircut — jo bhi ho, seedha poochhiye. |
|   | feeling | body | Koi bhi sawaal ho toh jhijhkiye mat, bas ek message kijiye, hum yahaan hain aapke liye. |

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
|   | factual | subject | Welcome — here is 10% off your first order |
|   | factual | previewText | Hand-churned desi ghee from Indore, with a little something off your first order. |
|   | feeling | headline | Real ghee, made the old way |
|   | feeling | intro | Thank you for finding us. |
|   | factual | intro | We want to make sure your first jar of desi ghee is a good one. |
|   | factual | bullets | Our desi ghee is hand-churned the traditional way — slow, careful, and done as it has always been done. |
|   | factual | bullets | Available in 500 ml at ₹850. |
|   | factual | bullets | Use the code at checkout for 10 per cent off your first order. |
|   | feeling | ctaLabel | Order your jar |
|   | factual | product | Desi ghee 500ml |
|   | feeling | body | Thank you for finding us — we are glad you are here. |
|   | factual | body | Our desi ghee, hand-churned the traditional way right here in Indore, is the heart of everything we do. |
|   | factual | body | It comes in a 500 ml jar at ₹850. |
|   | factual | body | To welcome you, we are offering 10 per cent off your first order — just use the code at checkout. |
|   | feeling | body | We hope it becomes a regular part of your kitchen. |

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
|   | feeling | subject | Welcome — here is what to expect from us |
|   | factual | previewText | Your first order comes with 10% off |
|   | feeling | headline | Glad you found us |
|   | feeling | intro | Welcome — we are a small dairy team based in Indore, and we are glad you are here. |
|   | factual | intro | Your first order comes with 10% off. |
|   | factual | bullets | Pure clarified butter, 500 ml — ₹850 |
|   | factual | bullets | Fresh paneer, 250 g — ₹120 |
|   | factual | bullets | 10% off your first order, automatically applied |
|   | feeling | ctaLabel | Get in touch |
|   | factual | product | Desi Ghee 500 ml |
|   | feeling | body | Welcome — we are a small dairy team based in Indore, and we are glad you are here. |
|   | factual | body | We make pure clarified butter (500 ml, ₹850) and fresh paneer (250 g, ₹120), and your first order comes with 10% off. |
|   | feeling | body | If you have any questions or would like to place an order, just reply to this email — we would love to help. |

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
|   | feeling | subject | Welcome — here's what you need to know about your ghee |
|   | factual | previewText | Pure desi ghee, made in Indore, with a little something for your first order. |
|   | feeling | headline | Glad you found us |
|   | feeling | intro | Thank you for reaching out — you have come to the right place. |
|   | feeling | intro | Our desi ghee is made here in Indore, and we are happy to tell you exactly what that means for you. |
|   | factual | bullets | Priced at ₹850 for 500 ml, with 10 per cent off your first order. |
|   | factual | ctaLabel | Claim your discount |
|   | factual | product | Desi ghee 500ml |
|   | feeling | body | Thank you for reaching out — you have come to the right place. |
|   | factual | body | Our desi ghee is made right here in Indore, and a 500 ml jar is priced at ₹850. |
|   | factual | body | Place your first order and you get 10 per cent off. |
|   | feeling | body | We would love to answer any questions you have — just hit the button below and let us know how we can help. |