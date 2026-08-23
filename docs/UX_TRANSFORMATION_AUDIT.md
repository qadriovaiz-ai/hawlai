# Hawlai UX Transformation — Audit & Implementation Plan

> Phases 1–3 of the mandate (audit → identify → plan). No code changed yet.
> Every claim below was verified against the codebase on 2026-08-23.

---

## Executive summary — read this first

**The mandate's central premise is partly already solved.** It assumes Hawlai exposes 23 departments / 46 tools as primary navigation. It does not. The sidebar was already collapsed to **6 destinations** (`src/lib/navGroups.tsx`), with a documented rationale that matches the mandate's own philosophy almost exactly:

| Mandate proposes | Already exists | Status |
|---|---|---|
| 🏠 Home | `/dashboard/overview` | ✅ Exists, needs restructuring |
| ✨ Hawlai | `/chat` (labelled "AI Employee") | ✅ Exists |
| ⚡ Work | `/dashboard/tasks` | ⚠️ Partial — see gap #2 |
| 🔔 Approvals | `/dashboard/approvals` | ✅ Exists |
| Business | `/dashboard/business` | ✅ Exists, hub page |
| ⌘ Explore Capabilities | `/dashboard/tools` | ✅ Exists as Layer-3 marketplace |

The 75 dashboard routes are **already not in the sidebar** — they're reached contextually or via deep links from chat replies.

**So the real work is narrower and different from what the mandate describes.** Building a "new navigation" would mean rebuilding something that already exists in nearly the proposed shape — which the mandate itself forbids (§23, Rule 8).

The genuine gaps are five, listed below in priority order. Three of them are significant.

---

## Phase 1 — What exists today

### Navigation
- `NAV_GROUPS` (6 items, flat, single group). Departments have **zero** nav presence by design.
- `/dashboard/business` is a grouped hub (Sell / Customers / Creative Tools / Automation / Account) linking ~25 destinations with plan-gate lock badges.
- `/dashboard/tools` is a browsable catalog of 46 capabilities across 23 departments.

### Onboarding
- `dealerships.onboarding_completed` (migration 023) exists.
- `WelcomeChatCard` — a **6-step conversational onboarding** (describe business → formality → language → language notes → personality → words to avoid) that drafts a full brand profile via Claude. It gates `/dashboard/overview` until complete.
- Signup redirects to `/dashboard`.

### Home (`/dashboard/overview`)
Already renders: opportunity feed, AI-generated growth report, pending-approval count, lead stats, campaign performance. Uses `Promise.allSettled` so one slow section can't take the page down.

### Work-adjacent surfaces
- `/dashboard/tasks` — human tasks + goals (`GoalsSection`, `TasksView`).
- `/dashboard/autopilot` — the only place `agent_tasks` and `automation_run_log` are surfaced.
- `/dashboard/approvals` — pending approvals with amount + reason.

### Memory
- `/dashboard/business-memory` — **already has view / edit / delete**, satisfying most of mandate §18.

### Backend (all confirmed working, all to be preserved)
Master Chat (44 tools), Business Context, business + lead memory, 3 personas with per-persona tool allowlists, Event Queue, Task Queue (`agent_tasks`), Goal→Plan→Task with draft-then-confirm, Approval Center, Execution Policy, Audit Log, UsageGuard, Cost Engine, CRM, Vapi calling.

---

## Phase 2 — The five real gaps

### Gap 1 — No intent capture at signup (HIGH)
Onboarding asks **who you are** (business, brand voice) but never **what you want**. Every user lands in the same full product regardless of need. There is no `product_mode` / intent concept anywhere in the schema.

**Consequence:** the mandate's central user story — "I only need AI calling" — is impossible today.

### Gap 2 — "Work" ≠ Tasks (HIGH)
`/dashboard/tasks` shows *human* tasks and goals. It does **not** show what Hawlai itself is doing. AI work (`agent_tasks`) and automation runs (`automation_run_log`) are visible only inside the Autopilot page, framed as configuration rather than activity.

**Consequence:** "What is Hawlai doing right now?" has no answer. The system feels like a black box precisely where it's most active.

### Gap 3 — No activity feed (HIGH)
Verified: **nothing** in the codebase implements a unified activity timeline. `audit_log` records approvals and sensitive actions; `automation_run_log` records cron subsystem runs; `agent_tasks` records queued AI work — but these are three separate stores with no combined chronological view.

**Consequence:** the mandate's §13 example (lead received → analyzed → called → qualified → appointment → team notified) cannot be rendered.

### Gap 4 — No dedicated calling experience (HIGH)
Calling exists and works, but is spread across `/dashboard/calls`, `/dashboard/leads`, `/dashboard/appointments`, and persona settings buried in `/dashboard/autopilot`. There is no employee-onboarding journey, no test-call flow, no go-live moment, and no calling-focused workspace.

### Gap 5 — Autonomy level is invisible (MEDIUM)
The four-level model the mandate describes (Suggest / Draft / Approval Required / Trusted Automation) **already exists in behavior** — goals draft-then-confirm, ads launch paused, approvals gate spend, autopilot toggles run unattended. But nothing names it or shows the user which level any given capability is operating at.

