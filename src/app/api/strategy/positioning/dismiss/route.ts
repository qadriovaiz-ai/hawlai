import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// A competitor Hawlai found that the owner says isn't one. Remembered, so
// it's never searched for again — the owner decides who their competitors are.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const competitorName = String(body.competitorName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (competitorName.length < 2) return NextResponse.json({ error: "Which competitor?" }, { status: 400 });

  const { error } = await supabase
    .from("competitor_dismissed")
    .upsert({ dealership_id: dealershipId, competitor_name: competitorName }, { onConflict: "dealership_id,competitor_name", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: `Couldn't remove it: ${error.message}` }, { status: 500 });
  return NextResponse.json({ dismissed: competitorName, note: "It won't be used again. Run the comparison again to replace it." });
}
