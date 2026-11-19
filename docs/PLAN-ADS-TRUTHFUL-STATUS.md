# Plan — truthful ad status, and checks before the money starts

Plan only. Nothing in this document has been built.
Written 19 November 2026 against commit `f9509cfc`.

---

## 0. Status of this document

**Approved 19 November 2026** as the base, with items G–J added (section 9).
The knowledge pack was superseded by a self-contained instruction, so
there is no separate document to check against any more.

Sections 1–8 were written before the live test was diagnosed; they stand.
Section 9 is the new work, and section 10 records what the live test
actually proved.

---

## 1. Current state — what is already built

Most of "truthful status" is built, and built carefully. This is the
part worth knowing before planning anything: the big mistake here would
be to rebuild it.

### Launch already creates everything paused

| What | Where |
|---|---|
| Campaign created `PAUSED` | [launchCampaign.ts:133](src/lib/ads/launchCampaign.ts:133) |
| Ad set created `PAUSED` | [launchCampaign.ts:167](src/lib/ads/launchCampaign.ts:167) |
| Ad created `PAUSED` | [launchCampaign.ts:180](src/lib/ads/launchCampaign.ts:180) |
| Row stored `meta_status: "PAUSED"` | [launchCampaign.ts:198](src/lib/ads/launchCampaign.ts:198) |
| Budget sharing explicitly off | [launchCampaign.ts:135](src/lib/ads/launchCampaign.ts:135) |

**This settles the Ads Manager drafts question.** Hawlai names a campaign
`Hawlai - <category> - <date>` ([launchCampaign.ts:131](src/lib/ads/launchCampaign.ts:131)),
an ad set `<headline> - AdSet` ([:156](src/lib/ads/launchCampaign.ts:156)),
an ad `<headline>` and a creative `<headline> - Creative`
([:96](src/lib/ads/launchCampaign.ts:96)). Nothing in this repo can produce
a "New Sales ad set", "New Leads ad" or "New Traffic ad". **Those drafts
in your Ads Manager were not created by Hawlai** — they are from the Ads
Manager UI itself. Deleting them is safe as far as this codebase is
concerned.

### Status is already read at three levels, not one

[campaignStatus.ts](src/lib/ads/campaignStatus.ts) exists precisely
because of the bug you are describing, and its header comment records it:
the activate path once POSTed `ACTIVE` to the ad alone, Meta accepted it,
the dashboard said ACTIVE, and the campaign above it was still paused.

- `readCampaignState` ([:146](src/lib/ads/campaignStatus.ts:146)) reads
  campaign, ad set and ad, **and checks the parent ids on file against
  Meta's own hierarchy** — a mismatch refuses rather than guessing.
- `running` is `levels.every(l => l.effective === "ACTIVE")`
  ([:183](src/lib/ads/campaignStatus.ts:183)). One definition, shared.
- `explainEffective` ([:80](src/lib/ads/campaignStatus.ts:80)) turns
  `CAMPAIGN_PAUSED` / `PENDING_BILLING_INFO` / `DISAPPROVED` into a
  sentence the owner can act on.
- `notDeliveringNote` ([campaignDeliveryDisplay.ts:122](src/lib/ads/campaignDeliveryDisplay.ts:122))
  already says "Active, not delivering" when Meta says ACTIVE with 0
  impressions and ₹0 spent.
- Reads retry transient errors three times
  ([metaRead.ts:43](src/lib/ads/metaRead.ts:43)), and "Meta accepted it
  but I could not read it back" is its own outcome (`unconfirmed`), not
  a failure.

Every surface goes through it: Analytics
([campaign-status/route.ts:85](src/app/api/ads/campaign-status/route.ts:85)),
the analytics agent ([analyticsAgent.ts:384](src/lib/agents/analyticsAgent.ts:384)),
chat's publish path ([publish/platforms/meta.ts:137](src/lib/publish/platforms/meta.ts:137)),
and the approvals route ([decide.ts:260](src/lib/approvals/decide.ts:260)).

