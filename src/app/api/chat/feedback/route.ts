import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, feedback } = await request.json();
  if (!messageId || !["up", "down"].includes(feedback)) {
    return NextResponse.json({ error: "messageId and feedback ('up'|'down') required" }, { status: 400 });
  }

  // Scoped through the conversation's dealership ownership via RLS —
  // chat_messages itself doesn't carry dealership_id directly, so this
  // relies on the existing chat_messages RLS policy (joined through
  // chat_conversations) rather than an explicit check here.
  const { error } = await supabase.from("chat_messages").update({ feedback }).eq("id", messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
