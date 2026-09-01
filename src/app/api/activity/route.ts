import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { buildActivityFeed, groupActivity } from "@/lib/activity/activityFeed";
import { fetchActivitySources } from "@/lib/activity/fetchActivitySources";

// UX Transformation, Piece 1 — the unified activity timeline.
//
// Reads five existing stores and normalizes them. No schema, no new
// tracking: everything here was already being recorded, it just had no
// combined view.

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const grouped = searchParams.get("grouped") === "1";

  // Queries live in fetchActivitySources so the Dashboard renders the
  // same timeline server-side without a second copy of them.
  const { sources, failedSources } = await fetchActivitySources(supabase, createServiceClient(), dealershipId, limit);

  const items = buildActivityFeed(sources, limit);

  return NextResponse.json({
    items,
    ...(grouped ? { grouped: groupActivity(items) } : {}),
    partial: failedSources > 0,
  });
}
