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
  const { data } = await supabase.from("content_autopilot_log").select("success, created_at").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo);
  const logs = data ?? [];
  const succeeded = logs.filter((l) => l.success).length;

  return NextResponse.json({
    totalAttempted: logs.length,
    succeeded,
    failed: logs.length - succeeded,
  });
}
