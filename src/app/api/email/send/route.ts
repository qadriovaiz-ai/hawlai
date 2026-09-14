import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { recipientOnRecord } from "@/lib/email/consent";
import { sendMarketingEmail } from "@/lib/email/sendMarketingEmail";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { to, subject, body } = await request.json();
  if (!to || !subject || !body) return NextResponse.json({ error: "to, subject, and body are all required" }, { status: 400 });

  // Same rules as every marketing email: only people on record, never
  // anyone who unsubscribed, always the address and unsubscribe footer.
  let kind;
  try {
    kind = await recipientOnRecord(supabase, dealershipId, to);
  } catch (err: any) {
    return NextResponse.json({ error: `Not sent — ${err.message}.` }, { status: 500 });
  }
  if (!kind) return NextResponse.json({ error: `${to} isn't a lead, customer or team member of this business, so Hawlai won't email them.` }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
  const result = await sendMarketingEmail(supabase, dealershipId, to, { subject, text: body, businessName: dealership?.dealership_name ?? "" });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
