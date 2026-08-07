import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CroView from "@/components/cro/CroView";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import UpgradeRequired from "@/components/billing/UpgradeRequired";

export default async function CroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (!hasFeature(limits, "cro")) return <UpgradeRequired feature="cro" />;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Conversion Rate Optimization</h1>
        <p className="text-slate-500 text-sm mt-0.5">Real suggestions from your actual page data, plus live A/B testing on your landing page.</p>
      </div>
      <CroView />
    </div>
  );
}
