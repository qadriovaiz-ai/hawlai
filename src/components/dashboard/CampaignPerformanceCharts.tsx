"use client";

import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

const AXIS_COLOR = "#8c8c98";
const GRID_COLOR = "#232329";
const TOOLTIP_STYLE = { background: "#151519", border: "1px solid #33333c", borderRadius: "8px", fontSize: "12px", color: "#f2f2f4" };

interface DailyPoint {
  date: string;
  spend: number;
  leads: number;
  revenue: number;
}

export default function CampaignPerformanceCharts({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-400 text-sm">No performance history yet — this fills in automatically once a launched campaign has run for at least a day.</p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Spend Over Time</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={formatted} margin={{ left: -20 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a5b4fc" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#a5b4fc" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Spend"]} />
            <Area type="monotone" dataKey="spend" stroke="#a5b4fc" strokeWidth={2} fill="url(#spendGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Leads Over Time</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={formatted} margin={{ left: -20 }}>
            <defs>
              <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5dcaa5" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#5dcaa5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="leads" stroke="#5dcaa5" strokeWidth={2} fill="url(#leadsGradient)" name="Leads" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Spend vs Revenue</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={formatted} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
            <Legend wrapperStyle={{ fontSize: "12px", color: AXIS_COLOR }} />
            <Line type="monotone" dataKey="spend" stroke="#a5b4fc" strokeWidth={2} dot={{ r: 3 }} name="Spend" />
            <Line type="monotone" dataKey="revenue" stroke="#5dcaa5" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
