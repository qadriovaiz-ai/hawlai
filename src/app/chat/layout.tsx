import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { LayoutGrid } from "lucide-react";

// The immersive, chat-first home — modeled on ChatGPT/Claude/Cursor/
// Lovable: the conversation IS the interface, not one item buried in
// a department sidebar. The full 21-department dashboard (Sidebar +
// TopBar) still exists at /dashboard/* for anyone who wants to browse
// or work in a specific page directly — this route deliberately opts
// out of that chrome via Next's route-group layout nesting instead of
// hiding it with CSS, so the page genuinely loads lighter too.
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
    <div className="min-h-screen flex flex-col bg-white">
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-slate-100 shrink-0">
        <Link href="/chat" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
            <Image src="/logo-icon.png" alt="Hawlai" width={28} height={28} className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-bold text-slate-900">Hawlai</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <Link href="/dashboard/overview" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <LayoutGrid className="w-3.5 h-3.5" /> Full Dashboard
          </Link>
        </div>
      </header>
      <main className="flex-1 min-h-0 px-4 sm:px-6 py-4">{children}</main>
    </div>
  );
}
