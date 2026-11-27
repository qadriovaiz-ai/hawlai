# PLAN — Instagram Seller Mode

> ## REVISION, 28 November 2026 — the founder replaced O4: UPI direct, no gateway
>
> **This section supersedes O4, its Rule 6 rows and the payment-link
> migration below.** Payment goes straight to the seller's own UPI ID:
> zero setup, zero cut, money straight into the seller's account. There
> is **no automatic payment detection** — accepted as a trade-off; the
> seller confirms on WhatsApp instead. Razorpay Route is reconsidered at
> scale, not now. Shopify/WordPress stay post-pilot.
>
> ### The new flow
>
> 1. Customer confirms the read-back → order `new` (shown **Pending**),
>    no side effects.
> 2. Customer is sent the UPI request: the seller's VPA, the amount, the
>    order reference.
> 3. **Seller is told on WhatsApp at once**: order details + "Payment
>    received?" with a Yes / Not yet answer. **One reminder after 15
>    minutes** if there is no answer.
> 4. Seller says yes → order **confirmed**, `applyOrderSideEffects` runs —
>    **stock moves here, at payment confirmation**, not before.
> 5. Customer gets a plain-text invoice: order #, items, amount, business
>    name, date. PDF is phase 2.
>
> ### Four things measured that this flow has to respect
>
> | Fact | Evidence | What it means |
> |---|---|---|
> | **A WhatsApp sender to the owner EXISTS** — the founder's note said it did not | `sendWhatsAppText` in `src/lib/whatsapp/metaClient.ts:115`, used today to message the **owner** (connection codes, task lists — `api/webhooks/whatsapp/route.ts:59-96`) | Not a new sender. **What is missing is different, and bigger:** |
> | **A business-initiated WhatsApp needs an approved TEMPLATE** outside 24 hours of the person's last message | Meta's rule, met on this product already (M4, the `approval_waiting_v2` / `approval_pending_notice` submissions) | The seller has usually not written to Hawlai in the last 24 hours, so **"payment received?" must be a template** — and the template sender was **deleted on 26 Nov** (`49cf3d8f`) when H3 moved to email. **A new Utility template must be submitted to Meta — a queue, like App Review**, and each send is a per-message charge |
> | **WhatsApp replies can already resolve pending items** | `src/lib/whatsapp/suggestionReply.ts` — "a second place to say yes" | The seller's "haan"/"1" reuses this pattern instead of a new one. Buttons on the template carry the **order id**, so two pending orders can never be confused; a typed "haan" with more than one pending order is answered with the list, never guessed |
> | **A `upi://` link may not be tappable inside an Instagram DM** | **unverified** — Instagram links `http(s)`; a custom scheme may show as plain text | The DM carries **three ways to pay, so one always works**: the VPA and amount as copyable text (works in every UPI app), the `upi://pay` link, and a **QR image** (a customer can scan it from their gallery). **No QR library is installed** — one dependency, and the image is served by an API route, **not a new page** (Rule 5) |
>
> ### Rule 6 — the revised rows
>
> | Action | Key | Kind / risk | Runs |
> |---|---|---|---|
> | Send the **UPI payment request** to the customer | `send_upi_request` | send, requests money / high | **Automatic, after the customer's own "yes" to the read-back** — the founder's flow. Stated plainly because it is a money request: Hawlai never holds money, the payee is the seller's own saved VPA, and the amount is catalog price × quantity − a live offer, through the claims guard and **confirmed by the customer** before it is sent |
> | Tell the **seller** on WhatsApp, and remind once at 15 min | `notify_seller_order` | send / low | **Automatic** — to the business's own verified number, about its own order. A per-message charge |
> | **Seller confirms payment** | `confirm_dm_payment` | edit + money / high | **The seller's own answer IS the approval.** One `pending_approvals` record, resolved from WhatsApp **or** the dashboard card — whichever comes first |
> | Invoice text to the customer | `dm_order_update` | send / medium | **Automatic inside 24 hours**; outside, seller-tapped with `HUMAN_AGENT` (FU2) |
>
> **A risk the flow accepts, and the agent must not hide:** stock moves at
> payment confirmation, so two customers can pay for the last unit. The
> agent checks stock when it quotes and never says "payment received"
> before the seller does; an oversell is refunded by the seller.
>
> ### Revised pieces and estimates
>
> Hours are this session's pace — build, tests, mutation checks, gates
> and the DECISIONS entry. Owner queues are not in them.
>
> | Piece | Size | Hours |
> |---|---|---|
> | F1 Conversation memory | S | 1.5–2 |
> | F2 Honest escalation | S | 1.5–2 |
> | F3 Token encryption + refresh | S/M | 3–4 |
> | F4 Seller Mode switch + seller's UPI ID (saved, format-checked) | S | 2 |
> | **WA-T** WhatsApp **template** sender to the seller + the template text to submit | S | 2 + **Meta's template queue** |
> | **UPI** request: VPA text + `upi://pay` link + QR image route | S | 2 |
> | O2 Order-creation function, `orders.channel` | S/M | 3 |
> | O1 Order capture in the conversation | M | 5–6 |
> | O3 One confirm record, resolvable from WhatsApp or the dashboard | M | 4–5 |
> | O4′ Payment confirm by WhatsApp reply, 15-min reminder, invoice text | S/M | 3 |
> | O5 Shipped / delivered | S | 1.5 |
> | V1 Variants as separate products | S | 1.5 |
> | FU1 One nudge inside 24 h | S/M | 3 |
> | FU2 24 h – 7 d, seller-sent | M | 4–5 |
> | T1 Shared post / story reply (payload checked first) | S/M | 3 |
> | T2 Caption-tag sync | M | 5–6 |
> | T3 Vision fallback | M | 5–6 |
> | W1 WhatsApp photo → product | M | 5–6 |
> | **Stats** Order summary on the existing Orders tab, by channel | S | 1.5 |
> | AR Meta App Review | XS | 0.5 + **weeks of queue** |
>
> **Roughly 65–75 hours of build — eight to ten working days** — plus two
> owner-side queues that should start **today**: the WhatsApp template
> and Meta App Review. No piece is L.
>
> ### Migrations, revised — four files
>
> 1. **Seller Mode**: `dealerships.instagram_selling_enabled`,
>    `dealerships.seller_upi_vpa`, `orders.channel`, `orders.upi_reference`
> 2. `dealerships.instagram_access_token_encrypted` (F3)
> 3. notification kinds `dm_needs_reply`, `dm_order_received` —
>    **`pg_get_constraintdef` on the live table first**
> 4. `instagram_media_products` (T2)
>
> `orders.razorpay_payment_link_id` / `payment_link_url` are **dropped**.
>
> ### Two new decisions for the founder
>
> 7. **An order the seller never confirms** — leave it pending, or cancel
>    it automatically after (say) 48 hours and tell the customer?
> 8. **The template's words** (drafted below) — submitted as Utility. The
>    earlier `approval_waiting_v2` was reclassified as Marketing for
>    wording; this one avoids it.
>
> > *Template `order_payment_check` (Utility, en):* "New order {{1}} for
> > ₹{{2}} from {{3}}. Has this payment reached your UPI account?" —
> > quick-reply buttons **Yes, received** / **Not yet**.
>
> ---

