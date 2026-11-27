# RESEARCH — Instagram DM Selling

**Audit and plan only. No code was written for this.** Measured on
27 November 2026 against the repository at `c302687b` and against
production, read-only.

**What was asked:** Instagram as an order-taking channel, as a
**capability any business can switch on** — a seller whose whole business
is Instagram, and an established brand with its own website that does not
take orders on Instagram yet. The agent answers price and stock, mentions
live offers, takes name / phone / address, confirms the order, follows up
on a quiet conversation, creates the order in Hawlai, tells the seller,
tracks it through stages, and never guesses a fact the catalog does not
hold.

---

## 0. Hinglish mein (Ovaiz ke liye)

**Sabse badi baat: iska aadha hissa pehle se bana hua hai — par aaj tak
ek bhi DM live kaam nahi kiya.** `src/lib/webhooks/autoReplyHandler.ts`
Instagram DM aane par business pehchanta hai, catalog + business knowledge
se jawab banata hai, claims-guard ("publish" mode, sabse sakht) lagata hai,
lead banata hai, aur `graph.instagram.com` se reply bhejta hai. Lekin
production mein:

- `candle_by_qaaf` ka **Instagram token mar chuka hai** — Instagram ne
  khud `401, code 190: session invalidated` bola.
- Account **kabhi webhook ke liye subscribe hi nahi hua** — subscription
  wala step 12–13 Nov ko bana, aur ye connection usse purana hai.
- Isliye **Meta ne aaj tak ek bhi DM webhook nahi bheja** (0 rows), aur
  **ek bhi reply nahi gaya** (0 rows).

To pehla kaam naya feature nahi hai — **Instagram dobara connect karo, aur
ek asli DM bhej kar dekho ki reply aata hai.** Uske baad hi upar banana
samajhdari hai.

**Do cheezein Meta ke rules se tay hoti hain, code se nahi:**

1. **2–3 din baad khud follow-up — automated message bhejna mana hai.**
   Instagram pe automated message sirf customer ke aakhri message ke
   **24 ghante** ke andar ja sakta hai. 24 ghante se 7 din tak sirf
   **insaan** (`HUMAN_AGENT` tag) bhej sakta hai. 7 din ke baad koi
   nahi. To "2–3 din baad agent khud bheje" Meta allow nahi karta.
   Kya ho sakta hai, wo §4 mein hai — aapka faisla chahiye.
2. **Doosre businesses ke liye chalane ko App Review + Business
   Verification chahiye** (Advanced Access). Tab tak ye sirf un accounts
   pe chalega jinka app pe role hai — yaani aapka apna.

**Publish permission (`instagram_content_publish`) ki zaroorat nahi hai** —
DM ka poora raasta usse alag hai. Confirm kiya.

**Website ke bina chalega?** Haan — products aur orders business se jude
hain, website se nahi. Lekin ek kami: jo brand Shopify pe hai, uska catalog
Hawlai ke `products` table mein aata hi nahi — uske liye adapter banana
padega.

---

## 1. Instagram messaging permission — live status

**Permission code mein maangi jaati hai:**
`src/app/api/auth/instagram/start/route.ts:43` —
`instagram_business_basic, instagram_business_manage_messages,
instagram_business_manage_comments`. This is the **Instagram Login** path,
and it is the one the DM sender uses (`graph.instagram.com/{ig-id}/messages`,
`autoReplyHandler.ts:30-39`).

**The Facebook Login path is a different channel.** Its scopes
(`src/app/api/auth/facebook/connect/route.ts:28-39`) carry
`pages_messaging` — Facebook Page Messenger — and do **not** carry the old
`instagram_manage_messages`. Instagram DMs therefore depend only on the
Instagram connection. `ROADMAP.md`'s "waiting on somebody" item 1 is
about `pages_messaging` (Facebook), not this.

**Without `instagram_content_publish`: yes, it works.** Nothing in the DM
path calls a publishing endpoint, and the Instagram start route never asks
for it.

**THE LIVE STATE, read from production today:**

