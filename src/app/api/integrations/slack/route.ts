import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sendSlackNotification } from "@/lib/agents/slackAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("dealerships").select("slack_webhook_url").eq("id", dealershipId).single();
  return NextResponse.json({ connected: !!data?.slack_webhook_url });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { webhook_url } = await request.json();
  if (!webhook_url || !webhook_url.startsWith("https://hooks.slack.com/")) {
    return NextResponse.json({ error: "That doesn't look like a Slack webhook URL (should start with https://hooks.slack.com/)" }, { status: 400 });
  }

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();

  const test = await sendSlackNotification(webhook_url, `🎉 Hawlai is now connected to Slack for *${dealership?.dealership_name ?? "your dealership"}*. You'll get notified here for new hot leads and important updates.`);
  if (!test.success) {
    return NextResponse.json({ error: `Couldn't send a test message: ${test.error}` }, { status: 400 });
  }

  await supabase.from("dealerships").update({ slack_webhook_url: webhook_url }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  await supabase.from("dealerships").update({ slack_webhook_url: null }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}