**Original plan, 28 November 2026.** Written
28 November 2026 on top of `docs/RESEARCH-INSTAGRAM-DM-SELLING.md`, after
the DM reply chain was made to work in production (signature fix
`da7cfa3e`, account-id fix `b2509a75`).

**What it is:** a capability any business can switch on, with or without
a website — a customer orders inside an Instagram DM, the seller confirms,
the customer pays by a Razorpay link, and the order moves pending →
confirmed → shipped → delivered.

---

## 0. Hinglish mein (Ovaiz ke liye)

**Teen cheezein jo plan badalti hain, code padh ke mili:**

1. **Razorpay payment link kabhi bana hi nahi.** Hawlai sirf Razorpay ka
   Orders API use karta hai website checkout ke liye, aur **Razorpay ka
   koi webhook Hawlai tak nahi aata.** To "jo already use ho raha hai wahi
   reuse karo" — sirf seller ka Razorpay credential reuse hota hai; link
   banana aur "paisa aaya ya nahi" pata karna naya hai.
2. **WhatsApp abhi har photo ignore karta hai** — sirf text padhta hai
   (`inbound.ts:93`). Photo se product banane ke liye pehle photo padhna
   sikhana padega.
3. **Instagram reply bina text wale DM ko skip karta hai**
   (`autoReplyHandler.ts:170`). Customer ne post share kiya aur kuch
   type nahi kiya — use koi jawab nahi jaata. Product-tagging ke liye ye
   pehle theek karna hoga.

