import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConversationSidebar from "@/components/chat/ConversationSidebar";

// The immersive, chat-first home — modeled on ChatGPT/Claude/Cursor/
// Lovable: a slim conversation-history sidebar (New Chat + past
// conversations) and the chat itself, not the 25-item department
// sidebar. That full dashboard still exists at /dashboard/* for
// anyone who wants to browse a specific page directly — reachable via
// "Full Dashboard" at the bottom of this sidebar.
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id, dealerships(dealership_name, onboarding_completed)").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/auth/login");

  const dealership = (profile as any)?.dealerships;
  if (!dealership?.onboarding_completed) redirect("/dashboard");

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <ConversationSidebar dealershipName={dealership?.dealership_name ?? "Your business"} />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}
