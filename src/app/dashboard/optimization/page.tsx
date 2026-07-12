import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Gauge, Zap, Pause, Eye, MapPin } from "lucide-react";
import { analyzeCampaigns } from "@/lib/agents/optimizationAgent";

const ACTION_STYLE: Record<string, { label: string; icon: any; className: string }> = {
  scale: { label: "Scale Up", icon: Zap, className: "bg-green-500/10 text-green-300 border border-green-700/50" },
  pause: { label: "Pause", icon: Pause, className: "bg-red-500/10 text-red-300 border border-red-700/50" },
  watch: { label: "Watch", icon: Eye, className: "bg-amber-500/10 text-amber-300 border border-amber-700/50" },
  fix_targeting: { label: "Fix Targeting", icon: MapPin, className: "bg-blue-500/10 text-blue-300 border border-blue-700/50" },
};

export default async function OptimizationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const result = await analyzeCampaigns(supabase, dealershipId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Gauge className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Optimization</h1>
          <p className="text-sm text-slate-500">What to scale, pause, or fix — based on real spend and lead data</p>
        </div>
      </div>

      <div className="card p-5 bg-purple-500/10 border-purple-700/40">
        <p className="text-sm text-purple-200 leading-relaxed">{result.summary}</p>
      </div>

      {result.recommendations.length > 0 && (
        <div className="space-y-3">
          {result.recommendations.map((rec, i) => {
            const style = ACTION_STYLE[rec.action] ?? ACTION_STYLE.watch;
            const Icon = style.icon;
            return (
              <div key={i} className="card p-4 flex items-start gap-3">
                <div className={`shrink-0 mt-0.5 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${style.className}`}>
                  <Icon className="w-3.5 h-3.5" /> {style.label}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{rec.headline}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{rec.reason}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!result.hasEnoughData && (
        <div className="card p-8 text-center">
          <Gauge className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Recommendations will appear here once campaigns have real spend or lead data.</p>
        </div>
      )}
    </div>
  );
}
