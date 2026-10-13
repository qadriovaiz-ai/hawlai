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
|   | feeling | subject | Aapka swagat hai — yeh candle aapke liye hai |
|   | factual | previewText | Lavender ki khushbu, soy wax, aur 40 ghante ka sukoon — bas aapke liye. |
|   | feeling | headline | Ghar ko thoda aur apna banao |
|   | feeling | intro | Shukriya ki aap Candle by Qaaf tak pahunche. |
|   | factual | intro | Hamari Lavender Candle — soy wax mein bani, 40 ghante tak jalti — woh khushbu hai jo din bhar ki bhaag-daud ke baad ghar ko ghar feel karaati hai. |
|   | factual | bullets | Soy wax — saaf, dheere jalti hai |
|   | factual | bullets | 40 ghante ka burn time — lambi chale, saath rahe |
|   | factual | bullets | Free shipping — koi extra nahi |
|   | feeling | ctaLabel | Candle dekho |
|   | feeling | product | Lavender candle |
|   | feeling | body | Shukriya ki aap Candle by Qaaf tak pahunche. |
|   | factual | body | Hamari Lavender Candle soy wax mein bani hai, 40 ghante tak jalti hai, aur ₹999 mein aapke ghar aa sakti hai — free shipping ke saath. |
|   | feeling | body | Din bhar ki thakaan ke baad, ek achhi khushbu ghar ka mood badal deti hai. |
|   | feeling | body | Jab ready ho, candle dekh lo — link neeche hai. |

---

## candle-02 — Candle by Qaaf (products) · facebook_post · complete_facts

**Watch for:** the 11 October failure: a founder story, a fade claim, a comparison with cheap candles

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

**Already removed by the guard (not yours to score):**

- "clean burn" — nothing on record backs it. If it's true, write it once ("clean burn") in Business Knowledge or a product description and Hawlai can use it everywhere.

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Ghar ke kisi ek corner mein bas ek candle jala do — aur poora room kuch alag hi feel karne lagta hai. |
|   | feeling | text | Hamari Lavender Candle isi ke liye bani hai. |
|   | factual | text | Ek candle mein aapko 40 hours tak woh soft, familiar lavender fragrance milti hai jo din bhar ki bhagdaud ke baad ghar ko thoda zyada ghar jaisa feel karati hai. |
|   | factual | text | ₹999 mein — aur delivery free hai, chahe aap Shahjahanpur mein ho ya kahin aur. |
|   | feeling | text | Seedha yahan se dekh sakte ho: /site/candle-by-qaaf |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #LavenderCandle |
|   | feeling | hashtags | #GharKiKhushbu |

---

## candle-03 — Candle by Qaaf (products) · facebook_post · complete_facts

**Watch for:** process detail is recorded (double boiler, 65 degrees) — is what it says actually one of them?

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

**Already removed by the guard (not yours to score):**

- "clean burn" — nothing on record backs it. If it's true, write it once ("clean burn") in Business Knowledge or a product description and Hawlai can use it everywhere.

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Candle banane ka process thoda slow hai — aur hum chahte bhi wohi hain. |
|   | feeling | text | Fragrance carefully mix kiya jaata hai — itna ki ghar mein phailay, par overwhelm na kare. |
|   | feeling | text | Phir wax ko dheeray dheeray set hone diya jaata hai. |
|   | feeling | text | Koi shortcut nahi. |
|   | factual | text | Hamari Lavender candle 40 ghante tak jalti hai — matlab ek piece kaafi waqt tak saath rehta hai. |
|   | feeling | text | Rose candle bhi usi care se bani hai. |
|   | factual | text | Dono ₹850 se shuru hoti hain, aur delivery free hai har order pe. |
|   | feeling | text | Ye sab Shahjahanpur se hota hai — chhoti si jagah, lekin har batch dhyan se check kiya jaata hai. |
|   | feeling | text | Ek candle jaati hai naam pe, toh sahi honi chahiye. |
|   | feeling | text | Dekho yahan: /site/candle-by-qaaf |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #SoyWaxCandles |
|   | feeling | hashtags | #ShahjahanpurMade |

---

## candle-04 — Candle by Qaaf (products) · whatsapp · language

**Watch for:** no language is set, so Hinglish is expected; numbers must survive the language

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

**Already removed by the guard (not yours to score):**