| Check | Result |
|---|---|
| Businesses with Instagram connected | **1** (`candle_by_qaaf`), token present, `dm_auto_reply_enabled = true` |
| The token, asked of Instagram (`/me`) | **401, code 190** — *"The session has been invalidated because the user changed their password or Facebook has changed the session"* |
| `ig_webhook_subscribed_at` / `ig_webhook_error` (migration 227) | **both null** — the subscribe step never ran for this connection; it predates the step |
| `webhook_deliveries` from `meta-messaging` / `meta-leads` | **0, ever** |
| `auto_reply_log` rows | **0, ever** (0 on `dm_instagram`) |

**Meta's access rule** ([App Review for Instagram API](https://developers.facebook.com/docs/instagram-platform/app-review)):
**Standard Access** covers Instagram accounts the app's own people own or
manage; serving **other businesses** needs **Advanced Access**, which
requires **App Review and Business Verification**. Whether this app has
it is in the Meta App Dashboard (App Review → Permissions and features),
not in the repo — **unverified here**. Requesting
`instagram_business_manage_messages` also adds the **Human Agent** feature
automatically, per the same documentation.

**Two further gaps found:**

- **No Instagram token refresh exists.** A grep for any refresh of the
  Instagram token across `src/` finds nothing. Instagram long-lived tokens
  expire (60 days, per Meta) and must be refreshed — so even a fresh
  connection dies on a schedule, silently.
- **The token is stored in plaintext.** The callback writes
  `instagram_access_token` directly
  (`src/app/api/auth/instagram/callback/route.ts:79-82`), while other
  secrets go through `src/lib/crypto/oauthSecrets.ts`.

## 2. Catalog — reuse without publishing a website

**Directly reusable — nothing in the schema needs a website.**

- `products` is keyed by `dealership_id`, not by website
  (`supabase/migrations/054_ecommerce_catalog.sql`, `create table products`).
- `fetchCatalog` reads by `dealership_id` only
  (`src/lib/claims/businessFacts.ts:221-222`), and the DM path already
  uses it (`autoReplyHandler.ts`, the `fetchCatalog(supabase, dealership.id)` call).
- Live **offers** are already in the facts — `discount_codes`, filtered by
  checkout's own liveness rule (`businessFacts.ts:471, 544`).
- **Stock** is in the shape: `inventory: number | null`, null meaning
  untracked (`businessFacts.ts:69-70`).
- The Products / Offers / Orders tabs are **not gated on a website**
  (`src/components/website-builder/WebsiteBuilderView.tsx:25-32, 484-488`),
  and products can also be added from chat (`masterBrainV2.ts` inserts
  into `products`).

**Adapt:**

- **A "was" price is not in the facts.** `products.compare_at_price`
  exists (054) but `CatalogProduct` has no field for it
  (`businessFacts.ts:56-73`), so a sale price shown on the site cannot be
  stated in a DM. **S.**
- **The catalog lives under "Website Builder"** in the navigation. A
  seller with no website has to find Products there. A naming/placement
  fix, not a new page (Rule 5). **S.**

**Genuinely new:**

- **Variants (size, colour, each with its own stock) do not exist.**
  There is no variants table or column anywhere in `supabase/migrations/`.
  Two ways — **a decision for the founder** (§8):
  - (a) each variant as its own product — no schema change, **S**, works
    for a small seller;
  - (b) a real variants table with per-variant stock, through the facts,
    the order items and the catalog UI — **M/L**.
- **A Shopify brand's catalog is not in `products`.** The only writers to
  `products` are `src/app/api/products/route.ts` and the chat tool — there
  is no Shopify product import. For "an established brand with its own
  website", a **Hawlai** website reuses its catalog directly; a **Shopify**
  or **WordPress** store needs a catalog adapter that reads their products
  (the Shopify GraphQL helper exists at `src/lib/commerce/shopifyGraphQL.ts`).
  **M**, and it can come after the pilot.

## 3. The WhatsApp "reply-only, 24-hour" pattern

**The premise needs correcting first: WhatsApp has no customer-reply
path to copy.** The WhatsApp webhook matches the sender against the
**owner's** verified number and hands the message to the owner's own
Hawlai assistant (`src/app/api/webhooks/whatsapp/route.ts:70`,
`owner_whatsapp_number`). It is the founder talking to Hawlai, not a
customer talking to a shop. Customer WhatsApp replies were never built.

**The right thing to build on is the Instagram path that already exists**
— same Meta stack, same signature check, same delivery log:

