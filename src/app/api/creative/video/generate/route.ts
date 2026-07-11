import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { startVideoGeneration } from "@/lib/agents/videoAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { prompt } = await request.json();
  if (!prompt || prompt.trim().length < 5) return NextResponse.json({ error: "Describe the video in a bit more detail" }, { status: 400 });

  const { data: draft, error: insertError } = await supabase
    .from("video_generations")
    .insert({ dealership_id: dealershipId, prompt: prompt.trim(), status: "pending" })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const operationName = await startVideoGeneration(prompt.trim());
    await supabase.from("video_generations").update({ operation_name: operationName }).eq("id", draft.id);
    return NextResponse.json({ id: draft.id });
  } catch (err: any) {
    await supabase.from("video_generations").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