**Paisa aur Rule 6:** order "pending" banana automatic hai (kuch charge
nahi hota, stock nahi ghatta). **Order confirm karna + payment link
bhejna = seller ka ek tap (approval).** Har action ki list §3 mein.

**Meri recommended order:** pehle neenv (memory, honest escalation,
token, switch) → phir order + payment → phir follow-up → phir tagging →
phir WhatsApp se product. App Review aaj hi shuru — wo queue hai.

---

## 1. Facts measured before sizing

| Fact | Where | Consequence |
|---|---|---|
| Razorpay is used only through **Orders** (`/v1/orders`, `/v1/payments`) for website checkout | `grep api.razorpay.com` → 4 calls, all orders/payments | A payment **link** is a new call, made with the same credential |
| **No Razorpay webhook** exists | `src/app/api/webhooks/` has none | "Paid" must be learned by asking Razorpay (poll), or by a webhook each seller configures — see decision 3 |
| The seller's Razorpay credential is read by `loadRazorpayConnection` | `src/lib/payments/razorpayConnection.ts:86` | Reused as is. **Connect-with-Razorpay (migration 178) is not confirmed live**, so the pilot uses the pasted-keys mode |
| Orders already carry `status`, `payment_status`, `payment_method`, `lead_id` | migrations 054, 058, 142 | Pending → delivered needs no new status column |
| The Orders tab knows `new, confirmed, shipped, delivered, cancelled` | `OrdersPanel.tsx:23` | "Pending" is shown for `new`; nothing renamed |
| `applyOrderSideEffects` decrements stock, counts the discount, emails the owner, and reports a **Purchase** to Meta | `src/lib/orderFulfillment.ts:82` | **Must run at CONFIRM, not at pending** — a pending DM order is not a purchase, and decrementing stock for an unconfirmed order lets anyone lock stock by typing |
| A chat tool `add_product` already inserts products | `masterBrainV2.ts:4102` | WhatsApp product intake can reuse it — the new part is the photo |
| WhatsApp inbound **skips every non-text message** | `src/lib/whatsapp/inbound.ts:93, 120` | Photos need reading first |
| The Instagram reply **skips any DM without text** | `autoReplyHandler.ts:170` | A shared post with no words gets no answer today |
| The DM reply is **one message, no memory** | `socialManagementAgent.ts:94` | Order-taking needs the thread first |

## 2. The pieces, sized

### Foundation — the outstanding items, and why they come first

| # | Piece | Reuse / new | Size |
|---|---|---|---|
| **F1** | **Conversation memory** — the last turns of this sender's thread from `auto_reply_log` (`source_id`, `incoming_text`, `reply_text`), plus the 24-hour window computed from the customer's last message | adapt | **S** |
| **F2** | **Honest escalation** — when the claims guard withholds a reply, the customer gets an honest holding line (inside the window) and the **seller is notified at once**; the question goes to `answer_gaps` as `instagram_dm`. Bundled with the H1/H2 pattern: a withheld reply is recorded, never silent | adapt + 1 notification kind | **S** |
| **F3** | **Instagram token encryption + refresh** — the token behind `oauthSecrets`, a daily refresh (`refresh_access_token`, the token must be ≥24h old), a refresh failure recorded as `needs_reconnect` through `recordHealth`. Five readers updated (callback, reply handler, probe, settings route, refresh) | adapt + 1 column | **S/M** |
| **F4** | **The Seller Mode switch** — separate from "reply to DMs"; registered in `AUTOMATION_TOGGLES`, so **switching on asks, switching off never does** (Rule 6) | adapt + 1 column | **S** |

