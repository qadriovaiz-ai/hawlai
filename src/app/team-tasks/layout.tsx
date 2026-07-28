import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import SignOutButton from "@/components/team/SignOutButton";

export default async function TeamTasksLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: membership } = await supabase.from("team_members").select("id, status").eq("user_id", user.id).eq("status", "active").maybeSingle();
  // Not an active team member (e.g. the Owner navigated here by
  // accident, or a since-removed member) — send them to the real
  // dashboard / login rather than showing an empty inbox.
  if (!membership) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
            <Image src="/logo-icon.png" alt="Hawlai" width={28} height={28} className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-bold text-slate-900">Hawlai</span>
        </div>
        <SignOutButton />
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
