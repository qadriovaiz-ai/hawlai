import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { recipientOnRecord } from "@/lib/email/consent";
import { sendMarketingEmail } from "@/lib/email/sendMarketingEmail";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { findUnsupportedLinks } from "@/lib/claims/claimCheck";
import { misleadingSubject } from "@/lib/expertise/channelRules";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { to, subject: plainSubject, body: plainBody, draft } = await request.json();
  // Either words written by hand ({subject, body}) or a visual email
  // draft ({draft}) — the one chat's preview card confirms.
  const subject = draft?.subject ?? plainSubject;
  const body = draft?.body ?? plainBody;
  if (!to || !subject || !body) return NextResponse.json({ error: "to, subject, and body are all required" }, { status: 400 });

  // Checked again here, not only when chat proposed it: this endpoint is
  // what actually sends.
  const subjectProblem = misleadingSubject(subject);
  if (subjectProblem) return NextResponse.json({ error: `Not sent: the subject "${subject}" ${subjectProblem}.` }, { status: 400 });

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

  let result;
  if (draft) {
    if (!facts) return NextResponse.json({ error: "Not sent — your store details couldn't be read to build the email. Try again." }, { status: 503 });
    result = await sendMarketingEmail(supabase, dealershipId, to, { draft, facts });
  } else {
    const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
    result = await sendMarketingEmail(supabase, dealershipId, to, { subject, text: body, businessName: dealership?.dealership_name ?? "" });
  }
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