### The minimum daily budget is already read from Meta, never hardcoded

[adAccountLimits.ts:130](src/lib/ads/adAccountLimits.ts:130) asks Meta for
`min_daily_budget,currency,account_status`, caches it for 7 days
([:20](src/lib/ads/adAccountLimits.ts:20)), and `clampBudgetToMinimum`
([:110](src/lib/ads/adAccountLimits.ts:110)) raises a too-small budget to
Meta's own floor. Account status codes 2 and 3 already have owner-language
explanations ([:37](src/lib/ads/adAccountLimits.ts:37)).

### Approval-first is already enforced on the spend moment

[`/api/ads/[id]/status`](src/app/api/ads/[id]/status/route.ts:66) is the
real-money trigger. Activating checks authority and queues a
`pending_approvals` row when the person lacks it
([:112](src/app/api/ads/[id]/status/route.ts:112)); pausing is never
gated ([:60](src/app/api/ads/[id]/status/route.ts:60)).

---

## 2. The gaps

Eight, in the order they matter. Two are serious, one is blocking.

### A — SERIOUS. The ad account is not part of the live status read

`readCampaignState` reads campaign → ad set → ad. **It never reads the
account.** If the ad account is disabled (`account_status` 2) or has an
unsettled balance (3), all three objects can report `effective_status:
ACTIVE` and nothing delivers. The dashboard will say **Active**.

`isAccountUsable` exists and already has the right words for it
([adAccountLimits.ts:56](src/lib/ads/adAccountLimits.ts:56)) — it is
simply never called at read time.

This is the same class of failure the file was written to fix, one level
higher up.

### B — SERIOUS. The activation route never checks the account

[adlaunch/route.ts:63](src/app/api/ads/adlaunch/route.ts:63) refuses a
dead account before launching — and launching **spends nothing**, because
everything is created paused.

[`/api/ads/[id]/status`](src/app/api/ads/[id]/status/route.ts) is the call
that actually starts the spend, and it does **not** check the account. The
check is on the harmless door and missing from the dangerous one.

### C — Funding source, prepaid balance and spend cap are never read

`fetchAdAccountLimits` asks for three fields only. Nothing anywhere reads
`funding_source_details`, `balance`, `amount_spent` or `spend_cap`. An
account with a valid card but an exhausted spend cap, or an Indian prepaid
account with ₹0 topped up, reads as perfectly healthy here.

### D — There is no shared pre-flight validator

The checks exist; they are scattered and each door gets a different set:

| Check | Where it lives | `adlaunch` | `preview` | chat launch |
|---|---|---|---|---|
| Page / ad account / token connected | route body, [adlaunch:44](src/app/api/ads/adlaunch/route.ts:44) | yes | — | not verified |
| Account usable | [adlaunch:63](src/app/api/ads/adlaunch/route.ts:63) | yes | [preview:108](src/app/api/ads/preview/route.ts:108) | not verified |
| Budget ≥ Meta minimum | `clampBudgetToMinimum` | yes | yes | not verified |
| Destination resolvable | [destination.ts:117](src/lib/ads/destination.ts:117) | yes | — | — |
| Instant Form exists | route body, adlaunch | yes | — | — |
| Special-category radius floor | [metaTargeting.ts:58](src/lib/ads/metaTargeting.ts:58) | in builder | in builder | in builder |
| Image present and decodable | route body | yes | — | — |

Nothing can answer "is this campaign launchable?" in one call, so nothing
can tell the owner the full list of what is wrong — only the first thing
that happens to fail.

### E — No Instagram identity is ever set

Neither `instagram_actor_id` nor `instagram_user_id` appears anywhere in
`src/`. Grep is clean. Ads are created with `page_id` only
([launchCampaign.ts:98](src/lib/ads/launchCampaign.ts:98)), so Meta falls
back to the Page's own Instagram presence or drops Instagram placements.

### F — Nothing is ever validated before it is created

