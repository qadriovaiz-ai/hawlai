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

  const [{ data: dealership }, { data: log }] = await Promise.all([
    supabase.from("dealerships").select("welcome_email_auto_enabled, follow_up_email_auto_enabled, follow_up_inactive_days, gmail_email").eq("id", dealershipId).single(),
    supabase.from("email_automation_log").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    welcomeEnabled: dealership?.welcome_email_auto_enabled ?? false,
    followUpEnabled: dealership?.follow_up_email_auto_enabled ?? false,
    followUpInactiveDays: dealership?.follow_up_inactive_days ?? 3,
    connected: !!dealership?.gmail_email,
    log: log ?? [],
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { welcomeEnabled, followUpEnabled, followUpInactiveDays } = await request.json();
  const update: any = {};
  if (typeof welcomeEnabled === "boolean") update.welcome_email_auto_enabled = welcomeEnabled;
  if (typeof followUpEnabled === "boolean") update.follow_up_email_auto_enabled = followUpEnabled;
  if (typeof followUpInactiveDays === "number") update.follow_up_inactive_days = followUpInactiveDays;

  const { error } = await supabase.from("dealerships").update(update).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
