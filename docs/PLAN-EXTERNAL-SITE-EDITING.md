# Editing the merchant's own site — Shopify, WooCommerce, WordPress

Plan only. Nothing here has been built. 19 November 2026.

---

## 0. Scope, and what is permanently outside it

**In scope:** pages, homepage, about/contact/FAQ, products, collections,
blog, menus, SEO fields, images, text, buttons and links, forms where
the API allows, and theme-supported changes.

**Out of scope, and not to be smuggled back in later:**

- any access to **orders or customers**
- installing **third-party apps or plugins**
- **store settings** — payment, shipping, tax

These are not "later phases". Nothing in the sequencing below leads to
them, no adapter declares them, and no scope is requested that would
permit them. If they are ever wanted they get their own decision, taken
deliberately and not as a consequence of this work.

That has a concrete design cost, stated here so it is not discovered as
a surprise: **this plan deliberately requests narrower credentials than
each platform would happily grant.** A merchant who connects Shopify
for content editing should not thereby hand over their customer list.

---

## 1. What each platform's API actually allows

Checked against the vendors' own documentation on 19 November 2026.
Where a page did not answer, it says so rather than guessing.

### Shopify — GraphQL Admin API

| Thing | Scope | Verdict |
|---|---|---|
| Pages | `write_content`, or `write_online_store_pages` | ✅ |
| Blog posts / articles | `write_content` | ✅ |
| Products, collections | `write_products` | ✅ |
| Images / files | `write_files` | ✅ |
| **Navigation menus** | `write_online_store_navigation` | ⚠️ **API exists, scope NOT granted** — corrected 2026-11-20 |
| Theme files | `write_themes` **plus an exemption** | ⚠️ gated |
| SEO metafields | not documented on the scopes page | ⚠️ unverified |

Two findings worth pulling out of the table.

**CORRECTED 2026-11-20 — the original claim here was false.** It said
there is no menu scope and no menu object in the Admin API, and that
the navigation scope is for URL redirects only. Checked against the
2026-07 reference: a `Menu` object exists (`read_online_store_navigation`),
and `menuCreate` and `menuUpdate` both exist (`write_online_store_navigation`).
The access-scope table lists only `UrlRedirect` against that scope,
which is where the mistake came from — the table is incomplete, and the
mutation page is the authority on what it gates.

**Menus are still out of this phase, for two real reasons.** The scope
is not in app version 4, so adding it costs a new app version plus
every connected merchant re-approving. And `menuUpdate` takes the
complete `items` list as a required argument — it replaces the whole
menu rather than patching a link, so an item the read did not
understand is an item the write drops. That needs its own staleness
contract, not a corner of another phase.

Any plan that promises "edit your menu
everywhere" is wrong on a third of the platforms, and the adapter must
be able to say so rather than fail.

**Theme file edits need Shopify's permission, not just the merchant's.**
A publicly distributed app that modifies theme files needs an exemption
requested through a form, on top of `write_themes`. That is a
relationship with Shopify, not an engineering task, and it should be
started early or designed around.

**And the scope we hold today is `read_products` only**
(`lib/commerce/shopifyAuth.ts:48`). Every content capability above
requires widening it, which means **re-consent from every merchant who
has already connected.** That is the real cost of Shopify-first, and it
is not a code cost.

### WordPress — core REST API (`wp/v2`)

| Thing | Endpoint | Verdict |
|---|---|---|
| Posts | `/wp/v2/posts` | ✅ |
| Pages | `/wp/v2/pages` | ✅ |
| Media / images | `/wp/v2/media` | ✅ |
| Categories, tags | `/wp/v2/categories`, `/wp/v2/tags` | ✅ |
| Site settings | `/wp/v2/settings` | ✅ (we will use almost none of it) |
| **Menus** | not listed in the core reference | ⚠️ **unverified** |
| SEO fields | plugin-dependent (Yoast, Rank Math) | ⚠️ varies per site |

**Authentication is application passwords** — the merchant generates
one in their own WordPress admin and pastes it to us. No app review, no
partner programme, no exemption form. That is the single biggest
practical difference between WordPress and Shopify for this work.

**The menus gap is unverified, not confirmed absent.** WordPress added
a menus REST route in a later version and the reference page read did
not list it. **Confirm before promising menus anywhere.**

**SEO is not core.** Titles and descriptions live in whichever plugin
the site runs, each with its own REST shape, and some with none. The
adapter must report SEO as unsupported on a site whose plugin it does
not recognise rather than writing a field nothing reads.

### WooCommerce — REST API v3

| Thing | Endpoint | Verdict |
|---|---|---|
| Products | `/wc/v3/products` | ✅ |
| Product categories | `/wc/v3/products/categories` | ✅ |
| Product images | an `images` argument on the product | ✅ (no separate endpoint) |
| Coupons | `/wc/v3/coupons` | ✅ |
| **Pages, posts, menus, SEO** | — | ❌ **not WooCommerce's** |

