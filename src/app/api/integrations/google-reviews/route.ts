import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchGoogleReviewsSnapshot } from "@/lib/agents/reputationAgent";
import { findPlaceCandidates } from "@/lib/google/findPlaceCandidates";

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

// Search Google for this business so the dealer picks it from a list
// instead of hunting a ChIJ... string in Google's Place ID Finder.
//
// POST rather than a query param on GET: the name and city come from
// the stored record, not the caller, so there is nothing to pass — and
// this is a billed outbound call, which does not belong on a GET that
// anything might prefetch or retry.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Read through the user's own client, so RLS decides which business
  // this is — the search terms cannot be supplied by the caller.
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, city")
    .eq("id", dealershipId)
    .single();

  const result = await findPlaceCandidates(dealership?.dealership_name, dealership?.city);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

  return NextResponse.json({ candidates: result.candidates });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // No membership check against the POST results, unlike the Meta
  // pixel in resolvePixel — and the difference is deliberate. A wrong
  // pixel id sends this business's conversion data to someone else; a
  // wrong place id only pulls someone else's public rating into this
  // dealer's own CRO page. Self-inflicted and visibly wrong, not a
  // cross-tenant leak. The UI no longer offers a way to type one.
  const { placeId } = await request.json();
  const cleanPlaceId = (placeId ?? "").trim() || null;
  const { error } = await supabase.from("dealerships").update({ google_place_id: cleanPlaceId }).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch immediately on connect rather than waiting for tomorrow's
  // cron — otherwise the card stays empty for a full day after saving.
  const result = cleanPlaceId ? await fetchGoogleReviewsSnapshot(supabase, dealershipId) : { fetched: false };
  return NextResponse.json({ success: true, fetchResult: result });
}