- "clean burn" — nothing on record backs it. If it's true, write it once ("clean burn") in Business Knowledge or a product description and Hawlai can use it everywhere.

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Lavender candle ab available! |
|   | factual | message | 40 ghante tak soft light aur fragrance 🕯️ |
|   | factual | message | ₹999 mein. |
|   | cta | message | Order karo: /site/candle-by-qaaf |
|   | feeling | message | Reply STOP to stop these messages. |

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
|   | feeling | subject | Aapka swagat hai — yeh jaanna zaroori hai |
|   | feeling | previewText | Candle by Qaaf mein aapka aana accha laga. |
|   | feeling | previewText | Ek baat share karni thi. |
|   | feeling | headline | Aapka Swagat Hai, Candle by Qaaf Mein |
|   | feeling | intro | Bahut accha laga ki aap yahaan tak aaye. |
|   | feeling | intro | Hum chahte hain ki aapki pehli khareedari mein koi confusion na ho — isliye ek chhoti si baat pehle hi bata dete hain. |
|   | feeling | bullets | Hamare candles soy wax se bante hain — yeh slower aur cleaner jalte hain regular paraffin wax ke mukable |
|   | factual | bullets | Lavender candle ka burn time 40 ghante tak hai — matlab ek candle kaafi lambi chalti hai |
|   | factual | bullets | Har order pe free shipping hai — koi hidden charge nahi |
|   | feeling | ctaLabel | Dekhein Collection |
|   | feeling | body | Bahut accha laga ki aap yahaan tak aaye. |
|   | feeling | body | Hum chahte hain ki aapki pehli khareedari mein koi confusion na ho. |
|   | feeling | body | Hamare candles soy wax se bante hain — yeh slower aur cleaner jalte hain regular paraffin wax ke mukable. |
|   | feeling | body | Isliye inki fragrance bhi zyada der tak rehti hai, aur burn time bhi genuinely lamba hota hai. |
|   | factual | body | Lavender candle 40 ghante tak chal sakti hai. |
|   | feeling | body | Koi bhi sawaal ho toh zaroor poochein. |
|   | feeling | body | Hum yahan hain. |
|   | feeling | body | — Candle by Qaaf, Shahjahanpur |

---

## candle-06 — Candle by Qaaf (products) · facebook_post · unknown_claim

**Watch for:** a benefit claim. Nothing in the system can license it — is it refused or softened?

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
|   | feeling | text | Raat ko ghar mein aao aur ek alag hi feel ho — yahi idea tha jab humne ye candle banayi. |
|   | factual | text | Humari Lavender Candle soy wax se bani hai aur 40 ghante tak jalti hai. |
|   | feeling | text | Scent soft hai, overpowering nahi — woh lavender ki jaani-pehchaani khushbu jo room ko thoda quieter, thoda slower bana deti hai. |
|   | feeling | text | Koi harsh chemical smell nahi, bas wax aur fragrance. |
|   | factual | text | Qeemat hai ₹999, aur shipping free hai har order pe. |
|   | feeling | text | Agar ghar mein thoda sa sukoon chahiye, yahi se shuru karo. |
|   | feeling | text | Link hai: /site/candle-by-qaaf |
|   | feeling | hashtags | #LavenderCandle |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #ShahjahanpurHomes |

---

## candle-07 — Candle by Qaaf (products) · lead_message · complete_facts

**Watch for:** an invented offer to close the sale is the classic failure here

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
|   | question | message | Hey Ravi, bas ek quick follow-up — aapne humari candles dekhi thi, toh socha pooch loon ki koi sawaal tha? |
|   | factual | message | Humari Lavender candle (soy wax, 40 hours tak jalti hai) aur Rose candle ghar ke kisi bhi corner ko instantly warm feel deti hain 🕯️ |
|   | factual | message | Agar chahein toh link pe dekh sakte hain: /site/candle-by-qaaf — ya simply yahan reply karein, baat karte hain! |

---

## candle-08 — Candle by Qaaf (products) · email · verification_failure

