import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IndianRupee } from "lucide-react";
import RefundRequestsView from "@/components/refunds/RefundRequestsView";

export default async function RefundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <IndianRupee className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Refund Requests</h1>
          <p className="text-sm text-slate-500">Raised on calls — nothing is refunded automatically, every request needs your approval.</p>
        </div>
      </div>
      <RefundRequestsView />
    </div>
  );
}
