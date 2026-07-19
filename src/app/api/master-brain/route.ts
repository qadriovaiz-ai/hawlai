import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { message, history } = body;
  if (!message || message.trim().length < 1) {
    return NextResponse.json({ error: "Please type something" }, { status: 400 });
  }

  try {
    const result = await runMasterBrainChat(supabase, dealershipId, Array.isArray(history) ? history : [], message);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[master-brain] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
