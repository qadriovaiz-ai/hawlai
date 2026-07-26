import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import UsageView from "@/components/billing/UsageView";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Usage & Plan</h1>
        <p className="text-sm text-slate-500">What you've used this month, against your plan's limits.</p>
      </div>
      <UsageView />
    </div>
  );
}
