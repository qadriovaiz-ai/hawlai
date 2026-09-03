import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, Lock } from "lucide-react";
import { getDealershipPlanLimits, hasFeature, GATED_FEATURE_MIN_PLAN, PLAN_LABELS } from "@/lib/plans";
import ClientLimitsView from "@/components/agency/ClientLimitsView";
import { buttonClasses } from "@/components/ui/buttonClasses";

// Phase 4 / 2a — per-client usage caps for agency operators.
export default async function AgencyLimitsPage() {
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
          <h1 className="text-lg font-bold text-slate-900">Client Limits</h1>
          <p className="text-sm text-slate-500">
            Cap what each client business can consume, independently of the plan you put them on. Needs the {PLAN_LABELS[GATED_FEATURE_MIN_PLAN.multiBusiness]} plan.
          </p>
          <Link href="/dashboard/billing" className={buttonClasses("primary", "md", "inline-flex")}>Upgrade</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <SlidersHorizontal className="w-5 h-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Client Limits</h1>
          <p className="text-sm text-slate-500">Cap what each client can use, below what their plan includes</p>
        </div>
      </div>
      <ClientLimitsView />
    </div>
  );
}
