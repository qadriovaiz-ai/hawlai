import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import AffiliateManagerView from "@/components/affiliate/AffiliateManagerView";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import UpgradeRequired from "@/components/billing/UpgradeRequired";

export default async function AffiliateMarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (!hasFeature(limits, "affiliateMarketing")) return <UpgradeRequired feature="affiliateMarketing" />;

  const { data: website } = await supabase.from("websites").select("slug").eq("dealership_id", dealershipId).maybeSingle();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Affiliate Marketing</h1>
          <p className="text-sm text-slate-500">People who sell for you and earn a real commission — automatically tracked from actual orders.</p>
        </div>
      </div>
      {website?.slug && (
        <div className="card p-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">Share this with anyone who wants to apply:</p>
          <code className="text-xs bg-slate-200 px-2 py-1 rounded text-purple-600">/affiliates?store={website.slug}</code>
        </div>
      )}
      <AffiliateManagerView />
    </div>
  );
}
