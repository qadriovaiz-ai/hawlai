import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { analyzeDescription } from "@/lib/agents/businessIntelligenceAgent";
import { aiFailedResponse } from "@/lib/ai/aiFailureResponse";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { description } = await request.json();
  if (!description) return NextResponse.json({ error: "Describe your business first" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;

  try {
    const result = await analyzeDescription(description, dealershipId ? { supabase, dealershipId } : undefined);
    // The AI failed: say why, save nothing (lib/ai/aiFailureResponse.ts).
    const aiFailed = aiFailedResponse(result);
    if (aiFailed) return aiFailed;
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
