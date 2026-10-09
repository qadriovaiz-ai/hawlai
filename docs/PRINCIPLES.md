# HAWLAI — PRINCIPLES

Agreed 2026-10-09, from Part 1 §3 of the final product instruction and
Part 2 §1's design law. This file is the short version a reviewer can
hold in their head. Where a principle has a mechanism in code, the
mechanism is named, because a principle with no enforcement is a wish.

---

## The design law

> **Intelligence = real data → analysis computed in code → the model
> explains or writes → a check verifies it.**
>
> The model never invents the data, the volume, the ranking, the
> competitor fact, or the "what worked".

This is the one line that decides most arguments. When a feature feels
intelligent but no data entered it, it is a model's guess wearing a
report's clothes. The reference implementation already in the
repository is the SEO toolkit: `seo/searchQueries.ts` stores Google's
own numbers as given, with a 28-day window, a 3-day lag and floors, and
the prompt is told to quote them exactly and never add a term that is
not in the list. Every other function should look like that.

---

## P1 — Customer-first copy, from product facts

Copy is driven by the customer's situation, the product's facts, proof,
the offer and the next step. The founder's story is **information, not a
content engine**: it belongs in About-type content, or when the owner
asks for it. A stranger cares about the product and about themselves.

*Withdrawn deliberately:* the earlier plan put the founder story at the
centre of every piece. It is wrong for most copy, and forcing it
produced sentences no buyer asked for.

## P2 — Truth from records

Every factual claim traces to owner-recorded data, or it is removed and
the owner is told. Unknown is never rendered as a confident sentence.

*Mechanisms:* `src/lib/claims/claimCheck.ts`,
`src/lib/claims/factsGate.ts` (FACTS_AVAILABLE / FACTS_UNAVAILABLE),
`src/lib/claims/personalStories.ts` (a third party's private story is
never copy), `src/lib/chat/replyClaims.ts` (the chat's own prose is
checked too).

## P3 — Multi-tenant, always

No business name, category, product or industry is hardcoded in code or
in a prompt. A fallback is built from the business's own facts or it
does not exist.

*Mechanisms:* `tests/multiTenantVocabulary.test.ts`,
`tests/multiTenantRender.test.ts`. These stay green and get extended,
never loosened. Comments that record a dated incident are exempt — the
record is why the rule survives.

## P4 — Risk-tiered approval

| Tier | What | Who decides |
|---|---|---|
| low | an internal draft, nothing leaves | Hawlai |
| medium | customer-facing copy | the owner, on a card |
| high | pricing, discounts, spend, outreach, automation toggles, performance claims | the owner, always, never auto-run |

Switching an automation **off** is never gated: the safe direction must
not be the slow one.

*Mechanisms:* `src/lib/executionPolicy.ts` (`ACTION_POLICIES`,
`AUTOMATION_TOGGLES`), `src/lib/publish/types.ts`
(`ALWAYS_REQUIRES_APPROVAL`, `ACTION_RISK`),
`src/lib/chat/requestApproval.ts`, `tests/approvalCoverage.test.ts` —
which fails for any new tool that calls a sender directly, so the next
one is safe by default rather than by review.

## P5 — One value moment, fast

Do not tour 58 tools. Pick the single most useful task for this business
and finish it. The value moment is the owner approving — or editing and
approving — their first piece of customer-facing copy that they say
they would actually use.

## P6 — No number without a source, or an honest empty state

Every figure on a screen or in an answer carries where it came from:
`measured` (the business's own platforms) · `web-found` (with a source
URL and excerpt) · `estimated` (say which third party) ·
`model-knowledge` (no source — advice only, never a number).

Below a floor, say what is missing and what would fix it, not a
confident paragraph. `{status: "insufficient_data", have, need,
how_to_get_it}` beats a sentence that sounds informed.

*Mechanisms today:* `src/lib/reports/healthScore.ts` (null below a
floor), `src/lib/reports/narrativeCheck.ts`,
`src/lib/agents/analyticsAgent.ts` (`not_connected | no_data | error |
ok` — the pattern worth copying), `src/lib/dataState.ts`.

