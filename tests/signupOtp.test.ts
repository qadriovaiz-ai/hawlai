// SIGNUP Q2 — the email code, and WHEN the business record is written.
//
// THE FAULT THIS PHASE EXISTS TO AVOID. Signup used to create the
// dealership in the browser immediately after `signUp`, with the
// session that call returned. Turn email verification on and `signUp`
// returns a user and NO session: `auth.uid()` is null, the RLS policy
// `dealerships_owner_all` refuses the row, and every new customer gets
// a policy error on the one screen they cannot get past.
//
// So the load-bearing assertions here are about ORDER — the page writes
// nothing until `verifyOtp` has handed back a session — and about the
// write being IDEMPOTENT, because a screen in the middle gives a
// refresh far more time to happen than there used to be.

import { describe, it, expect } from "vitest";
import {
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  cleanOtpInput,
  isAlreadyRegistered,
  isCompleteOtp,
  otpFailureMessage,
} from "@/lib/onboarding/otp";
import { ensureBusinessForOwner } from "@/lib/onboarding/createBusiness";
import { PLACEHOLDER_BUSINESS_NAME } from "@/lib/onboarding/signup";
import { code } from "./helpers/source";

describe("1. the code box takes whatever length Supabase sends", () => {
  // THE BUG THIS REPLACES (2 November 2026). This file used to assert
  // `OTP_LENGTH === 6`. Supabase's email OTP length is a PROJECT
  // SETTING, 6 to 10 digits, and this project sends eight — so the box
  // dropped the last two digits of every code, verifyOtp was handed a
  // truncated string, and every correct code came back "expired or
  // invalid". The test did not catch it; it pinned the assumption, so
  // the number looked deliberate and checked.

  it("AN EIGHT-DIGIT CODE SURVIVES INTACT", () => {
    // The exact case that was broken: a real code from this project.
    expect(cleanOtpInput("19258085")).toBe("19258085");
    expect(isCompleteOtp("19258085")).toBe(true);
  });

  it("AND SO DOES EVERY LENGTH SUPABASE ALLOWS", () => {
    expect(OTP_MIN_LENGTH).toBe(6);
    expect(OTP_MAX_LENGTH).toBe(10);
    for (let length = OTP_MIN_LENGTH; length <= OTP_MAX_LENGTH; length += 1) {
      const digits = "1234567890".slice(0, length);
      expect(cleanOtpInput(digits), digits).toBe(digits);
      expect(isCompleteOtp(digits), digits).toBe(true);
    }
  });

  it("AND NOTHING SHORTER THAN SUPABASE'S FLOOR IS SENT", () => {
    // verifyOtp counts against the project's rate limit whether the
    // code was plausible or not.
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("")).toBe(false);
  });

  it("AND NOTHING THAT IS NOT A DIGIT GETS THROUGH", () => {
    // A paste out of an email brings spaces and sometimes a dash.
    expect(cleanOtpInput("1925 8085")).toBe("19258085");
    expect(cleanOtpInput("19-25-80-85")).toBe("19258085");
    expect(cleanOtpInput(" 123456 ")).toBe("123456");
    expect(cleanOtpInput("abc123456def")).toBe("123456");
    expect(cleanOtpInput("")).toBe("");
  });

  it("AND ONLY WHAT CANNOT BE A CODE AT ALL IS CUT", () => {
    expect(cleanOtpInput("12345678901234")).toBe("1234567890");
    expect(cleanOtpInput("12345678901234").length).toBe(OTP_MAX_LENGTH);
  });

  it("the cooldown is long enough to be worth having", () => {
    // Supabase rate-limits resends per project, so a second press a
    // moment later costs the owner his code rather than getting him a
    // new one.
    expect(RESEND_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(30);
  });
});

describe("2. EACH FAILURE GETS ITS OWN ADVICE, not its own wording", () => {
  it("AN EXPIRED CODE SAYS GET A NEW ONE", () => {
    expect(otpFailureMessage("Token has expired or is invalid")).toMatch(/expired/i);
    expect(otpFailureMessage("Token has expired or is invalid")).toMatch(/new one/i);
  });

  it("A WRONG CODE SAYS TYPE THE WHOLE THING", () => {
    // "the whole code" rather than "again" since 2 November: a
    // half-typed code is now possible (the box accepts 6 to 10 digits
    // because the length is a project setting), and a partial code is
    // exactly what verifyOtp reports as invalid.
    expect(otpFailureMessage("Invalid token")).toMatch(/not right/i);
    expect(otpFailureMessage("Invalid token")).toMatch(/the whole code/i);
  });

  it("AND A RATE LIMIT SAYS WAIT", () => {
    expect(otpFailureMessage("email rate limit exceeded")).toMatch(/wait/i);
    expect(otpFailureMessage("For security purposes, you can only request this after 48 seconds")).toMatch(/wait/i);
  });

  it("AND THE THREE ARE GENUINELY DIFFERENT ADVICE", () => {
    // Showing "Token has expired or is invalid" for all three is how
    // somebody retypes a dead code four times.
    const messages = [
      otpFailureMessage("Token has expired"),
      otpFailureMessage("Invalid token"),
      otpFailureMessage("email rate limit exceeded"),
    ];
    expect(new Set(messages).size).toBe(3);
  });

  it("and an unrecognised message is passed through rather than swallowed", () => {
    expect(otpFailureMessage("Something nobody has seen before")).toBe("Something nobody has seen before");
    expect(otpFailureMessage("")).toMatch(/try again/i);
    expect(otpFailureMessage(null)).toMatch(/try again/i);
  });

  it("AND A REFRESH IS RECOGNISED AS ONE", () => {
    // Signing up again returns "User already registered", which reads
    // as "go and log in" — except an unconfirmed account cannot log in.
    // A dead end built out of two correct error messages.
    expect(isAlreadyRegistered("User already registered")).toBe(true);
    expect(isAlreadyRegistered("A user with this email address has already been registered")).toBe(true);
    expect(isAlreadyRegistered("Invalid login credentials")).toBe(false);
    expect(isAlreadyRegistered(null)).toBe(false);
  });
});