**The decisive fact: a WooCommerce store IS a WordPress site.** Woo
covers commerce objects; everything this plan calls "content" comes
from the WordPress core REST API on the same host. So WooCommerce is
not a third platform so much as **a second capability on the second
platform** — one host, two credentials.

Auth is a consumer key and secret over HTTPS (Basic), or OAuth 1.0a
over plain HTTP. We already have `lib/commerce/wooAuth.ts`, which
normalises and SSRF-guards the store URL and runs the key handshake.

---

## 2. The adapter layer — which already exists

**This is the part that needs least building, and the plan would be
wrong to pretend otherwise.**

`lib/publish/types.ts` already defines:

```ts
export type PlatformId = "shopify" | "wordpress" | "woocommerce"
  | "meta" | "hawlai_shop" | "hawlai_site";

export interface PublishPlatform {
  readonly id: PlatformId;
  readonly supports: readonly ActionKey[];
  isConnected(dealershipId): Promise<boolean>;
  preview(action): Promise<PreviewResult>;   // reads, never writes
  execute(action): Promise<ExecuteResult>;   // the only writer
}
```

`wordpress` and `woocommerce` are **already declared and not yet
implemented.** Somebody anticipated this exactly.

And the hardest design question is already decided, well, in that
file's own comment: **`ActionKey` is deliberately not a universal
set.** Each platform declares what it supports and the tool layer reads
that, because "modelling a universal *create discount* would produce a
tool the assistant offers on sites that cannot do it, and a failure the
merchant experiences as the product lying to them."

That is exactly the right answer to a menu action Shopify's granted
scopes cannot perform. The adapter does not stub a menu edit that fails
at runtime; it omits
`update_menu` from `supports`, and the assistant never offers it for
that store.

**So the work is three adapters, not an architecture.** Each is a file
in `lib/publish/platforms/` that returns a `PublishPlatform`, plus a
line in `registry.ts`. Hawlai Core continues not to know which platform
it is talking to — which is already true today for Shopify, Meta and
the two built-in surfaces.

### What does need adding

- **New `ActionKey` values** for the content verbs that do not exist
  yet: `update_page_text` and `update_page_meta` already exist and
  should be reused verbatim rather than paralleled. Likely new:
  `create_page`, `update_collection`, `update_menu`, `upload_image`.
  Each added only when at least one adapter can honestly implement it.
- **A capability probe per site**, because WordPress capability is
  per-installation rather than per-platform. Two WordPress sites differ
  by plugin; `supports` is static per adapter, so SEO and menus need a
  runtime check feeding the same "do not offer what cannot be done"
  rule.

---

## 3. How it fits the C4 Actions layer — unchanged, which is the point

Nothing about approval, undo or audit needs inventing. The external
adapters inherit the standard by implementing the same interface.

**Preview reads, execute writes.** `preview()` captures current values
into `preview.changes[].before`. `execute()` must re-read and compare
before applying, and return `{ stale: true }` having applied nothing if
the platform moved in between. The comment in `types.ts` gives the
scenario: previewed at 10am, approved at 3pm, changed at noon.

**Undo needs no history table.** It goes through the same door as the
thing it reverses — a new action, its own preview, its own approval —
built from `preview.changes[].before`. Which means an external adapter
gets undo for free **if and only if** its preview captures a complete
before-state. For a page body that is the whole body, not a diff.

**Approval and audit are already registry-driven.** `executionPolicy`
classifies the action and `requestApproval` creates the record, and
`tests/approvalCoverage.test.ts` fails for anything new that reaches a
sender directly. Editing a merchant's live homepage is unambiguously
approval-gated, and nothing special is needed to make it so.

**One genuine new question: staleness on a platform we do not own.**
For `hawlai_site` the before-value cannot change behind us. A merchant
can edit their own WordPress page in another tab mid-approval. The
contract already handles this — that is what `stale` is for — but the
adapters must actually re-read, and the tests should prove it per
adapter rather than assume it.

---

## 4. Which to build first — WordPress, and not the obvious one

**My recommendation: WordPress first, WooCommerce second, Shopify
third.** That is the opposite of where the existing code is, and the
reasons are not about code.

**Why not Shopify first, despite the head start.** `shopify.ts` exists
and already does `update_product_price`. But every content capability
needs scopes we do not hold, and widening scopes means **re-consent
from every merchant already connected** — a migration of human
attention, not of data. On top of that, theme edits need an exemption
Shopify grants by application. Shopify-first means the first milestone
is a conversation with Shopify and an email to every connected
merchant, before a line of content code earns anything.

**Why WordPress first.**

1. **Its content API is the most complete of the three** — pages,
   posts, media, taxonomies — and content is what this plan is for.
