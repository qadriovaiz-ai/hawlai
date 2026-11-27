# AUDIT — "Connected" means a column has a value

**Audit and plan only. No code was written for this.** Read from the
repository at `b52775e7` on 27 November 2026.

**Why now.** The same failure has been found twice in two days. Search
Console showed **Connected** while its daily sync had failed for 23 days on
a dead token. Instagram showed connected while its token had been
invalidated (`401, code 190`) and its webhook had never been subscribed —
**zero** DMs ever reached the product. In both, the screen said what was
**stored**, not what **worked**.

---

## 0. Hinglish mein (Ovaiz ke liye)

**17 integrations dekhe. Ek mein bhi "abhi kaam kar raha hai" wala check
nahi hai.** Har jagah "connected" ka matlab hai — database mein kuch
likha hai (email, page id, token, URL). Teen jagah ek asli check hota hai,
par sirf ek pal ke liye — connect karte waqt (Razorpay keys), ya token
expire hone se thoda pehle (Canva). Do jagah (Shopify, WooCommerce) asli
API call hoti hai, **fail hoti hai, aur phir bhi "connected: true" bhej
diya jaata hai** — code ki comment khud ye kehti hai.

**Instagram sabse kamzor hai:** uska status sirf `instagram_business_id`
dekhta hai — **token hai ya nahi, ye bhi nahi.**

**Ilaaj ek jagah:** ek shared "health" helper — har integration ke liye
ek chhota, sirf-padhne wala API call ("main kaun hoon?" type), jiska
nateeja ek table mein rahe, aur saare cards wahi padhein. Plus jab bhi
asli kaam (sync, reply, send) fail ho, wo bhi wahin likhe — ye free hai
aur sabse sach. Aur ek test jo fail ho jaaye agar koi naya integration
is helper ke bina "connected" dikhaye — taaki ye teesri baar na mile.

---

## 1. Every integration: how "connected" is decided

