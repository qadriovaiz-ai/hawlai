import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getVideoAdapter, isModelConfigured, getFallbackModelKey } from "@/lib/videoModels";
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
    const taskId = await getVideoAdapter(modelKey).start(prompt.trim(), modelKey);
    await supabase.from("video_generations").update({ task_id: taskId, operation_name: taskId }).eq("id", draft.id);
    return NextResponse.json({ id: draft.id });
  } catch (err: any) {
    // Section 21 — try the other provider before giving up. Unlike
    // research failover this is NOT silent: the customer explicitly
    // picked this model, so model_key is updated to whatever actually
    // ran and `switchedTo` is returned for the UI to surface. Failing
    // over is better than a dead end; misreporting which model made
    // their video is not.
    const fallbackKey = getFallbackModelKey(modelKey);
    if (fallbackKey) {
      try {
        const taskId = await getVideoAdapter(fallbackKey).start(prompt.trim(), fallbackKey);
        await supabase.from("video_generations").update({ task_id: taskId, operation_name: taskId, model_key: fallbackKey }).eq("id", draft.id);
        console.warn(`[video] ${modelKey} failed (${err.message}) — switched to ${fallbackKey}.`);
        return NextResponse.json({ id: draft.id, switchedTo: fallbackKey, requestedModel: modelKey });
      } catch (fallbackErr: any) {
        // Both providers down — report the ORIGINAL failure, since
        // that's the model the customer actually asked for.
        console.error(`[video] fallback ${fallbackKey} also failed:`, fallbackErr.message);
      }
    }
    await supabase.from("video_generations").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