### Orders and payment — the core

| # | Piece | Reuse / new | Size |
|---|---|---|---|
| **O1** | **Order capture in the conversation** — product (from the catalog, by id), quantity, name, phone, address, gathered over turns; a **read-back** the customer must answer "yes" to; only then an order. Every stated price and stock passes the claims guard | new on F1 | **M** |
| **O2** | **One order-creation function** — extracted from `api/public/orders` so checkout and DMs share it (no self-calls); `orders.channel` so an order says it came from Instagram; created as `new` (shown "Pending") **with no side effects** | adapt + 1 column | **S/M** |
| **O3** | **Seller confirms = an approval card** — "Confirm order #, ₹X, and send the payment link?" On approve: `confirmed`, `applyOrderSideEffects`, the link created and sent | adapt (approval infra) | **M** |
| **O4** | **Razorpay payment link** — created with the seller's own credential, `reference_id` = the order, Razorpay's own SMS/email off (the DM carries it), an expiry; columns for the link id and URL. **"Paid" learned by asking Razorpay** on the 2-minute dispatcher until paid or expired — no setup for the seller (decision 3) | new | **M** |
| **O5** | **Shipped / delivered** — the seller changes it on the Orders tab (exists); telling the customer is a seller-tapped message, because it is usually outside the 24 hours | adapt | **S** |
| **V1** | **Variants as separate products** — "Kurta – Red – M" as its own product, stock its own; the agent groups siblings by name when asked "do you have M?". No schema | adapt (prompt + catalog note) | **S** |

### Follow-up — inside Meta's rule

| # | Piece | Size |
|---|---|---|
| **FU1** | **One automated nudge inside the 24 hours** — a customer who was quoted and went quiet gets one message before the window closes, scheduled on `agent_tasks.scheduled_for` (130), the window re-checked at send time. Never more than one per conversation | **S/M** |
| **FU2** | **24 hours to 7 days: seller-sent only** — a drafted message on an approval card, sent with the `HUMAN_AGENT` tag when the seller taps. After 7 days, nothing (decision 4) | **M** |

**The "2–3 days later" idea, as written, is outside what Meta allows** when
the customer has not replied: automated only inside 24 hours, a human up
to 7 days, nothing after.

### Product tagging

| # | Piece | Size |
|---|---|---|
| **T1** | **A DM that points at a post** — read the shared post / story reply in the message (today a DM with no text is skipped), so the agent knows which post the customer means. **The exact payload shape is unverified** and is checked against one real share first | **S/M** |
| **T2** | **Caption tag sync** — read the account's recent posts (`/{ig-user-id}/media?fields=caption,media_url,permalink`), parse `#HawlaiTag: Product Name`, match to a product name; an ambiguous or unknown name links nothing and tells the seller. A small mapping table, post → product. Daily, and on demand when a DM names an unknown post | **M** + 1 table |
| **T3** | **Vision fallback** — through `lib/ai/claude.ts`, the post's image against the catalog's photos; cached per post. **High confidence still asks the customer "is it the X?"** before quoting; low confidence asks "which product?" A vision guess is never stated as fact (decision 6) | **M** |

### WhatsApp product intake

| # | Piece | Size |
|---|---|---|
| **W1** | **Photo + details on WhatsApp → a catalog entry** — from the **owner's verified number only**; read image messages (today skipped), download through the Graph media edge, store the photo, hand caption + photo to the existing `add_product` tool; the product created **inactive** until the owner says it is right | **M** |

### Meta App Review

| # | Piece | Size |
|---|---|---|
| **AR** | **Advanced Access for `instagram_business_manage_messages`, plus Business Verification** — a queue, owner-side. Needs a screencast of the DM flow and a privacy policy URL. Start today; nothing here waits on it for the pilot on your own account | **XS** for code, weeks of queue |

## 3. Rule 6 — what runs by itself, and what asks

