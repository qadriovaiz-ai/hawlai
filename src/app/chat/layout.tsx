import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConversationSidebar from "@/components/chat/ConversationSidebar";
import { resolveOnboardingState, shouldSendToOnboarding } from "@/lib/onboardingState";

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

  // Resolved through the shared helper, NOT an embedded join. This
  // and /dashboard/page redirect at each other, so they are only safe
  // while they agree — and they previously read the same field
  // through two different query shapes that this schema has a
  // documented history of diverging. See lib/onboardingState.ts.
  const onboarding = await resolveOnboardingState(supabase, user.id);
  if (!onboarding.dealershipId) redirect("/auth/login");

  // `?from=chat` tells /dashboard not to bounce straight back. A
  // second guard on top of the shared resolver: if these two ever
  // disagree again for a reason nobody predicted, the cycle stops
  // after one hop instead of spinning forever.
  if (shouldSendToOnboarding(onboarding)) redirect("/dashboard?from=chat");

  return (
    <div className="flex h-screen bg-slate-200 overflow-hidden">
      <ConversationSidebar dealershipName={onboarding.dealershipName ?? "Your business"} />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}
