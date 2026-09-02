import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WelcomeChatCard from "@/components/dashboard/WelcomeChatCard";
import { resolveOnboardingState, shouldSendToOnboarding } from "@/lib/onboardingState";

// The primary landing experience after login is now the full-screen
// conversational Master Chat (/dashboard/master-brain) — talk to
// Hawlai the way you'd talk to a person, and it routes the request to
// whichever department/action is needed, instead of clicking through
// 21 separate pages. First-time users still see the one-time
// "describe your business" onboarding chat here before being sent on;
// the KPI-card dashboard some people prefer still exists at
// /dashboard/overview, reachable from the sidebar.
export default async function DashboardEntryPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Same resolver /chat/layout uses. These two redirect at each
  // other, so a single shared query shape is what keeps them from
  // disagreeing — see lib/onboardingState.ts.
  const onboarding = await resolveOnboardingState(supabase, user.id);
  if (!onboarding.dealershipId) redirect("/auth/login");

  if (shouldSendToOnboarding(onboarding)) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <WelcomeChatCard
          dealershipName={onboarding.dealershipName ?? "your business"}
          ownerName={onboarding.ownerName}
        />
      </div>
    );
  }

  // The hop guard. /chat/layout sends people here with ?from=chat when
  // IT decided onboarding was incomplete. If we then decide it IS
  // complete and bounce them back, that is a loop — so when the two
  // disagree, stop here and show onboarding rather than ping-ponging.
  // Reaching this branch means the resolver returned different answers
  // for the same user moments apart, which should be impossible now;
  // it is handled anyway because the failure mode is a product nobody
  // can use.
  const params = (await searchParams) ?? {};
  if (params.from === "chat") {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <WelcomeChatCard
          dealershipName={onboarding.dealershipName ?? "your business"}
          ownerName={onboarding.ownerName}
        />
      </div>
    );
  }

  redirect("/chat");
}
