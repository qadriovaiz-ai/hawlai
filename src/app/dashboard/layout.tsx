import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import MasterBrainWidget from "@/components/dashboard/MasterBrainWidget";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

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
        <header className="h-14 flex items-center px-5 border-b border-slate-200 bg-white">
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

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar dealershipName={dealershipName} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar user={user} profile={profile} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <MasterBrainWidget />
    </div>
  );
}
