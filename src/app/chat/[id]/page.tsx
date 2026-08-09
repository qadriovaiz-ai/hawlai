import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import MasterChatPage from "@/components/chat/MasterChatPage";

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/auth/login");

  const { data: conversation } = await supabase.from("chat_conversations").select("id").eq("id", id).eq("dealership_id", dealershipId).maybeSingle();
  if (!conversation) notFound();

  const { data: messages } = await supabase.from("chat_messages").select("id, role, content, tools_used, artifacts, feedback").eq("conversation_id", id).order("created_at", { ascending: true });

  const initialMessages = (messages ?? []).map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, toolsUsed: m.tools_used ?? [], artifacts: m.artifacts ?? [], feedback: m.feedback ?? null }));

  return <MasterChatPage conversationId={id} initialMessages={initialMessages} />;
}
