import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
