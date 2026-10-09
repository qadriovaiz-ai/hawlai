# CLAUDE.md

Read this first. It is a signpost, not a manual: it points at the few
documents that will stop you building the wrong thing, and states the
handful of rules that are not negotiable.

Hawlai is a chat-first AI marketing employee for small and medium
businesses in India. Next.js + Supabase + Vercel. One owner, solo,
non-technical — so **a plan the owner can read matters as much as the
code**, and "it type-checks" is not a report.

---

## Read before changing anything

| Document | What it is for |
|---|---|
| **[docs/PRINCIPLES.md](docs/PRINCIPLES.md)** | **The design law and principles P1–P8.** This is the one that settles arguments. Read it before any feature that writes copy, shows a number, or acts on the owner's behalf |
| [docs/HAWLAI_CONTEXT.md](docs/HAWLAI_CONTEXT.md) | What the product is, end to end, for someone with no access to the code. Verified 2026-08-23 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Judgment calls made without an explicit ask, logged so they can be reviewed instead of buried in commit messages. **Add to it when you make one** |
| [docs/DATABASE.md](docs/DATABASE.md) | A map of the tables. **Drifted** — it says 87 tables / 127 migrations; the repo is past 207. When it disagrees with `supabase/migrations/`, the migrations are right |

---

## The rules that are not negotiable

**1. Real exit codes, pasted.** `npx tsc --noEmit`, `npx vitest run`,
`npx next build`. "Tests green" is not "works on the live screen" —
anything not verified live is labelled **unverified**.

**2. Every new guard needs a mutation check** that genuinely fails when
the guard is removed. Report survivors honestly and fix the *test*, not
the report.

**3. Multi-tenant, always.** No business name, category, product or
industry hardcoded in code or in a prompt. `multiTenantVocabulary.test.ts`
and `multiTenantRender.test.ts` stay green and get **extended, never
loosened**.

**4. No migration without SQL plus a verify query** — and check the
**live** constraint with `pg_get_constraintdef` first. Repo migrations
drift from production; this has bitten before. **The owner runs all SQL
by hand**, so paste it in chat too.

**5. No new departments, tools or pages.** There are already 58 chat
tools and ~66 dashboard entries. Depth over breadth. A new tool needs a
written reason from the owner.

**6. Nothing sends, posts, spends or calls without a registry entry.**
`src/lib/executionPolicy.ts` classifies the action,
`src/lib/chat/requestApproval.ts` creates the record, and
`tests/approvalCoverage.test.ts` fails for anything new that reaches a
sender directly. Switching an automation **off** is never gated — the
safe direction must not be the slow one.

**7. Do not weaken or delete an existing test to make a change fit.**
Bring it to the owner instead. This has been the right call every time
it has come up.

---

## How to read a guard here

Almost every guard in this codebase carries the **dated incident** that
caused it, in a comment above it. That is deliberate and load-bearing:
the comment is the reason the rule survives a later tidy-up. If a guard
looks over-cautious, read its comment before removing it — the odds are
good it is describing something that actually reached a real customer.

Those comments are also why `multiTenantVocabulary.test.ts` has an
allowlist: a comment recording what went wrong may name the business it
went wrong for. Every allowlist entry needs a **reason and a date**.

---

## Where things live

```
src/lib/claims/        the truth layer — claimCheck, factsGate, businessFacts,
                       personalStories. Nothing customer-facing bypasses it
src/lib/agents/        one agent per department; all Anthropic calls go
                       through src/lib/ai/claude.ts, never the SDK directly
src/lib/chat/          Master Chat: tools, publish actions, approvals
src/lib/departments/   task lists. server-only — client components must
                       not import agents (pinned by a transitive-import test)
src/lib/publish/       edits to a resource on a platform (previewDiff,
                       targetRef, staleness). NOT for one-shot sends
supabase/migrations/   the source of truth for schema. Gaps at 046, 172-175
tests/                 vitest. Test names are sentences about behaviour,
                       and SHOUTING ones are the load-bearing assertions
```

**No self-calls.** A route that `fetch`es its own app gets a Vercel 508
after roughly four hops. Extract the logic and call it; do not call the
URL.