| Action | Registry key (new unless noted) | Kind / risk | Runs |
|---|---|---|---|
| Answer a DM | `auto_reply_dm` (exists) | send / medium | **Automatic** |
| Create a **pending** order from a confirmed read-back | `create_dm_order` | create / medium | **Automatic** — nothing charged, no stock moved, the seller sees it |
| **Confirm an order and send the payment link** | `confirm_dm_order` | send, requests money / high | **APPROVAL — the seller's tap** |
| One nudge inside 24 hours | `dm_followup` | send / medium | **Automatic**, once, window checked at send |
| A message from 24 hours to 7 days | `dm_human_message` | send / high | **APPROVAL** — seller-sent, `HUMAN_AGENT` |
| "Your order has shipped" | `dm_order_update` | send / medium | **APPROVAL** when outside 24 hours; automatic inside |
| Link a post to a product from its caption tag | `link_post_product` | edit internal / low | **Automatic** |
| Product from a WhatsApp photo | `add_product` (exists — its policy is checked in W1) | create / low | **Automatic, created inactive** |
| Switch Seller Mode **on** | `AUTOMATION_TOGGLES` entry | — | **APPROVAL** — Phase 2B's rule |
| Switch Seller Mode **off** | — | — | **Never gated** — the safe direction is never the slow one |

`tests/approvalCoverage.test.ts` gains the new senders, so a later change
that reaches them directly fails.

## 4. Migrations (Rule 4 — live constraint checked first, SQL + verify pasted)

1. `orders.channel`, `orders.razorpay_payment_link_id`, `orders.payment_link_url` (O2, O4)
2. `dealerships.instagram_selling_enabled` (F4)
3. `dealerships.instagram_access_token_encrypted` (F3)
4. notification kinds `dm_needs_reply`, `dm_order_received` — **`pg_get_constraintdef` on the live table first**
5. `instagram_media_products` — post → product (T2)

## 5. Recommended order

| Order | Pieces | Why here |
|---|---|---|
| **1** | **F1, F2** | Order-taking is a conversation; and a withheld reply must stop being silent before money is involved |
| **2** | **F3, F4** | The token dies on a schedule without F3; F4 is the switch everything else hangs on |
| **3** | **O2 → O1 → O3 + O4** | The order, then capturing it, then confirming and paying |
| **4** | **V1, FU1** | Small, and they make O1 usable for a real catalog |
| **5** | **T1 → T2 → T3** | T1 first: it also fixes the silent no-text DM |
| **6** | **W1, O5, FU2** | Intake and the after-sale messages |
| **Now, in parallel** | **AR** | A queue |

**Total, roughly:** foundation S+S+S/M+S; orders M+S/M+M+M+S+S; follow-up
S/M+M; tagging S/M+M+M; WhatsApp M. Five migrations.

## 6. What the founder needs to decide

1. **The order above** — or a different one.
2. **Stock moves at confirm, not at pending** (recommended) — so a typed
   order cannot lock stock.
3. **"Paid" by asking Razorpay every two minutes** (recommended, zero
   setup for the seller) — or a Razorpay webhook, which each seller would
   have to configure in their own Razorpay dashboard, against the
   automate-by-default rule.
4. **A seller who confirms after the customer's 24 hours** — send the link
   with `HUMAN_AGENT` on the seller's tap (it is the seller's decision,
   which is the closest reading of "human agent", but it is a reading), or
   ask the seller to confirm within 24 hours.
5. **Cash on delivery** when the seller has no Razorpay connected — allowed,
   or Seller Mode requires Razorpay?
6. **A vision match always asks the customer to confirm** before quoting
   (recommended).

## 7. Unverified, stated rather than assumed

- **The shared-post / story-reply payload shape** in an Instagram DM —
  checked against one real share before T1 is built.
- **Whether a seller's Razorpay account has Payment Links enabled** —
  most do by default; the first real link will say.
- **Whether a one-tap seller send counts as `HUMAN_AGENT`** under Meta's
  policy.
- **Nothing here has run.** The reply chain is confirmed live; everything
  in this plan is built on top of it and untested.
