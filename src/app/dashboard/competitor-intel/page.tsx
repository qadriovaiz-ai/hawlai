import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Radar } from "lucide-react";
import CompetitorIntelView from "@/components/competitor/CompetitorIntelView";

export default async function CompetitorIntelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Radar className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Competitor Intelligence</h1>
          <p className="text-sm text-slate-500">Social monitoring, pricing, SEO, and content gaps — all grounded in real web search, plus daily new-product alerts.</p>
        </div>
      </div>
      <CompetitorIntelView />
    </div>
  );
}