## P7 — India-native

Hinglish, Hindi or English by the owner's setting, not by guess.
WhatsApp, Instagram and Facebook as they actually work here. Rupees.
Local occasions. First-party data — lead messages, chat questions, site
search, orders — before any bought data, because it is cheaper, more
specific and more Indian than anything a third party sells.

*Mechanism:* `src/lib/content/language.ts` (the setting is a rule, not a
field), `src/lib/expertise/seasonalCalendar.ts`.

## P8 — Prove it

No quality change ships on the strength of how it reads. A blind,
shuffled, pairwise human comparison across several businesses in
different categories, with the pass mark fixed **before** any score is
seen. An LLM judge is a pre-screen only, and only once it has been
validated against the human scores on that same set.

If Hawlai loses, the report says Hawlai lost.

---

## What not to build

- No new departments, tools or pages. There are already 58 chat tools and
  ~66 dashboard entries. Depth over breadth; a new tool needs a written
  reason from the owner.
- No autonomous sending, posting, spending or calling — ever — without a
  registry entry.
- No founder-story copy as the default. No invented testimonials,
  numbers, urgency, discounts or contact details.
- No metric on any screen without a source (P6).
- No WhatsApp broadcast before the consent ledger exists.
- No evaluation by LLM judge alone.
- No rebuild on another stack. Next.js, Supabase, Vercel.

---

## Known, logged, not yet fixed

### Phase 5 — the strip takes the whole sentence

The claims guard removes by **sentence**, so a true price in the same
sentence as an unbacked claim goes with it. *"Pure cotton kurta fabric,
₹480"* loses the ₹480 too.

This is deliberate and it was the right first choice: rewriting a
sentence around a deleted clause reads as a bug, and the owner cannot
tell what changed. But it costs the owner true information, and it is
the reason the third tier exists at all — a draft now keeps composition
claims rather than deleting the sentence they sit in.

Two ways out, neither chosen yet:

1. **Claim-only strip.** Remove the offending phrase and repair the
   sentence. Needs real clause awareness; a naive version produces
   "Order via ." which this codebase has already shipped once
   (`bioPhrase`, September 2026) and had to fix.
2. **Ask the owner.** Show the sentence, the phrase in question, and
   three buttons: it's true (record it), drop the phrase, drop the
   sentence. More screen, no guessing, and it turns a deletion into a
   fact the business keeps.

**(2) is the better shape** — it matches how the site claims review
already works (`reviewPage` offers Keep / Edit / Remove per row, and
refuses Remove when the sentence says more than the flagged words). The
work is extending that to generated copy rather than inventing a
mechanism.

Logged 2026-10-09, at Ovaiz's instruction, while enabling the widened
`CLAIM_TERMS`.

---

## Where this is linked from

`CLAUDE.md` at the repository root points here first, so the next agent
reads these before changing anything, without being told to.

---

## How a test reads this codebase

Guards here carry their dated incident in a comment, which makes
comments load-bearing — and makes a test that greps source unreliable
unless it strips them. `code()` in `tests/helpers/source.ts` is the one
implementation; `sourceWithComments()` is for when the record itself is
what a test protects. Rule 8 in `CLAUDE.md` has the incident and the
measured exposure.

The deeper point: a source grep proves a *string* exists, not that
behaviour happens. Where a test can execute the thing instead, it
should. Two findings in October 2026 came from exactly this — a grep for
`revise: true` could not tell the chat path from the page path, and a
grep for `sendMarketingEmail(...requestId)` was satisfied by either of
two call sites while one was broken. Both were replaced with tests that
run the code and count what it did.

---

## How to read a guard in this codebase

Almost every guard carries the dated incident that caused it. That is
deliberate and it is load-bearing: the comment is the reason the rule
survives a later tidy-up. If a guard looks over-cautious, read its
comment before removing it — the odds are good that it is describing
something that actually went out to a real customer.
