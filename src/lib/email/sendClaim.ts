// The send is claimed before it happens, not recorded after.
//
// WHY THE 5-MINUTE WINDOW WAS NOT ENOUGH (duplicateSend.ts says so in
// its own header): it is a content hash, so it cannot tell a retry from
// a deliberate second send of the same subject, and it is not atomic.
//
// The reason it could never be atomic was in sendDealerEmail: the
// email_sends row was inserted AFTER the send returned success. At the
// instant two requests race, the row does not exist yet, so no unique
// constraint on that table could have prevented anything.
//
// So the row becomes a CLAIM, written BEFORE the send, keyed on a
// request id the client generates once per composed email. A retry
// reuses the id and loses the insert; a deliberate second send is a new
// press with a new id and goes through. That is the distinction a
// content hash cannot make, which is why the window STAYS as a belt for
// callers that send no key.
//
// Migration 208 (applied 2026-10-09), whose unique index is partial on
// BOTH conditions:
//   idempotency_key is not null        -- null keys must not collide
//   handoff_state is distinct from 'failed'
//                                      -- a failed send must not block
//                                         the retry of itself
//
// handoff_state is Hawlai's own side of the boundary: claimed -> sent |
// failed. It is NOT delivery_status, which is Resend's verdict and is
// null forever on every Gmail send.

/** Postgres unique-violation. The whole mechanism rests on this one code. */
const UNIQUE_VIOLATION = "23505";

export type Claim =
  | { claimed: true; id: string }
  /** Someone else holds this exact request id: the send already happened or is happening. */
  | { claimed: false; duplicate: true; error: string }
  /** The claim could not be written for an unrelated reason. */
  | { claimed: false; duplicate: false; error: string };

export function duplicateSendError(to: string): string {
  return `Not sent again: this same email to ${to} has already been sent. If you meant to send a second one, start a new email rather than re-pressing this one.`;
}

/**
 * Take the claim, or discover someone already has it.
 *
 * FAILS CLOSED, unlike the content-hash window next door. That window
 * fails open on a read error because the cost of refusing a legitimate
 * approved email was judged higher than a rare double. This is the
 * opposite case: if the claim cannot be WRITTEN, the mechanism that
 * would notice a double is not running, and sending anyway would be
 * sending with the safety off. The caller refuses and says so.
 */
export async function claimSend(
  supabase: any,
  args: { dealershipId: string; to: string; subject: string; via: "gmail" | "resend"; idempotencyKey: string }
): Promise<Claim> {
  try {
    const { data, error } = await supabase
      .from("email_sends")
      .insert({
        dealership_id: args.dealershipId,
        to_email: args.to,
        subject: args.subject,
        via: args.via,
        idempotency_key: args.idempotencyKey,
        handoff_state: "claimed",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return { claimed: false, duplicate: true, error: duplicateSendError(args.to) };
      }
      console.error("[send-claim] couldn't claim the send:", error.message);
      return {
        claimed: false,
        duplicate: false,
        error: "Not sent — the duplicate check couldn't be recorded, so Hawlai stopped rather than risk sending twice. Try again.",
      };
    }
    return { claimed: true, id: String(data.id) };
  } catch (err: any) {
    console.error("[send-claim] couldn't claim the send:", err?.message);
    return {
      claimed: false,
      duplicate: false,
      error: "Not sent — the duplicate check couldn't be recorded, so Hawlai stopped rather than risk sending twice. Try again.",
    };
  }
}

/**
 * How the claim ended.
 *
 * NOTHING IS DELETED on failure — the row is marked `failed` instead.
 * The unique index excludes failed rows, so the same request id can be
 * retried without a delete that could itself fail, and the failed row
 * stays where it can be diagnosed.
 *
 * A resolve that fails is logged and swallowed: the email has already
 * gone (or already failed), and throwing here would turn a delivered
 * email into an error the owner sees. The row left at `claimed` is the
 * honest record of exactly that — a send whose outcome Hawlai could not
 * write down — and stats does not count it.
 */
export async function resolveClaim(
  supabase: any,
  claimId: string,
  outcome: { sent: boolean; resendMessageId?: string | null }
): Promise<void> {
  try {
    const { error } = await supabase
      .from("email_sends")
      .update({
        handoff_state: outcome.sent ? "sent" : "failed",
        ...(outcome.resendMessageId ? { resend_message_id: outcome.resendMessageId } : {}),
      })
      .eq("id", claimId);
    if (error) console.error("[send-claim] couldn't record how the send ended:", error.message);
  } catch (err: any) {
    console.error("[send-claim] couldn't record how the send ended:", err?.message);
  }
}

/**
 * Which rows count as a send that happened.
 *
 * `null` COUNTS, and that is not an oversight. Migration 208 added the
 * column; every row written by the code that predates the claim
 * mechanism has no handoff_state, and those rows are successful sends
 * because the old insert only ran AFTER the send returned success.
 *
 * The backfill set the eight historical rows to 'sent', and it does NOT
 * make null impossible: any caller that sends no idempotency key still
 * takes the old insert-after-success path. So this rule, not the
 * backfill, is what keeps the numbers right.
 */
export function countsAsSent(row: { handoff_state?: string | null }): boolean {
  const state = row?.handoff_state ?? null;
  return state === null || state === "sent";
}
