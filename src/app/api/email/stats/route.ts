import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { countsAsSent } from "@/lib/email/sendClaim";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("email_sends").select("via, opened, clicked, created_at, handoff_state").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo);
  // A CLAIM IS NOT A SEND. Since migration 208 a row is written BEFORE
  // the send, so this table now holds rows for emails that are still in
  // flight ('claimed') and for ones that never left ('failed'). Counting
  // those would overstate the owner's send volume and quietly deflate
  // every open and click rate computed from it.
  //
  // `null` DOES count: it means the row was written by a path that only
  // inserts after the send already succeeded (sendClaim.countsAsSent
  // explains why that is permanent, not a leftover).
  const sends = (data ?? []).filter(countsAsSent);

  const resendSends = sends.filter((s) => s.via === "resend");
  const gmailSends = sends.filter((s) => s.via === "gmail");
  const opened = resendSends.filter((s) => s.opened).length;
  const clicked = resendSends.filter((s) => s.clicked).length;

  return NextResponse.json({
    totalSent: sends.length,
    resendSentCount: resendSends.length,
    gmailSentCount: gmailSends.length,
    openRate: resendSends.length > 0 ? Math.round((opened / resendSends.length) * 1000) / 10 : null,
    clickRate: resendSends.length > 0 ? Math.round((clicked / resendSends.length) * 1000) / 10 : null,
  });
}
