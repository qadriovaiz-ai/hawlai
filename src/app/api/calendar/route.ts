import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: manualItems, error } = await supabase
    .from("marketing_calendar")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("scheduled_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull in real scheduled ad campaigns too (Paid Ads Agent), read-only,
  // so the calendar reflects what's actually launching, not just plans.
  const { data: scheduledAds } = await supabase
    .from("ad_creatives")
    .select("id, headline, scheduled_start, meta_status")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched")
    .not("scheduled_start", "is", null);

  const adItems = (scheduledAds ?? []).map((ad: any) => ({
    id: `ad-${ad.id}`,
    title: ad.headline,
    channel: "paid_ads",
    scheduled_date: ad.scheduled_start?.slice(0, 10),
    status: ad.meta_status === "ACTIVE" ? "in_progress" : "planned",
    notes: null,
    is_auto: true,
  }));

  const combined = [...(manualItems ?? []), ...adItems].sort(
    (a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
  );

  return NextResponse.json(combined);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { title, channel, scheduled_date, notes } = body;

  if (!title || title.trim().length < 2) return NextResponse.json({ error: "Title is too short" }, { status: 400 });
  if (!scheduled_date) return NextResponse.json({ error: "scheduled_date is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("marketing_calendar")
    .insert({
      dealership_id: dealershipId,
      title: title.trim(),
      channel: channel ?? "other",
      scheduled_date,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
