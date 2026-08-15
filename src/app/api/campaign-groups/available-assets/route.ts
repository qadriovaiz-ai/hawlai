import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAvailableAssets } from "@/lib/agents/campaignGroupAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assets = await getAvailableAssets(supabase, dealershipId);
  return NextResponse.json(assets);
}