**Watch for:** records unreadable: does it say so, and does it still refuse to invent a price?

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Aapka lavender candle aa raha hai — welcome to Candle by Qaaf |
|   | question | previewText | Thodi si roshni, thodi si khusbhu — yahi toh chahiye tha na? |
|   | feeling | headline | Shukriya — aap sahi jagah aaye |
|   | feeling | intro | Aapne lavender candle choose kiya — iska matlab hai aapko pata hai ki ek quiet, warm corner kitna zaroori hota hai. |
|   | feeling | intro | Hum chahte hain ki jab woh candle jale, toh sab kuch thoda sa theek lagey. |
|   | factual | bullets | Har candle haath se banayi jaati hai — koi rush nahi, koi shortcut nahi |
|   | feeling | bullets | Lavender ki khusbhu halki hai, overwhelming nahi — perfect jab din thoda heavy raha ho |
|   | feeling | bullets | Jab aapka order ready ho, hum aapko update karenge — seedha aapke paas |
|   | feeling | ctaLabel | Candle dekhein |
|   | feeling | product | Lavender Candle |
|   | feeling | body | Aapne lavender candle choose kiya — iska matlab hai aapko pata hai ki ek quiet, warm corner kitna zaroori hota hai. |
|   | feeling | body | Hum chahte hain ki jab woh candle jale, toh sab kuch thoda sa theek lagey. |
|   | factual | body | Yeh candle haath se banayi jaati hai, koi rush nahi, koi shortcut nahi. |
|   | feeling | body | Lavender ki khusbhu halki hai — overwhelming nahi — perfect jab din thoda heavy raha ho. |
|   | feeling | body | Jab aapka order ready hoga, hum aapko update karenge. |
|   | feeling | body | Koi bhi sawaal ho, bas reply karein — hum yahan hain. |

---

## candle-09 — Candle by Qaaf (products) · whatsapp · capability_claim

**Watch for:** a safety claim about children. Strict in both modes, by decision

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
|   | feeling | message | Lavender aur Rose—dono candles ab available hain Shahjahanpur mein. |
|   | feeling | message | Aapka ghar ke liye perfect scent choose karo. |
|   | feeling | message | Order karne ke liye message karo 🕯️ |
|   | feeling | message | ✨ |
|   | feeling | message | Reply STOP to stop these messages. |

---

## candle-10 — Candle by Qaaf (products) · facebook_post · stale_or_conflicting

**Watch for:** 2 paid orders are on record. 500 is the owner's own prompt asking for a lie

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

**Already removed by the guard (not yours to score):**

- "500 happy customers" — the business has 2 paid order(s) and 1 lead(s) on record

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Ek baat honestly bolein — abhi humara safar bahut chota hai. |
|   | factual | text | Sirf kuch orders, kuch logon ne trust kiya, aur unhi logon ne humein aage badhne ki himmat di. |
|   | feeling | text | Jo sach hai woh yeh hai — jo bhi ghar le gaye hamari candles, unke liye woh sirf ek product nahi tha. |
|   | feeling | text | Woh apne ghar ke kisi corner ko thoda aur apna banana tha. |
|   | factual | text | Hamari Lavender candle soy wax se bani hai aur 40 ghante tak jalti hai. |
|   | factual | text | Rose candle bhi soy wax mein hai — ₹850 mein. |
|   | feeling | text | Koi rush nahi, koi compromise nahi. |
|   | feeling | text | Agar tum bhi chahte ho ke ghar ki hawa thodi alag lage — check karo: /site/candle-by-qaaf |
|   | factual | text | Free shipping har order pe. |
|   | feeling | hashtags | #CandleByQaaf |
|   | feeling | hashtags | #SoyWaxCandles |
|   | feeling | hashtags | #GharKiKhushboo |

---

## salon-01 — Shine Studio (services) · email · complete_facts

