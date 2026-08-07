import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import UsageView from "@/components/billing/UsageView";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Usage & Plan</h1>
          <p className="text-sm text-slate-500">What you've used this month, against your plan's limits.</p>
        </div>
        <Link
          href="/dashboard/billing/plans"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 whitespace-nowrap pt-1"
        >
          Compare plans <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <UsageView />
    </div>
  );
}
