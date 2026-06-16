import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [{ data: leads }, { data: calls }, { data: appointments }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId),
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
    </div>
  );
}
