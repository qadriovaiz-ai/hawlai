# Signup: fewer fields, and an email code

**2 November 2026. Plan only: no code, no migration run, nothing paid.**

Two changes asked for together:

1. Signup drops **Business Name** and **City**. The name is collected by
   the new step 3 (`ConfirmBusinessStep`), which is already built.
2. **Email OTP verification** on signup. No SMS, no new cost.

---

## 1. The two checks that were asked for, answered

| Column | Live definition | What that means |
|---|---|---|
| `dealerships.dealership_name` | `text **not null**` (`001_schema.sql:15`) | **A value is required at insert.** Dropping the field from signup means something has to stand in |
| `dealerships.city` | `text` — nullable (`001_schema.sql:16`) | **Nothing needed.** It simply is not set, and step 3 writes it later if the owner types one |

So the founder's instinct was right on both counts: the name needs a
stand-in, the city does not.

### And a third thing, which is bigger than either

`src/app/auth/signup/page.tsx` creates the dealership **in the
browser, with the new user's own session**, under the RLS policy
`dealerships_owner_all` (`owner_id = auth.uid()`).

That only works because email confirmation is effectively **off**
today: `signUp` returns a session immediately, so `auth.uid()` is set
and the insert passes.

**Turn email verification on and that insert fails.** `signUp` then
returns a user with **no session**, `auth.uid()` is null, RLS refuses
the row, and the new customer gets a policy error on the one screen
they cannot get past. Change 2 therefore cannot be done without moving
where the business record is created — that is the real work in it,
not the code box.

---

## 2. Change 1 — signup drops two fields

### The placeholder, and why it needs a guard rather than just a value

`dealership_name` is read in **94 files, 224 times**, and several of
those reach a person: `sendDealerEmail`, `sendApprovedEmail`,
`gmailAgent`, the growth report's subject line, the spend alert.

So a placeholder is not a harmless internal value. If the owner signs
up and closes the tab before step 3, the next morning's report arrives
with the placeholder as the business name in its **subject line**. That
is the same class of fault as step 3's "pulled from your website": a
screen or an email stating something nobody said.

Two ways, and I want a decision:

**(a) A marked placeholder plus a guard — recommended.**
One exported constant, and one helper that refuses to show it:

- `PLACEHOLDER_BUSINESS_NAME` in `src/lib/onboarding/signup.ts`
- `displayBusinessName(name)` returns `null` for the placeholder, so a
  caller must decide what to say instead of printing it
- the handful of paths that reach a person use it: the growth report's
  subject and body, `sendDealerEmail`'s footer, the spend alert
- a test asserts the placeholder appears in **no** generated
  customer-facing copy, and that the email paths go through the helper

Honest about its limit: the dashboard will say the placeholder in
places I do not change, because 94 files is not a sweep worth doing
blind. The rule is that **nothing that leaves the product** may show it.

**(b) Make the column nullable (migration 215).**
More correct, and more dangerous: 224 reads, some of them string
operations that would turn `null` into `"null"` on a screen. It is a
real option but it is **L**, and it is a schema change made for the
sake of tidiness rather than for a behaviour the founder asked for.

I recommend **(a)**, with (b) noted as the thing to do if the
placeholder ever shows up somewhere it should not.

### What changes

- `signup/page.tsx`: the form loses two fields and keeps three. The
  dealership insert sends `dealership_name: PLACEHOLDER_BUSINESS_NAME`
  and no `city`.
- Step 3 already overwrites both. **No change needed there** — it
  writes `dealership_name` and `city` through `PATCH /api/dealership`,
  which P3 taught to accept them.
- One thing to fix in passing: step 3's name field currently resolves
  to "you entered this when you signed up" when the analysis says
  nothing. With a placeholder on the record that label would be false.
  `provenanceLabel` must treat the placeholder as **"nobody has said
  this yet"**, so the field renders empty and asks to be filled.

**Size: S.**

---

## 3. Change 2 — email OTP

### What Supabase gives us, and the one catch

Supabase's built-in email confirmation is **free and already there** —
no new service, no SMS. Two dashboard settings and one code change:

