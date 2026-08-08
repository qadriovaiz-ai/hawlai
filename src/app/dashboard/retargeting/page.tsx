import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RotateCcw } from "lucide-react";
import RetargetingView from "@/components/retargeting/RetargetingView";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import UpgradeRequired from "@/components/billing/UpgradeRequired";

export default async function RetargetingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (!hasFeature(limits, "retargeting")) return <UpgradeRequired feature="retargeting" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <RotateCcw className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Retargeting</h1>
          <p className="text-sm text-slate-500">Bring back people who almost bought — real audience lists and ad copy, ready for Meta or Google Ads.</p>
        </div>
      </div>
      <RetargetingView />
    </div>
  );
}
