import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import PaidAdsView from "@/components/paid-ads/PaidAdsView";

export default async function PaidAdsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Paid Advertising</h1>
          <p className="text-sm text-slate-500">Meta Ads is connected — launch real campaigns in Ads Manager. Google, LinkedIn, TikTok, Snapchat and Pinterest Ads aren't connected yet, so this generates planning content for each until they are.</p>
        </div>
      </div>
      <PaidAdsView />
    </div>
  );
}