- **Confirm email** turned on.
- The **Confirm signup** email template changed to include
  `{{ .Token }}`, which is what makes it a **6-digit code** rather than
  only a magic link. Out of the box the template sends a link.
- `supabase.auth.verifyOtp({ email, token, type: "signup" })` in the
  app. That call returns a **session** on success, which is the hinge
  the rest of this depends on.

**THE CATCH, and it is the part that bites in production.** Supabase's
built-in email sender is rate-limited to a handful of messages per hour
and is documented as development-only. On that, the second and third
person to sign up in an hour get no code and no explanation.

**Resend is already configured in this project** (`RESEND_API_KEY`), so
the fix costs nothing new: set Resend as the project's **custom SMTP**
in the Supabase dashboard. That is a manual step for the founder, it
has to be done **before** verification is turned on, and without it
this feature looks broken at exactly the moment it starts mattering.

### Where the business record gets created

This is the actual work. Today:

```
signUp() -> session -> insert dealership (client, RLS) -> update profile -> /dashboard
```

With verification on, `signUp` returns no session. So:

```
signUp()            -> no session, a code is emailed
[code screen]       -> verifyOtp() -> SESSION
                    -> insert dealership + update profile   <- moved here
                    -> /dashboard -> onboarding step 1
```

The insert stays **client-side under the user's own session** — no
service client, no new route, no RLS exception. It simply runs after
verification instead of before.

**And it becomes idempotent, which it is not today.** Nothing stops a
double-submit or a refresh creating a second dealership for the same
owner; with a verification screen in the middle there is more time for
that to happen. The insert first checks for a dealership with this
`owner_id` and uses it if present.

### The screen

- After `signUp`: a "check your email" step with a 6-box code input,
  the email shown, and a **Resend code** button on a 60-second cooldown
  — Supabase rate-limits resends and a greyed-out button beats an error
  the owner cannot act on.
- A wrong code says so and lets them retry; it does not restart signup.
- An expired code offers resend rather than silently failing.
- "Wrong email?" goes back to the form with the email editable.

### What this does NOT do

- **No phone/SMS OTP.** The founder's call: SMS costs money, email does
  not.
- **No change to login.** Password login is untouched.
- **No magic-link flow.** The template carries both a link and a code;
  the screen uses the code, and a clicked link still works through
  Supabase's own handling. Worth knowing, not worth building around.
- **No migration.** Nothing new is stored.

**Size: M.** The code box is small; moving record creation, making it
idempotent, and the resend/expiry/wrong-code states are the bulk.

---

## 4. Phases, sizes, migrations

| Phase | What | Size | Migration |
|---|---|---|---|
| **Q1** | Signup drops the two fields; placeholder constant + guard on the paths that reach a person; step 3's provenance treats the placeholder as unanswered | **S** | none |
| **Q2** | OTP screen, `verifyOtp`, resend with cooldown, record creation moved after verification and made idempotent | **M** | none |

**No migration in either**, unless the founder picks option (b) for the
business name, which would be migration 215 and **L**.

Each phase: tests with mutation checks, then `npx tsc --noEmit`,
`npx vitest run` and `npx next build` with exit codes pasted, then one
commit. Nothing is called working until it has been seen on a live
screen — and this one genuinely cannot be: **only the founder can
create a real account and receive a real email.**

---

## 5. What I need decided

1. **Business name stand-in: (a) marked placeholder with a guard, or
   (b) nullable column?** I recommend (a).
2. **What should the placeholder say?** It is briefly visible in the
   dashboard. I suggest something that reads as unfinished rather than
   as a name — "Your business" — so that if it ever does leak it reads
   as a blank, not as a mistake.
3. **Resend as Supabase's custom SMTP, before Q2 ships.** This is a
   dashboard step only you can do. Confirm you will, or Q2 should wait:
   shipping verification on the built-in sender means the second signup
   in an hour gets nothing.
4. **Order:** Q1 then Q2 (Q1 is independent and small), or Q2 first?
   I would do **Q1 first** — it is small, it has no dashboard
   dependency, and it leaves signup with exactly the three fields Q2
   then wraps a code screen around.
