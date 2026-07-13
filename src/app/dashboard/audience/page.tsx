import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Users2, MapPin, Wallet, AlertCircle } from "lucide-react";

export default async function AudiencePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [{ data: brandProfile }, { data: leads }] = await Promise.all([
    supabase.from("brand_profiles").select("target_persona, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("leads").select("source, meta_campaign_id, budget").eq("dealership_id", dealershipId),
  ]);

  const persona = brandProfile?.target_persona as { age_range?: string; income?: string; concerns?: string[] } | null;

  const sourceCounts: Record<string, number> = {};
  for (const lead of leads ?? []) {
    const key = lead.source ?? "unknown";
    sourceCounts[key] = (sourceCounts[key] ?? 0) + 1;
  }
  const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const budgets = (leads ?? []).map((l) => l.budget).filter((b): b is number => typeof b === "number");
  const avgBudget = budgets.length > 0 ? Math.round(budgets.reduce((s, b) => s + b, 0) / budgets.length) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
          <Users2 className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audience</h1>
          <p className="text-sm text-slate-500">Who your customers are, based on your Brand Voice and real lead data</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Target Persona (from Brand Voice)</p>
        {persona && (persona.age_range || persona.income || persona.concerns?.length) ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {persona.age_range && (
              <div>
                <p className="text-xs text-slate-400">Age range</p>
                <p className="text-sm font-medium text-slate-800">{persona.age_range}</p>
              </div>
            )}
            {persona.income && (
              <div>
                <p className="text-xs text-slate-400">Income level</p>
                <p className="text-sm font-medium text-slate-800">{persona.income}</p>
              </div>
            )}
            {persona.concerns && persona.concerns.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400 mb-1">Main concerns</p>
                <div className="flex flex-wrap gap-1.5">
                  {persona.concerns.map((c, i) => (
                    <span key={i} className="text-xs bg-blue-500/10 text-blue-300 px-2 py-1 rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Not set yet — go to Settings → Brand Voice and describe your business, or analyze your website, to fill this in.
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400" /> Where leads come from
          </p>
          {topSources.length === 0 ? (
            <p className="text-sm text-slate-400">No leads yet</p>
          ) : (
            <div className="space-y-2">
              {topSources.map(([source, count]) => (
                <div key={source} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 capitalize">{source.replaceAll("_", " ")}</span>
                  <span className="font-semibold text-slate-800">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-slate-400" /> Average stated budget
          </p>
          <p className="text-2xl font-bold text-slate-900">
            {avgBudget !== null ? `₹${avgBudget.toLocaleString("en-IN")}` : "—"}
          </p>
          <p className="text-xs text-slate-400">{budgets.length} lead(s) with a budget on file</p>
        </div>
      </div>
    </div>
  );
}
