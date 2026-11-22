# WordPress and WooCommerce — sizing, and the founder's decisions

Written 22 November 2026, at the founder's request, before any build.
Sizing only; the decisions at the end were taken by the owner the same
day and are recorded here so they are not re-litigated.

---

## 0. Method, and what this document does not know

Every number below was **measured from the repository**, not estimated
from memory: `wc -l` over the publish layer, `grep` over the integration
surface, and the migration history read for what already exists.

**The one calibration point is Shopify**, and it is worth stating what
it cost: 2,674 lines across 8 files, and **four separate corrections
after it met a real store** — a `seo` field that did not exist on
`Page`, a required `author` hidden by a filtered introspection, an empty
metafield write Shopify accepted and ignored, and a producer still
writing `metaTitle` after the adapter had moved to `seoTitle`. Three of
those were invisible to a green test suite.

So the ranges here are a **plan, not a promise**. The thing most likely
to be wrong is the per-platform API surface, exactly as it was for
Shopify.

---

## 1. What already exists — the part that changes the sizing

Neither platform is a green field. Both were partly wired long ago and
then left.

| Already built | Where |
|---|---|
| `PlatformId` lists both | `src/lib/publish/types.ts:13` |
| `publish_actions.platform` CHECK allows both | migrations 170, 179 |
| Woo: `store_url`, `consumer_key`, `consumer_secret_encrypted` (AES-256-GCM) | migrations 024, 160; plaintext dropped in 164 |
| Woo connect handshake + nonce index | migration 166, `src/lib/commerce/connectHandshake.ts` |
| Woo connect routes (route / start / callback) + Settings UI | `src/app/api/integrations/woocommerce/*`, `WooCommerceConnect.tsx` |
| Woo product reads against `wc/v3/products` | `src/lib/agents/woocommerceAgent.ts` (52 lines) |
| WP: `site_url`, `username`, `app_password` + connect route + UI | migration 025, `src/app/api/integrations/wordpress/route.ts`, `WordPressConnect.tsx` |
| WP connection test against `wp/v2/users/me` | `src/lib/agents/wordpressAgent.ts` (55 lines) |

The registry's own comment records why they stop there, and it is the
right instinct:

> `wordpress` and `woocommerce` are declared in `PlatformId` but have no
> producer — nothing calls `createPublishAction` with either, so no card
> can reach approval for them. Deliberately ABSENT rather than stubbed:
> a stub would make the executor claim success on a publish that never
> happened, which is worse than the error.

### 1.1 Two findings that are prerequisites, not nice-to-haves

**`wordpress_app_password` is stored in plaintext.** Migration 160
encrypted the Razorpay secret, the Shopify access token and the
WooCommerce consumer secret. It did not touch this one, added in
migration 025, and `api/integrations/wordpress/route.ts:36` still writes
it raw. A WordPress application password is a **full-access site
credential** — it carries whatever capabilities its user has, and an
admin's app password is admin. This is the same class of problem
migration 160's own header describes.

**`publishWordPressPost` has zero callers.** 55 lines that POST to a
live WordPress site with no approval, no preview, no claims check, no
staleness check and no idempotency key. It is not a Rule 6 violation
today, because nothing calls it — but it is a loaded gun, and it must
not become the WordPress implementation by someone wiring the function
that is already there.

---

## 2. The contract, and how much of it is generic

```ts
interface PublishPlatform {
  readonly id: PlatformId;
  readonly supports: readonly ActionKey[];
  readonly undoes?: readonly ActionKey[];
  isConnected(dealershipId): Promise<boolean>;
  preview(action): Promise<PreviewResult>;   // reads, never writes
  execute(action): Promise<ExecuteResult>;   // re-reads, then writes
  undo?(action): Promise<UndoProposal>;      // proposes, never writes
}
```

Five methods, two declarations — and it has **already been implemented
four times**: `hawlaiShop` 271 lines, `meta` 466, `hawlaiSite` 629,
`shopify` 1,557. The spread is the measure that matters: an adapter's
size tracks its API surface, not the contract.

