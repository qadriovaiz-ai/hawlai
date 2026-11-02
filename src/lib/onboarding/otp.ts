// THE EMAIL CODE'S RULES — signup Q2.
//
// Pure, so the code's shape, the cooldown and the message for each kind
// of failure are all checked without a browser or a mailbox.
//
// THE LENGTH IS NOT OURS TO DECIDE, AND ASSUMING IT COST A WORKING
// FEATURE (2 November 2026). The first version of this file said
// "Supabase's own code is six digits", capped the input at six, and had
// a test asserting `OTP_LENGTH === 6`. That was wrong: Supabase's email
// OTP length is a project setting, allowed anywhere from 6 to 10 digits,
// and this project sends EIGHT. So the box silently dropped the last two
// digits of every code, `verifyOtp` was handed a truncated string, and
// every correct code the founder typed came back "expired or invalid" —
// with the one message that sends somebody off to request another code
// that will fail in exactly the same way.
//
// The guard made it worse rather than catching it: a test pinned the
// assumption, so the number looked deliberate and checked.
//
// NOW THE RANGE IS WHAT SUPABASE ALLOWS, and the only thing that judges
// a code is `verifyOtp`. Setting the dashboard back to six would also
// have "fixed" it, and is not a fix: it leaves the product depending on
// a setting staying put, with nothing to catch it moving.
//
// AND NO SCREEN STATES A DIGIT COUNT ANY MORE. We cannot read the
// project's setting from the client, so any number in that sentence
// would be a guess shown to the owner as a fact.

/** Supabase's own floor for an email OTP. */
export const OTP_MIN_LENGTH = 6;

/** Supabase's own ceiling. Nothing longer can be a code it sent. */
export const OTP_MAX_LENGTH = 10;

export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Only digits, and never cut below what Supabase may have sent.
 *
 * THE CEILING IS THE CEILING OF THE RANGE, not of one project's
 * setting. Cutting at six is the bug this file is about; cutting at ten
 * is only refusing something that cannot be a code.
 */
export function cleanOtpInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, OTP_MAX_LENGTH);
}

/**
 * Is there enough here to be worth sending?
 *
 * THE FLOOR, NOT AN EXACT LENGTH. The client cannot know how long this
 * project's codes are, so the only honest question is whether the owner
 * has typed at least as much as any Supabase code could be. `verifyOtp`
 * decides the rest — it is the only thing that actually knows.
 */
export function isCompleteOtp(value: string): boolean {
  return cleanOtpInput(value).length >= OTP_MIN_LENGTH;
}

/**
 * What to say when a verification fails.
 *
 * TRANSLATED, RATHER THAN SHOWN RAW. Supabase's own messages are about
 * tokens and OTPs; the owner typed a code out of an email. And the
 * three cases need different ADVICE, not different wording of the same
 * advice: a wrong code means try again, an expired one means get a new
 * one, and a rate limit means wait. Showing "Token has expired or is
 * invalid" for all three is how someone retypes a dead code four times
 * — and, on 2 November, how a truncation bug looked like an expiry one.
 */
export function otpFailureMessage(raw: string | null | undefined): string {
  const text = String(raw ?? "").toLowerCase();
  if (!text) return "That did not work — try again.";
  if (text.includes("expired")) {
    return "That code has expired. Send a new one and try again.";
  }
  if (text.includes("rate limit") || text.includes("too many") || text.includes("security purposes")) {
    return "Too many tries just now. Wait a minute, then send a new code.";
  }
  if (text.includes("invalid") || text.includes("token")) {
    return "That code is not right. Check the email and type the whole code.";
  }
  return raw as string;
}

/**
 * Is this signUp failure really "you already started this"?
 *
 * WHY IT MATTERS: refreshing the code screen loses the page's state,
 * and signing up again with the same email returns "User already
 * registered" — which reads as "go and log in", except an unconfirmed
 * account cannot log in. That is a dead end built out of two correct
 * error messages. Recognised here so the screen can resend the code and
 * carry on instead.
 */
export function isAlreadyRegistered(raw: string | null | undefined): boolean {
  const text = String(raw ?? "").toLowerCase();
  return text.includes("already registered") || text.includes("already been registered") || text.includes("user already exists");
}
