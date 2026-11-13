# Hawl — the owner's WhatsApp control channel

**Investigation and plan, 13 November 2026. No code written.**

The ask: let the owner run Hawlai from WhatsApp — give it work, ask for
reports, approve things — without opening a laptop. And the standing
architecture rule: **Hawl is a mouth, not a brain.** Everything it says
must come from the system that already exists.

---

## 0. The headline, before anything else

**Most of Hawl already exists and has done for some time.** The webhook
at [`src/app/api/webhooks/whatsapp/route.ts`](../src/app/api/webhooks/whatsapp/route.ts)
already identifies the owner by phone number, runs the **real Master
Chat engine**, keeps conversation history, sends images back, gates on
plan and message limits, and gives team members a deliberately narrower
surface.

| The concept | Already built | Where |
|---|---|---|
| Owner connects a number | **yes**, with a CONNECT code flow | `whatsapp-connect/start`, `/verify`, `whatsapp_verification_codes` |
| Hawlai knows it is the owner | **yes** | `route.ts:69` — `owner_whatsapp_number` + `owner_whatsapp_verified` |
| Owner can give it work | **yes**, full Master Chat | `route.ts:115` — `runMasterBrainChat(supabase, dealership.id, history, text)` |
| Owner can ask for reports | **yes** | tool `get_growth_report`, `toolSchemas.ts:723` → `masterBrainV2.ts:3033` |
| Conversation remembers | **yes** | `whatsapp_chat_sessions`, `route.ts:113-118` |
| Team members limited | **yes**, their own tasks only | `route.ts:88-96` |
| **Approve / reject over WhatsApp** | **NO** | nothing anywhere reads `pending_approvals` from this path |
| **Disconnect a number** | **NO** | `start` and `verify` exist; there is no `disconnect` |
| Verified against live WhatsApp | **NO** | `route.ts:8-19` says so in its own header |

**So this is an upgrade of one webhook, not a new agent.** No new brain,
no second tool registry, no parallel chat. That is already true today —
the rule the ask states is the rule the code already follows.

---

## 1. Can the existing WhatsApp infrastructure carry a second number?

**The question does not apply in the shape it was asked, and that is
worth knowing before anything is designed.**

There is **one platform-level WhatsApp number**, not one per business:
[`gupshupClient.ts:11`](../src/lib/whatsapp/gupshupClient.ts) —
`GUPSHUP_SOURCE_NUMBER`, commented "Hawlai's own WhatsApp Business
number". Every message Hawlai sends comes from it.

So the owner does not *connect their own sending number*. They register
their personal number as the one allowed to **talk to Hawlai's number**,
which is what the CONNECT flow already does.

**And the mixing the ask worries about cannot happen today**, because
**nothing in this codebase sends WhatsApp to a customer**. Checked
rather than assumed: every caller of `sendWhatsAppText` /
`sendWhatsAppImage` is the owner-facing webhook itself. The
`whatsappMarketingAgent` only *generates* content
(`generateWhatsappContent`, `whatsappMarketingAgent.ts:39`); it never
sends. No customer receives a WhatsApp from Hawlai, so no customer
replies into this webhook.

**But it becomes real the moment customer messaging is built** — a known
gap already (WhatsApp customer replies are unbuilt). With one source
number, a customer's reply and the owner's instruction arrive at the
same webhook, distinguished only by sender. Today an unknown sender
gets "This number isn't connected to a Hawlai account"
(`route.ts:86`), which is a dead end for a customer who was messaged
first.

**Recommendation: write this down as a constraint now and do not solve
it yet.** When customer WhatsApp is built it needs its own source
number, because a business's customers must not be one lookup away from
the owner's control channel. That is a decision for that project, with a
cost (a second Gupshup number), and it should not be pre-empted here.

---

## 2. How is the owner's number authenticated?

**Already built, and the design is sound:**

1. Owner starts from the dashboard → a row in `whatsapp_verification_codes` for that number.
2. Owner messages `CONNECT` from the phone itself → webhook finds a *pending, unexpired* row (`route.ts:48-55`) and sends a six-digit code **to the phone**.
3. Owner types the code into the dashboard → `whatsapp-connect/verify` sets `owner_whatsapp_number` and `owner_whatsapp_verified` (`verify/route.ts:38`).

Both halves are required — possession of the phone *and* a signed-in
dashboard session — so a stranger who knows the number cannot connect
it, and someone holding the phone cannot connect it without the account.

**The weakness is not connection, it is what possession buys afterwards.**
After this, **any message from that number is treated as the owner**,
with full Master Chat tool access. A borrowed phone, a SIM swap, or a
hijacked WhatsApp account is, from the webhook's point of view, the
owner. The dashboard requires a live session for the same power; this
path requires a phone number. **That gap is acceptable for asking
questions and is the whole problem for approvals — see §4.**

---

## 3. Can the Master Chat tool engine be reused?

**It is already reused, directly, with no adapter:** `route.ts:115`
calls `runMasterBrainChat` — the same function the in-app chat calls.
Tools, registry, facts, claims guard and approval gating are therefore
identical by construction. Nothing to build.

Two differences from the web chat worth stating:

- **History is capped at 20 messages** (`route.ts:113`) and stored per phone number in `whatsapp_chat_sessions`. The web chat keeps a conversation row. A long WhatsApp conversation silently forgets its start — fine, but it means "do the thing we discussed yesterday" may not work.
- **Only image artifacts are sent back** (`route.ts:122`). Anything else a tool produces — a document, a table, a card — reaches the owner as whatever `result.reply` said about it, which may be nothing.