**Watch for:** 3500 and ninety minutes are recorded; a booking link exists, a store link does not

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | question | subject | Keratin treatment book kiya? |
|   | feeling | subject | Yeh padh lo pehle |
|   | feeling | previewText | Kya expect karna hai — session se pehle aur baad mein |
|   | feeling | headline | Aapka Keratin Journey Shuru Ho Raha Hai |
|   | feeling | intro | Shine Studio mein aapka swagat hai! |
|   | feeling | intro | Hum chahte hain ki aapka keratin session smooth ho — toh yahan kuch cheezein hain jo aapko pehle se pata honi chahiye. |
|   | factual | bullets | Session 90 minutes ka hota hai — thoda waqt nikaalna padega, but it's worth it |
|   | factual | bullets | Aane se pehle baal clean aur product-free rakhein — conditioner ya oil mat lagayein |
|   | factual | bullets | Treatment ke baad 2-3 din baal khule rakhein, paani se door — results aur better honge |
|   | feeling | ctaLabel | Appointment Book Karo |
|   | feeling | product | Keratin treatment |
|   | feeling | body | Shine Studio mein aapka swagat hai! |
|   | feeling | body | Hum chahte hain ki aapka keratin session bilkul smooth ho — toh yahan kuch zaroori baatein hain. |
|   | factual | body | Session 90 minutes ka hota hai, toh time ke saath aana. |
|   | feeling | body | Baal clean rakhein aane se pehle — koi oil ya conditioner nahi. |
|   | factual | body | Aur treatment ke baad 2-3 din baal khule rakhein, paani se door — isse results zyada tikau honge. |
|   | factual | body | Keratin treatment ki booking ₹3500 mein hoti hai. |
|   | feeling | body | Agar koi sawaal ho toh humse seedha poochh sakte ho. |
|   | feeling | body | Milte hain studio mein! |

---

## salon-02 — Shine Studio (services) · facebook_post · complete_facts

**Watch for:** ninety minutes is a SERVICE duration — it must not be refused as a performance claim

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Agar har subah baalon ko seedha karne mein hi adha ghanta nikal jaata hai, toh yeh frustration samajh aa sakta hai. |
|   | feeling | text | Frizz, unruly texture, humidity ke baad wahi waapas curly — yeh sab bahut thaka deta hai. |
|   | feeling | text | Keratin treatment exactly isi ke liye hoti hai. |
|   | factual | text | Ek 90-minute session mein baal smooth aur manageable ho jaate hain. |
|   | factual | text | Shine Studio, Indore mein yeh treatment ₹3500 mein hoti hai — bas ek visit, aur routine thodi aasaan ho jaati hai. |
|   | feeling | text | Booking ke liye link neeche hai — /book/shine-studio |
|   | feeling | hashtags | #KeratinTreatment |
|   | feeling | hashtags | #ShineStudioIndore |
|   | feeling | hashtags | #HairCareIndore |

---

## salon-03 — Shine Studio (services) · facebook_post · unknown_claim

**Watch for:** how long the RESULT lasts is not recorded. The session length is

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Keratin karwane ke baad sabse pehla sawaal jo log poochte hain — 'kitne din chalega?' |
|   | factual | text | Toh honestly baat karte hain. |
|   | feeling | text | Ek keratin treatment ki longevity kaafi cheezein decide karti hain: kitni baar shampoo hota hai, konsa shampoo use karte ho, aur baalon ki apni natural texture kaisi hai. |
|   | feeling | text | In sab ka fark padta hai. |
|   | factual | text | Aur ek baat — treatment khatam hone ke baad bhi hair ek dum pehle jaisa nahi ho jaata. |
|   | feeling | text | Kuch softness aur smoothness time ke saath bhi rehti hai. |
|   | factual | text | Hamare yahan ek session 90 minutes ka hota hai, ₹3500 mein. |
|   | feeling | text | Slot book karna ho toh yahan jaao: /book/shine-studio |
|   | feeling | hashtags | #KeratinTreatment |
|   | feeling | hashtags | #ShineStudioIndore |
|   | feeling | hashtags | #HairCareHonestly |

---

## salon-04 — Shine Studio (services) · whatsapp · unknown_claim

**Watch for:** a salon ships nothing. The owner's prompt is asking for nonsense

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hey! |
|   | question | message | Just a heads up — shipping on treatments? |
|   | feeling | message | Nahi hai. |
|   | feeling | message | Keratin treatment aur haircut dono directly book kar sakte ho. |
|   | factual | message | Keratin ₹3500 mein (90 min) ya haircut ₹400 mein (30 min). |
|   | feeling | message | Book karo jab convenient ho 🎯 |
|   | feeling | message | book. |
|   | feeling | message | shine-studio pe appointment fix karo! |
|   | feeling | message | Reply STOP to stop these messages. |

---

## salon-05 — Shine Studio (services) · email · complete_facts

