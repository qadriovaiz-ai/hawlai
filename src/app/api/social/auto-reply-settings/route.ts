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
    supabase.from("dealerships").select("dm_auto_reply_enabled, comment_auto_reply_enabled, fb_page_id").eq("id", dealershipId).single(),
    supabase.from("auto_reply_log").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    dmEnabled: dealership?.dm_auto_reply_enabled ?? false,
    commentEnabled: dealership?.comment_auto_reply_enabled ?? false,
    connected: !!dealership?.fb_page_id,
    log: log ?? [],
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { dmEnabled, commentEnabled } = await request.json();
  const update: any = {};
  if (typeof dmEnabled === "boolean") update.dm_auto_reply_enabled = dmEnabled;
  if (typeof commentEnabled === "boolean") update.comment_auto_reply_enabled = commentEnabled;

  const { error } = await supabase.from("dealerships").update(update).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
