import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WelcomeChatCard from "@/components/dashboard/WelcomeChatCard";

// The primary landing experience after login is now the full-screen
// conversational Master Chat (/dashboard/master-brain) — talk to
// Hawlai the way you'd talk to a person, and it routes the request to
// whichever department/action is needed, instead of clicking through
// 21 separate pages. First-time users still see the one-time
// "describe your business" onboarding chat here before being sent on;
// the KPI-card dashboard some people prefer still exists at
// /dashboard/overview, reachable from the sidebar.
export default async function DashboardEntryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id, full_name").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/auth/login");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, onboarding_completed")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.onboarding_completed) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <WelcomeChatCard dealershipName={dealership?.dealership_name ?? "your business"} ownerName={profile?.full_name ?? null} />
      </div>
    );
  }

  redirect("/dashboard/master-brain");
}
