# WhatsApp — what is built, what is unverified, and the move to Meta Cloud API

Written 23 November 2026, at the owner's request, before any build.
The decision at the end was taken by him the same day and is recorded
here so it is not re-litigated.

---

## 0. Method, and what this document does not know

Everything below was **measured from the repository**: `wc -l` over
the WhatsApp surface, `grep` over every send site, the migration
history, and `docs/PLAN-HAWL-WHATSAPP.md` for what was decided and
shipped in November.

**Nothing here has met a live WhatsApp number.** That is not an
omission in the audit; it is the finding. `docs/PLAN-HAWL-WHATSAPP.md`
said so on 18 November in its own words, about H5:

> Cannot be done by me. Needs one real message through a live number.

The one calibration point for what "unverified against a real API"
costs in this codebase is the Shopify adapter: 2,674 lines, and **four
corrections after it met a real store**, three of which a green test
suite could not see. The WordPress adapter was then written the other
way round — probed against a live site first — and needed none. That
contrast is the argument for how this work should be sequenced.

---

## 1. What is already built

More than it looks. This is not a green field.

| | Lines | What |
|---|---|---|
| `src/lib/whatsapp/` | **467** | `gupshupClient` 56, `suggestionReply` 111, `pendingReply` 135, `approvalReply` 165 |
| `api/webhooks/whatsapp/route.ts` | **243** | the inbound brain: CONNECT, task list, approve/reject, Master Chat |
| `api/whatsapp-connect/*` | **201** | start / verify / disconnect |

From `PLAN-HAWL-WHATSAPP.md` §6a:

| | Piece | Status |
|---|---|---|
| **H1** | One approval decision, shared by every channel | shipped `5b7eac50` |
| **H2** | Approve or reject from WhatsApp, critical excluded | shipped `7479ade4` |
| **H3** | Tell the owner something is waiting | **deferred**, parked on `hawl-h3-deferred` |
| **H4** | Disconnect, and the session goes with it | shipped `eb2f53b2` |
| **H5** | Confirm the live payload shape | **deferred — needs a live number** |

### 1.1 The shape that makes a provider swap cheap

**Every outbound send is inside one file.** `grep` for
`sendWhatsAppText` / `sendWhatsAppImage` returns call sites in
`api/webhooks/whatsapp/route.ts` and nowhere else.

That is not luck. It is the `channelRules` guard — *"only the inbound
webhook can send a WhatsApp message"* — which exists because of
WhatsApp's **24-hour session window**: outside it, only a Meta-approved
template may be sent, so a notification raised from anywhere else would
fail against the live API whether or not a test existed. That guard
already caught H3 trying to notify over WhatsApp, and the design
changed rather than the guard.

So the provider surface is **two things**, not scattered call sites:

1. **Outbound** — `gupshupClient.ts`, 56 lines: `sendWhatsAppText`,
   `sendWhatsAppImage`, `normalizePhoneNumber`.
2. **Inbound** — `extractIncoming()` in the webhook, 10 lines, which
   turns a provider payload into `{ phone, text }`.

Everything else — the approval vocabulary, the pending-list
resolution, the Master Chat loop, usage limits, plan gating, the
connect/verify flow — is **provider-agnostic already** and does not
move.

### 1.2 The guesswork, named in its own comment

`extractIncoming` carries this, verbatim:

> built against Gupshup's documented v2 inbound webhook format … This
> has NOT been exercised against live Gupshup traffic yet — the
> defensive fallback parsing below tries a couple of plausible field
> paths, but the first real incoming message should be checked against
> actual logs.

So the inbound half is a documented guess with fallbacks. **For a move
to Meta Cloud API that is good news, not bad**: there is no live
Gupshup behaviour to preserve, so nothing is being migrated away from.
The guess is simply replaced with a different one — and this time it
can be checked, because the number is verified.

---

## 2. Why the move, and what actually changes

Gupshup is a **BSP** — a reseller that sits between this product and
Meta's own API. The owner's Meta Business verification is already done
(**+91 81150 15907, Verified**), which is the slow part of going
direct and the reason the intermediary stops earning its place.

### 2.1 What is genuinely different

| | Gupshup | Meta Cloud API |
|---|---|---|
| Send endpoint | `api.gupshup.io/sm/api/v1/msg` | `graph.facebook.com/v*/{PHONE_NUMBER_ID}/messages` |
| Body | form-encoded, message as a JSON **string** | JSON |
| Auth | `apikey` header | `Authorization: Bearer <token>` |
| Sender | `GUPSHUP_SOURCE_NUMBER` | `PHONE_NUMBER_ID` (not a phone number) |
| Inbound | `payload.payload.payload.text` | `entry[].changes[].value.messages[]` |
| Webhook verification | none in this code | `GET` challenge with `hub.verify_token` |
| Payload signing | none in this code | `X-Hub-Signature-256`, HMAC-SHA256 |

**Two of those rows are new obligations, not translations**, and they
are the ones worth naming before anyone estimates:

- **The GET verification handshake.** Meta will not deliver to a
  webhook that does not answer a challenge. The current route has a
  `POST` only.
- **Payload signing.** Meta signs every delivery with
  `X-Hub-Signature-256`. Nothing is checked today — and that is worse
  than untidy. See §2.3.