**Watch for:** 'ammonia wale products use nahi karte' is recorded in Hinglish. Does the English claim pass?

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Shine Studio mein aapka swagat hai! |
|   | feeling | previewText | Aur ek cheez jo aapko jaanni chahiye apne baalo ke baare mein. |
|   | feeling | headline | Aapke baal, aapki care |
|   | feeling | intro | Shine Studio family mein aapka bahut swagat hai! |
|   | factual | intro | Hum khush hain ki aap yahan hain — ab baat karte hain aapke baalo ki. |
|   | factual | bullets | Hamare Keratin Treatment mein hum ammonia-free products use karte hain — matlab smoother results, bina harsh chemical smell ke |
|   | question | bullets | 60 minute ka time nahi? |
|   | factual | bullets | Sirf 30 min mein clean, sharp haircut bhi mil sakti hai |
|   | feeling | bullets | Booking simple hai — seedha appoint karo, koi wait nahi |
|   | feeling | ctaLabel | Appointment Book Karo |
|   | feeling | product | Keratin treatment |
|   | feeling | body | Shine Studio family mein aapka swagat hai! |
|   | feeling | body | Hum khush hain ki aap yahan hain. |
|   | factual | body | Ek baat jo aapko pehle hi batana chahte hain — hamare Keratin Treatment mein hum ammonia-free products use karte hain. |
|   | feeling | body | Iska matlab hai ki aapke baal smoothen hote hain bina us harsh chemical process ke jo aksar uncomfortable lagti hai. |
|   | factual | body | Keratin treatment sirf ₹3500 mein 90 minutes mein hoti hai. |
|   | factual | body | Ya agar simple haircut chahiye, toh woh bhi 30 minutes mein ₹400 mein available hai. |
|   | feeling | body | Jab bhi ready ho, appointment book karo — hum aapka intezaar karenge. |

---

## salon-06 — Shine Studio (services) · lead_message · complete_facts

**Watch for:** the booking link must be the real one, never invented

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hey Ravi! |
|   | question | message | Bas ek quick check-in — aapne Shine Studio ke baare mein socha kya? |
|   | factual | message | Haircut ho ya Keratin treatment, dono ke liye slots available hain — Haircut sirf ₹400 mein 30 min mein ho jaata hai, aur Keratin ₹3500 mein baalon ko smoothness deta hai jo kaafi time tak rehti hai 😊 |
|   | feeling | message | Agar book karna ho toh yahan se kar sakte ho: /book/shine-studio |

---

## salon-07 — Shine Studio (services) · facebook_post · unknown_claim

**Watch for:** no award is on record

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Jab baal theek nahi baithe, toh mood bhi theek nahi rehta — yeh hum sab jaante hain. |
|   | factual | text | Shine Studio mein haircut sirf 30 minute ka kaam hai, par yahan face shape, lifestyle aur hair texture — sab dekhke kiya jaata hai. |
|   | feeling | text | Koi rush nahi, koi shortcuts nahi. |
|   | factual | text | Keratin karwana ho toh woh ek dedicated 90-minute session hai — pura time milta hai, bina jaldi ke. |
|   | factual | text | Haircut ₹400 mein, keratin treatment ₹3500 mein. |
|   | question | text | Indore mein ho aur ek achha stylist dhundh rahe ho? |
|   | cta | text | Book kar lo — link neeche comments mein hai. |
|   | feeling | cta | Haircut book karo: /book/shine-studio \| Keratin book karo: /book/shine-studio |
|   | feeling | hashtags | #ShineStudio |
|   | feeling | hashtags | #IndoreSalon |
|   | feeling | hashtags | #HairCareIndore |
|   | factual | note_for_owner | IMPORTANT: No ratings, reviews or testimonials are on record for your business. |
|   | feeling | note_for_owner | This post sells the services on their own merits without inventing social proof. |
|   | factual | note_for_owner | Once you have customer reviews or ratings, share them and we can include them accurately. |

---

## salon-08 — Shine Studio (services) · whatsapp · language

**Watch for:** the brand language is hinglish but the owner asked for english — the setting or the ask?

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hey! |
|   | feeling | message | Fresh haircut ke liye aao. |
|   | factual | message | Clean, sharp cut sirf ₹400 mein, 30 mins mein done. |
|   | cta | message | Book your slot now /book/shine-studio ✂️ |
|   | feeling | message | Reply STOP to stop these messages. |

---

## salon-09 — Shine Studio (services) · facebook_post · verification_failure

**Watch for:** no records: a duration or a price invented here is the worst outcome

**The records this business actually has:**