| Reused untouched (~1,566 lines + the layers above) | New per platform |
|---|---|
| `types` 402, `create` 410, `executor` 261, `resolve` 155, `money` 119, `release` 87, `reject` 45, `registry` 42, `log` 45 | transport + auth module |
| the whole claims layer (`src/lib/claims`) — platform-independent | the adapter: preview / execute / undo per ActionKey |
| `executionPolicy`, `requestApproval`, `pending_approvals`, `result_details`, the approval cards | a resource resolver (Shopify's is 219 lines) |
| autonomy: `canHoldL1` / `canHoldL2`, the `undoes` contract | a live verification script |
| `PlatformId`, the `publish_actions` CHECK — both already done | producer wiring (15 `platform:` call sites in `masterBrainV2`) |

**The producer layer already has the precedent.** `propose_page_meta`
routes between `hawlai_site` and `shopify`, and its comment states the
rule a third and fourth platform will follow: the claims check sits
**above** the branch, because what the guard does to a sentence has
nothing to do with where the sentence is going, and duplicating it per
platform is how one copy drifts.

---

## 3. Why WordPress goes first

Cheapness is the second reason. The first is technical:

**WooCommerce's API is a WordPress REST namespace.** `/wp-json/wc/v3/…`
and `/wp-json/wp/v2/…` are the same host, the same auth, the same error
envelope. The transport, auth and error-mapping module built for
WordPress is the module WooCommerce uses. Building WooCommerce first
means building that module anyway and then leaving most of the content
half unbuilt.

WordPress also unlocks the stated need — the M1/M3 SEO and AEO content
surface — with the smallest possible surface area.

| | WordPress (content + Yoast meta) | WooCommerce (full parity) |
|---|---|---|
| ActionKeys | `publish_post`, `update_post`, `update_page_text`, `update_page_meta` | those, plus `update_product_price` / `_description` / `_name`, `create_discount_code` |
| Transport | new, ~150–250 lines (REST, no token refresh) | reuses WordPress's |
| Adapter | ~400–700 lines | ~800–1,200 lines |
| Catalogue work | **none** | `ProductSource` union + 5 consumers + a `businessFacts` decision |
| Rough | **5–7 commits** | **8–12 commits**, plus the catalogue decision |

**WooCommerce's biggest unknown is the catalogue, not the adapter.**
`ProductSource = "shopify" | "hawlai_shop"` today; a third member
reaches `productSource.ts`, `ProductPicker.tsx`, `adEngine`,
`ads/destination.ts` and `dashboardData`. And the real question is
upstream of all of them: `businessFacts.fetchCatalog` reads Hawlai's own
`products` table, so Woo products need either a live read or a sync.
That is its own small initiative, and the owner has deferred it.

---

## 4. Auth — three different access models

Both new platforms are **simpler than Shopify**, which needs OAuth, a
token refresh (`shopifyToken.ts`, 197 lines) and GraphQL.

**WooCommerce REST** — consumer key + consumer secret, sent as HTTP
Basic (or as a query string, HTTPS only). Generated in the WooCommerce
admin, or through the `/wc-auth/v1/authorize` handshake, which is what
`woocommerce_connect_pending` and the existing start/callback routes
were built for. Scope `read_write`. **No expiry and no refresh**, so
none of the token-refresh machinery is needed.

**WordPress REST** — Application Passwords, core since 5.6. Basic auth
with `username:app_password`. Per-user, revocable, no expiry, and
**no scopes**: the credential is exactly as powerful as its user. That
last point is why plaintext storage is not a stylistic objection.
(OAuth1 on WordPress needs a plugin, so it is not worth the dependency.)

**Yoast, for SEO meta.** WordPress core REST exposes `title`, `content`,
`excerpt`, `slug`, `status` and registered `meta` — it does **not**
expose an SEO title or description, because those are not core concepts.
They are plugin fields. The owner has chosen **Yoast**, so the adapter
reads and writes Yoast's own meta keys, and the preview must be able to
say "this site does not have Yoast" as an honest refusal rather than
writing a key nothing reads. Treat the exact key names and their REST
exposure as **unverified until a real site accepts a write** — this is
precisely the shape of all four Shopify corrections.

---

## 5. Test site

There is no WooCommerce or WordPress equivalent of
`hawlaitest.myshopify.com`, and without one nothing can be verified. The
value of having one is not theoretical: on 22 November the Shopify
verification script caught a `metaTitle` producer bug that had been
silently refusing step 1 since 20 November, invisible to 7,700 passing
tests.

This machine has **no Docker, no PHP and no wp-cli**, so a local site
cannot be stood up as things are.

| Option | Cost | Time | Usable? |
|---|---|---|---|
| WordPress.com free | ₹0 | 5 min | **No.** No plugins on the free plan, so no WooCommerce and no Yoast; and its API is WordPress.com OAuth, not self-hosted application passwords. |
| Temporary sandbox (InstaWP / TasteWP free tier) | ₹0 | ~10 min | **Yes** for adapter verification. Full admin, plugins allowed. Expires in hours or days. |
| Local via Docker Desktop | ₹0 | 30–60 min | **Yes** for adapter verification — the verification script runs locally, as the Shopify one does. **Not reachable from Vercel**, so the full chat → approval → publish path cannot be exercised. |
| Cheap permanent host or small VPS | ~₹200–500/mo | 1–2 h | The real equivalent: public, permanent, a standing fixture. |

---

## 6. The founder's decisions, 22 November 2026

1. **The security fix comes first, standalone and non-negotiable.**
   Encrypt `wordpress_app_password` the way migration 160 encrypted the
   others. A plaintext admin-access credential does not stay.
2. **Delete `publishWordPressPost`.** The adapter will be the only
   route; the old function is removed so nobody wires it by mistake.
3. **WordPress first, then WooCommerce**, for the transport/auth reuse
   reason in §3.
4. **Temporary free sandbox first** (InstaWP / TasteWP) to verify the
   adapter. A permanent VPS only if the work proceeds.
5. **Yoast SEO meta is in Phase 1**, alongside posts and pages — not
   deferred.
6. **WooCommerce catalogue and coupon decisions are deferred** until the
   WooCommerce phase begins.

## 7. What is still open

- Yoast's exact meta keys and their REST exposure — **unverified** until
  a real site accepts a write.
- Whether `update_page_meta` on WordPress should refuse outright when
  Yoast is absent, or fall back to core fields. Refusing is the position
  this codebase's precedent supports: a write to a key nothing reads is
  the silent no-op shape that has already cost four live corrections.
- WooCommerce: live catalogue read vs sync into `products`; whether
  `create_discount_code` is in scope. Both deferred by the owner.
