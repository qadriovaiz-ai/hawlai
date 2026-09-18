import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Ads the owner saw and pasted in (the Ad Library website shows every
// active ad; its API doesn't, outside the EU). Their own record — it's
// quoted as written, marked "ad you saw", and kept for every later run.

async function dealershipOf(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  return (profile?.dealership_id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const dealershipId = await dealershipOf(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const competitorName = String(body.competitorName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const adText = String(body.adText ?? "").replace(/\s+/g, " ").trim();
  if (competitorName.length < 2) return NextResponse.json({ error: "Whose ad is it? Add the competitor's name." }, { status: 400 });
  if (adText.length < 10) return NextResponse.json({ error: "Paste the ad's words — at least a sentence." }, { status: 400 });
  if (adText.length > 2000) return NextResponse.json({ error: "That's longer than an ad — paste just the ad's text (2,000 characters at most)." }, { status: 400 });

  const { data, error } = await supabase
    .from("competitor_owner_ads")
    .insert({ dealership_id: dealershipId, competitor_name: competitorName, ad_text: adText })
    .select("id, competitor_name, ad_text, created_at")
    .single();
  if (error) return NextResponse.json({ error: `Couldn't save that ad: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ad: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const dealershipId = await dealershipOf(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which ad?" }, { status: 400 });
  const { error } = await supabase.from("competitor_owner_ads").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: `Couldn't remove that ad: ${error.message}` }, { status: 500 });
  return NextResponse.json({ removed: true });
}
