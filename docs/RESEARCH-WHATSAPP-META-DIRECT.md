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

### 4.1 Status, 23 November 2026 — all five closed

| | Piece | Shipped | Verified against live Meta traffic |
|---|---|---|---|
| **M0** | sender verification | `ceaf553a` | **yes** — §7 |
| **M1** | Meta client | `f94c2427` | **yes** — §7 |
| **M2** | inbound read by provider | `629934cc` | **partly** — §7.3 names which traps did and did not meet real traffic |
| **M3** | provider switch | `f94c2427` | **yes** — §7 |
| **M4** | the live run | — | **this is §7** |

H5, open since the H-series, is closed with M4.

---

## 5. What is needed before M4, and who can get it

| | |
|---|---|
| A Meta app with WhatsApp added | the owner — I cannot create accounts |
| `WHATSAPP_PHONE_NUMBER_ID` | from the app's WhatsApp → API setup |
| `WHATSAPP_ACCESS_TOKEN` | a permanent token from a System User, not the 24-hour test token |
| `WHATSAPP_VERIFY_TOKEN` | any string the owner chooses; it goes in both places |
| `WHATSAPP_APP_SECRET` | for `X-Hub-Signature-256` |
| `WHATSAPP_PROVIDER` | **set to `meta`** — added to this list 23 November 2026, see below |
| The callback URL registered | points at `/api/webhooks/whatsapp` |
| The `messages` field **subscribed** | a verified callback URL is not a subscription |
| The recipient on the allow-list | a Meta **test** number only sends to numbers added under "To" |

**`WHATSAPP_PROVIDER` was missing from this list, and that omission is
what cost the first two live attempts.** The list was written while
M0–M3 were still unbuilt, so it named the credentials Meta hands out
and not the switch M3 later added. Both of the first real deliveries
passed signature verification, were accepted with a 200, and were then
dropped by `activeProvider()` throwing — which is the fail-closed
behaviour M3 was built for, working exactly as designed, on a deploy
where the variable had simply never been set.

A checklist that is written before the build is a checklist that
describes the provider's requirements rather than the product's.

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

---

## 7. M4 — the live run, 23 November 2026

One real message in, one real reply out. Sender `918115015907`, Meta
test number as the business, business `candle_by_qaaf`
(`ba79191a-0a50-474f-9326-1ac0b461befb`), WABA `1889708125540674`.

**H5 is closed.** The payload shape is no longer a guess.

### 7.1 Every delivery, and what each one proved

| Time (UTC) | Method | Status | What it settled |
|---|---|---|---|
| 19:00:28 | GET | **403** | the GET challenge refuses a wrong `hub.verify_token` |
| 19:12:53 | GET | **200** | `whatsappChallenge` answers Meta's real handshake |
| 19:53:57 | POST | 200 | Meta signs its **test-button** deliveries too — signature passed |
| 20:18:11 | POST | 200 | the first real message. Signature passed, `WHATSAPP_PROVIDER` unset, dropped and recorded |
| 20:30:32 | POST | **200** | **the run.** Message parsed, Master Chat answered, reply delivered |
| 20:30:48 ×2 | POST | 200 | **delivery statuses for that reply** — trap #2, in real traffic |

Between 20:18 and 20:30: `WHATSAPP_PROVIDER=meta` added to Production
and the deployment redeployed (`dpl_C8iNCqnHycER…`, aliased to
`hawlai.online`). Nothing else changed.

### 7.2 How a silent route was read

Nothing logs on the happy path, by design, so the 20:30 requests
produced **no runtime log lines at all**. The evidence is therefore
indirect, and each piece is stated with what it rests on:

- **M0.** A failed signature returns **401**. The 20:30 POSTs returned
  200, and the `WHATSAPP_PROVIDER` error at 20:18 is logged *after*
  `JSON.parse`. So the raw body was read, HMAC-SHA256 over those exact
  bytes matched `WHATSAPP_APP_SECRET`, and the body parsed.
- **M3.** The `WHATSAPP_PROVIDER isn't set` line is absent at 20:30 and
  present on every earlier POST. And a reply arrived: `sendWhatsAppText`
  resolves through `PROVIDERS[activeProvider()]`, so `gupshup` would
  have thrown on missing credentials and logged `handling failed`.
