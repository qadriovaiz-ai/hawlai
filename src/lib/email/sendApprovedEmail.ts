// Sending one marketing email, callable from more than the route.
//
// G-3 STEP 3a. A straight extraction out of
// src/app/api/email/send/route.ts with NO behaviour change — same order,
// same checks, same messages, same statuses. It exists so the approvals
// route can send without calling this app over HTTP, which gets a Vercel
// 508 after about four hops.
//
// WHY NOT sendDealerEmail, WHICH THE APPROVALS ROUTE ALREADY CALLED.
// Phase 2B wrote a send_email branch that calls sendDealerEmail directly,
// and it was correct for the shape it was written for: a note to a
// colleague. It is WRONG for a marketing email to a customer, because it
// skips everything in this file — the recipient-on-record check, the
// suppression list, the business address and unsubscribe footer that
// sendMarketingEmail adds, the misleading-subject rule, the unsupported
// link check, the duplicate window and the idempotency claim.
//
// Routing the customer card through that branch would have made the
// approval path LESS safe than the browser path it replaces. That is the
// trap in G-3 step 3, and it is why the work is extracted rather than
// reusing what was already there.

import { recipientOnRecord } from "@/lib/email/consent";
import { sendMarketingEmail } from "@/lib/email/sendMarketingEmail";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { findUnsupportedLinks } from "@/lib/claims/claimCheck";
import { misleadingSubject } from "@/lib/expertise/channelRules";
import { isPieceId, markTrackedLinks } from "@/lib/attribution/contentLink";
import { registerPiece } from "@/lib/attribution/pieces";
import { recentDuplicateSend } from "@/lib/email/duplicateSend";

export type EmailSendInput = {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  draft?: Record<string, any> | null;
  piece_id?: string | null;
  request_id?: string | null;
};

export type EmailSendResult =
  | { ok: true }
  | { ok: false; status: number; error: string; duplicate?: boolean; lastSentAt?: string };

/**
 * Every rule, in the order the route always ran them.
 *
 * The duplicate window comes before the recipient and footer work so a
 * double press costs nothing, and the attribution marking comes AFTER
 * the link check so an unverified link is refused outright rather than
 * quietly tracked.
 */
export async function sendApprovedEmail(
  supabase: any,
  dealershipId: string,
  input: EmailSendInput
): Promise<EmailSendResult> {
  const { to, subject: plainSubject, body: plainBody, draft, piece_id, request_id } = input;
  // ONE ID PER COMPOSED EMAIL, from the client. A retry reuses it and is
  // refused by migration 208's unique index; a deliberate second send is
  // a new press with a new id and goes through. The content-hash window
  // below cannot make that distinction, which is why both exist.
  const requestId = typeof request_id === "string" && request_id.trim() ? request_id.trim().slice(0, 100) : null;
  // Either words written by hand ({subject, body}) or a visual email
  // draft ({draft}) — the one chat's preview card confirms.
  const subject = draft?.subject ?? plainSubject;
  const body = draft?.body ?? plainBody;
  if (!to || !subject || !body) return { ok: false, status: 400, error: "to, subject, and body are all required" };

  // Checked again here, not only when chat proposed it: this endpoint is
  // what actually sends.
  const subjectProblem = misleadingSubject(subject);
  if (subjectProblem) return { ok: false, status: 400, error: `Not sent: the subject "${subject}" ${subjectProblem}.` };

  // THE SAME EMAIL TWICE, because a button was pressed twice.
  //
  // This endpoint had no idempotency of any kind: a retry, a
  // double-click or a card re-pressed after a slow response sent it
  // again, and nothing in the product would have noticed. Checked
  // BEFORE the recipient and footer work so a duplicate costs nothing
  // (src/lib/email/duplicateSend.ts explains what this does and does
  // not guarantee).
  const dupe = await recentDuplicateSend(supabase, dealershipId, to, subject);
  // `lastSentAt`, not `firstSentAt`: the query orders newest-first, so
  // this is the most recent matching send. A mutation check that
  // reversed the ordering survived, which is how the wrong name was
  // noticed — nothing reads this field yet, so it is renamed now
  // rather than left to mislead whoever first does.
  if (dupe.duplicate) return { ok: false, status: 409, error: dupe.error, duplicate: true, lastSentAt: dupe.sentAt };

  // Same rules as every marketing email: only people on record, never
  // anyone who unsubscribed, always the address and unsubscribe footer.
  let kind;
  try {
    kind = await recipientOnRecord(supabase, dealershipId, to);
  } catch (err: any) {
    return { ok: false, status: 500, error: `Not sent — ${err.message}.` };
  }
  if (!kind) return { ok: false, status: 400, error: `${to} isn't a lead, customer or team member of this business, so Hawlai won't email them.` };

  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const allWords = [subject, body, draft?.headline, draft?.intro, ...(Array.isArray(draft?.bullets) ? draft.bullets : []), draft?.ctaLabel].filter(Boolean).join("\n");
  const badLinks = facts ? findUnsupportedLinks(allWords, facts) : [];
  if (badLinks.length) return { ok: false, status: 400, error: `Not sent: the email contains ${badLinks[0]}.` };

  // Which email this is, so a visit arriving from it can be counted
  // against it (migration 197). Registered here, at the send, because an
  // email that was drafted and never sent published nothing. Marking
  // happens AFTER the link check above — an unverified link is refused
  // outright, never quietly tracked.
  let sendSubject = subject;
  let sendBody = body;
  let sendDraft = draft;
  if (isPieceId(piece_id)) {
    const { data: saved } = await supabase
      .from("email_marketing_pieces")
      .select("id, topic")
      .eq("id", piece_id)
      .eq("dealership_id", dealershipId)
      .maybeSingle();
    const pieceId = saved?.id ? await registerPiece(supabase, { dealershipId, kind: "email", sourceId: saved.id, label: saved.topic }) : null;
    if (pieceId) {
      sendBody = markTrackedLinks(body, pieceId).text;
      sendSubject = markTrackedLinks(subject, pieceId).text;
      if (draft) {
        sendDraft = { ...draft };
        for (const key of ["body", "intro", "headline", "ctaUrl"] as const) {
          if (typeof sendDraft[key] === "string") sendDraft[key] = markTrackedLinks(sendDraft[key], pieceId).text;
        }
        if (Array.isArray(sendDraft.bullets)) {
          sendDraft.bullets = sendDraft.bullets.map((b: unknown) => (typeof b === "string" ? markTrackedLinks(b, pieceId).text : b));
        }
      }
    }
  }

  let result;
  if (sendDraft) {
    if (!facts) return { ok: false, status: 503, error: "Not sent — your store details couldn't be read to build the email. Try again." };
    result = await sendMarketingEmail(supabase, dealershipId, to, { draft: sendDraft, facts }, requestId);
  } else {
    const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
    result = await sendMarketingEmail(supabase, dealershipId, to, { subject: sendSubject, text: sendBody, businessName: dealership?.dealership_name ?? "" }, requestId);
  }
  if (!result.success) {
    // A double-press is 409 and "already sent", not 400 and "couldn't be
    // sent" — the second reads as a failure and invites a third press.
    if ((result as any).duplicate) return { ok: false, status: 409, error: result.error!, duplicate: true };
    return { ok: false, status: 400, error: result.error! };
  }
  return { ok: true };
}