/** A dealerships/profiles double that records every write. */
function db(seed: { dealerships?: any[]; profiles?: any[] } = {}, errors: Record<string, string> = {}) {
  const tables: Record<string, any[]> = {
    dealerships: seed.dealerships ?? [],
    profiles: seed.profiles ?? [{ id: "u1", home_dealership_id: null }],
  };
  const writes: { table: string; kind: string; values: any }[] = [];

  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      let pending: { kind: "insert" | "update"; values: any } | null = null;
      const rows = () => tables[table].filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const apply = () => {
        if (pending) {
          const { kind, values } = pending;
          pending = null;
          writes.push({ table, kind, values });
          if (errors[`${table}:${kind}`]) return { data: null, error: { message: errors[`${table}:${kind}`] } };
          if (kind === "insert") {
            const row = { id: `${table}_${tables[table].length + 1}`, ...values };
            tables[table].push(row);
            return { data: [row], error: null };
          }
          for (const r of rows()) Object.assign(r, values);
          return { data: null, error: null };
        }
        if (errors[`${table}:select`]) return { data: null, error: { message: errors[`${table}:select`] } };
        return { data: rows(), error: null };
      };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        limit: () => Promise.resolve(apply()),
        insert(values: any) { pending = { kind: "insert", values }; return chain; },
        update(values: any) { pending = { kind: "update", values }; return chain; },
        single: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        maybeSingle: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { client, tables, writes };
}

describe("3. the business record, written once", () => {
  it("CREATES IT WITH THE STAND-IN NAME AND LINKS THE PROFILE", async () => {
    const { client, tables, writes } = db();
    const result = await ensureBusinessForOwner(client, { id: "u1", fullName: "Rajesh Sharma" });
    expect(result).toEqual({ ok: true, dealershipId: "dealerships_1", created: true });
    expect(tables.dealerships[0].dealership_name).toBe(PLACEHOLDER_BUSINESS_NAME);
    expect(tables.dealerships[0].owner_id).toBe("u1");
    expect(tables.profiles[0].dealership_id).toBe("dealerships_1");
    expect(tables.profiles[0].full_name).toBe("Rajesh Sharma");
    expect(writes.filter((w) => w.table === "dealerships" && w.kind === "insert")).toHaveLength(1);
  });

  it("AND A SECOND RUN CREATES NOTHING", async () => {
    // A refresh or a double-press on the code screen must not leave the
    // owner with two businesses and nothing to say which is his.
    const { client, tables, writes } = db();
    const first = await ensureBusinessForOwner(client, { id: "u1", fullName: "Rajesh" });
    const second = await ensureBusinessForOwner(client, { id: "u1", fullName: "Rajesh" });
    expect(first.ok && first.created).toBe(true);
    expect(second).toEqual({ ok: true, dealershipId: "dealerships_1", created: false });
    expect(tables.dealerships).toHaveLength(1);
    expect(writes.filter((w) => w.table === "dealerships" && w.kind === "insert")).toHaveLength(1);
  });

  it("A FAILED READ IS NOT 'THERE IS NONE'", async () => {
    // Acting on that would create a second business for an owner who
    // has one.
    const { client, writes } = db({}, { "dealerships:select": "connection reset" });
    const result = await ensureBusinessForOwner(client, { id: "u1" });
    expect(result).toEqual({ ok: false, error: "connection reset" });
    expect(writes).toHaveLength(0);
  });

  it("home_dealership_id IS FILLED ONLY WHEN IT IS EMPTY", async () => {
    // It is what lets /api/agency/switch repoint dealership_id to a
    // client team's business and still know how to get back. Writing it
    // every time would undo that for an agency that had switched.
    const { client, writes } = db({
      dealerships: [{ id: "d_existing", owner_id: "u1" }],
      profiles: [{ id: "u1", home_dealership_id: "d_home" }],
    });
    const result = await ensureBusinessForOwner(client, { id: "u1" });
    expect(result.ok).toBe(true);
    const update = writes.find((w) => w.table === "profiles" && w.kind === "update");
    expect(update?.values).toEqual({ dealership_id: "d_existing" });
    expect(update?.values).not.toHaveProperty("home_dealership_id");
  });

  it("AND IT IS SET ON A PROFILE THAT HAS NONE", async () => {
    const { client, writes } = db();
    await ensureBusinessForOwner(client, { id: "u1" });
    const update = writes.find((w) => w.table === "profiles" && w.kind === "update");
    expect(update?.values.home_dealership_id).toBe("dealerships_1");
  });

  it("A FAILED PROFILE LINK IS AN ERROR, not a shrug", async () => {
    // resolveOnboardingState reads dealership_id from the profile, and
    // with it null the dashboard sends the owner back to login. The old
    // code did not even check this update.
    const { client } = db({}, { "profiles:update": "permission denied" });
    const result = await ensureBusinessForOwner(client, { id: "u1" });
    expect(result).toEqual({ ok: false, error: "permission denied" });
  });

  it("and a blank name does not overwrite one already on the profile", async () => {
    const { client, writes } = db({}, {});
    await ensureBusinessForOwner(client, { id: "u1", fullName: "   " });
    const update = writes.find((w) => w.table === "profiles" && w.kind === "update");
    expect(update?.values).not.toHaveProperty("full_name");
  });
});