| Piece | Where | State |
|---|---|---|
| Signature-checked webhook | `src/app/api/webhooks/meta-messaging/route.ts` (60 lines) | reuse |
| Route a DM to its business | `autoReplyHandler.ts:99-107` (`instagram_business_id`) | reuse |
| Skip the business's own echoes | `autoReplyHandler.ts:170` (`is_echo`) | reuse |
| Every DM becomes a lead | `src/lib/leads/dmLeadLinking.ts:106` `resolveDmLead` (`dm_source_id`, `dm_channel`) | reuse |
| This lead's past notes | `getLeadMemory` | reuse |
| The reply, guarded | `src/lib/agents/socialManagementAgent.ts:94` `generateAutoReply`, guard at `:242` | reuse |
| Send on Instagram | `autoReplyHandler.ts:30-39` | reuse |
| Every outcome recorded | `webhook_deliveries` (226/227), `auto_reply_log` (033) | reuse |

**What it lacks for selling:**

- **It forgets the conversation.** `generateAutoReply` takes **one**
  incoming message, plus the lead's notes — no thread
  (`socialManagementAgent.ts:94-110`). Taking an order is a
  conversation: product, then size, then name, then address. The thread
  is recoverable from `auto_reply_log` (`source_id` + `incoming_text` +
  `reply_text`, migration 033) — an index and a read, no new table.
  **S.** The website chat already does multi-turn
  (`src/lib/agents/chatbotAgent.ts:121, 172` — last 6 turns) and already
  extracts a structured `leadCapture` (`:170, :207`) — **that is the
  shape to copy.**
- **The 24-hour window is not tracked.** Nothing records when the
  customer last wrote, so nothing can refuse a send outside it. Derivable
  from the same log. **S.**

## 4. Proactive follow-up after 2–3 days

**Genuinely new, and limited by Meta's policy rather than by code.**

**Nothing existing messages a customer.**
`src/lib/agents/coldLeadAgent.ts` (`notifyColdLeads`) tells the **owner**
a lead has gone cold — it never contacts the lead. The workflow engine
sends **email**, not DMs.

