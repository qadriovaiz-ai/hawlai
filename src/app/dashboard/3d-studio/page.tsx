import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ThreeDStudioView from "@/components/three-d/ThreeDStudioView";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import UpgradeRequired from "@/components/billing/UpgradeRequired";

export default async function ThreeDStudioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (!hasFeature(limits, "threeDStudio")) return <UpgradeRequired feature="threeDStudio" />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">3D Studio</h1>
        <p className="text-sm text-slate-500">
          Real, interactive 3D — describe what you want, Claude writes the actual WebGL scene. Drag to rotate, scroll to zoom.
        </p>
      </div>
      <ThreeDStudioView />
    </div>
  );
}
