# Live check — Phase 3.5 (sirf 3 screens)

**Business: candle_by_qaaf. Time: 15 minute.**

> ### ⛔ Pehle ye padh lo
> **Kisi bhi card par Approve, Publish, Send ya "Send via WhatsApp"
> MAT dabana.** Hum sirf dekh rahe hain ki Hawlai kya likhta hai.
> Kuch bhejna nahi hai. Main bolunga tab dabana.

Har surface par 4 cheezein dekhni hain:
**kya type karna hai → kya dikhna chahiye → kya NAHI dikhna chahiye → DB (sirf agar likha ho)**

---

## 1. Email card

**Kya type karna hai** — Master Chat kholo, ye likho:

```
candle_by_qaaf ke liye welcome email likho, lavender candle ke baare mein
```

**Kya dikhna chahiye**

1. Ek email card — usme **Subject**, **Preview** aur **Body** dikhega.
2. Body chhoti honi chahiye aur **customer se shuru** honi chahiye
   (jaise "Shaam ko ghar shor karta hai…"), owner ki kahani se nahi.
3. Price aur agla kadam (order kahan karna hai) **body ke andar** hona
   chahiye — sirf aakhir mein ek line nahi.
4. Agar Hawlai ne koi line hataai, to card ke neeche **ek chhota note**
   hoga: kya hata aur kyun.

**Kya NAHI dikhna chahiye**

- `Concrete_details_used`, `Facts_used`, `FACTS_AVAILABLE`, `_claimsNote`
  jaisa koi label
- Koi lamba UUID (jaise `8f3b2c1e-…`)
- Koi aisa discount ya offer jo tumne record nahi kiya ("50% off",
  "free shipping")
- "500+ happy customers", "India ka number 1" jaisa koi count ya ranking
- "Sleep better", "stress buster" — **agar dikhe to uske saath note
  hona chahiye.** Note ke bina dikhe to galat hai.
- "Non-toxic", "safe for babies" — **ye kabhi nahi dikhna chahiye**

**DB check** — nahi chahiye. Card dekh kar bas aage badho.

---

## 2. Facebook caption

**Kya type karna hai** — usi chat mein:

```
write a facebook post about the lavender candle
```

**Kya dikhna chahiye**

1. Ek caption card, aur neeche "Saved to Content".
2. Caption **150 word se kam**. Mota-moti: screen par 1 chhota paragraph,
   pura screen bhar ke nahi.
3. Shuruaat customer ki baat se — "shaam", "ghar", "khushbu" — na ki
   "Main ne seekha…" se.
4. Soy wax / 40 hour burn / 550 jaisi **asli baat** andar honi chahiye.
5. Agar Hawlai ne caption chhota kiya, to note kahega ki usne kitni
   line kaati.

**Kya NAHI dikhna chahiye**

- Owner ki kahani pura caption — "Main ne hard way seekha",
  "wo batch ghar se bahar nahi gaya", "main khud roz jalati hoon"
- "cheap synthetic alternatives", "unlike most candles",
  "most candles don't", "separates X from Y" — doosre ke product ke
  baare mein koi baat
- "the scent lasts", "twenty minutes mein khatam" — kitni der chalega
  iska koi daava jo record mein nahi hai
- `Concrete_details_used` jaisa label
- 189 word jaisa lamba caption

**DB check** (optional, 1 minute) — Supabase mein:

```sql
select created_at, content_type, left(output->>'text', 120) as caption
from content_pieces
where dealership_id = (select id from dealerships where dealership_name ilike '%qaaf%')
order by created_at desc
limit 1;
```

Caption wahi hona chahiye jo screen par dikha.

---

## 3. Lead follow-up

**Kya type karna hai** — chat nahi. **Leads** page kholo.

1. Koi ek lead par click karo (jo pehle se bana hua hai).
2. **"WhatsApp Message"** button dabao.

**Kya dikhna chahiye**

1. Ek chhota message — 2 se 4 line.
2. Lead ka **naam** aur usne jo poocha tha (jaise lavender candle) uska
   zikr.
3. Agar price hai to **asli** price (550), aur ek saaf agla kadam
   ("rakh doon?", "call kar sakte hain?").

**Kya NAHI dikhna chahiye**

- "50% off", "free delivery", ya koi bhi offer jo tumne record nahi kiya
- "India ka number 1", "best in Shahjahanpur"
- Ekdum template jaisa message — "Looking for the perfect gift? We have
  amazing products for everyone." Aisa aaye to Hawlai ko khud kehna
  chahiye ki ye theek nahi hai.
- `_factsState`, `publishable` jaisa koi label

> ⛔ **"Send via WhatsApp" MAT dabana.** Message bas padh lo.

**DB check** — nahi chahiye.

---

## Agar kuch galat dikhe

Bas **wo line copy karke mujhe bhej do**, aur likh do kaunsa number tha
(1, 2 ya 3). Screenshot ki zaroorat nahi. Mujhe 3 cheezein chahiye:

1. Tumne kya type kiya / kaunsa button dabaya
2. Screen par kya aaya (jo galat laga wo line)
3. Kaunsa surface tha — email, facebook, ya lead

Sab theek dikhe to bas **"3 ke 3 theek"** likh dena.

---

### Ye check kya dekh raha hai

Phase 3.5 mein 15 generator ek hi darwaze se guzarne lage.
Email, Facebook caption aur lead message — teeno ka raasta badla hai.
Teeno mein se **lead message ke paas pehle koi check hi nahi tha**.
Ye check bas ye dekh raha hai ki naya raasta live screen par
sach mein kaam karta hai — code mein to 3922 test pass hain, lekin
**live screen par kuch verify nahi hua hai.**
