// The same email, sent twice, because a button was pressed twice.
//
// PHASE 2B. /api/email/send had no idempotency of any kind: a retried
// request, a double-click, or a card re-pressed after a slow response
// sent the email again. The recipient gets it twice and there is nothing
// in the product that would have noticed.
//
// WHAT THIS IS, PRECISELY: a duplicate-suppression WINDOW, not a true
// idempotency key. It asks whether this business already sent this
// recipient this subject in the last few minutes, using `email_sends` —
// the table sendDealerEmail already writes on every send.
//
// WHAT IT THEREFORE DOES NOT DO:
//   - It cannot tell a double-submit from a deliberate second send of
//     the same subject inside the window. That is why the window is
//     minutes, not hours, and why the refusal says how to proceed.
//   - It is not atomic. Two requests landing in the same instant can
//     both read "no duplicate" and both send. Closing that needs a
//     unique constraint on a real idempotency key, which needs a
//     column and therefore a migration — offered, not assumed.
//
// It is chosen over a new column because it needs no schema change and
// it stops the failure that actually happens: a human or a client
// retrying, seconds apart.

/** How long two identical sends count as the same send. */
export const DUPLICATE_WINDOW_MINUTES = 5;

export type DuplicateCheck =
  | { duplicate: false }
  | { duplicate: true; sentAt: string; error: string };

/**
 * Whether this exact email already went out moments ago.
 *
 * Fails OPEN on a read error, deliberately: a database hiccup must not
 * block a legitimate email the owner has already approved. The cost of
 * the rare double is lower than the cost of silently refusing to send.
 * The read error is logged so it is not invisible.
 */
export async function recentDuplicateSend(
  supabase: any,
  dealershipId: string,
  toEmail: string,
  subject: string,
  now: () => number = Date.now
): Promise<DuplicateCheck> {
  const since = new Date(now() - DUPLICATE_WINDOW_MINUTES * 60_000).toISOString();
  try {
    const { data, error } = await supabase
      .from("email_sends")
      .select("created_at")
      .eq("dealership_id", dealershipId)
      .eq("to_email", toEmail)
      .eq("subject", subject)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("[duplicate-send] couldn't check for a duplicate:", error.message);
      return { duplicate: false };
    }
    const previous = (data ?? [])[0];
    if (!previous) return { duplicate: false };
    return {
      duplicate: true,
      sentAt: previous.created_at,
      error: `Not sent again: "${subject}" already went to ${toEmail} in the last ${DUPLICATE_WINDOW_MINUTES} minutes. If you meant to send a second one, change the subject or wait a few minutes.`,
    };
  } catch (err: any) {
    console.error("[duplicate-send] couldn't check for a duplicate:", err?.message);
    return { duplicate: false };
  }
}
