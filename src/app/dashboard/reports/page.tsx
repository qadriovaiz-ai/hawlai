import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FileText, Flame, ShieldCheck, Megaphone, IndianRupee, CheckCircle2, ListChecks, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { generateExecutiveReport } from "@/lib/agents/reportingAgent";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const report = await generateExecutiveReport(supabase, dealershipId);
  const { stats } = report;

  const cards = [
    { label: "Total Leads", value: stats.totalLeads, icon: Flame, color: "bg-red-50 text-red-600" },
    { label: "Campaigns Launched", value: stats.campaignsLaunched, icon: Megaphone, color: "bg-purple-50 text-purple-600" },
    { label: "Total Ad Spend", value: formatCurrency(stats.totalSpend), icon: IndianRupee, color: "bg-amber-50 text-amber-600" },
    { label: "Cost / Lead", value: stats.costPerLead !== null ? formatCurrency(stats.costPerLead) : "—", icon: IndianRupee, color: "bg-blue-50 text-blue-600" },
    { label: "Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: "bg-green-50 text-green-600" },
    { label: "ROAS", value: stats.roas !== null ? `${stats.roas.toFixed(1)}x` : "—", icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
    { label: "Pending Approvals", value: stats.pendingApprovals, icon: ShieldCheck, color: "bg-orange-50 text-orange-600" },
    { label: "Appointments Completed", value: stats.appointmentsCompleted, icon: CheckCircle2, color: "bg-green-50 text-green-600" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Executive Summary</h1>
          <p className="text-sm text-slate-500">Everything that matters, in one look</p>
        </div>
      </div>

      <div className="card p-5 bg-purple-50 border-purple-100">
        <p className="text-sm text-purple-900 leading-relaxed">{report.summary}</p>
      </div>

      {report.priorities.length > 0 && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ListChecks className="w-4 h-4 text-purple-600" /> Priorities
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
    </div>
  );
}
