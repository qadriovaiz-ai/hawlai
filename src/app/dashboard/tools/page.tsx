import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDealershipPlanLimits } from "@/lib/plans";
import ToolMarketplaceView from "@/components/tools/ToolMarketplaceView";

export default async function ToolMarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);

  return <ToolMarketplaceView limits={limits} />;
}