No `execution_options`, no `validate_only` anywhere in `src/`. The only
way this codebase finds out a campaign is invalid is to create it and read
the error.

### G — A duplicate `setCampaignStatus` that is the old bug

[campaignEditAgent.ts:183](src/lib/agents/campaignEditAgent.ts:183) is a
second function of the same name that POSTs `status` **to the ad only**,
never reads `effective_status`, and writes `meta_status` locally as though
it were confirmed. It is exactly what
[campaignStatus.ts:3](src/lib/ads/campaignStatus.ts:3) documents replacing.

It has **one caller** — [autopilotAgent.ts:145](src/lib/agents/autopilotAgent.ts:145),
and only with `"PAUSED"`. Pausing an ad does stop that ad, so this is not
currently lying to anyone. It is a loaded gun: one `"ACTIVE"` caller
reintroduces the original defect in full. It also uses the Page token,
which this codebase's own notes say cannot read campaigns and ad sets
([metaToken.ts:10](src/lib/ads/metaToken.ts:10)).

### H — BLOCKING. Four columns the code reads exist in no migration

`src/lib/ads/adAccountLimits.ts` selects `fb_min_daily_budget`,
`fb_currency`, `fb_account_status`, `fb_limits_checked_at`
([:153](src/lib/ads/adAccountLimits.ts:153)).

**No migration in `supabase/migrations/` creates any of them.** I grepped
all 228 files for `min_daily_budget`, `account_status` and
`limits_checked` — zero hits. Only `fb_ad_account_id` is in a migration.

Either they were added by hand in production (likely, given the standing
practice), or `/api/ads/preview` and the adlaunch account check are
failing in production right now, because PostgREST rejects a whole SELECT
when one column is missing. **This has to be settled before anything else
is planned** — see section 4.

---

## 3. Where the new code goes, and what calls it

Two new modules. **No new chat tool, no new page, no new department** —
Rule 5 is untouched.

### `src/lib/ads/accountHealth.ts`

One function: "can this account pay right now, and what does it say if
not". Reads `account_status`, `funding_source_details`, `balance`,
`spend_cap`, `amount_spent` in the single Graph read `adAccountLimits`
already makes. Returns the same shape `isAccountUsable` returns today, so
it is a widening, not a replacement.

Called by:

- `readCampaignState` ([campaignStatus.ts:146](src/lib/ads/campaignStatus.ts:146))
  — so every "Active" in the product already runs through it (gap A).
- `/api/ads/[id]/status` before flipping ACTIVE (gap B).
- `preflight.ts` below.

### `src/lib/ads/preflight.ts`

One function taking a draft and returning **every** problem, not the first.
It calls the checks that already exist — `isAccountUsable`,
`clampBudgetToMinimum`, `resolveAdDestination`, `buildMetaTargeting`'s
radius floor — and adds the Meta dry run (gap F). Nothing is reimplemented.

Called by:

- `/api/ads/adlaunch` ([route.ts:63](src/app/api/ads/adlaunch/route.ts:63)), replacing the scattered checks
- `/api/ads/preview` ([route.ts:98](src/app/api/ads/preview/route.ts:98))
- `/api/retargeting/campaign`
- chat's launch path, via the existing tool — **no new tool**

---

## 4. Migrations

**Probably none. But this cannot be assumed, and one thing must be checked
before any of it is built.**

Run this and send me the output. It decides whether commit 0 exists at all:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'dealerships'
  and column_name in (
    'fb_ad_account_id', 'fb_min_daily_budget', 'fb_currency',
    'fb_account_status', 'fb_limits_checked_at'
  )