### Non-gaps — already satisfied
- Navigation collapse (§21) — done
- Memory UX (§18) — done except the proactive "should I remember this?" prompt
- Provider-name hiding (§20) — enforced throughout the Usage/Pricing work
- Approval infrastructure (§D) — exists; needs richer *presentation*, not new plumbing
- Progressive discovery Layer 3 (§17) — `/dashboard/tools` already plays this role

---

## Phase 3 — Implementation plan

Ordered by value-per-risk. Each piece is independently shippable and preserves existing routes.

### Piece 1 — Activity Feed (foundation)
A unified read-only timeline over `audit_log` + `automation_run_log` + `agent_tasks` + `calls` + `notifications`, normalized into one shape and sorted chronologically.

Built first because Pieces 2 and 5 both consume it. Read-only over existing tables.

**Schema:** none — pure composition. *(A materialized view could come later if performance demands; not needed at current data volumes.)*

### Piece 2 — Work page
Restructure `/dashboard/tasks` into four sections: **Now** (running `agent_tasks` + in-flight calls), **Waiting for You** (approvals + questions), **Scheduled** (future `agent_tasks` + automation schedules), **Completed** (recent finished work, from the activity feed).

Keeps human tasks and goals — adds the AI-work half that's missing. Route stays `/dashboard/tasks`; nav label changes to "Work".

**Schema:** none.

### Piece 3 — Intent capture + product mode
Add an intent step to onboarding — natural-language first, with shortcut chips. Deterministic keyword routing, with a clarifying question when ambiguous (never silent misrouting).

**Schema:** genuinely new. `dealerships.product_mode` + an `onboarding_sessions` table (mode, current step, activation milestone reached). This is the one concept the existing schema cannot express.

### Piece 4 — Calling employee experience
The mandate's most detailed section, and the biggest single piece. Six-step employee onboarding (business → job → knowledge → behaviour → permissions → boundaries), a mandatory test-call flow, an explicit go-live moment, and a focused calling workspace nav.

**Reuses:** existing personas + tool allowlists (job → persona mapping stays internal), `getBusinessContext`, `business_knowledge`, Vapi infrastructure, CRM.

**Schema:** likely an `ai_employees` table (a customer-facing abstraction over persona + channel + knowledge + boundaries) — but I want to confirm against `agent_persona_settings` before proposing it, since that table may extend rather than needing a sibling.

⚠️ **Cannot be fully tested** — inbound calling is DLT-blocked; the test-call flow depends on outbound, which works.

### Piece 5 — Home restructure
Rebuild `/dashboard/overview` around the mandate's four questions: *What is Hawlai working on? / Needs your attention / Recent results / Hawlai recommends*. Reuses the existing opportunity feed and growth report; adds live work from Piece 1.

**Schema:** none.

### Piece 6 — Autonomy levels + contextual discovery
Name and surface the four autonomy levels already in behavior. Add contextual cross-capability recommendations (mandate §17 Layer 2).

**Schema:** possibly a small user-preference column; to be confirmed.

---

## Recommended sequence

**1 → 2 → 5 → 3 → 4 → 6**

Rationale: Activity Feed unblocks Work and Home. Those three are pure composition over existing data — no schema, no risk to working systems, and they deliver the "Hawlai feels alive" outcome fastest. Intent capture then has a real product to route *into*. The calling experience is last among the big pieces because it's the largest and benefits from the shell being settled.

Piece 6 is deliberately last — it's polish on top of a coherent product, not a foundation.

---

## Open questions — need your decision

**Q1. Does "Work" replace or sit beside Tasks?** My recommendation: restructure the existing route rather than adding a seventh nav item, since a 6-item nav is already the product's stated discipline.

**Q2. How aggressively should product mode narrow the UI?** The mandate says a calling-only user shouldn't see marketing departments. But the nav is already only 6 items — the departments are already invisible. So the real question is narrower: should `/dashboard/business` and `/dashboard/tools` filter their contents by mode, or stay complete with contextual recommendations layered on? I lean toward **filtering the hub, keeping Tools complete** — Tools is explicitly the "explore everything" surface.

**Q3. Should existing users be asked their intent retroactively?** Every current business has `onboarding_completed = true` and no `product_mode`. Options: (a) leave them in full mode, (b) prompt once, (c) infer from usage. I lean toward **(a) with an optional switcher** — no forced re-onboarding for working accounts.

**Q4. Which piece do you want first?** My recommendation above is 1 → 2 → 5, but if the calling experience is commercially urgent, Piece 4 can move up at the cost of building it before the shell settles.

---

## What I will not do

- Rebuild the navigation that already matches the target shape.
- Delete or hide any of the 75 existing routes.
- Duplicate approval, persona, memory, or usage infrastructure for visual reasons.
- Add schema before confirming the existing tables genuinely can't express the concept.
- Claim any calling flow is verified working when inbound calling remains DLT-blocked.
