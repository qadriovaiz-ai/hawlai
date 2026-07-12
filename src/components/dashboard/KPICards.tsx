import { Users, Flame, Zap, Snowflake, Calendar, Phone } from "lucide-react";

interface KPIs {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  appointments: number;
  calls: number;
}

export default function KPICards({ kpis }: { kpis: KPIs }) {
  const cards = [
    {
      label: "Total Leads",
      value: kpis.totalLeads,
      icon: Users,
      color: "text-brand-600 bg-brand-50",
      change: "+12%",
    },
    {
      label: "Hot Leads 🔥",
      value: kpis.hotLeads,
      icon: Flame,
      color: "text-red-400 bg-red-500/10",
      change: `${kpis.totalLeads > 0 ? Math.round((kpis.hotLeads / kpis.totalLeads) * 100) : 0}%`,
    },
    {
      label: "Warm Leads ⚡",
      value: kpis.warmLeads,
      icon: Zap,
      color: "text-amber-400 bg-amber-500/10",
      change: `${kpis.totalLeads > 0 ? Math.round((kpis.warmLeads / kpis.totalLeads) * 100) : 0}%`,
    },
    {
      label: "Cold Leads ❄️",
      value: kpis.coldLeads,
      icon: Snowflake,
      color: "text-blue-400 bg-blue-500/10",
      change: `${kpis.totalLeads > 0 ? Math.round((kpis.coldLeads / kpis.totalLeads) * 100) : 0}%`,
    },
    {
      label: "Appointments",
      value: kpis.appointments,
      icon: Calendar,
      color: "text-green-400 bg-green-500/10",
      change: "+5%",
    },
    {
      label: "Calls Made",
      value: kpis.calls,
      icon: Phone,
      color: "text-purple-400 bg-purple-500/10",
      change: "+18%",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map(({ label, value, icon: Icon, color, change }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-xs text-green-400 font-medium bg-green-500/10 px-1.5 py-0.5 rounded">
              {change}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
        </div>
      ))}
    </div>
  );
}