| Integration | "Connected" means | Where | Real check? |
|---|---|---|---|
| **Instagram** (Business Login) | `instagram_business_id` is set — **not even the token is looked at** | `src/app/api/settings/instagram-business-login/route.ts:8-9` | **None** |
| **Facebook Page** (Meta) | `fb_page_id` is set | `src/app/dashboard/settings/integrations/page.tsx:41` | **None.** `fb_webhook_subscribed_at` / `_error` exist (migration 227) and are **not shown** |
| **Search Console** | `search_console_email` is set; the card also shows whether a property was matched | `integrations/page.tsx:47-48`, `SearchConsoleActions.tsx:77-83` | **None on screen.** The daily sync tells the owner **once** when it dies (`src/lib/seo/searchQueries.ts:97`), but the card keeps saying Connected |
| **Gmail** | `gmail_email` is set | `integrations/page.tsx:42` | **None** |
| **Google Ads** | `google_ads_email` is set | `integrations/page.tsx:43` | **None** |
| **YouTube** | `youtube_channel_title` is set | `integrations/page.tsx:49` | **None** |
| **Pinterest / Snapchat / LinkedIn** | an encrypted token exists (`hasToken`, deliberately not decrypted) | `integrations/page.tsx:53-55` | **None** |
| **Shopify** | store URL + token exist. It then **does** get a fresh token and fetch products — and on failure: *"Connection may have gone stale — still report connected: true, just no products"* | `src/app/api/integrations/shopify/route.ts:15, 33` | **A real call, its failure discarded** |
| **WooCommerce** | store URL + consumer key exist. Same product fetch, same comment, same discard | `src/app/api/integrations/woocommerce/route.ts:12, 24` | **A real call, its failure discarded** |
| **WordPress** | site URL + a decryptable app password | `src/app/api/integrations/wordpress/route.ts:28` | **None** — decrypting proves the row, not the site |
| **Razorpay** (keys) | key id + encrypted secret exist — **verified with Razorpay once, when saved** (`/v1/orders?count=1`) | `src/app/api/settings/razorpay/route.ts:66-70`; status `src/lib/payments/razorpayConnection.ts:76` | **At save only** |
| **Razorpay** (Connect / OAuth) | token not past expiry, **or** a refresh token exists; carries `needsReconnect` | `razorpayConnection.ts:71-74` | **Expiry arithmetic, no call** |
| **Canva** | a token survives `getValidAccessToken`, which refreshes within five minutes of expiry and removes the row if refresh fails | `src/app/api/canva/refresh/route.ts:22-33` | **Only near expiry** — a revoked grant with time left on the token reads as connected |
| **WhatsApp** (owner's number) | `owner_whatsapp_verified` | `integrations/page.tsx:265` | **At verification only** (OTP). The Meta number itself is platform-wide, not per business |
| **Slack** | `slack_webhook_url` is set | `src/app/api/integrations/slack/route.ts:10-11` | **None — and none is possible without posting a message** |
| **Google Reviews** | `google_place_id` is set, plus the latest snapshot | `src/app/api/integrations/google-reviews/route.ts:9-10` | **Indirect** — the snapshot's date shows the last successful read |

**Nothing in `src/` is a health check.** A search for `healthCheck`,
`checkHealth`, `connectionHealth` or anything like it finds no file. The
only code that tells the owner a connection died is Search Console's
(`searchQueries.ts:97`), and the `integration_disconnected` notification
kind it uses has no other caller.

## 2. Token- or row-only, with no real check — the list

1. Instagram — `settings/instagram-business-login/route.ts:9`
2. Facebook Page — `integrations/page.tsx:41`
3. Search Console — `integrations/page.tsx:47`
4. Gmail — `integrations/page.tsx:42`
5. Google Ads — `integrations/page.tsx:43`
6. YouTube — `integrations/page.tsx:49`
7. Pinterest — `integrations/page.tsx:53`
8. Snapchat — `integrations/page.tsx:54`
9. LinkedIn — `integrations/page.tsx:55`
10. WordPress — `integrations/wordpress/route.ts:28`
11. Slack — `integrations/slack/route.ts:11`
12. Razorpay (OAuth) — `razorpayConnection.ts:71-74`

**And two that call the API and then ignore the answer** — the cheapest
fixes in this document, because the call already happens:

13. Shopify — `integrations/shopify/route.ts:33`
14. WooCommerce — `integrations/woocommerce/route.ts:24`

**Partial, one moment only:** Razorpay keys (at save), Canva (near
expiry), WhatsApp (at verification), Google Reviews (snapshot date).

## 3. What already exists to build on

The pattern does not need inventing; four pieces of it are already here,
each in one place:

| Piece | Where | What it shows |
|---|---|---|
| **"Connected" and "needs reconnect" as two separate answers** | `razorpayConnection.ts:74` | `{ connected, needsReconnect }` — the honest shape |
| **Verify before calling it connected** | `settings/razorpay/route.ts:66` | a real read at save time |
| **Tell the owner once, when it breaks** | `searchQueries.ts` `tellOwnerItDied` | notifies only if the last run succeeded — no daily nagging |
| **Record why, not just that** | `webhook_deliveries` (226), `fb/ig_webhook_*` (227), `automation_run_log` | failures already land in tables nobody's status reads |

## 4. The recommendation — one helper, every integration through it

### 4.1 Two kinds of evidence, both written to one place

**Passive — free, and the most truthful.** Every real use of an
integration already succeeds or fails: the search sync, a DM reply, a
Shopify page edit, a sent email. Each failure point calls one shared
function — *this integration, for this business, failed, and this is
what the provider said* — and each success calls its twin. No extra API
traffic at all. Search Console's `tellOwnerItDied` is the first of these
and becomes a caller of the shared function rather than its own copy.

**Active — a small "who am I" read**, for integrations that may go days
without being used:

| Integration | The probe — read-only, cheapest call that proves the token works |
|---|---|
| Instagram | `GET graph.instagram.com/me` **and** `/me/subscribed_apps` — the second is what would have caught the never-subscribed account |
| Facebook Page | `GET /{page-id}?fields=id` **and** `/{page-id}/subscribed_apps` |
| Search Console | refresh if due, then `GET /webmasters/v3/sites` — and the selected property must still be in the list |
| Gmail | refresh if due, then the Gmail profile read |
| Google Ads | refresh if due, then `listAccessibleCustomers` |
| YouTube | `channels?mine=true` |
| Shopify | fresh token, then GraphQL `{ shop { name } }` |
| WooCommerce | `GET /wp-json/wc/v3/products?per_page=1` |
| WordPress | `GET /wp-json/wp/v2/users/me` with the app password |
| Razorpay | keys: the same `/v1/orders?count=1` used at save; OAuth: the refresh |
| Canva | `GET /v1/users/me` — `profile:read` is already a requested scope |
| Pinterest / Snapchat / LinkedIn | each one's own "current user" read |
| **Slack** | **no probe — any call to an incoming webhook posts a message.** Passive only, and the card says so |

**No probe ever writes.** That is the rule that makes probing safe to
run unattended, and it is why Slack has none.

### 4.2 One table, one state per integration

`integration_health` — one row per business per integration: the
**state**, the provider's own **reason**, **when it was last checked**,
and **when it last worked**. A migration (Rule 4): SQL plus a verify
query, the owner runs it.

| State | Shown as |
|---|---|
| `working` | **Connected** · checked N minutes ago |
| `needs_reconnect` | **Connected but not responding — reconnect needed**, with the provider's reason ("session invalidated", "invalid_grant") |
| `incomplete` | **Connected, but not set up to receive** — e.g. Instagram with no webhook subscription, Search Console with no property |
| `unchecked` | **Linked · not checked yet** — never "Connected" on a stored value alone |
| `unverifiable` | **Linked · can't be checked without sending** (Slack) |

### 4.3 When the probes run

- **When the Integrations page opens**, for anything not checked in the
  last ~10 minutes — server-side, in parallel, each with a short timeout.
- **Once a day**, in the `heavy` group — it is network traffic, so it
  cannot go in `signals`, which `cronGroups.ts` keeps database-only.
- **On every real use**, passively, as above.

### 4.4 Telling the owner

A move from `working` to `needs_reconnect` raises the existing
`integration_disconnected` notification — **once**, by the same "only if
it was working last time" rule `tellOwnerItDied` already follows. No new
notification kind and no migration for this part.

### 4.5 Making sure there is no third time

The pattern only holds if a new integration **cannot** skip it:

- **One registry** lists every integration with its probe, or with an
  explicit `unverifiable` and the reason.
- **A test** fails if a card on the Integrations page shows a status that
  does not come from the registry, and if a registry entry has neither a
  probe nor a written reason — read with `code()`, slices bounded at both
  ends (Rule 8).
- **Each card shows the shared status** instead of computing its own
  `connected`. The existing `connected` answers stay for the code that
  calls them (`isConnected()` in publishing, for example) — "is anything
  stored" is still a real question; it just stops being what the owner is
  told.
- **Mutation-checked** like every guard here: remove a probe, map a
  failure to `working`, drop a card from the registry — each must fail
  the suite.

## 5. Pieces, sizes and order

| # | Piece | Size |
|---|---|---|
| **H0** | Shopify and WooCommerce stop discarding the call they already make — report it | **XS** |
| **H1** | `integration_health` table, the shared helper (record, read, notify-on-transition), the registry, the status pill, the guard test | **M** |
| **H2** | Probes for the three that have already burned: **Instagram (with subscription), Facebook Page (with subscription), Search Console (with property)**; passive hooks in the DM reply path and the search sync | **S** |
| **H3** | Commerce: Shopify, WooCommerce, WordPress, Razorpay | **S** |
| **H4** | Google: Gmail, Google Ads, YouTube; Canva; Pinterest, Snapchat, LinkedIn | **S** |
| **H5** | The daily sweep in `heavy`, and the page-open refresh | **S** |

**H0 can ship alone today.** H1 is the foundation and must come before
the probes. H2 first among the probes, because those three are where the
lies have already been caught.

**Rules:** Rule 4 for the one migration; **Rule 5** — no new page, the
status appears on the existing cards; **Rule 6** — probes only read, so
none needs a registry entry, and none may write; **Rule 3** — nothing
business-specific.

## 6. Unverified, stated rather than assumed

- **Each probe endpoint is taken from what the repo already calls or
  Meta/Google/Shopify document;** none has been run as a probe. Rate
  limits per provider are not checked here.
- **The 10-minute freshness window** is a starting number, not a
  measured one.
- **No integration's live health was measured for this audit** beyond
  the two already known (Search Console on 26 Nov, Instagram on 27 Nov).