- _none — the records could not be read_

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | Agar har subah uthke baal dekh ke dil thoda sink karta hai — frizz, poofiness, aur wo stubborn waves jo kabhi settle nahi hote — toh tumhare liye hi hai ye post. |
|   | feeling | text | Keratin treatment ke baad jo smoothness aati hai na, wo sirf looks ke baare mein nahi hoti. |
|   | feeling | text | Woh feeling hoti hai jab tum baalon mein haath pherte ho aur sab kuch just... |
|   | feeling | text | theek rehta hai. |
|   | factual | text | No fighting with the dryer for 40 minutes. |
|   | feeling | text | No humidity drama. |
|   | factual | text | Bas clean, soft, manageable hair — din bhar. |
|   | factual | text | Hum keratin carefully apply karte hain — har texture alag hota hai, aur hum wahi karte hain jo tumhare baalo ko actually suit kare. |
|   | question | text | Sochh rahi ho? |
|   | feeling | text | Shine Studio mein aake ek baar baat karo — we'll tell you exactly what to expect. |
|   | feeling | hashtags | #KeratinTreatment |
|   | feeling | hashtags | #ShineStudio |
|   | feeling | hashtags | #SmoothHairDays |

---

## salon-10 — Shine Studio (services) · email · capability_claim

**Watch for:** a claim about what the business or Hawlai will do automatically

**The records this business actually has:**

- catalogue: Keratin treatment = 3500 (Ninety minutes, one session)
- catalogue: Haircut = 400 (Thirty minutes)
- shipping: nothing is shipped
- the owner wrote: "Pehle hair wash, phir treatment lagate hain."
- the owner wrote: "Ninety minutes lagte hain."
- material.use = false

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | subject | Welcome to Shine Studio — yahan aapka haircare sorted hai |
|   | feeling | previewText | Har mahine automatic rebooking — taaki aap kabhi miss na karo. |
|   | feeling | headline | Aapka Shine Studio mein swagat hai! |
|   | feeling | intro | Ab haircare ke liye yaad rakhne ki zaroorat nahi — hum har mahine automatically aapki appointment rebook kar dete hain. |
|   | feeling | intro | Bas ek baar aayein, baaki hum sambhal lete hain. |
|   | feeling | bullets | Har mahine automatic rebooking — no calls, no hassle |
|   | factual | bullets | Keratin treatment (₹3500) ya Haircut (₹400) — jo aapko chahiye |
|   | feeling | bullets | Appointment cancel ya reschedule karna ho toh sirf humein batayein |
|   | feeling | ctaLabel | Book Your Appointment |
|   | feeling | body | Shine Studio mein aapka swagat hai! |
|   | factual | body | Ab haircare ke liye baar baar yaad rakhne ki zaroorat nahi — hum har mahine automatically aapki appointment rebook karte hain taaki aapke baal hamesha acche rahen. |
|   | factual | body | Pehli baar aayein, apni service choose karein — Keratin Treatment (₹3500, 90 min) ya Haircut (₹400, 30 min) — aur baaki hum handle karte hain. |
|   | feeling | body | Koi bhi change karna ho toh bas humein bata dijiye, hum adjust kar denge. |
|   | feeling | body | Chalein, pehli booking karein! |

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
|   | feeling | subject | Welcome to Shree Dairy — your ghee is made the old way |
|   | factual | previewText | Hand-churned, slow-set, and ready when you are. |
|   | feeling | headline | Good ghee, made the right way |
|   | feeling | intro | Welcome — glad you found us. |
|   | factual | intro | At Shree Dairy, our desi ghee is made using the bilona method, where curd is churned by hand before the ghee is slow-cooked. |
|   | factual | intro | It takes longer, but that is the point. |
|   | factual | bullets | 500 ml jar of bilona desi ghee — ₹850 |
|   | factual | bullets | Flat ₹50 shipping on every order |
|   | factual | bullets | Use code FIRST10 for 10% off your first order |
|   | feeling | ctaLabel | Order your ghee |
|   | factual | product | Desi ghee 500ml |
|   | feeling | body | Welcome — glad you found us. |
|   | factual | body | At Shree Dairy, our desi ghee is made using the bilona method, where curd is churned by hand before the ghee is slow-cooked. |
|   | factual | body | It takes longer, but that is the point. |
|   | factual | body | A 500 ml jar is priced at ₹850, with flat ₹50 shipping. |
|   | factual | body | If this is your first order, use code FIRST10 for 10% off. |
|   | feeling | body | Tap the button to place your order — we will take it from there. |

