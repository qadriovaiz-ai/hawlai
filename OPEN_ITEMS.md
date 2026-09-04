# Open items

Deliberately deferred work, recorded here because this codebase has no
`TODO` markers — a fact the 2026-09-01 audit established, and which
cuts both ways: anyone grepping for outstanding work finds nothing.

Each item states what is left, why it was deferred, and what unblocks
it. Delete an entry when it is done.

---

## 0. Route-level smoke tests — hit every route, assert it works

**Status:** SCHEDULED. Next work item after the Shopify and
WooCommerce connects are verified live. Decided 2026-09-04, after the
third incident in a week.
**Unblocked by:** nothing

THREE production incidents in three days got past a green build and a
full test suite, because all three were RUNTIME failures the compiler
cannot see:

- **2026-09-02** — a redirect loop plus a request storm left the
  dashboard blank. `tsc` and `next build` both passed.
- **2026-09-03** — `buttonClasses` was a client export called from
  thirteen server components. Every one of those pages returned 500.
  263 tests passed and the build was green the entire time.
- **2026-09-04** — the auth middleware matched both new OAuth
  callbacks and 307'd them to `/auth/login`. WooCommerce connect was
  COMPLETELY BROKEN on arrival: its store POSTs credentials
  server-to-server with no cookie, so the credentials were never
  stored and the dealer got no error. Shopify survived only because
  its callback is a browser redirect carrying the user's own cookie.
  349 tests passed, including 21 written specifically for the
  WooCommerce flow.

The third is the sharpest argument yet, because the tests were not
thin. They covered the SSRF guard, the nonce format, the HMAC rule,
and the expiry arithmetic — and none of them could have caught it,
because not one executed the route in its real environment. It was
found by curling production after deploying.

`next build` prerenders only static routes; everything behind auth is
dynamic and therefore never executed. That gap is where all three
lived.

**What to build:**

1. **Route reachability.** Hit every route and assert it neither 5xx's
   nor redirects somewhere unexpected. The redirect half is not
   optional — the 2026-09-04 incident was a 307, not a 500, and a
   smoke test that only checked for 5xx would have passed it.
2. **Page render.** Request every page with a session and assert
   non-5xx. Content assertions are not the point; executing the render
   is.
3. **Middleware matcher.** Already built and already earning its keep
   — `tests/middlewareMatcher.test.ts` evaluates the real exported
   matcher against real paths in both directions. It caught the
   missing `$` anchor, without which a future
   `/api/integrations/shopify/callback-verify` would have been
   silently public. Fold it into the suite rather than rewriting it.

Authenticated routes need a session, so this likely means Playwright
with a seeded test user, or a request-level harness with a mocked
Supabase session.

**Why it is worth the setup cost:** it is the only check covering
server/client boundary violations, middleware matcher mistakes,
missing env vars at runtime, RLS denials on a page query, and
dropped-column references — five distinct failure classes, none
visible to `tsc`, three of which have now actually happened here.

---

## 0b. Nobody is reading CI

**Status:** needs a decision, not code

The GitHub Actions workflow runs typecheck, tests and build on every
push to `main`. It exists precisely so a broken commit fails before a
deploy does.

On 2026-09-03, commit `ae1b96f` shipped a build-breaking import.
Vercel surfaced it first; the Actions run either had not finished or
had gone red unread. Either way the signal existed and was not acted
on.

**A CI pipeline nobody watches is close to no CI at all.** Options,
roughly in order of effort: branch protection so `main` cannot take a
red commit; a notification on failure (Slack, email); or simply making
it habit to check the run before deploying.

Worth deciding deliberately rather than assuming the workflow is doing
a job it is not.

---

## 0c. A2 and A5 are NOT Group A — both need a registration round

**Status:** reclassified after research, not built
**Unblocked by:** Meta Tech Provider onboarding (A2); a Google OAuth
verification submission (A5)

I grouped both as "pure wiring, nothing blocked" in the connection
audit plan. Verifying before building showed that was wrong in both
cases, in the same way: the credential can only be obtained
automatically through a programme that has to be applied for.

**A2 — Meta Conversions API token.** The plan was to reuse the
long-lived user token from the existing Facebook OAuth as the CAPI
token. Two problems, and the second is the disqualifying one:

- Meta's own documentation does not state that a user access token is
  accepted at `POST /{pixel_id}/events`. It documents two paths:
  generate one in Events Manager, or use a System User token. Third
  parties report user tokens working, but building on an undocumented
  behaviour for the credential that carries purchase data is not a
  trade worth making.
- Even where it works, a long-lived user token expires in ~60 days.
  Today a dealer pastes a non-expiring Events Manager token once.
  Replacing that with a credential that dies silently after two
  months, taking server-side purchase tracking with it, is a
  REGRESSION dressed as an improvement — and the failure is invisible
  until someone notices conversions have quietly dropped.

The clean path is Meta Business Extension / Tech Provider onboarding,
which issues a non-expiring system user token through OAuth. That is
a registration, so A2 belongs with Shopify in Group B.

**A5 — GA4 measurement ID and GTM container ID.** Reading these needs
`analytics.readonly` and `tagmanager.readonly`. Both are Google
SENSITIVE scopes: they require app verification before any account
outside the test list can grant them — a submission with written
justification and a video demonstration, and 3–5 business days.

The app already requests `adwords`, itself a sensitive scope, so the
verification posture needs checking before anything is built: adding
scopes to a verified app means re-submitting, and if the app is
currently in Testing mode then every Google connection is already
capped at 100 test users.

**Neither was built.** Both would otherwise have shipped as code that
looks finished and cannot work.

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
