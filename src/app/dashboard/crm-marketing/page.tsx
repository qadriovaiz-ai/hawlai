import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Users2 } from "lucide-react";
import CrmMarketingView from "@/components/crm/CrmMarketingView";

export default async function CrmMarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Users2 className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">CRM Marketing</h1>
          <p className="text-sm text-slate-500">Meeting booking, follow-up reminders, and everything else that keeps leads moving.</p>
        </div>
      </div>
      <CrmMarketingView />
    </div>
  );
}