---

## 4. Approvals over WhatsApp — the riskiest part, and the real work

**Nothing reads `pending_approvals` from WhatsApp today.** There are two
separate problems, and the second is the dangerous one.

### 4a. The mechanical problem: the approve path needs a session

`PATCH /api/approvals/[id]` begins with `supabase.auth.getUser()` and
refuses without a user (`approvals/[id]/route.ts:74`). A webhook has no
session — it has a verified phone number. Everything after that check —
role resolution, `checkApprovalAuthority` (already extracted, in
[`src/lib/approvalAuthority.ts:42`](../src/lib/approvalAuthority.ts)),
threshold handling, modification, execution — is **inline in the route
handler**.

So approving from WhatsApp means **extracting the decision into one
function that both callers use**, exactly as `resolvePublicSite` was
extracted for the three public routes. Not duplicating it into the
webhook: two copies of an approval rule is the worst possible thing to
have two of.

### 4b. The dangerous problem: "yes" is not an approval

Two things make a bare WhatsApp "yes" unsafe, and neither is solved by
plumbing:

**Which one?** If two approvals are pending, "yes" is ambiguous. The
existing comment at `route.ts:102-107` says Master Chat already handles
"yes, go ahead" through conversation history — **that is true and it is
about something else.** It means the model's own last question, not a
`pending_approvals` row raised by a background job the owner never saw.
Reading one as the other would approve a record because a sentence
nearby sounded like consent.

**On whose authority?** The dashboard's approve button is backed by a
logged-in session. A WhatsApp approval is backed by possession of a
phone number (§2). For "post this caption" that is a reasonable trade.
For **spending money or sending to customers** it is a real downgrade of
the control that `executionPolicy` exists to provide — and
`AUTOMATION_TOGGLES` already classes several of those as `critical`.

**Recommendation, and it is a judgement the owner should confirm:**

- Approvals over WhatsApp are **referenced explicitly**, never by a bare "yes" — Hawlai sends a short numbered list and accepts `APPROVE 2` / `REJECT 2`, or a one-time token per approval. Unambiguous, and it reads naturally.
- **Rejecting is always allowed.** Saying no is the safe direction and must never be the slow one — the same rule that keeps switching an automation *off* ungated.
- **Approving is allowed for everything except the `critical` tier**, which still needs the dashboard. The owner loses nothing he has today; he gains the ninety per cent that is captions, drafts and small changes.
- Every WhatsApp approval records **that it came from WhatsApp**, so the audit trail does not claim a dashboard click that never happened.

---

## 5. If the owner disconnects WhatsApp or changes number

**There is no disconnect path at all** — `whatsapp-connect/` has `start`
and `verify` only. What happens today:

- **Changing the number**: `verify` overwrites `owner_whatsapp_number`, so the old number stops being recognised immediately. Good. But its `whatsapp_chat_sessions` row survives, keyed on `phone_number`, holding the conversation history of a number no longer connected. It is unreachable but not deleted.
- **Losing the phone**: nothing to revoke with. The number stays verified until someone edits the database.
- **Plan downgrade**: handled — re-checked on every message (`route.ts:73-79`).

**What is needed is small and belongs in this project**: a disconnect
that clears the number, the verified flag and the stored session, and
says plainly that WhatsApp control is off. Plus: when the number
changes, the previous number's session should go with it — history
belongs to the connection, not to the phone.

**A deliberate non-goal:** no "emergency stop" over WhatsApp. If
somebody has the phone, a WhatsApp-triggered lockout is as available to
them as it is to the owner. Revocation belongs on the dashboard, behind
a session.

---

## 6. The plan

| | Piece | Size | The riskiest part |
|---|---|---|---|
| **H1** | **One approval decision function**, extracted from the PATCH route so the dashboard and WhatsApp share it. No behaviour change on the dashboard | **M** | It is the authorization path. The extraction must be provably identical — the existing route's tests are the spec, and nothing in them gets loosened |
| **H2** | **Pending approvals over WhatsApp** — a numbered list, `APPROVE n` / `REJECT n`, rejection always allowed, `critical` tier excluded, source recorded | **M** | §4b. A bare "yes" must never approve a record, and the model's own conversational "yes" must stay separate from an approval id |
| **H3** | **Tell the owner something is waiting.** Nothing notifies him today — he only finds out in the dashboard, which is the thing he is trying not to open | **S** | Frequency. One message per approval is useful; one per minor action is the popup problem in his pocket |
| **H4** | **Disconnect, and clean up on number change** | **S** | That revocation stays dashboard-only — see §5 |
| **H5** | **Confirm the live payload shape** against real Gupshup traffic and replace the defensive guesswork at `route.ts:20-28` with what actually arrives | **S** | Cannot be done by me. Needs one real message through a live number — an owner task |

**Order:** H5 first if credentials exist, because every other piece is
built on a payload shape nobody has seen. Otherwise H1 → H2 → H3 → H4.

**No new tool, agent, department or page.** H1 extracts an existing
function, H2 and H4 add branches to an existing webhook and an existing
connect flow, H3 is a message from a job that already runs.

---

## 7. What I would check with the owner before building

1. **The `critical` exclusion in H2** — he may want *everything* approvable from WhatsApp. That is his call to make knowingly, not mine to assume. It trades the session-backed control that `executionPolicy` was built to give for the convenience the whole feature exists for.
2. **H3's frequency** — every approval, or a daily digest?
3. **Whether H5 is possible at all** right now: is there a live Gupshup number and key? If not, everything here ships unverified against the one integration whose shape is a guess.
