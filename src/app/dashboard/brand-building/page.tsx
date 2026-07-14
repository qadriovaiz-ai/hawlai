import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PenTool } from "lucide-react";
import BrandBuildingView from "@/components/brand/BrandBuildingView";

export default async function BrandBuildingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <PenTool className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Brand Building</h1>
          <p className="text-sm text-slate-500">
            Logo, colors, typography, tagline, mission, vision, brand story, social identity and guidelines for {dealership?.dealership_name ?? "your business"}.
            {" "}Fine-tune tone first in{" "}
            <Link href="/dashboard/settings/brand" className="text-purple-400 hover:text-purple-300 underline">
              Brand Voice
            </Link>{" "}
            for sharper results.
          </p>
        </div>
      </div>

      <BrandBuildingView />
    </div>
  );
}
