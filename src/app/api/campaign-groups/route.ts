import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignGroups, createCampaignGroup } from "@/lib/agents/campaignGroupAgent";

async function resolveDealershipId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  return profile?.dealership_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const dealershipId = await resolveDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await getCampaignGroups(supabase, dealershipId);
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const dealershipId = await resolveDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await request.json();
  if (!name || !name.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await createCampaignGroup(supabase, dealershipId, name.trim());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}
