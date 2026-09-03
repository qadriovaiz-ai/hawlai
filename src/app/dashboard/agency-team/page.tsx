import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users2, Lock } from "lucide-react";
import { getDealershipPlanLimits, hasFeature, GATED_FEATURE_MIN_PLAN, PLAN_LABELS } from "@/lib/plans";
import AgencyTeamGrid from "@/components/agency/AgencyTeamGrid";
import { buttonClasses } from "@/components/ui/buttonClasses";

// P3 piece 7b — manage who reaches which client from one screen.
// /dashboard/team stays as-is for single-business team management;
// this is the cross-business view an agency needs.
export default async function AgencyTeamPage() {
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
          <h1 className="text-lg font-bold text-slate-900">Agency Team</h1>
          <p className="text-sm text-slate-500">
            Manage who has access to which client from one screen, with a different role per business. Needs the {PLAN_LABELS[GATED_FEATURE_MIN_PLAN.multiBusiness]} plan.
          </p>
          <Link href="/dashboard/billing" className={buttonClasses("primary", "md", "inline-flex")}>Upgrade</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Users2 className="w-5 h-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Agency Team</h1>
          <p className="text-sm text-slate-500">Who can reach which client, and as what</p>
        </div>
      </div>
      <AgencyTeamGrid />
    </div>
  );
}
