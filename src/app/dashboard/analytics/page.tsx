import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";
import { formatCurrency } from "@/lib/utils";
import { History } from "lucide-react";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [{ data: leads }, { data: calls }, { data: appointments }, { data: perfHistory }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId),
    supabase.from("campaign_performance_history").select("*").eq("dealership_id", dealershipId).order("snapshot_date", { ascending: false }),
  ]);

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l) => l.lead_temperature === "hot").length ?? 0;
  const qualifiedLeads = leads?.filter((l) => l.lead_temperature !== "cold").length ?? 0;

  const qualificationRate = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;
  const hotPct = totalLeads > 0 ? Math.round((hotLeads / totalLeads) * 100) : 0;
  const appointmentRate = totalLeads > 0 ? Math.round(((appointments?.length ?? 0) / totalLeads) * 100) : 0;
  const callCompletionRate = (calls?.length ?? 0) > 0
    ? Math.round((calls?.filter((c) => c.status === "completed").length ?? 0) / (calls?.length ?? 1) * 100)
    : 0;

  // Score distribution
  const scoreBuckets = [
    { range: "0–20", min: 0, max: 20 },
    { range: "21–40", min: 21, max: 40 },
    { range: "41–60", min: 41, max: 60 },
    { range: "61–80", min: 61, max: 80 },
    { range: "81–100", min: 81, max: 100 },
  ].map(({ range, min, max }) => ({
    range,
    count: leads?.filter((l) => l.ai_score >= min && l.ai_score <= max).length ?? 0,
  }));

  // Source breakdown
  const sources = ["csv_upload", "website", "referral", "walk_in", "social_media"];
  const sourceData = sources.map((source) => ({
    source: source.replace(/_/g, " "),
    count: leads?.filter((l) => l.source === source).length ?? 0,
  })).filter((s) => s.count > 0);

  // Monthly trend
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { month: d.toLocaleString("en-IN", { month: "short" }), monthNum: d.getMonth(), year: d.getFullYear() };
  });
  const monthlyTrend = months.map(({ month, monthNum, year }) => ({
    month,
    leads: leads?.filter((l) => { const d = new Date(l.created_at); return d.getMonth() === monthNum && d.getFullYear() === year; }).length ?? 0,
    calls: calls?.filter((c) => { const d = new Date(c.created_at); return d.getMonth() === monthNum && d.getFullYear() === year; }).length ?? 0,
    appointments: appointments?.filter((a) => { const d = new Date(a.created_at); return d.getMonth() === monthNum && d.getFullYear() === year; }).length ?? 0,
  }));

  // Lifetime totals per campaign from the permanent daily-snapshot
  // history — this survives even if a campaign is later paused,
  // deleted on Meta, or Facebook access is ever lost, since it's our
  // own stored copy, not a live re-fetch from Meta each time.
  const campaignTotals = new Map<string, { headline: string; spend: number; leads: number; days: number }>();
  for (const row of perfHistory ?? []) {
    const existing = campaignTotals.get(row.ad_creative_id) ?? { headline: row.headline ?? "Untitled", spend: 0, leads: 0, days: 0 };
    existing.spend += Number(row.spend ?? 0);
    existing.leads += Number(row.leads ?? 0);
    existing.days += 1;
    campaignTotals.set(row.ad_creative_id, existing);
  }
  const campaignTotalsList = Array.from(campaignTotals.values()).sort((a, b) => b.spend - a.spend);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-0.5">Performance metrics and insights</p>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Qualification Rate", value: `${qualificationRate}%`, sub: "Hot + Warm leads", color: "bg-brand-50 text-brand-700" },
          { label: "Hot Lead Percentage", value: `${hotPct}%`, sub: "Of all leads", color: "bg-red-50 text-red-700" },
          { label: "Appointment Rate", value: `${appointmentRate}%`, sub: "Leads to appointments", color: "bg-green-50 text-green-700" },
          { label: "Call Completion", value: `${callCompletionRate}%`, sub: "Calls answered", color: "bg-purple-50 text-purple-700" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mb-3 ${color}`}>
              {label}
            </div>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <AnalyticsCharts
        scoreBuckets={scoreBuckets}
        sourceData={sourceData}
        monthlyTrend={monthlyTrend}
      />

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Campaign Performance History</p>
        </div>
        <p className="text-xs text-slate-400">
          Saved permanently in Hawlai — this survives even if a campaign is later paused, deleted on Meta, or Facebook access changes. Updates once a day automatically.
        </p>
        {campaignTotalsList.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No history recorded yet — this fills in once a launched campaign has run for at least a day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium">Days Tracked</th>
                  <th className="pb-2 font-medium">Total Spend</th>
                  <th className="pb-2 font-medium">Total Leads</th>
                  <th className="pb-2 font-medium">Avg. Cost/Lead</th>
                </tr>
              </thead>
              <tbody>
                {campaignTotalsList.map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{c.headline}</td>
                    <td className="py-2 text-slate-500">{c.days}</td>
                    <td className="py-2 text-slate-700">{formatCurrency(c.spend)}</td>
                    <td className="py-2 text-slate-700">{c.leads}</td>
                    <td className="py-2 text-slate-700">{c.leads > 0 ? formatCurrency(c.spend / c.leads) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