2. **No gatekeeper.** Application passwords are issued by the merchant
   in their own admin. No app review, no partner programme, no
   exemption form, no re-consent of an existing install.
3. **It unlocks WooCommerce content for free.** A Woo store is a
   WordPress site, so the WordPress adapter is what edits a Woo store's
   pages and blog. Building Woo first would deliver products and no
   content at all — the wrong half of this plan.
4. **It matches the market.** Hawlai's businesses are Indian SMBs, and
   that segment skews WordPress and WooCommerce over Shopify.

**The honest counter-argument**, which should be heard before this is
settled: Shopify merchants are more likely to be paying for a tool like
this, and the Shopify adapter is partly written. If the goal is revenue
from the next ten customers rather than coverage of the next hundred,
Shopify first is defensible. **That is a founder's call, not mine** —
but it should be made knowing the first Shopify milestone is a scope
re-consent and not a feature.

---

## 5. Sequencing and rough effort

Sizes are relative to the commits in this repo: **S** ≈ a day, **M** ≈
a few days, **L** ≈ a week or more with a real site to test against.

### Phase 1 — WordPress content (the foundation)

| | | |
|---|---|---|
| 1.1 | Connection: application passwords, stored encrypted like the Meta and Shopify tokens; reuse `publicHttpUrl`'s SSRF guard | **M** |
| 1.2 | `wordpressPlatform` with `update_page_text`, `update_page_meta`, reusing the existing ActionKeys | **M** |
| 1.3 | Capability probe — which plugins, so SEO and menus are offered only where they exist | **M** |
| 1.4 | `create_page`, `update_post`, `publish_post` | **M** |
| 1.5 | `upload_image` via `/wp/v2/media` | **S** |

**Riskiest:** 1.3. A probe that guesses wrong offers an edit that
silently writes to a field nothing renders, which is worse than not
offering it.

### Phase 2 — WooCommerce commerce (small, because Phase 1 did the hard part)

| | | |
|---|---|---|
| 2.1 | `woocommercePlatform` on the existing `wooAuth` handshake | **S** |
| 2.2 | `update_product_price`, `update_product_name`, `update_product_description` — the ActionKeys Shopify and hawlai_shop already use | **M** |
| 2.3 | `update_collection` for product categories | **S** |
| 2.4 | Pairing: one host, two credentials, one connection in the owner's eyes | **M** |

**Riskiest:** 2.4. Two credentials for one site is a UX problem, and
getting it wrong means a merchant who "connected WooCommerce" finds
their pages uneditable with no idea why.

### Phase 3 — Shopify content (the gated one)

| | | |
|---|---|---|
| | | | **Status** |
|---|---|---|---|
| 3.0 | **Not code:** request the theme exemption; decide whether theme edits are in the first release at all | **—** | **deferred** — first step is Shopify's approval queue, not code |
| 3.1 | Scope widening and the re-consent flow for already-connected merchants | **L** | **done 2026-11-20** — app version 4 released with `write_files`; test store reconnected |
| 3.2 | Extend `shopify.ts` with `update_page_text`, `update_page_meta`, `publish_post` | **M** | **done 2026-11-20** (`ad129356`) |
| 3.3 | Collections and files | **M** | **done 2026-11-20** — `update_collection_text` (`64c58e4a`), `upload_image` (`b9f39ae9`) |
| 3.4 | Make the absence of menus explicit in `supports`, and prove the assistant never offers it | **S** | **done 2026-11-20** (`da367518`) — and the recorded reason was false; corrected |

**Every one of 3.1–3.4 is UNVERIFIED against a live store.** The code,
the tests and the API shapes are confirmed from the version-pinned
2026-07 documentation; nothing has run against Shopify's real
`pageUpdate`, `articleCreate`, `collectionUpdate` or `fileCreate`.
Phase 3 is not finished until it has.

**Riskiest:** 3.1, and it is a product risk rather than a technical
one. A re-consent prompt is a moment where a merchant can say no, and
some will.

### Before any of it

Two things to settle first, both cheap:

- **Confirm the WordPress menus endpoint.** It is marked unverified
  above and it changes what Phase 1 can promise.
- **Confirm how SEO plugins expose fields over REST**, for at least
  Yoast and Rank Math. If neither is addressable, SEO leaves Phase 1
  and the plan says so rather than shipping a field that writes
  nowhere.

---

## 6. What this plan does not say

It does not say the merchant's site will look designed. Editing text,
images and SEO through an API is not the same as building a page, and
every platform's theme decides what the result looks like. A plan that
implied otherwise would be promising the thing the four-palette
limitation in `docs/INVESTIGATION-WEBSITE-BUILDER.md` already says
Hawlai's own builder cannot do.

And it does not touch orders, customers, plugins or store settings —
see section 0, which is the part of this document least open to
revision.
