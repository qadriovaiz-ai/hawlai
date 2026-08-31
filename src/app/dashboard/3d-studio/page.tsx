import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ThreeDStudioView from "@/components/three-d/ThreeDStudioView";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import UpgradeRequired from "@/components/billing/UpgradeRequired";
import FeatureUnavailable from "@/components/billing/FeatureUnavailable";
import { isFeatureEnabled } from "@/lib/featureFlags";

export default async function ThreeDStudioPage() {
  // The route is deliberately kept rather than removed — existing deep
  // links (including ones the AI wrote into past chat replies, see
  // masterBrainV2's 3D scene note) still resolve to an explanation
  // instead of a 404. Checked before auth work so a switched-off page
  // costs no queries.
  if (!isFeatureEnabled("studio3d")) return <FeatureUnavailable feature="studio3d" />;

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
