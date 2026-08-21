import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt, Lock } from "lucide-react";
import { getDealershipPlanLimits, hasFeature, GATED_FEATURE_MIN_PLAN, PLAN_LABELS } from "@/lib/plans";
import AgencyBillingView from "@/components/agency/AgencyBillingView";
import { buttonClasses } from "@/components/ui/Button";

// P3 piece 7c — a reporting view of what each client actually costs
// to run, for an agency re-billing its own clients. Deliberately not a
// consolidated payment system (see /api/agency/billing's header).
export default async function AgencyBillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (!hasFeature(limits, "multiBusiness")) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-6 text-center space-y-3">
          <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-brand-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Agency Billing</h1>
          <p className="text-sm text-slate-500">
            See what each client actually costs to run this month, so you can re-bill them accurately. Needs the {PLAN_LABELS[GATED_FEATURE_MIN_PLAN.multiBusiness]} plan.
          </p>
          <Link href="/dashboard/billing" className={buttonClasses("primary", "md", "inline-flex")}>Upgrade</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Receipt className="w-5 h-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Agency Billing</h1>
          <p className="text-sm text-slate-500">What each client costs you this month</p>
        </div>
      </div>
      <AgencyBillingView />
    </div>
  );
}
