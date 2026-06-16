import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import KPICards from "@/components/dashboard/KPICards";
import LeadCharts from "@/components/dashboard/LeadCharts";
import RecentActivity from "@/components/dashboard/RecentActivity";
import SeedButton from "@/components/dashboard/SeedButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealership_id, dealerships(dealership_name)")
    .eq("id", user.id)
    .single();

  const dealershipId = profile?.dealership_id;

  if (!dealershipId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-500">No dealership found. Please complete setup.</p>
        </div>
      </div>
    );
  }

  // Fetch KPI data in parallel
  const [leadsRes, callsRes, appointmentsRes] = await Promise.all([
    supabase.from("leads").select("id, lead_temperature, status, created_at, ai_score, name, vehicle").eq("dealership_id", dealershipId).order("created_at", { ascending: false }),
    supabase.from("calls").select("id, status, created_at").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("id, status, appointment_date").eq("dealership_id", dealershipId),
  ]);

  const leads = leadsRes.data ?? [];
  const calls = callsRes.data ?? [];
  const appointments = appointmentsRes.data ?? [];

  const kpis = {
    totalLeads: leads.length,
    hotLeads: leads.filter((l) => l.lead_temperature === "hot").length,
    warmLeads: leads.filter((l) => l.lead_temperature === "warm").length,
    coldLeads: leads.filter((l) => l.lead_temperature === "cold").length,
    appointments: appointments.length,
    calls: calls.length,
  };

  // Build monthly data (last 6 months)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return {
      month: d.toLocaleString("en-IN", { month: "short" }),
      year: d.getFullYear(),
      monthNum: d.getMonth(),
    };
  });

  const monthlyGrowth = months.map(({ month, year, monthNum }) => ({
    month,
    leads: leads.filter((l) => {
      const d = new Date(l.created_at);
      return d.getMonth() === monthNum && d.getFullYear() === year;
    }).length,
  }));

  const temperatureDistribution = [
    { name: "Hot 🔥", value: kpis.hotLeads, color: "#ef4444" },
    { name: "Warm ⚡", value: kpis.warmLeads, color: "#f59e0b" },
    { name: "Cold ❄️", value: kpis.coldLeads, color: "#3b82f6" },
  ];

  const conversionFunnel = [
    { stage: "Total Leads", count: leads.length },
    { stage: "Hot Leads", count: kpis.hotLeads },
    { stage: "Ready to Call", count: leads.filter((l) => l.status === "ready_to_call").length },
    { stage: "Called", count: leads.filter((l) => l.status === "called").length },
    { stage: "Appointments", count: appointments.length },
  ];

  const recentLeads = leads.slice(0, 8);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            AI-powered lead overview for your dealership
          </p>
        </div>
        <SeedButton dealershipId={dealershipId} />
      </div>

      {/* KPI Cards */}
      <KPICards kpis={kpis} />

      {/* Charts */}
      <LeadCharts
        temperatureDistribution={temperatureDistribution}
        monthlyGrowth={monthlyGrowth}
        conversionFunnel={conversionFunnel}
      />

      {/* Recent Activity */}
      <RecentActivity leads={recentLeads} />
    </div>
  );
}