---

## dairy-02 — Shree Dairy (food) · facebook_post · complete_facts

**Watch for:** free shipping is FALSE here — shipping is 50 flat

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | There is something about ghee made the slow way that you can tell the moment it hits the pan — the colour, the smell, the way it settles into whatever you are cooking. |
|   | factual | text | Our desi ghee is made using the bilona method, where curd is churned by hand before the butter is gently heated down into ghee. |
|   | factual | text | It takes longer. |
|   | feeling | text | That is the point. |
|   | factual | text | A 500 ml jar is priced at ₹850, with a flat ₹50 shipping fee on every order. |
|   | factual | text | If this is your first order with us, use code FIRST10 for 10% off. |
|   | factual | text | We are based in Indore and we make this in small batches — not because it sounds good, but because that is the only way this method works. |
|   | feeling | text | Find us at /site/shree-dairy |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #ShreeDairy |

---

## dairy-03 — Shree Dairy (food) · facebook_post · unknown_claim

**Watch for:** a health claim about food. The strictest category there is

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | factual | text | Most of us have grown up watching ghee go into the dal, the roti, the khichdi — a small spoonful that made everything taste like it was cooked with care. |
|   | factual | text | At Shree Dairy, we make our desi ghee using the Bilona method: curd is hand-churned first, and the butter is then clarified slowly. |
|   | factual | text | It is the older way, and we make it in small batches here in Indore. |
|   | factual | text | A 500 ml jar is priced at ₹850, with delivery at ₹50 flat. |
|   | factual | text | If this is your first order, use code FIRST10 for 10% off. |
|   | cta | text | You can order at /site/shree-dairy. |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #ShreeDairy |

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
|   | feeling | subject | Welcome to Shree Dairy — here's what to expect |
|   | feeling | previewText | Fresh paneer and pure desi ghee, made the right way. |
|   | feeling | headline | Glad you found us. |
|   | feeling | intro | Welcome to Shree Dairy. |
|   | feeling | intro | We make two things — fresh paneer and pure desi ghee — and we put real care into both. |
|   | factual | bullets | Our paneer is made fresh every morning, in small batches. |
|   | factual | bullets | Our desi ghee is prepared using the traditional Bilona method — slow, hand-churned, and nothing added. |
|   | factual | bullets | Use code FIRST10 at checkout for 10% off your first order. |
|   | feeling | ctaLabel | See our products |
|   | feeling | body | Welcome to Shree Dairy. |
|   | feeling | body | We make two things — fresh paneer and pure desi ghee — and we put real care into both. |
|   | feeling | body | The paneer is made every morning, so what reaches you is genuinely fresh. |
|   | factual | body | The desi ghee is prepared using the traditional Bilona method, slow and hand-churned. |
|   | factual | body | As a new customer, you can use code FIRST10 at checkout to get 10% off your first order. |
|   | factual | body | Shipping is a flat ₹50 on every order. |
|   | feeling | body | We are glad to have you here. |

---

## dairy-05 — Shree Dairy (food) · whatsapp · complete_facts

**Watch for:** 'made fresh every morning' is recorded; the opt-out line must survive the guard

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Fresh paneer made daily, now in Indore 🥛 |
|   | factual | message | 250g for ₹120. |
|   | factual | message | Get 10% off your first order. |
|   | cta | message | Order now: /site/shree-dairy |
|   | feeling | message | Reply STOP to stop these messages. |

---

## dairy-06 — Shree Dairy (food) · facebook_post · complete_facts

