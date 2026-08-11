import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import MasterBrainWidget from "@/components/dashboard/MasterBrainWidget";
import MobileTabBar from "@/components/dashboard/MobileTabBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Restricted roles AND Admin/Marketing Manager all land on
  // /team-tasks — that page branches internally (see
  // ManagerWorkspace.tsx) to give Admin/Marketing Manager a richer,
  // read-focused view (team tasks, leads, roster) via a dedicated
  // service-role-gated endpoint, while Designer/Content Writer/Sales/
  // Viewer keep the single-card Task Inbox. This intentionally does
  // NOT send them into the full owner dashboard — migration 071's RLS
  // extension only covers leads + dealerships so far, and routing
  // these roles into the full sidebar today would show ~20 empty
  // pages rather than a complete experience. The RLS extension stays
  // in place as a real foundation for when dashboard-page-by-page
  // parity is built out, it's just not what decides routing yet.
  const { data: teamMembership } = await supabase.from("team_members").select("id, role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (teamMembership) redirect("/team-tasks");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, dealerships(*)")
    .eq("id", user.id)
    .single();

  const dealershipName = profile?.dealerships?.dealership_name ?? "My Dealership";
  const onboardingCompleted = profile?.dealerships?.onboarding_completed ?? true;

  // No sidebar/nav clutter until the welcome step is done or skipped
  // — matches a clean, single-focus "describe your idea" first screen
  // instead of dropping a new signup into a full app shell at once.
  if (!onboardingCompleted) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="h-14 flex items-center px-5 border-b border-slate-200 bg-slate-100">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
              <Image src="/logo-icon.png" alt="Hawlai" width={28} height={28} className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-bold text-slate-900">Hawlai</span>
          </Link>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  // Team members are redirected to /team-tasks above, so anyone
  // reaching here is genuinely the owner of profile.dealership_id (or
  // their currently-active business via BusinessSwitcher) — same
  // ownership context pending_approvals' owner-only RLS expects, no
  // extra check needed. Only used for the mobile tab bar's Approvals
  // dot; cheap head-count query, not fetching any rows.
  const { count: pendingApprovalsCount } = await supabase
    .from("pending_approvals")
    .select("id", { count: "exact", head: true })
    .eq("dealership_id", profile?.dealership_id)
    .eq("status", "pending");

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar dealershipName={dealershipName} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar user={user} profile={profile} />
        <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <MasterBrainWidget />
      <MobileTabBar pendingApprovalsCount={pendingApprovalsCount ?? 0} />
    </div>
  );
}
