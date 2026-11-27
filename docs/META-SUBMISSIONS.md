# Two Meta submissions for Seller Mode — ready to paste

Written 28 November 2026. **Both need the founder's own Meta login** — a
WhatsApp Business account token for the template, the Meta developer
dashboard plus a screen recording and business documents for App Review.
Neither can be done from the codebase. Both are queues, so they start now.

---

## 1. The WhatsApp template `order_payment_check` (Utility)

Sent to the **seller** when a customer orders in an Instagram DM, because
a business-initiated WhatsApp message outside 24 hours of the person's
last message must be an approved template. The order id travels as the
button payload at send time, so two pending orders are never confused.

### Wording, and why it is Utility

> **New order {{1}} for ₹{{2}} from {{3}}. Has this payment reached your
> UPI account?**
>
> Buttons (Quick Reply): **Yes, received** · **Not yet**

It is about one specific transaction, it asks a yes/no about it, and it
carries no offer, discount or call to buy — the three things that got
`approval_waiting_v2` reclassified as Marketing. Sample values are
ordinary, because Meta's classifier reads the body **with** them.

### Option A — WhatsApp Manager (no code)

WhatsApp Manager → **Message templates** → **Create template** →
Category **Utility** → name `order_payment_check` → language **English**
→ paste the body → add the two Quick Reply buttons → samples
`#1042`, `1,299`, `Priya` → **Submit**.

### Option B — Graph API (how `approval_waiting_v2` was submitted)

`POST https://graph.facebook.com/v21.0/<WABA_ID>/message_templates`

```json
{
  "name": "order_payment_check",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "New order {{1}} for ₹{{2}} from {{3}}. Has this payment reached your UPI account?",
      "example": { "body_text": [["#1042", "1,299", "Priya"]] }
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Yes, received" },
        { "type": "QUICK_REPLY", "text": "Not yet" }
      ]
    }
  ]
}
```

**After it is APPROVED**, check the category Meta finally assigned — if it
says MARKETING, do not use it; the wording gets revised instead.

---

## 2. Meta App Review — Advanced Access for Instagram messaging

Until it is granted, Instagram DMs work only for accounts with a role on
the app — the founder's own. Every other business needs this.

### What to request

| Permission | Why Hawlai needs it | Request? |
|---|---|---|
| `instagram_business_basic` | Read the connected account's id and username | **Yes** |
| `instagram_business_manage_messages` | Receive a customer's DM and send the business's reply (auto-reply, Seller Mode) | **Yes — the one that matters** |
| `instagram_business_manage_comments` | Reply to comments | **No — removed from the app on 28 Nov** |

**DECIDED 28 NOV — the comments permission and field are removed** until
comment replies are built (the founder's call). What was weighed: The connect screen
(`src/app/api/auth/instagram/start/route.ts:43`) also asks for
`instagram_business_manage_comments`, and the webhook subscription asks
for `comments` — but **replying to Instagram comments is not built**.
Meta's reviewers commonly reject a submission that requests a permission
the app does not visibly use. The safe order: drop the comments scope
from the connect screen and the subscription until comment replies
exist, then request it with them. (A one-line change each; not made
without the founder's say-so, because it changes what every owner is
asked at connect.)

### Before the request can be submitted

1. **Business Verification** — Meta Business Settings → Security Center →
   Start verification (company documents). Required for Advanced Access.
2. **Privacy policy URL:** `https://hawlai.online/privacy-policy`
3. **Data deletion:** the same page has a "Data Retention & Deletion"
   section — enter `https://hawlai.online/privacy-policy` as the **data
   deletion instructions URL**.
4. App icon, category and contact email filled in under App settings →
   Basic.

### The use-case text for `instagram_business_manage_messages`

> Hawlai is an AI marketing assistant for small businesses in India.
> When a customer sends a business a Direct Message on Instagram, Hawlai
> reads the message and replies on the business's behalf with the
> business's own product prices and availability, taken only from the
> catalog the business entered. If Hawlai cannot answer from those
> records, it tells the customer a person will reply, and notifies the
> business. The business switches this on itself and can switch it off
> at any time. Hawlai does not send promotional messages and only replies
> within Instagram's 24-hour messaging window.

### The screen recording (Meta requires one)

1. Log in to Hawlai → **Integrations** → **Connect with Instagram** →
   Instagram's consent screen (show the permissions) → back in Hawlai,
   connected.
2. From a **different** Instagram account, DM the business: "Do you have
   the lavender candle?"
3. Show the reply arriving in that DM thread.
4. In Hawlai → **Social** → the auto-reply log showing the message and the
   reply.
5. Turn the DM auto-reply off, to show the business is in control.

Keep it under three minutes, with no other accounts' data visible.

### Where

developers.facebook.com → the Hawlai app → **App Review** → **Permissions
and Features** → `instagram_business_manage_messages` → **Request Advanced
Access**.
