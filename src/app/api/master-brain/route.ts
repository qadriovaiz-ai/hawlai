import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { checkAndRecordMessageUsage } from "@/lib/usage/messageLimits";

// Vercel's default serverless timeout (as low as 10s on some plans)
// is nowhere near enough for slow tool calls in Master Chat's
// multi-step loop — Opus writing an 8000-token 3D scene, or even a
// few Sonnet calls chained together, can genuinely take 30-90+
// seconds. Without this, the request gets silently cut off mid-
// generation with no useful error. Vercel caps this automatically to
// whatever the actual plan allows if 300 exceeds it, so setting the
// higher number here is safe regardless of plan.
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { message, history, conversationId } = body;
  if (!message || message.trim().length < 1) {
    return NextResponse.json({ error: "Please type something" }, { status: 400 });
  }

  const limitCheck = await checkAndRecordMessageUsage(dealershipId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: `You've hit today's message limit (${limitCheck.messagesPerDay}/day) for your plan. Upgrade for more, or try again tomorrow.`,
        limitReached: true,
      },
      { status: 429 }
    );
  }

  // Auto-create a conversation on the first message if the caller
  // didn't already have one (e.g. sending from a fresh /chat screen).
  let activeConversationId = conversationId;
  if (!activeConversationId) {
    const { data: newConvo } = await supabase
      .from("chat_conversations")
      .insert({ dealership_id: dealershipId, title: message.trim().slice(0, 60) })
      .select("id")
      .single();
    activeConversationId = newConvo?.id ?? null;
  }

  if (activeConversationId) {
    await supabase.from("chat_messages").insert({ conversation_id: activeConversationId, role: "user", content: message });
  }

  try {
    const result = await runMasterBrainChat(supabase, dealershipId, Array.isArray(history) ? history : [], message);

    if (activeConversationId) {
      await supabase.from("chat_messages").insert({
        conversation_id: activeConversationId, role: "assistant", content: result.reply, tools_used: result.toolsUsed ?? [],
      });
      // Touch updated_at so the sidebar re-sorts this conversation to the top.
      await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeConversationId);
    }

    return NextResponse.json({ ...result, conversationId: activeConversationId });
  } catch (err: any) {
    console.error("[master-brain] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