order by column_name;
```

- **Five rows back** → the columns were added by hand, the repo is missing
  the migration file, and commit 0 is a migration file that records what
  production already has (`add column if not exists`, so it is a no-op there).
- **Fewer than five** → `/api/ads/preview` and the adlaunch account check
  are broken in production today, and commit 0 is the real migration. That
  would also mean gap B is worse than described: the account check in
  adlaunch is not merely in the wrong place, it is not running at all.

Everything after gap C is read live from Meta and cached in the columns
above, so **no new column is needed** for funding or balance — the 7-day
cache ([adAccountLimits.ts:20](src/lib/ads/adAccountLimits.ts:20)) is the
wrong place for a balance anyway, which changes hourly. It gets read at
decision time and never stored.

---

## 5. Graph API verification

Checked against Meta's current documentation, not memory.

**1. `instagram_user_id`, never `instagram_actor_id`.** `instagram_actor_id`
was deprecated in Marketing API **v22.0** and replaced by
`instagram_user_id` (alongside `instagram_story_id` →
`source_instagram_media_id`). This repo is on **v23.0**
([adEngine.ts:18](src/lib/adEngine.ts:18)), so the old field is not
available to us. Meta's error reference also says sending **both** is an
error, so this is a swap, never an addition. Since the repo sets neither
today, there is nothing to migrate — gap E is a clean addition of the
correct field.

**2. Budget sharing.** `is_adset_budget_sharing_enabled: false` is already
set at the campaign ([launchCampaign.ts:135](src/lib/ads/launchCampaign.ts:135)).
Correct as-is; nothing to change. **Unverified against your doc**, which I
could not read.

**3. Minimum daily budget.** Read live from the account's
`min_daily_budget`, in minor units, with the account's own currency
([adAccountLimits.ts:130](src/lib/ads/adAccountLimits.ts:130)). Already
right — this is the field, and it is already never hardcoded.

**4. Age and country rules.** `age_min`/`age_max` are valid 13–65 and the
repo already records this ([metaTargeting.ts:12](src/lib/ads/metaTargeting.ts:12)),
along with the special-ad-category radius floor of 25km
([:58](src/lib/ads/metaTargeting.ts:58)) and the 250-city cap
([:23](src/lib/ads/metaTargeting.ts:23)). **I have not re-verified these
against Meta's live docs** — they are recorded here as the repo's existing
belief, and the dry run in point 5 makes verifying them by hand
unnecessary, because Meta itself will say.

**5. `validate_only` is real, and is the best thing in this plan.**
`execution_options: ["validate_only"]` is supported on campaign, ad set
and ad creation; it runs the full validation and performs no mutation.
Better still, `synchronous_ad_review` — which Meta says must only be used
*together with* `validate_only` — runs the **Ads Integrity** checks:
message language, the image text rule, and the rest of the policy logic.

That is the whole pre-flight, done by Meta, for free, with nothing created
and nothing spent. It replaces guessing at Meta's rules with asking it.

Sources: [v22.0 changelog](https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/version22.0),
[Instagram Marketing API update](https://developers.facebook.com/blog/post/2025/08/11/instagram-marketing-api-update/),
[Error reference](https://developers.facebook.com/docs/marketing-api/error-reference/),
[Ad account ads reference](https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads),
[Ad account campaigns reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/campaigns).

---

## 6. Sizes, order, and the riskiest part

Status first, as you asked.

| # | Commit | Gap | Size |
|---|---|---|---|
| 0 | Record the four `fb_*` columns as a migration, or add them | H | **S** — blocked on the query in section 4 |
| 1 | The account is part of "Active" — `accountHealth.ts`, wired into `readCampaignState` | A | **S** |
| 2 | The activate route checks the account before it flips | B | **S** |
| 3 | Funding source, balance and spend cap in the same read | C | **M** |
| 4 | One `preflight.ts`; the three launch doors call it | D | **M** |
| 5 | Meta's own dry run — `validate_only` + `synchronous_ad_review` | F | **M** |
| 6 | Delete the duplicate `setCampaignStatus`; autopilot uses the real one | G | **S** |
| 7 | `instagram_user_id` on the creative | E | **L** |

**The riskiest part is 7, and it is last for that reason.** It changes
what Meta is asked to create. A wrong or wrongly-permissioned Instagram id
fails the creative at create time, which means a launch that works today
stops working — and I cannot verify it without a real ad account with a
connected Instagram business profile. Commit 5 lands before it on purpose:
once the dry run exists, commit 7 can be verified against Meta without
creating anything.

**Commit 6 has a dependency worth stating:** autopilot currently pauses
through the ad alone. Moving it to the real `setCampaignStatus` means a
pause now reads back from Meta before reporting success — which is
correct, and slower. It stays a pause, so Rule 6's "switching off is never
gated" is untouched.

**One thing for your decision, on Rule 6.** The dry run in commit 5 is a
Graph `POST` that creates nothing and spends nothing. My reading is that it
needs no `executionPolicy` entry, because nothing is sent, posted or spent.
But it is a new POST to Meta, and `approvalCoverage.test.ts` is
deliberately suspicious of exactly that. I will not decide this one
quietly — tell me which way, and if you want it registered I will register
it as a non-gated action with a reason.

---

## 7. The tests

### Commits 1–2 (the account in the status read)

- One fixture per `account_status` code: 1 usable, 2 disabled, 3 unsettled,
  and an undocumented code → treated as **unknown, not usable**, never
  silently fine.
- **The load-bearing one:** campaign, ad set and ad all `ACTIVE`, account
  status 3 → the owner-facing label is **not** "Active".
- The activate route with a dead account → refuses, writes nothing to Meta.
- Pausing with a dead account → **still works.** Switching off is never
  blocked, not even by this.

### Commit 3 (funding and balance)

- Zero prepaid balance with a healthy status → not usable.
- Spend cap reached (`amount_spent >= spend_cap`) → not usable, with the
  cap named.
- `spend_cap: 0` → means **no cap**, not a cap of zero. A fixture pinning
  this, because getting it backwards would pause every account.
- A missing field → unknown, never assumed healthy.

### Commit 4 (preflight)

One failing fixture per rule, each asserting **the specific sentence**: no
page, no ad account, dead account, budget under minimum, unresolvable
destination, instant-form destination with no form, special category under
the radius floor, undecodable image, missing destination URL.

Plus: **a draft with three faults reports all three.** That is the whole
point of the module, and a first-failure-wins implementation passes every
single-fault test above.

### Commit 5 (dry run)

- `execution_options` contains `validate_only` on every create call.
- **`synchronous_ad_review` never appears without `validate_only`** — Meta
  says so, and alone it would mean a real creation.
- Meta returning a policy rejection → surfaced in the owner's words,
  nothing created.
- Meta unreachable → the dry run is **inconclusive, not a pass**. A check
  that could not run must not read as a check that succeeded.

### Commit 6 (the duplicate)

- `campaignEditAgent.ts` no longer exports `setCampaignStatus`.
- Autopilot's pause goes through `lib/ads/campaignStatus`, verified by
  `effective_status`, not by a local write.

### Commit 7 (Instagram)

- The creative carries `instagram_user_id`.
- **`instagram_actor_id` appears nowhere** — deprecated at v22.0, and
  sending both is an error.
- No Instagram connected → the ad is still created, Facebook-only. An
  optional identity must not become a new way to fail.

### Mutation checks

Each commit's load-bearing assertion gets a mutation that genuinely fails:
flip `every` to `some` in the running check; return `usable: true` for an
unknown status code; drop `validate_only` from the options array; return
the first preflight failure instead of all of them. Survivors get reported,
and the **test** gets fixed, not the report.

Source-grep tests use `code()` from [tests/helpers/source.ts](tests/helpers/source.ts),
**sliced to the block before anchoring** — `indexOf` on a bare name lands
on the import.

---

## 8. What was wrong in the original brief

**"Everything is created paused" — already true.** Not a gap. Three
`status: "PAUSED"` writes, lines 133, 167 and 180 of `launchCampaign.ts`,
plus the stored row at 198.

**"Three-level status check" — already built**, in `campaignStatus.ts`,
with the hierarchy-mismatch refusal on top of it. The gap is the **fourth**
level, the account, which is not in the doc as you summarised it.

**"Never hardcode the minimum daily budget" — already honoured**, read live
from Meta at `adAccountLimits.ts:130`.

**The Ads Manager drafts are not ours.** "New Sales ad set", "New Leads ad",
"New Traffic ad" cannot be produced by this codebase — every object it
creates is named from `Hawlai - ` or the headline. If the doc treats those
as evidence of a Hawlai bug, that premise is wrong, and any fix built on it
would be fixing nothing.

**`instagram_actor_id` is the deprecated field.** v22.0 replaced it with
`instagram_user_id`, and we are on v23.0.

---

## 9. Items G–J

Added 19 November 2026, after the live test.

---

### G — The silent non-delivery detector

**What exists.** The *display* half is built and the *detection* half is
not.

[`notDeliveringNote`](src/lib/ads/campaignDeliveryDisplay.ts:122) already
produces the sentence — it names this exact campaign in its comment
([:109](src/lib/ads/campaignDeliveryDisplay.ts:109)): Active on Meta for
19 days, 0 impressions, ₹0 spent. But it is a **pure display function in
a client component**. It fires only when somebody opens Analytics and
looks at the row. Nobody opened it for 70 days, so nobody was told.

There is no detector anywhere. The daily run has no Meta delivery read:
`budget_alerts` ([budgetAlertAgent.ts](src/lib/agents/budgetAlertAgent.ts))
compares `ad_creatives.daily_budget` against
`campaign_performance_history.spend` — **database only**. A campaign
spending ₹0 trips no budget alert, because ₹0 is under budget. The one
condition that means "broken" is indistinguishable from "thrifty".

**What gets built.** A new subsystem `delivery_watch` in the `heavy`
group, before `daily_autopilot`
([cronGroups.ts:127](src/lib/automation/cronGroups.ts:127)). `heavy`
because this file's own rule settles it: `signals` is "database-only and
fast" and this is a live Graph read. **No new cron entry** — Vercel Hobby
allows two and both are used; a subsystem key is the established way
around that, the way `decision_results` and `monthly_review` already are.

Alerts go through [`emitNotification`](src/lib/notifications/emit.ts), the
same channel `budget_alerts` uses, with a new kind. No new panel, no new
page.

The diagnosis runs in your order and **stops at the first failure**, so
the owner gets one cause, not a list of nine checks:

1. account status and funding → 2. Page/Instagram access → 3. effective
status at all three levels, plus issues and review state → 4. schedule →
5. budget vs the live minimum, bid cap → 6. audience size → 7. learning
stage → 8. only once delivery exists: creative, landing page, pixel, cost.

The on-demand half reuses
[`/api/ads/campaign-status`](src/app/api/ads/campaign-status/route.ts),
which already does the live three-level read when the page opens.

**The 1h / 24h / 72h checks** are not timers. The daily run records the
first-impression time per campaign; each morning it asks which of those
marks a campaign has passed without an impression. A campaign launched at
any hour is therefore checked at the next run after each mark. Honest
about what a once-daily run can do, rather than pretending to a 1-hour
cadence a 2-cron budget cannot buy.

**Success is the first impression, not the launch.** That is the one
sentence that would have caught this in September.

| | |
|---|---|
| **Size** | **L** — the largest item here |
| **Riskiest part** | Alert volume. A detector that fires on every campaign in its first hour trains the owner to ignore it, which is worse than silence. The 24-hour floor before the first alert is load-bearing, and so is one alert per campaign per cause. |

**Tests.** Active 25 hours with 0 impressions → alert, with the diagnosed
cause. Active 23 hours with 0 impressions → **no alert**. Active with 1
impression → no alert, ever. Two causes present → the **first** in the
order is reported, not both. Account unfunded and ad set paused → account
is named, because it is cause 1. Meta unreadable → "could not check",
never "delivering fine". The same campaign on two consecutive days → one
alert, not two.

---

### H — Interest targeting: why a candle brand got "Electronic music"

**Found it.** [`resolveInterests`](src/lib/ads/metaTargeting.ts:127) does
this:

```
search?type=adinterest&q=<phrase>&limit=1   →   take data[0]
```

`limit=1`, and **the first result is accepted with no relevance check at
all** ([:110](src/lib/ads/metaTargeting.ts:110)). The input is
`concerns` — pain-point phrases from the brand profile, like
"relaxation" or "ambience", **not** interest-category names. Meta's
search is doing its job; it is being asked a question it was never meant
to answer, and whatever comes back first becomes paid targeting.

That is "Electronic music (music)" on a candle brand. One Graph call, one
unchecked array index, 1.1–1.4M people.

**The fix already exists ten lines below, in the same file.**
[`resolveIncomeBracket`](src/lib/ads/metaTargeting.ts:151) calls the same
endpoint and then **refuses a match that does not read like an income
bracket** (`/income|affluen|earner/i`), with a comment explaining that
silently targeting "luxury cars" for "high income" would be worse than
omitting income entirely. Interests get the identical treatment: the
principle is already written down here, it was just never applied to the
field that spends the money.

**What changes.** Search terms come from **real product records**, not
pain-point phrases. More than one candidate is fetched. Each is
relevance-checked against the product vocabulary the business itself
supplied. Nothing relevant → **broad targeting**, which for a ₹100/day
test is the better answer anyway. Multi-tenant throughout: the check
compares Meta's returned name against the business's own words, and no
trade vocabulary is written into the code.

**Location.** [`resolveLocation`](src/lib/ads/metaTargeting.ts:167)
already reads the business profile and falls back to All India
([:217](src/lib/ads/metaTargeting.ts:217)). Lucknow +25km was not a
default: 25km is `SPECIAL_CATEGORY_MIN_RADIUS_KM`
([:58](src/lib/ads/metaTargeting.ts:58)) — so **this ad set was targeted
as a special ad category**. Worth confirming against the live ad set,
because if the candle business is being classified as housing/employment/
credit, that is its own bug and it also restricts delivery. Added to the
G diagnosis as a check.

| | |
|---|---|
| **Size** | **M** |
| **Riskiest part** | Making it stricter narrows nothing and broadens some ad sets. Broad is correct at ₹100/day, but it is a real change in who sees the ad, so it ships with the before/after targeting written into the launch record. |

**Tests.** A concern phrase matching nothing relevant → **broad, no
interests**. A product term matching a plainly relevant interest → kept.
An irrelevant first result with a relevant second → the relevant one
wins, which `limit=1` cannot do. Meta returning nothing → broad, not an
error. Multi-tenant: the relevance check contains **no** product,
category or industry words — pinned by extending
`multiTenantVocabulary.test.ts`.

---

### I — The India securities and investments declaration

**Nothing exists.** No `regional_regulated_categories`, no
`regional_regulation_identities`, nothing related, anywhere in `src/`.

**What Meta requires.** Two ad-set fields:
`regional_regulated_categories` names which regional regulation applies,
and `regional_regulation_identities` names the payer and beneficiary.
Required on every ad set created on or after 28 July 2025 that delivers
to audiences in India. Verification is through SEBI registration, or
identity/business verification for the exempt.

**What I could not verify, and how we will.** The **exact enum value** for
the India securities category is not in any public documentation I could
find — Meta's blog names the fields but not the values. I will not guess
it. Commit 5's `validate_only` dry run is exactly how it gets confirmed:
Meta validates the ad set and says, and nothing is created. This is the
first real payoff from building the dry run before this item.

**The default is "not finance", and it is never auto-ticked.** Your live
test is the evidence that matters: you published with the box **unchecked**
and the warning cleared. Sending the declaration as false, explicitly, for
every India-targeting ad set.

**A finance business is refused, not launched.** If the business or its
copy is about shares, trading, mutual funds, investment advice or
investment courses, the pre-flight refuses and says Meta requires a
verified advertiser, payer and beneficiary first. Ticking it without that
verification produces the error you already saw — "Verification required
for 1 location", code **#3858541**. Launching into that is worse than
refusing.

**Multi-tenant caution.** Detecting "is this a finance business" must not
become a hardcoded word list, which Rule 3 forbids and which would misfire
on, say, a business whose product is named after a financial term. It
reads the business's own declared category and the claims the copy makes,
through the existing claims layer, and **when it cannot tell, it asks the
owner rather than deciding**. That is the honest behaviour and it is also
the safe one in both directions.

**Read back after creation**, and any regulatory warning Meta returns is
surfaced in the status function rather than swallowed — which is item A's
rule applied to a different field.

| | |
|---|---|
| **Size** | **M** |
| **Riskiest part** | Sending a wrong enum value to every India ad set would break every launch at once. It therefore ships **after** commit 5 and the value is confirmed by dry run before a single real ad set carries it. |

**Tests.** A non-finance business targeting India → declaration sent as
false, ad set created. A finance business → **refused, nothing created**,
with the verification requirement in the message. A business targeting
outside India → the field is not sent. Meta returning a regulatory warning
→ surfaced, not swallowed. **The field is never auto-ticked** — a mutation
that flips the default to true fails the suite.

---

### J — Funds but no payment method

**Nothing exists.** `fetchAdAccountLimits`
([adAccountLimits.ts:130](src/lib/ads/adAccountLimits.ts:130)) asks for
`min_daily_budget,currency,account_status` and nothing else. There is no
read of `funding_source_details` anywhere.

**This is the state your account was in, and it is the point of the
item.** ₹250 of prepaid funds sat in the account and publishing stayed
blocked; adding UPI as a *payment method* unblocked it. Funds and a
payment method are two different things, and an account can have the
first without the second while reading as perfectly healthy here.

Folded into **commit 3**, since it is the same Graph read. Three distinct
states, said in three distinct sentences:

- **No payment method, funds present** → "You have ₹250 in the account but
  no payment method on it. Meta won't publish ads until you add one."
- **No payment method, no funds** → add a payment method.
- **Payment method present, balance low** → a warning, not a block.

| | |
|---|---|
| **Size** | **S** (inside commit 3) |
| **Riskiest part** | Blocking a launch on a misread funding state. A field Meta does not return is **unknown**, and unknown warns rather than blocks. |

**Tests.** Funds and no payment method → the specific sentence, and it is
**not** the same sentence as no-funds. Payment method and zero balance →
warns, does not block. Neither → blocks. `funding_source_details` absent
from Meta's response → unknown, warns, does not block. A dead account
(status 2 or 3) still blocks regardless of funding, because that check
comes first.

---

## 10. What the live test proved, and what it did not

Recorded 19 November 2026 so the next person does not re-derive it.

**Proved.** The campaign "Ghar ko do lavender ki shanti" (ad set live from
10 September) read **Active** in both Hawlai and Ads Manager with zero
impressions and zero spend for roughly 70 days, and **nothing told the
owner**. Meta's own diagnosis was "ad set delivering zero impressions due
to non-delivery". That is gap A and item G in one sentence, and it is the
reason this plan exists.

**Proved.** Production `dealerships` has all five `fb_*` columns
(`fb_ad_account_id text`, `fb_currency text`, `fb_account_status integer`,
`fb_min_daily_budget integer`, `fb_limits_checked_at timestamptz`). So gap
H is **only a missing migration file**, and the preview route is not
broken in production. Nothing needs to be run against the database for
commit 0.

**Proved.** The Ads Manager drafts are not Hawlai's.

**NOT proved, and labelled unverified.** Whether the missing payment
method, the India declaration, the interest targeting, or some
combination, was the actual blocker. The founder fixed all three by hand
on 19 November; the delivery check was still pending when this was
written. **Nothing in this plan should be read as "the cause was X".** The
product failure being fixed here is not that the ad did not deliver — it
is that the ad did not deliver *and the owner was never told*.

