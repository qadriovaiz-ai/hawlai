import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getVideoAdapter, isModelConfigured } from "@/lib/videoModels";
import { checkAndRecordGenerationUsage, generationLimitMessage } from "@/lib/usage/generationLimits";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { prompt, model } = await request.json();
  if (!prompt || prompt.trim().length < 5) return NextResponse.json({ error: "Describe the video in a bit more detail" }, { status: 400 });

  const modelKey = model || "veo";
  if (!isModelConfigured(modelKey)) {
    return NextResponse.json({ error: "This model isn't connected yet — pick a connected model or ask the team to add the API key." }, { status: 400 });
  }

  // Applies to every video model, not just Veo — the plan's cap is "how
  // many video generations this tier permits," not provider-specific.
  const usage = await checkAndRecordGenerationUsage(dealershipId, "video");
  if (!usage.allowed) return NextResponse.json({ error: generationLimitMessage(usage), limitReached: true }, { status: 429 });

  const { data: draft, error: insertError } = await supabase
    .from("video_generations")
    .insert({ dealership_id: dealershipId, prompt: prompt.trim(), status: "pending", model_key: modelKey })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const adapter = getVideoAdapter(modelKey);
    const taskId = await adapter.start(prompt.trim(), modelKey);
    await supabase.from("video_generations").update({ task_id: taskId, operation_name: taskId }).eq("id", draft.id);
    return NextResponse.json({ id: draft.id });
  } catch (err: any) {
    await supabase.from("video_generations").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
