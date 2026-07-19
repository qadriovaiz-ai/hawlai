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
  const { message, history, conversationId } = body;
  if (!message || message.trim().length < 1) {
    return NextResponse.json({ error: "Please type something" }, { status: 400 });
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
