import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { recipientOnRecord } from "@/lib/email/consent";
import { sendMarketingEmail } from "@/lib/email/sendMarketingEmail";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { findUnsupportedLinks } from "@/lib/claims/claimCheck";
import { misleadingSubject } from "@/lib/expertise/channelRules";
import { isPieceId, markTrackedLinks } from "@/lib/attribution/contentLink";
import { registerPiece } from "@/lib/attribution/pieces";
import { recentDuplicateSend } from "@/lib/email/duplicateSend";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { to, subject: plainSubject, body: plainBody, draft, piece_id, request_id } = await request.json();
  // ONE ID PER COMPOSED EMAIL, from the client. A retry reuses it and is
  // refused by migration 208's unique index; a deliberate second send is
  // a new press with a new id and goes through. The content-hash window
  // below cannot make that distinction, which is why both exist.
  const requestId = typeof request_id === "string" && request_id.trim() ? request_id.trim().slice(0, 100) : null;
  // Either words written by hand ({subject, body}) or a visual email
  // draft ({draft}) — the one chat's preview card confirms.
  const subject = draft?.subject ?? plainSubject;
  const body = draft?.body ?? plainBody;
  if (!to || !subject || !body) return NextResponse.json({ error: "to, subject, and body are all required" }, { status: 400 });

  // Checked again here, not only when chat proposed it: this endpoint is
  // what actually sends.
  const subjectProblem = misleadingSubject(subject);
  if (subjectProblem) return NextResponse.json({ error: `Not sent: the subject "${subject}" ${subjectProblem}.` }, { status: 400 });

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
  if (dupe.duplicate) return NextResponse.json({ error: dupe.error, duplicate: true, lastSentAt: dupe.sentAt }, { status: 409 });

  // Same rules as every marketing email: only people on record, never
  // anyone who unsubscribed, always the address and unsubscribe footer.
  let kind;
  try {
    kind = await recipientOnRecord(supabase, dealershipId, to);
  } catch (err: any) {
    return NextResponse.json({ error: `Not sent — ${err.message}.` }, { status: 500 });
  }
  if (!kind) return NextResponse.json({ error: `${to} isn't a lead, customer or team member of this business, so Hawlai won't email them.` }, { status: 400 });

  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const allWords = [subject, body, draft?.headline, draft?.intro, ...(Array.isArray(draft?.bullets) ? draft.bullets : []), draft?.ctaLabel].filter(Boolean).join("\n");
  const badLinks = facts ? findUnsupportedLinks(allWords, facts) : [];
  if (badLinks.length) return NextResponse.json({ error: `Not sent: the email contains ${badLinks[0]}.` }, { status: 400 });

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
    if (!facts) return NextResponse.json({ error: "Not sent — your store details couldn't be read to build the email. Try again." }, { status: 503 });
    result = await sendMarketingEmail(supabase, dealershipId, to, { draft: sendDraft, facts }, requestId);
  } else {
    const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
    result = await sendMarketingEmail(supabase, dealershipId, to, { subject: sendSubject, text: sendBody, businessName: dealership?.dealership_name ?? "" }, requestId);
  }
  if (!result.success) {
    // A double-press is 409 and "already sent", not 400 and "couldn't be
    // sent" — the second reads as a failure and invites a third press.
    if ((result as any).duplicate) return NextResponse.json({ error: result.error, duplicate: true }, { status: 409 });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
