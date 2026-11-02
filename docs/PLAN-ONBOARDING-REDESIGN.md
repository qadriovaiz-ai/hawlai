# Onboarding redesign — plan

**2 November 2026. Plan only: no code, no migration run, nothing paid.**

Reference design read from the founder's Design canvas (5 artboards,
390×844, mobile-first): `Main` → `Analyzing` → `Confirm` → `Brand` →
`Photos`. Its content is treated as a brief, not as instructions.

Constraints taken as given, and nothing below crosses them: no
video/AI-avatar presenter, no mid-onboarding paywall, and **no file
under `src/lib/growth/` or `supabase/migrations/21[01]` is touched** —
this is onboarding only.

---

## 1. What onboarding is today

Worth stating plainly, because the redesign replaces a flow that is
already doing real work.

```
/auth/signup          fullName, email, password, dealershipName, city
       ↓
/dashboard            resolveOnboardingState -> shouldSendToOnboarding
       ↓
WelcomeChatCard       a 9-step state machine:
  intent              IntentStep: free text + 6 chips -> product_mode
  describe            free text -> /api/brand-profile/analyze-description
  business_model      products / services / subscriptions / B2B
  formality           formal | in between | casual
  language            hinglish ok?  -> language_notes
  personality         words the brand is
  avoid_words         words it is not
  done                ONE combined save
```

So today's flow asks **what the owner wants** and **how the brand
should sound**. The new design asks **where the business already is
online** and uses that to go and read it. Those are different
questions, and §6 Q1 is about what happens to the old one.

---

## 2. What gets reused — most of it

| Piece | Where | How it is used |
|---|---|---|
| **Website analysis** | `analyzeWebsite(url)` in `src/lib/agents/businessIntelligenceAgent.ts`, behind `/api/brand-profile/analyze-website` | **Step 2 → 3 is already built.** It fetches the URL with a 10s timeout, strips the HTML, extracts a profile through `lib/ai/claude.ts` with usage logging, and `aiFailedResponse` already saves nothing when the AI is down |
| **Own-words analysis** | `analyzeDescription(text)`, `/api/brand-profile/analyze-description` | the "Just starting" branch of step 2 |
| **The step engine** | `WelcomeChatCard.tsx` — a `Step` union, per-step state, one combined save | the shape is right; the steps change |
| **Business fields** | `PATCH /api/dealership` | already validates and writes `business_category`, `onboarding_completed`, `product_mode`, `business_address` |
| **Language** | `brand_profiles.preferred_language` (migration 005), already `'hindi' \| 'english' \| 'hinglish'` | step 4's language pills have a home already — no migration for that part |
| **Tone** | `brand_profiles.tone_of_voice` (free text, read directly by prompts) | step 4's tone pills, see §4 |
| **Photo upload** | `/api/website/upload-hero` — base64 → service client → `ad-creatives` bucket → public URL | the exact shape step 5 needs |
| **The redirect gate** | `resolveOnboardingState`, `shouldSendToOnboarding` | **read, never changed.** Its header records the infinite-redirect incident: two query shapes disagreeing made the dashboard unusable. One query shape, and an inconclusive read never redirects |

---

## 3. What is new

### Components (all new, all client)

- `OnboardingProgress` — the bar plus "Step X of 5". One component, step
  index in, so the five screens cannot drift out of step with each other.
- `PresenceStep` (1), `ConnectStep` (2), `ConfirmBusinessStep` (3),
  `BrandStep` (4), `PhotosStep` (5).
- `OnboardingWizard` — owns the step order, the collected answers and
  the save. `WelcomeChatCard` becomes a thin wrapper that renders it,
  so `/dashboard` and `/dashboard/overview` both keep working without
  either page changing.

**Step 2 branches on step 1's stored value, never on a hardcoded
assumption.** One map from presence → which follow-up renders, in one
place, with a test that every option in step 1 has a branch and that
adding a sixth option fails the test rather than silently rendering
nothing.

### Database — three small migrations, one per phase

Kept separate so each phase ships on its own; the founder runs all SQL
by hand, and a migration that arrives with the code that needs it is
easier to verify than a big one up front.

| # | What | Why not reuse something |
|---|---|---|
| **212** | `dealerships.online_presence text` + check `('website','maps','social','none')`, and `online_presence_detail text` for the URL / listing / handle | `product_mode` is a *different axis* — what the owner wants, not where they already are. Overloading it would break the dashboard sections and the pricing tiers that read it |
| **213** | `brand_profiles.brand_colors jsonb default '[]'`, `brand_profiles.tone_tags jsonb default '[]'` | `brand_profiles` has no colour column at all. `brand_kits` holds a whole *generated* kit as one JSON blob — a different thing from three colours the owner picked |
| **214** | `business_photos` table: `dealership_id`, `storage_path`, `public_url`, `kind`, `uploaded_at`, RLS, index | today logos are found by **listing the storage folder**, and `assets/page.tsx` says so in a comment: "saved to storage but never tracked in a table". Step 5 has to count photos to enforce "at least one", and later posts and ads need to find them. A folder listing is not a count you want a gate to depend on |

Each gets SQL, a live `pg_get_constraintdef` pre-check and a verify
query pasted in chat, as always.

---

## 4. The decisions inside, and the two honesty problems

