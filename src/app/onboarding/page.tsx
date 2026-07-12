import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OnboardingChat from "@/components/onboarding/OnboardingChat";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id, full_name").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, city, onboarding_completed")
    .eq("id", dealershipId)
    .single();

  // Already been through this — don't force it again.
  if (dealership?.onboarding_completed) redirect("/dashboard");

  return (
    <OnboardingChat
      dealershipName={dealership?.dealership_name ?? "your business"}
      ownerName={profile?.full_name ?? null}
    />
  );
}
