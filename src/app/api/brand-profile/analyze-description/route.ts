import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { analyzeDescription } from "@/lib/agents/businessIntelligenceAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { description } = await request.json();
  if (!description) return NextResponse.json({ error: "Describe your business first" }, { status: 400 });

  try {
    const result = await analyzeDescription(description);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