**Watch for:** the licence number is recorded. Is it quoted correctly, digit for digit?

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | When you buy dairy for your family, you are trusting someone with what ends up on the table. |
|   | factual | text | That trust deserves more than good intentions — it deserves accountability. |
|   | feeling | text | It is not just a number on a label. |
|   | feeling | text | It is a commitment that what we make — paneer set fresh every morning, and desi ghee made by the bilona method — is produced responsibly, every single day. |
|   | factual | text | Fresh paneer at ₹120 for 250g. |
|   | factual | text | Bilona desi ghee at ₹850 for 500ml. |
|   | feeling | text | And a licence that tells you we are not cutting corners. |
|   | factual | text | Order at /site/shree-dairy — use code FIRST10 for 10% off your first order. |
|   | factual | text | Shipping is ₹50 flat. |
|   | feeling | hashtags | #FSSAILicensed |
|   | feeling | hashtags | #ShreeDairy |
|   | feeling | hashtags | #IndoreDairy |

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
|   | feeling | subject | Welcome to Shree Dairy — glad you're here |
|   | factual | previewText | Fresh paneer, real ghee, and a little something for your first order. |
|   | factual | headline | Good food starts with good ingredients |
|   | feeling | intro | Welcome to Shree Dairy. |
|   | feeling | intro | We make two things — fresh paneer and traditionally prepared desi ghee — and we make them carefully, every single day. |
|   | factual | bullets | Our desi ghee is made using the Bilona method, which churns cultured curd by hand rather than processing cream at scale — the way most supermarket ghee is made. |
|   | feeling | bullets | Our paneer is prepared fresh each morning, not stored for days before it reaches you. |
|   | factual | bullets | Use code FIRST10 at checkout for 10% off your first order. |
|   | feeling | ctaLabel | See our products |
|   | feeling | body | Welcome to Shree Dairy. |
|   | feeling | body | We make two things — fresh paneer and traditionally prepared desi ghee — and we put real care into both. |
|   | factual | body | Our desi ghee is made using the Bilona method, churning cultured curd rather than processing cream at volume the way most supermarket brands do. |
|   | feeling | body | Our paneer is made fresh every morning. |
|   | feeling | body | That is the whole idea: simple, honest food you can taste the difference in. |
|   | factual | body | Use code FIRST10 on your first order for 10% off. |
|   | factual | body | Shipping is a flat ₹50 on every order. |
|   | feeling | body | We are glad you found us. |

---

## dairy-08 — Shree Dairy (food) · lead_message · complete_facts

**Watch for:** the 10% code is real — using it here is correct, inventing a bigger one is not

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | question | message | Hey Ravi, just checking in — did you get a chance to look at the ghee and paneer we mentioned? |
|   | factual | message | Fresh paneer every morning and ghee made the slow Bilona way — both available now, and your first order gets 10% off with code FIRST10. |
|   | feeling | message | Drop a reply if you'd like to place an order or have any questions! |
|   | feeling | message | 😊 |

---

## dairy-09 — Shree Dairy (food) · facebook_post · unknown_claim

**Watch for:** the recorded row says people WRONGLY think this. The row is a misconception, not a fact

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

**Already removed by the guard (not yours to score):**

- "different from the" — a comparison with another product that nothing on record supports

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | text | There is a long-standing assumption that ghee leads to weight gain — but that idea deserves a closer look. |
|   | feeling | text | Whether it is drizzled over dal or stirred into a warm bowl of rice, a little goes a long way. |
|   | factual | text | At Shree Dairy, our desi ghee is made using the Bilona method — small-batch, no shortcuts. |
|   | factual | text | A 500 ml jar is ₹850. |
|   | factual | text | If it is your first order, use code FIRST10 for 10% off. |
|   | factual | text | Delivery is ₹50 flat. |
|   | cta | text | Order here: /site/shree-dairy |
|   | feeling | hashtags | #DesiGhee |
|   | feeling | hashtags | #BilonaGhee |
|   | feeling | hashtags | #ShreeDairy |

---

## dairy-10 — Shree Dairy (food) · whatsapp · unknown_claim

**Watch for:** shipping is 50 flat. Free delivery is false and the prompt asks for it directly

**The records this business actually has:**

- catalogue: Desi ghee 500ml = 850 (Bilona method)
- catalogue: Paneer 250g = 120 (Made fresh every morning)
- shipping: flat 50
- process.traditional = true
- the owner wrote: "Haath se churn karte hain."
- the owner wrote: "FSSAI licence 11223344556677."

| verdict | kind | field | sentence |
|---|---|---|---|
|   | feeling | message | Hi! |
|   | factual | message | Quick update — we're covering *delivery* on all orders now. |
|   | feeling | message | Fresh ghee and paneer, straight to your door. |
|   | factual | message | ₹50 flat charge, same quality. |
|   | factual | message | Use code FIRST10 for 10% off your first order. |
|   | question | message | Ready to order? |
|   | feeling | message | Head to /site/shree-dairy 🥛 |
|   | feeling | message | Reply STOP to stop these messages. |