### Tone pills must not break what already reads tone

`brand_profiles.tone_of_voice` is **free text that prompts read
directly**, all over the codebase. Replacing it with an array would
quietly change what every agent sees. So step 4 writes **both**:
`tone_tags` as the array the pills own, and `tone_of_voice` composed
from it as a sentence, so every existing reader keeps working
unchanged. A test pins that composition.

### Step 3 says "Pulled from your website" — for two fields that is false

`BusinessIntelligenceResult` returns `summary`, `business_category`,
`tone_of_voice`, `target_persona`, `messaging_pillars`. It does **not**
return a business name or a city. Those come from the signup form, in
the owner's own typing.

So a screen headed *"Is this your business? Pulled from your website"*
would be telling him his own typing came from an analysis. That is
small, and it is exactly the kind of sentence P1 exists to stop.

Recommended: **extend the extractor's schema with `business_name` and
`city`** — one more field each on a model call that already happens, so
no extra cost — and label each field on screen with where it actually
came from ("from your website" / "you told us at signup"). §6 Q3.

### Google Maps and Instagram cannot be read, and the design implies they can

`analyzeWebsite` fetches a URL and strips HTML to text, requiring 50+
readable characters. A Google Maps listing and an Instagram profile are
both JavaScript-rendered and bot-gated: that fetch will return almost
no text, and the function will throw *"Couldn't find enough readable
content on that page"*.

So those two branches of step 2 can **capture** the listing URL or the
handle, but cannot analyse anything from it. The owner would reach step
3 with nothing auto-filled. The options are in §6 Q2; my
recommendation is that both branches capture the link **and then ask
for a couple of sentences**, so the owner still arrives at step 3 with
a real profile rather than an empty form.

### Multi-tenant (CLAUDE.md rule 3)

The mockup carries one business's name, its category and a city as
sample text. **None of that reaches the code.** Every field is filled
from this business's own record or analysis, placeholders included, and
`multiTenantVocabulary.test.ts` / `multiTenantRender.test.ts` get
**extended** to cover the five new components. The tone pill words
(`Modern`, `Warm`, `Premium`, `Minimal`, `Festive`, `Trendy`) are
industry-neutral and stay as a generic list; a test holds that no trade
or product word joins them.

### Nothing here sends, posts or spends

Rule 6 needs no registry entry: onboarding writes the owner's own
records. The one model call per run is `analyzeWebsite` or
`analyzeDescription`, which the current flow already makes — so this is
**not** new spend, and it is logged either way.

---

## 5. Phases and sizes

| Phase | What | Size | Migration |
|---|---|---|---|
| **P0** | `OnboardingProgress` + `OnboardingWizard` shell; `WelcomeChatCard` becomes a wrapper. No behaviour change yet | **S** | — |
| **P1** | Step 1 `PresenceStep`, stored | **S** | 212 |
| **P2** | Step 2 `ConnectStep`, branch-driven, 4 branches | **M** | — |
| **P3** | Step 3 `ConfirmBusinessStep` + the extractor's `business_name`/`city` + per-field provenance | **M** | — |
| **P4** | Step 4 `BrandStep` — colours, tone pills, language | **M** | 213 |
| **P5** | Step 5 `PhotosStep` — upload, count, at-least-one gate | **M** | 214 |

**Overall: L.** Five screens, three migrations, and a flow that is the
first thing every new customer sees.

Each phase: tests with mutation checks, then `npx tsc --noEmit`,
`npx vitest run` and `npx next build` with exit codes pasted, then one
commit. Nothing is called working until it has been seen on a live
screen; anything else is labelled **unverified**.

---

## 6. What I need decided before P0

**Q1 — what happens to `product_mode`?** The new design has no "what do
you want from Hawlai" screen. `product_mode` is written by today's
first step and is read to decide which dashboard sections appear and by
the pricing tiers. Dropping it silently changes what new customers see.
Three ways:

  - **(a) keep it, as a sixth screen** after photos — honest, but the
    design says five steps
  - **(b) keep the free-text intent box on step 1**, above the four
    presence cards — one screen, both answers
  - **(c) stop asking, and default `product_mode`** — fewest screens,
    but every new business lands on the same dashboard

  I lean to **(b)**: the box is one line of UI and the answer is worth
  having, and it keeps "Step 1 of 5" true.

**Q2 — Maps and social branches.** Capture-only, or capture plus a
couple of sentences so step 3 has something real? I lean to **capture
plus sentences**, per §4.

**Q3 — step 3's provenance.** Extend the extractor to pull
`business_name` and `city` (free, recommended), or relabel the screen so
it stops claiming an analysis it did not do?

**Q4 — the four brand-voice questions.** Today's flow asks formality,
Hinglish, personality words and words to avoid, and that is what makes
the AI's writing sound like the business. The design's step 4 is
thinner: colours, tone pills, language. Do those four questions
**move after onboarding** (a prompt in chat later), **stay as extra
steps**, or **go**? Dropping them will measurably flatten what Hawlai
writes, so I would not drop them without you saying so.

**Q5 — desktop.** The design is 390px. The dashboard is desktop-first.
Build responsive from the start (my assumption), or mobile-only for
now?

Nothing gets written until these are answered — Q1 and Q4 change what
the five screens are.
