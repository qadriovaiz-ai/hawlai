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
|   | feeling | headline | Welcome to the family! |
|   | feeling | headline | ✨ |
|   | feeling | intro | Bahut khushi hui ki tumne humse connect kiya. |
|   | feeling | intro | Yeh candle sirf ek candle nahi — yeh thoda sa sukoon hai, tumhare liye. |
|   | factual | bullets | Haath se, chhote batches mein pour kiya — har ek carefully |
|   | question | bullets | 40 hours tak jalti rehegi — aur shipping? |
|   | factual | bullets | Bilkul free |
|   | feeling | ctaLabel | Explore Our Candles |
|   | feeling | body | Bahut khushi hui ki tumne humse connect kiya! |
|   | feeling | body | Yeh candle sirf ek candle nahi — thoda sa sukoon hai, tumhare liye. |
|   | factual | body | Aur ek baat: 40 hours tak saath degi yeh, aur shipping bilkul free hai. |
|   | feeling | body | Koi bhi sawaal ho toh seedha poochho — hum yahaan hain. |

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
|   | feeling | subject | Aapka swagat hai — yahan se shuru karo |
|   | factual | previewText | 40 ghante ki roshni, hath se bani, sirf aapke liye. |
|   | feeling | headline | Welcome! |
|   | feeling | headline | Kuch khaas aapka intezaar kar raha hai |
|   | feeling | intro | Itni busy duniya mein aapne humare paas aana choose kiya — shukriya, dil se. |
|   | feeling | intro | Aage kya hoga, woh hum batate hain. |
|   | factual | bullets | Har candle hand-poured hai, small batches mein, 65 celsius par fragrance daal ke |
|   | factual | bullets | Ek candle, poore 40 hours ki roshni |
|   | feeling | ctaLabel | Collection Dekho |
|   | feeling | body | Itni busy duniya mein aapne humare paas aana choose kiya — shukriya, dil se. |
|   | question | body | Result? |
|   | factual | body | Ek candle jo poore 40 hours jalti hai. |
|   | factual | body | Aur best part — free shipping bhi milta hai. |
|   | feeling | body | Aake ek nazar dalein, koi jaldi nahi. |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Swagat hai — aapka lavender candle aa raha hai ✨ |
|   | question | previewText | Pehli baar Candle by Qaaf family mein? |
|   | feeling | previewText | Yeh padho. |
|   | feeling | headline | Aapka ghar thoda aur sukoon wala hone wala hai |
|   | feeling | intro | Welcome to Candle by Qaaf — bahut khushi hui ki aap yahan tak pohanche. |
|   | factual | intro | Yeh lavender candle sirf ek product nahi hai, yeh woh wala moment hai jab din bhar ki bhaag-daud ke baad aap finally apne liye kuch karte hain. |
|   | factual | bullets | Har candle haath se banayi jaati hai — machine nahi, dhyan se |
|   | factual | bullets | Lavender ki khushbu dheere-dheere failti hai, ek dum overwhelming nahi |
|   | feeling | bullets | Jab jalaao, toh bas kuch der ke liye sab kuch side pe rakh do |
|   | feeling | ctaLabel | Candle dekho |
|   | feeling | product | Lavender Candle |
|   | feeling | body | Welcome to Candle by Qaaf — bahut khushi hui ki aap yahan tak pohanche. |
|   | factual | body | Yeh lavender candle sirf ek product nahi, yeh woh wala moment hai jab aap din bhar ki bhaag-daud ke baad finally apne liye kuch karte hain. |
|   | factual | body | Haath se banayi, dheeri aur soothing khushbu ke saath — yeh candle aapke space ko thoda aur apna feel karati hai. |
|   | feeling | body | Koi rush nahi, koi shor nahi. |
|   | feeling | body | Bas aap aur ek achhi roshni. |
|   | feeling | body | Koi bhi sawaal ho toh hum yahaan hain — seedha reply karo is email pe. |

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
|   | feeling | subject | Swagat hai! |
|   | factual | subject | Yahan se shuru hoti hai aapki hair journey |
|   | feeling | previewText | Hum bahut khush hain ki aap hum tak pahunche — aage kya hoga, woh bhi bata dete hain. |
|   | feeling | headline | Aapka swagat hai, dil se! |
|   | feeling | intro | Itna trust karne ke liye shukriya — sach mein bahut achha laga ki aap humare paas aaye. |
|   | factual | intro | Hum chahte hain ki aapka experience bilkul smooth aur stress-free ho, toh bas ek baar poori baat sun lo. |
|   | factual | bullets | Ek session ka time hota hai 90 minutes, toh plan karke aana. |
|   | feeling | ctaLabel | Appointment Book Karo |
|   | feeling | body | Itna trust karne ke liye shukriya — sach mein bahut achha laga ki aap humare paas aaye. |
|   | feeling | body | Hum chahte hain ki aapka experience bilkul smooth ho. |
|   | factual | body | Hamare treatments mein ammonia-free products use hote hain kyunki aapke baal hamesha pehle aate hain. |
|   | factual | body | Ek session 90 minutes ka hota hai, toh time plan kar lena. |
|   | factual | body | Pricing seedhi hai — 3500 INR, koi confusion nahi. |
|   | feeling | body | Jab bhi ready ho, appointment book karo — hum taiyaar hain! |

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
|   | factual | subject | Yahan ammonia-free keratin milta hai |
|   | factual | headline | Ammonia-free keratin — bas 90 minutes |
|   | feeling | intro | Aapka swagat hai! |
|   | feeling | intro | Hum khush hain ki aap yahan hain. |
|   | factual | bullets | Sirf 90 minutes ka time chahiye |
|   | factual | bullets | Price seedha aur clear: 3500 INR |
|   | feeling | bullets | Koi hidden surprise nahi, bas achhe baal |
|   | feeling | ctaLabel | Book a consultation |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Aapka swagat hai! |
|   | feeling | body | Hum khush hain ki aap yahan hain. |
|   | factual | body | Treatment sirf 90 minutes mein ho jaata hai, aur price hai 3500 INR. |
|   | feeling | body | Koi confusion nahi, koi pressure nahi. |
|   | feeling | body | Bas aayein, baat karein, aur decide karein jo aapko sahi lage. |
|   | feeling | body | Hum ready hain jab bhi aap ho! |

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
|   | feeling | subject | Hum yahan hain aapke liye |
|   | feeling | previewText | Keratin treatment se haircut tak — Indore mein sab kuch yahan milega. |
|   | feeling | headline | Aagaye aap — bilkul sahi jagah! |
|   | feeling | intro | Bohot khushi hui ki aapne hamare saath connect kiya. |
|   | feeling | intro | Baalon ka kuch bhi ho — keratin treatment ho ya simple haircut — hum yahan hain Indore mein, aapke liye. |
|   | feeling | ctaLabel | Appointment book karo |
|   | feeling | product | Keratin Treatment |
|   | feeling | body | Shukriya ki aapne humse touch kiya — yeh sach mein acha laga! |
|   | feeling | body | Jaanta hoon kabhi kabhi pata nahi hota kahaan se shuru karein ya kya poochein. |
|   | feeling | body | Koi baat nahi — seedha hum se pooch lo. |
|   | feeling | body | Keratin treatment karwani ho ya sirf ek clean haircut chahiye, hum Indore mein aapka intezaar kar rahe hain. |
|   | feeling | body | Koi bhi sawaal ho, chhota ya bada, bas ek message karo. |
|   | feeling | body | Aapka swagat hai! |

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
|   | feeling | subject | Welcome – here's what we make and what comes next |
|   | factual | previewText | Handcrafted ghee, a first-order discount, and everything you need to know. |
|   | feeling | headline | Glad you're here |
|   | feeling | intro | Thank you for connecting with us — we're genuinely happy to have you. |
|   | feeling | intro | Here's a quick look at what we do and how to get started. |
|   | factual | bullets | Our ghee is made using the traditional hand-churning method, so every jar carries real craft and care. |
|   | factual | bullets | A 500 ml jar is priced at 850 INR, with a flat shipping charge of 50 INR — no surprises at checkout. |
|   | factual | bullets | Use your first-order discount of 10 percent to get started — just look out for the code in your next message from us. |
|   | feeling | ctaLabel | Book a consultation |
|   | feeling | product | Bilona Ghee |
|   | feeling | body | Thank you for connecting with us — we're genuinely happy to have you. |
|   | factual | body | Our ghee is made using the traditional hand-churning method, bringing real craft to every jar. |
|   | factual | body | A 500 ml jar is priced at 850 INR, with a flat shipping charge of 50 INR. |
|   | factual | body | As a new subscriber, you're entitled to a 10 percent discount on your first order — details coming your way shortly. |
|   | feeling | body | We are FSSAI licensed, so you can buy with full confidence. |
|   | feeling | body | We look forward to being part of your kitchen. |

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
|   | feeling | subject | Welcome — here's what to expect from us |
|   | factual | previewText | Hand-churned goodness, starting from 120 INR. |
|   | feeling | previewText | Glad you're here. |
|   | feeling | headline | Good to have you with us |
|   | feeling | intro | Thank you for reaching out — you've come to the right place. |
|   | factual | intro | We make our products the traditional, hand-churned way, and we're glad to share that with you. |
|   | factual | bullets | Products starting from 120 INR, with flat shipping at 50 INR |
|   | factual | bullets | We're licensed under FSSAI (11223344556677), so you can buy with confidence |
|   | feeling | ctaLabel | Book a consultation |
|   | feeling | body | Thank you for reaching out — you've come to the right place. |
|   | factual | body | We make our products the traditional, hand-churned way, and we're glad to share that with you. |
|   | factual | body | Our range starts from 120 INR, with a flat shipping rate of 50 INR. |
|   | factual | body | Our flagship offering is priced at 850 INR. |
|   | factual | body | We are FSSAI licensed (11223344556677), so you can shop with full confidence. |
|   | factual | body | In the meantime, feel free to get in touch with any questions. |

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
|   | feeling | subject | Welcome — here's what to expect from us |
|   | factual | previewText | Traditional ghee, a first-order discount, and a quick note on what comes next. |
|   | feeling | headline | Glad you're here |
|   | feeling | intro | Thank you for reaching out to us. |
|   | feeling | intro | We make ghee the traditional way — the kind that tastes like it should — and we're happy to have you with us. |
|   | factual | bullets | 500 ml starts at 850 INR, with a flat shipping charge of 50 INR. |
|   | factual | bullets | Use your first order to try us out — you get 10 percent off to get started. |
|   | factual | ctaLabel | Place your first order |
|   | feeling | body | Thank you for reaching out to us. |
|   | feeling | body | We make ghee the traditional way — the kind that tastes like it should — and we're happy to have you with us. |
|   | feeling | body | We are FSSAI licensed, so you know exactly who you are buying from. |
|   | factual | body | 500 ml starts at 850 INR, with a flat shipping charge of 50 INR. |
|   | factual | body | As a welcome, your first order comes with 10 percent off. |