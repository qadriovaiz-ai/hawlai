"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const router = useRouter();
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }
  return (
    <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1.5">
      <LogOut className="w-3.5 h-3.5" /> Sign out
    </button>
  );
}
