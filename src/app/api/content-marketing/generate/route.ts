import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateContent } from "@/lib/agents/contentMarketingAgent";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { contentType, topic } = await request.json();
  if (!contentType) return NextResponse.json({ error: "contentType required" }, { status: 400 });

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const { output, _fallback } = await generateContent(
    contentType,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "car dealership",
    topic ?? "",
    brandProfile
  );

  // Only save real generations to history — a fallback shouldn't
  // clutter the calendar/history with placeholder drafts.
  let saved = null;
  if (!_fallback) {
    const { data } = await supabase
      .from("content_pieces")
      .insert({ dealership_id: dealershipId, content_type: contentType, topic: topic ?? "", output })
      .select()
      .single();
    saved = data;
  }

  return NextResponse.json({ output, _fallback, id: saved?.id ?? null });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ items: data ?? [] });
}
