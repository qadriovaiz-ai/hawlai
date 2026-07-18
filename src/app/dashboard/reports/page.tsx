import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FileText, Flame, ShieldCheck, Megaphone, IndianRupee, CheckCircle2, ListChecks, TrendingUp, Gauge, ArrowUpRight, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { generateExecutiveReport } from "@/lib/agents/reportingAgent";
import { generateGrowthReport } from "@/lib/agents/growthAdvisorAgent";
import ReportToolsCard from "@/components/reports/ReportToolsCard";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealershipInfo } = await supabase.from("dealerships").select("business_category").eq("id", dealershipId).single();

  const [report, growth] = await Promise.all([
    generateExecutiveReport(supabase, dealershipId),
    generateGrowthReport(supabase, dealershipId, dealershipInfo?.business_category ?? "car dealership"),
  ]);
  const { stats } = report;

  const scoreColor = growth.healthScore >= 70 ? "text-green-400" : growth.healthScore >= 40 ? "text-amber-400" : "text-red-400";
  const scoreRing = growth.healthScore >= 70 ? "stroke-green-500" : growth.healthScore >= 40 ? "stroke-amber-500" : "stroke-red-500";

  const cards = [
    { label: "Total Leads", value: stats.totalLeads, icon: Flame, color: "bg-red-500/10 text-red-400" },
    { label: "Campaigns Launched", value: stats.campaignsLaunched, icon: Megaphone, color: "bg-purple-500/10 text-purple-400" },
    { label: "Total Ad Spend", value: formatCurrency(stats.totalSpend), icon: IndianRupee, color: "bg-amber-500/10 text-amber-400" },
    { label: "Cost / Lead", value: stats.costPerLead !== null ? formatCurrency(stats.costPerLead) : "—", icon: IndianRupee, color: "bg-blue-500/10 text-blue-400" },
    { label: "Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: "bg-green-500/10 text-green-400" },
    { label: "ROAS", value: stats.roas !== null ? `${stats.roas.toFixed(1)}x` : "—", icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
    { label: "Pending Approvals", value: stats.pendingApprovals, icon: ShieldCheck, color: "bg-orange-500/10 text-orange-400" },
    { label: "Appointments Completed", value: stats.appointmentsCompleted, icon: CheckCircle2, color: "bg-green-500/10 text-green-400" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Executive Summary</h1>
          <p className="text-sm text-slate-500">Everything that matters, in one look</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
          <Gauge className="w-4 h-4 text-purple-400" /> Business Health Score
        </div>
        <div className="flex items-start gap-5">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-slate-200" />
              <circle
                cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
                className={scoreRing}
                strokeDasharray={`${(growth.healthScore / 100) * 97.4} 97.4`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${scoreColor}`}>{growth.healthScore}</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-sm text-slate-700">{growth.headline}</p>
            {growth.risks.length > 0 && (
              <div className="space-y-1">
                {growth.risks.map((r, i) => (
                  <p key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {r}
                  </p>
                ))}
              </div>
            )}
            {growth.nextActions.length > 0 && (
              <div className="space-y-1">
                {growth.nextActions.map((a, i) => (
                  <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-400" /> {a}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5 bg-purple-500/10 border-purple-700/40">
        <p className="text-sm text-purple-200 leading-relaxed">{report.summary}</p>
      </div>

      {report.priorities.length > 0 && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ListChecks className="w-4 h-4 text-purple-400" /> Priorities
          </div>
          <ul className="space-y-1.5">
            {report.priorities.map((p, i) => (
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span> {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Leads by Stage</p>
        <div className="space-y-2">
          {Object.entries(stats.leadsByStage).map(([stage, count]) => (
            <div key={stage} className="flex items-center justify-between text-sm">
              <span className="text-slate-500 capitalize">{stage.replaceAll("_", " ")}</span>
              <span className="font-semibold text-slate-800">{count as number}</span>
            </div>
          ))}
          {Object.keys(stats.leadsByStage).length === 0 && (
            <p className="text-sm text-slate-400">No leads yet</p>
          )}
        </div>
      </div>

      <ReportToolsCard />
    </div>
  );
}