describe("4. NOTHING IS WRITTEN BEFORE THE EMAIL IS VERIFIED", () => {
  const page = code("src/app/auth/signup/page.tsx");

  it("THE SIGNUP PAGE TOUCHES NO TABLE OF ITS OWN", () => {
    // THE WHOLE POINT OF Q2. With verification on there is no session
    // until verifyOtp, so any table write on this page before it is a
    // row RLS will refuse — on the one screen a new customer cannot get
    // past.
    expect(page).not.toMatch(/\.from\("dealerships"\)/);
    expect(page).not.toMatch(/\.from\("profiles"\)/);
    expect(page).not.toMatch(/\.insert\(/);
  });

  it("AND THE RECORD IS CREATED IN THE VERIFY HANDLER, NOT THE SIGNUP ONE", () => {
    // ORDER IN THE FILE IS NOT THE PROPERTY. The first version of this
    // compared indexOf("verifyOtp") with indexOf("ensureBusinessForOwner"),
    // which happens to be true today and says nothing about WHICH
    // handler calls it. The property is that the handler running before
    // there is a session does not write.
    const signupBody = page.slice(
      page.indexOf("async function handleSignup("),
      page.indexOf("async function handleVerify(")
    );
    const verifyBody = page.slice(
      page.indexOf("async function handleVerify("),
      page.indexOf("async function handleResend(")
    );
    expect(signupBody.length).toBeGreaterThan(100);
    expect(verifyBody.length).toBeGreaterThan(100);
    expect(signupBody).not.toMatch(/ensureBusinessForOwner/);
    expect(verifyBody).toMatch(/verifyOtp/);
    expect(verifyBody).toMatch(/ensureBusinessForOwner\(/);
    // And the write comes after the verify inside that handler.
    expect(verifyBody.indexOf("ensureBusinessForOwner(")).toBeGreaterThan(verifyBody.indexOf("verifyOtp"));
  });

  it("AND IT IS THE SIGNUP KIND OF CODE, not a magic link", () => {
    expect(page).toMatch(/type: "signup"/);
  });

  it("A REFRESH RESENDS RATHER THAN DEAD-ENDING", () => {
    expect(page).toMatch(/isAlreadyRegistered\(signupError\.message\)/);
    expect(page).toMatch(/auth\.resend\(\{ type: "signup", email \}\)/);
  });

  it("AND THE RESEND BUTTON IS ON A COOLDOWN", () => {
    expect(page).toMatch(/disabled=\{cooldown > 0 \|\| loading\}/);
    expect(page).toMatch(/setCooldown\(RESEND_COOLDOWN_SECONDS\)/);
  });

  it("AND AN INCOMPLETE CODE CANNOT BE SUBMITTED", () => {
    expect(page).toMatch(/if \(!isCompleteOtp\(code\)\) return/);
    expect(page).toMatch(/disabled=\{loading \|\| !isCompleteOtp\(code\)\}/);
  });

  it("the box is marked up as a one-time code, so a phone offers to fill it", () => {
    expect(page).toMatch(/autoComplete="one-time-code"/);
    expect(page).toMatch(/inputMode="numeric"/);
  });

  it("AND THE SCREEN STATES NO DIGIT COUNT", () => {
    // The client cannot read the project's OTP length setting, so any
    // number in that sentence is a guess shown to the owner as a fact.
    // Saying "6-digit code" next to a box that cut an 8-digit code is
    // how the bug of 2 November read as the owner's mistake.
    expect(page).not.toMatch(/\d-digit/);
    expect(page).not.toMatch(/OTP_MIN_LENGTH\}-digit/);
    expect(page).not.toMatch(/placeholder="123456"/);
  });
});
