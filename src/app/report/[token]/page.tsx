import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { generateExecutiveReport } from "@/lib/agents/reportingAgent";
import { generateGrowthReport } from "@/lib/agents/growthAdvisorAgent";
import { getAgencyBranding, reportFooterText, reportAccentColor, reportLogoUrl } from "@/lib/agents/agencyBrandingAgent";
import { formatCurrency } from "@/lib/utils";

export default async function ClientReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("id, dealership_name, business_category, owner_id")
    .eq("report_share_token", token)
    .maybeSingle();
  if (!dealership) notFound();

  const [report, growth, branding] = await Promise.all([
    generateExecutiveReport(supabase, dealership.id),
    generateGrowthReport(supabase, dealership.id, dealership.business_category ?? "business"),
    getAgencyBranding(supabase, dealership.owner_id),
  ]);
  const { stats } = report;
  const accentColor = reportAccentColor(branding);
  const logoUrl = reportLogoUrl(branding);

  const cards = [
    ["Total Leads", String(stats.totalLeads)],
    ["Campaigns Launched", String(stats.campaignsLaunched)],
    ["Total Ad Spend", formatCurrency(stats.totalSpend)],
    ["Revenue", formatCurrency(stats.totalRevenue)],
    ["ROAS", stats.roas !== null ? `${stats.roas.toFixed(1)}x` : "—"],
    ["Appointments Completed", String(stats.appointmentsCompleted)],
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Performance Report</p>
            <h1 className="text-2xl font-bold text-slate-900">{dealership.dealership_name}</h1>
            <p className="text-sm text-slate-400">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          {logoUrl && <img src={logoUrl} alt="" className="h-10 object-contain shrink-0" />}
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: `${accentColor}1A` }}>
          <p className="text-3xl font-bold" style={{ color: accentColor }}>{growth.healthScore}<span className="text-base opacity-70">/100</span></p>
          <p className="text-sm text-slate-600 mt-1">{growth.headline}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cards.map(([label, value]) => (
            <div key={label} className="bg-slate-100 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        {growth.strengths?.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1.5">Strengths</p>
            <ul className="space-y-1">{growth.strengths.map((s: string, i: number) => <li key={i} className="text-sm text-slate-600">• {s}</li>)}</ul>
          </div>
        )}
        {growth.nextActions?.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1.5">Next Steps</p>
            <ul className="space-y-1">{growth.nextActions.map((a: string, i: number) => <li key={i} className="text-sm text-slate-600">• {a}</li>)}</ul>
          </div>
        )}

        <p className="text-xs text-slate-300 text-center pt-4">{reportFooterText(branding)}</p>
      </div>
    </div>
  );
}
