# Open items

Deliberately deferred work, recorded here because this codebase has no
`TODO` markers — a fact the 2026-09-01 audit established, and which
cuts both ways: anyone grepping for outstanding work finds nothing.

Each item states what is left, why it was deferred, and what unblocks
it. Delete an entry when it is done.

---

## 1. Encrypt `fb_page_access_token` and `instagram_access_token`

**Status:** blocked on live testing
**Unblocked by:** the four pending live tests passing (Master Chat,
Canva, Shopify, dashboard)

The other twelve marketing OAuth columns were encrypted in migration
165. These two were held back deliberately:

- **Neither ever refreshes.** `fb_page_access_token` is written once at
  connect; `instagram_access_token` is pasted manually. So unlike the
  others, there is no gradual migration — a backfill is the only path.
- **`fb_page_access_token` spans 13 files** across lead ingestion, ad
  launch, analytics and the webhook handlers. It is the most
  load-bearing credential in the product.

Touching that surface immediately before testing Canva, Master Chat,
Shopify and the new dashboard would make any regression impossible to
attribute — you would be debugging encryption and four other things at
once.

**When doing it:** same two-phase shape as 165 — add encrypted columns,
deploy dual-read code, backfill immediately (no wait), drop plaintext
in a later migration. `src/lib/crypto/oauthSecrets.ts` already has the
helper shape; extend `OAuthProvider` and add the Meta columns.

---

## 1b. Drop the plaintext marketing OAuth columns

**Status:** ready when convenient
**Unblocked by:** nothing — safe to do now

Migration 165 added the encrypted columns; the backfill ran on
2026-09-03 and encrypted the two live values (one dealership's Gmail
pair). A confirming dry run reported `to encrypt: 0`, and the stored
ciphertext was verified to decrypt from the live database.

The twelve plaintext columns are still populated and still read as a
fallback. Dropping them is the same shape as migration 164, with the
same ordering rule: the code must stop naming them BEFORE the drop
runs, which means editing `oauthSecrets.ts` to select only the
encrypted columns first, deploying, then dropping.

Low urgency — 94 of 96 columns are empty — but it should not drift.

---

## 2. Middleware double-auth on `/api/*`

**Status:** recorded, needs a deliberate decision
**Also noted in:** `src/middleware.ts`, above the matcher

Every `/api/*` request pays two auth round-trips — once in middleware,
once in the route handler. Excluding `/api` from the matcher would
halve it and was deliberately not done during the blank-dashboard fix:
a handful of routes (`/api/creative/video/models`, `/api/icon-library`
among them) have no auth check of their own and rely on middleware for
it, so excluding `/api` wholesale would quietly make them public.

**To do it properly:** give those routes their own auth checks first,
then narrow the matcher.

---

## 3. Unsigned webhooks: `whatsapp` and `vapi`

**Status:** recorded, not scheduled

`/api/webhooks/meta-leads` and `/api/webhooks/meta-messaging` now
verify `X-Hub-Signature-256`. `/api/webhooks/resend` verifies its own.
Two remain unsigned:

- `/api/webhooks/whatsapp` — Gupshup's scheme, not Meta's
- `/api/webhooks/vapi` — Vapi's scheme

Neither is a one-line change with the existing helper, since both use
different signature schemes. Both are unauthenticated writes reachable
by anyone who learns the URL.

---

## 4. Heavy cron group may not fit in 60 seconds

**Status:** live limitation, mitigation proposed not built

Vercel Hobby caps function duration at 60s. The `heavy` cron group
runs three LLM-backed subsystems plus five third-party integrations
across every dealership in one invocation. Eight dealerships is
already unlikely to fit.

Partial-run detection (R7) makes this **visible** — an incomplete run
returns 500 and Vercel records a failed cron — but does not fix it.

**Proposed fix:** per-dealership batching with a cursor, so each
invocation processes a bounded slice and the next resumes where it
stopped.

**Also in this class:** four routes declare `maxDuration = 300` on a
plan that caps at 60 — `master-brain`, `website-builder`, `3d-scenes`,
and the `whatsapp` webhook. They are either being silently capped or
would fail on a config change. Not investigated.

---

## 5. Grep-based audit findings carry a systematic caveat

**Status:** methodological, applies to the 2026-09-01 audit artifact

The audit's dead-code detection searched for `href`/route strings and
missed pages imported as **components** rather than navigated to. That
produced at least one wrong retraction-worthy finding.

Anything in that audit derived from grepping — dead code, call-site
counts, "nothing references X" — carries the same risk and should be
re-verified before being acted on.