### 2.3 The webhook has no caller authentication at all

Verified three ways, 23 November 2026:

1. `middleware.ts`'s matcher **explicitly excludes** `api/webhooks`, so
   no middleware runs on it.
2. The route contains **zero** occurrences of `signature`, `hmac`,
   `x-hub`, `verify_token`, `authorization` or `secret`.
3. It exports `POST` only.

**The sole thing identifying the caller is the phone number in the
request body**, which the caller writes:

```ts
const { data: dealership } = await supabase.from("dealerships")
  .select("id, dealership_name, owner_id")
  .eq("owner_whatsapp_number", phone)
  .eq("owner_whatsapp_verified", true)
```

`owner_whatsapp_verified` checks the **stored row**, not the caller. So
anyone who knows the webhook URL and a connected owner's WhatsApp
number can POST a forged body and reach:

- **Master Chat as that owner**, with full tool access
- **`APPROVE n`** on anything pending that is not `critical` tier

Neither of those two facts is a secret: the number is the owner's
business WhatsApp, usually printed on their own website.

This is **not introduced by the Meta move** — it is true of the Gupshup
path in production today. The move is simply the moment it stops being
possible to overlook, because Meta ships the fix: a signature header,
and a shared secret to check it with.

### 2.2 What does not change

The approval vocabulary and its guards, the `critical`-tier exclusion,
`parseDecision`'s refusal of a bare "yes", the 24-hour-window rule, the
plan gate, usage limits, and every test already written against them.
A provider swap that touched those would be the wrong shape.

---

## 3. The owner's decisions, 23 November 2026

1. **Keep the Gupshup code.** It is not deleted — it may be useful
   later, and a BSP is a real fallback if a direct integration is ever
   rate-limited or suspended.
2. **Build a new Meta Cloud API integration** beside it, replacing the
   connection layer only.
3. **The verified number is reused** — +91 81150 15907, already
   through Meta Business verification.
4. **Finish this audit with those decisions in it, then build.**

---

## 4. What a build would be, and in what order

Sized the way the WordPress work was, which is the only recent
calibration that held: probe first, build second.

| | Piece | Size | The riskiest part |
|---|---|---|---|
| **M0** | **Verify the webhook's sender** — the GET challenge and `X-Hub-Signature-256`. Independent of the provider swap, and the hole is open in production today | **S** | It is an authorization path, and §2.3 is a live impersonation route, not a tidiness point. Signing has to be checked BEFORE the body is parsed, or a forged payload has already been acted on by the time anyone looks |
| **M1** | **A Meta client** beside `gupshupClient`, same three exports, so the webhook's call sites do not move | **S** | Not the sending — the **sender id**. `PHONE_NUMBER_ID` is not a phone number, and confusing the two is a silent 400 |
| **M2** | **`extractIncoming` for Meta's shape**, chosen by provider rather than guessed | **M** | Meta batches: `entry[].changes[].value.messages[]` is an ARRAY, and statuses arrive on the same endpoint. Today's parser reads one message and returns null for anything else |
| **M3** | **Which provider is live**, one switch, so both can exist | **S** | It must not be inferable from which env vars happen to be set — that is how a half-configured deploy picks a provider nobody chose |
| **M4** | **The live run** — one real message in, one real reply out, the payload shape recorded from actual traffic | **S** | Cannot be done without the number and the token. This is H5, finally doable |

**No new tool, agent, department or page.** M1 is a module beside an
existing one; M2 and M3 are branches in an existing webhook; M0 adds a
handler to an existing route.

---

## 5. What is needed before M4, and who can get it

| | |
|---|---|
| A Meta app with WhatsApp added | the owner — I cannot create accounts |
| `WHATSAPP_PHONE_NUMBER_ID` | from the app's WhatsApp → API setup |
| `WHATSAPP_ACCESS_TOKEN` | a permanent token from a System User, not the 24-hour test token |
| `WHATSAPP_VERIFY_TOKEN` | any string the owner chooses; it goes in both places |
| `WHATSAPP_APP_SECRET` | for `X-Hub-Signature-256` |
| The callback URL registered | points at `/api/webhooks/whatsapp` |

**The 24-hour test token is a trap worth stating once.** Meta's setup
screen hands out a token that expires the next day; a System User token
does not. An integration verified on the first and deployed on the
second fails silently a day later, and the failure looks like "WhatsApp
stopped working" rather than "the token expired".

---

## 6. What is still open

- **M0 is a security finding, not a feature, and it is live now.**
  §2.3: the webhook authenticates nobody, and a forged body reaches
  Master Chat as the owner and `APPROVE n` on their pending actions.
  It is not caused by the Meta move and it does not wait for it.
  **My recommendation is to fix it first, on its own**, before any of
  M1–M4 — it is small, it is independent, and every day it is open is
  a day the only thing standing between a stranger and an owner's
  approvals is a URL and a phone number printed on their website.
- **Template messages are out of scope** and should stay so. Every
  send in this product is a reply inside the 24-hour window —
  `gupshupClient`'s own header says so — and adding templates means
  Meta approval queues for each one.
- **H3 is still parked.** It was deferred for the session-window
  reason, which does not change with the provider: a notification
  raised outside the window needs a template.
