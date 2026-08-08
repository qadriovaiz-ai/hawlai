import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  const { data } = await supabase.from("email_sends").select("via, opened, clicked, created_at").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo);
  const sends = data ?? [];

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
