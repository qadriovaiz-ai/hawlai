import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchGoogleReviewsSnapshot } from "@/lib/agents/reputationAgent";

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

  const [{ data: dealership }, { data: snapshot }] = await Promise.all([
    supabase.from("dealerships").select("google_place_id").eq("id", dealershipId).single(),
    supabase.from("google_reviews_snapshot").select("*").eq("dealership_id", dealershipId).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({ placeId: dealership?.google_place_id ?? null, snapshot: snapshot ?? null });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { placeId } = await request.json();
  const cleanPlaceId = (placeId ?? "").trim() || null;
  const { error } = await supabase.from("dealerships").update({ google_place_id: cleanPlaceId }).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch immediately on connect rather than waiting for tomorrow's
  // cron — otherwise the card stays empty for a full day after saving.
  const result = cleanPlaceId ? await fetchGoogleReviewsSnapshot(supabase, dealershipId) : { fetched: false };
  return NextResponse.json({ success: true, fetchResult: result });
}
