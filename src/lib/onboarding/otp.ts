// THE EMAIL CODE'S RULES — signup Q2.
//
// Pure, so the code's shape, the cooldown and the message for each kind
// of failure are all checked without a browser or a mailbox.
//
// SUPABASE'S OWN CODE IS SIX DIGITS, and `{{ .Token }}` in the Confirm
// signup template is what sends it. The screen must not accept more or
// fewer: a five-digit submit is a wasted round trip, and `verifyOtp`
// counts against the project's rate limit whether the code was
// plausible or not.
//
// THE COOLDOWN IS NOT POLITENESS EITHER. Supabase rate-limits resends
// per project, so a second press a moment later costs the owner his
// code rather than getting him a new one. A disabled button with
// seconds on it beats an error he cannot act on.

export const OTP_LENGTH = 6;

export const RESEND_COOLDOWN_SECONDS = 60;

/** Only digits, and only as many as the code has. */
export function cleanOtpInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function isCompleteOtp(value: string): boolean {
  return cleanOtpInput(value).length === OTP_LENGTH;
}

/**
 * What to say when a verification fails.
 *
 * TRANSLATED, RATHER THAN SHOWN RAW. Supabase's own messages are about
 * tokens and OTPs; the owner typed a code out of an email. And the
 * three cases need different ADVICE, not different wording of the same
 * advice: a wrong code means try again, an expired one means get a new
 * one, and a rate limit means wait. Showing "Token has expired or is
 * invalid" for all three is how someone retypes a dead code four times.
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
    return "That code is not right. Check the email and type it again.";
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