- **M1.** The reply is on the owner's phone, and no
  `Meta refused the message` line exists. Graph accepted a `type: text`
  send with `preview_url: false`.
- **M2, the text path.** `fromMeta` has exactly one route to a message
  and no fallback: `entry[] → changes[] → field === "messages" →
  value.messages[] → type === "text" → from + text.body`. A reply is
  impossible unless every step matched, and
  `normalizePhoneNumber(from)` must have produced `918115015907` or the
  dealership lookup would have answered "this number isn't connected".
  **The documented shape is confirmed by being the only shape that
  works, not by having been read.** The route deliberately never logs
  the payload — it contains the message body.

Database, the same run: one `whatsapp_chat_sessions` row with two
turns, `daily_message_usage.message_count` incremented by one, one
`api_usage_logs` row (`anthropic` / `master_chat`), and **no**
`webhook_deliveries` row — success writes nothing, which is §7.5.

### 7.3 Which of M2's three traps met real traffic

M2 was built for three Meta behaviours. Only one of them actually
happened, and saying which matters more than the green suite does.

| Trap | Live? |
|---|---|
| **#2 statuses on the same endpoint** | **YES.** The two 20:30:48 deliveries were `delivery status`, skipped, and recorded as `nothing_to_reply_to` with that reason |
| **#1 `messages` is an array** | **no.** Every real delivery carried exactly one message. The batching branch has never run outside tests |
| **#3 non-`messages` change fields** | **no.** Both status deliveries arrive with `field: "messages"` and a `value.statuses[]`, so the field guard was never the thing that skipped them |

Also still unverified live: non-text skipping (no image was ever sent
in), `sendWhatsAppImage`, the 24-hour window expiring, and the entire
Gupshup path — which the owner chose to keep as a fallback and which
has never met live traffic under either provider.

### 7.4 The reconciliation that looked like a bug

`daily_message_usage.message_count` read **2** for one WhatsApp
message. It was not a double increment:

- `checkAndRecordMessageUsage` has exactly **two** call sites —
  `/api/master-brain` and this webhook. `masterBrainV2` never counts,
  and `checkUsage(…, "message")` has **zero** callers.
- Its upsert is `message_count: usedToday + 1`, a read-then-write, so
  concurrency can only **under**-count. 2 cannot come from one message.

The second count was that day's web chat. It was invisible at first
only because the diagnostic query was scoped to 30 minutes while
`usage_date` is a **UTC** day — which runs 05:30 IST to 05:30 IST and
so contains the whole Indian working day.

A third `master_chat` cost row the same day came from a script calling
the agent directly; a script bypasses both routes and so increments
nothing. **Three agent calls and a count of two reconcile only if
exactly one of them bypassed a route** — worth re-checking if that
arithmetic ever fails to close, because the counter increments *before*
the model call, so a failure in between leaves a count with no cost row.

### 7.5 What this run exposed, not fixed

- **Success writes nothing.** `webhook_deliveries` records only
  refusals, so silence there means "handled" *or* "never called" — the
  exact ambiguity migration 226 exists to remove, one level up. Here
  only Vercel's request log could tell the two apart, and on the Hobby
  plan **runtime logs are retained 30 minutes** while request records
  last 6 hours. A `handled` record would close this.
- **Web and WhatsApp are indistinguishable in the cost log.** Both log
  `operation: "master_chat"` (`masterBrainV2.ts:6139`). The owner
  approved a later, separate commit to carry a surface through so it
  reads `master_chat:whatsapp`.
- **One business number serves every tenant.** `PHONE_NUMBER_ID` is a
  single env var and no table maps it, unlike `dealerships.vapi_phone_number_id`.
  Owner identification is by the *sender's* number, which is correct
  and sufficient today. It is not sufficient for a customer messaging a
  *business* — that needs a per-business column, and no real business
  exists yet.
- **`candle_by_qaaf` is on `basic` in production** so the plan gate
  would pass. See `DECISIONS.md` — the admin Spend page now reports
  ₹1,999 of revenue that does not exist.
