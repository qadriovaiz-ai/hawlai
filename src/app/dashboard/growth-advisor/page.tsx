import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import GrowthAdvisorView from "@/components/growth-advisor/GrowthAdvisorView";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import UpgradeRequired from "@/components/billing/UpgradeRequired";

export default async function GrowthAdvisorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (!hasFeature(limits, "growthAdvisor")) return <UpgradeRequired feature="growthAdvisor" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Compass className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Growth Advisor</h1>
          <p className="text-sm text-slate-500">Revenue forecast, growth opportunities, budget guidance, and expansion strategy — all grounded in your real data.</p>
        </div>
      </div>
      <GrowthAdvisorView />
    </div>
  );
}
