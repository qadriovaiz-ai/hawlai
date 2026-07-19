import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MasterChatPage from "@/components/chat/MasterChatPage";

export default async function AIAgentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <MasterChatPage />;
}
