import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/agents/businessIntelligenceAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await request.json();
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "Enter a full URL starting with http:// or https://" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;

  try {
    const result = await analyzeWebsite(url, dealershipId ? { supabase, dealershipId } : undefined);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
