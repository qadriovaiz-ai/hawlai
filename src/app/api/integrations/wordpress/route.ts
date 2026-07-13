import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { testWordPressConnection } from "@/lib/agents/wordpressAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("dealerships").select("wordpress_site_url, wordpress_username, wordpress_app_password").eq("id", dealershipId).single();
  return NextResponse.json({ connected: !!(data?.wordpress_site_url && data?.wordpress_app_password) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { site_url, username, app_password } = await request.json();
  if (!site_url || !username || !app_password) {
    return NextResponse.json({ error: "Site URL, Username, and Application Password are all required" }, { status: 400 });
  }

  const test = await testWordPressConnection(site_url, username, app_password);
  if (!test.success) return NextResponse.json({ error: test.error }, { status: 400 });

  await supabase.from("dealerships").update({
    wordpress_site_url: site_url, wordpress_username: username, wordpress_app_password: app_password,
  }).eq("id", dealershipId);
  return NextResponse.json({ success: true, siteName: test.siteName });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  await supabase.from("dealerships").update({
    wordpress_site_url: null, wordpress_username: null, wordpress_app_password: null,
  }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}
