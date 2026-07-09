import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { searchCompetitorAds } from "@/lib/agents/researchAgent";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "Search term is too short" }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token")
    .eq("id", dealershipId)
    .single();

  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Facebook Page isn't connected" }, { status: 400 });
  }

  const result = await searchCompetitorAds(token, query.trim());
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ads: result.ads });
}