**What Meta allows** ([Messenger Platform and IG Messaging API policy](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy);
[Human Agent](https://developers.facebook.com/docs/features-reference/human-agent)):

| Since the customer's last message | Allowed |
|---|---|
| **Within 24 hours** | Any message, **including automated** |
| **24 hours to 7 days** | Only a **human** reply, sent with the `HUMAN_AGENT` tag |
| **More than 7 days** | Nothing |
| A conversation started from a **Click-to-Direct ad** | Reportedly up to 7 days for any message — **unverified** (third-party sources only) |

**So "2–3 days later, the agent writes on its own" is not permitted.**
Three things are, and they can be combined:

- **(a) Follow up inside the 24 hours.** A customer who asked a price
  and went quiet gets a nudge after a few hours. Fully automated and
  compliant. **S/M** — `agent_tasks` already has `scheduled_for`
  (`supabase/migrations/130_agent_tasks.sql:32`) and the 2-minute
  dispatcher already honours it
  (`src/app/api/events/dispatch/route.ts:72-78`).
- **(b) From 24 hours to 7 days, Hawlai drafts and the seller sends.**
  The seller taps send on an approval card — a human decision, sent with
  `HUMAN_AGENT`. Whether a one-tap send on a drafted message satisfies
  Meta's "human agent" intent is **a judgement call worth confirming with
  Meta's policy text before the pilot**. **M** — an approval card, a
  registry entry (Rule 6), and the tag.
- **(c) Never leave it unread in the first place.** The agent answers
  instantly, so "unread for 2–3 days" only happens when it **escalated**.
  Then the seller is notified at once, not on day 3.

**Recommendation: (c) always, plus (a); (b) only if the founder wants
the 24h–7d window, knowing the policy question.**

## 5. Order → lead/order in the dashboard, with stages

**Reuse:**

- `orders` exists, and needs no website: `website_id` is nullable
  (`054_ecommerce_catalog.sql`, `orders`); `orders.lead_id` links an order
  to its lead (`supabase/migrations/142_customer_ltv.sql:11`).
- **`applyOrderSideEffects`** (`src/lib/orderFulfillment.ts:82`) already
  does what an order needs: stock decrement (`:161`), discount usage
  count, abandoned-cart clean-up, the owner's email, and the Meta
  purchase conversion. A DM order should go through it, **not** a copy.
- `orders.status` is free text (no CHECK in any migration) and already
  says `new | confirmed | shipped | delivered | cancelled` (054 comment);
  the Orders tab shows them (`OrdersPanel.tsx`).

**The stage list maps onto two things that already exist — the lead and
the order — rather than one new pipeline:**

| Stage asked for | Where it lives |
|---|---|
| inquiry | the DM lead, created on the first message (`resolveDmLead`) |
| interested | the same lead, once the agent has quoted a product |
| pending | an order with `status = 'new'`, created by the agent |
| confirmed | `status = 'confirmed'` — **set by the seller**, see below |
| shipped / delivered | `status = 'shipped' / 'delivered'` — existing |

**`leads.status` should NOT be widened.** Its CHECK is the calling
product's vocabulary — `new, ready_to_call, called, appointment_set,
converted, not_interested` (`supabase/migrations/001_schema.sql:41`, no
later migration changes it) — and the calling agent reads it. Widening it
would mean checking the **live** constraint first (Rule 4) and every
reader of it. The order carries the stages instead.

**Adapt / new:**

- **Order creation is inside a public route.** The insert lives in
  `src/app/api/public/orders/route.ts`; it needs extracting into a
  function both checkout and the DM path call (the "no self-calls" rule
  forbids calling the route). **S/M.**
- **An order needs to say it came from Instagram.** There is no
  `channel` / `source` on `orders` (only `utm_source`, migration 194). A
  migration — **S**, SQL plus a verify query, owner runs it.
- **The seller is told by email only today.** No in-app notification
  kind exists for an order — the allowed kinds in
  `supabase/migrations/235_notification_kind_export_failed.sql:33` have
  none. A new kind is a migration; **check the live constraint with
  `pg_get_constraintdef` first** (Rule 4) — repo migrations have drifted
  from production before. **S.**

## 6. A capability toggle, for businesses with and without a website

**Possible today, and nothing in the schema assumes a website** —
products, orders and the catalog read are all by business (§2, §5).

**What exists:** one switch, `dm_auto_reply_enabled`, read at
`autoReplyHandler.ts:128, 166`, registered as `dm_auto_reply` in
`AUTOMATION_TOGGLES` (`src/lib/executionPolicy.ts`). It is **shared by
Facebook and Instagram**, and it means "answer questions", not "take
orders".

**Adapt:** a second, separate capability — **"take orders in DMs"** —
on top of the reply switch: a column and a toggle-registry entry.
Answering and selling are different promises to the owner, so they
should be different switches. The reply persona already exists
(`resolvePersona(…, "dm")`, `autoReplyHandler.ts`) and can lean "sales"
when selling is on. **S.**

**One thing that is NOT the same for both kinds of business:** a Shopify
or WordPress brand has an empty `products` table (§2). For them the
capability needs the catalog adapter first.

## 7. The claims guard on the DM surface

**Already on it, and it is stricter there than on the website chat.**

| Surface | Guard | Where |
|---|---|---|
| Website chat (ChatWidget) | `stripUnsupported(…, "publish")` — removes unsupported sentences, falls back to a hand-off | `chatbotAgent.ts:196-198` |
| Instagram DM | `guardGenerated(…, "publish")` **plus** the bare-yes rule: if what survives is only "Yes!", nothing is sent | `socialManagementAgent.ts:242, 277-286` |

**Adapt — the escalation path, which is where "ask the seller" lives:**

- **When the guard withholds a reply, the customer gets silence.** The
  reason goes into `auto_reply_log.error` and nothing else. The customer
  should get an honest holding line ("let me check with the team"), and
  the seller should be **told at once**. **S.**
- **"Ask the seller" already exists for the website.** Unanswered
  questions become the owner's own question (V4c / V4c-ii,
  `src/lib/chat/answerGaps.ts`), but its source type allows only
  `website_chat` (`answerGaps.ts:44`; column default in migration 230).
  Adding `instagram_dm` is **S**.
- **Order facts must be guarded too.** A confirmation that restates
  price, stock or delivery has to pass the same check — the order summary
  is a claim like any other.

---

## 8. The build, in pieces that can each be gated on their own

**Order matters: nothing above P0 can be verified live until P0 is.**

| # | Piece | Reuse / adapt / new | Size |
|---|---|---|---|
| **P0** | **Make the existing path work live.** Reconnect Instagram (the callback now subscribes and records it), confirm the Meta app's Instagram webhook points at `/api/webhooks/meta-messaging`, send one real DM from a role-holding account, see a `webhook_deliveries` row, an `auto_reply_log` row and a reply on the phone | **No code**, owner steps + one verification | **XS** |
| P0b | App Review for **Advanced Access** + Business Verification | a queue, like GBP | owner, **weeks** |
| P1 | Instagram token health: refresh before expiry, detect a dead token and raise `integration_disconnected` (kind already exists), move the token behind `oauthSecrets` | adapt | **S/M** |
| P2 | Conversation memory: the last turns from `auto_reply_log` into the reply, plus the 24-hour window computed from it | adapt | **S** |
| P3 | Honest escalation: a holding line to the customer, the seller notified, `answer_gaps` from DMs | adapt | **S** |
| P4 | The "take orders" capability switch, separate from replying | adapt | **S** (migration) |
| P5 | Order capture: structured extraction (product, variant, quantity, name, phone, address) over turns, a read-back for the customer to confirm, then an order through the **extracted** order-creation function and `applyOrderSideEffects` | adapt checkout + new extraction | **M** |
| P6 | Order channel + in-app "new order" notification | new, two migrations | **S** |
| P7 | Stages: DM orders on the existing Orders tab, filterable by channel; the seller confirms | adapt | **S** |
| P8 | Follow-up inside 24h via `agent_tasks.scheduled_for` | new on existing queue | **S/M** |
| P9 | Follow-up 24h–7d, seller-sent with `HUMAN_AGENT` | new, Rule 6 entry + approval card | **M**, policy check first |
| P10 | Variants | (a) **S** or (b) **M/L** | decision |
| P11 | Catalog adapter for Shopify / WordPress brands | new | **M** |
| P12 | `compare_at_price` into the facts | adapt | **S** |

**Rules this touches, stated up front:**

- **Rule 6** — the DM reply is already registered (`auto_reply_dm`,
  `requiresApproval: false`). An order created by the agent and a
  follow-up message are **new** actions and each needs its entry; P9's
  is an approval by design.
- **Rule 5** — no new page or tool: orders use the Orders tab, the switch
  sits beside the existing auto-reply one, the catalog stays where it is.
- **Rule 4** — three migrations (P4, P6 ×2). Each one: the live
  constraint checked with `pg_get_constraintdef` first, SQL + verify query
  pasted, owner runs it.
- **Rule 3** — nothing here names a business, category or product; the
  agent reads the catalog it is given.
- **Founder's automate-by-default rule** — automated wherever Meta allows
  it; the two places it does not (24h–7d, beyond 7 days) are Meta's
  policy, written down here as the rule requires.

## 9. What the founder needs to decide

1. **Follow-up:** (c)+(a) only, or also (b) — the seller-sent 24h–7d
   message, knowing it rests on a reading of Meta's Human Agent policy?
2. **Who confirms an order:** the agent creates it as *pending* and the
   **seller** confirms (recommended — a human looks before anything ships),
   or the agent confirms on its own?
3. **Variants:** separate products for the pilot (a), or a real variants
   table now (b)?
4. **Shopify/WordPress brands:** in the first version, or after the
   pilot?
5. **App Review:** start the Advanced Access request now — it is a queue,
   and it gates every business that is not yours.

## 10. Unverified, stated rather than assumed

- **Whether the Meta app has Advanced Access** for
  `instagram_business_manage_messages`, and whether its app-level webhook
  for Instagram is configured — both live in the Meta App Dashboard.
- **Why the token was invalidated** — Instagram's own message names a
  password change or a security reset; which one is not visible here.
- **The Click-to-Direct ad window** — third-party sources only.
- **Whether a one-tap seller send counts as "human agent"** under Meta's
  policy.
- **Nothing in this document has run against a real customer DM.** No
  Meta messaging webhook has ever reached this product.
