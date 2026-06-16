"use client";

import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList
} from "recharts";

interface Props {
  temperatureDistribution: { name: string; value: number; color: string }[];
  monthlyGrowth: { month: string; leads: number }[];
  conversionFunnel: { stage: string; count: number }[];
}

const FUNNEL_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

export default function LeadCharts({ temperatureDistribution, monthlyGrowth, conversionFunnel }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Temperature Distribution */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Lead Temperature</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={temperatureDistribution}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {temperatureDistribution.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [value, "Leads"]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          {temperatureDistribution.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-slate-600">{entry.name} ({entry.value})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Growth */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Lead Growth</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyGrowth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
            />
            <Bar dataKey="leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Conversion Funnel */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Conversion Funnel</h3>
        <div className="space-y-2 mt-2">
          {conversionFunnel.map((item, i) => {
            const max = conversionFunnel[0]?.count || 1;
            const pct = Math.round((item.count / max) * 100);
            return (
              <div key={item.stage}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-600">{item.stage}</span>
                  <span className="text-xs font-semibold text-slate-900">{item.count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: FUNNEL_COLORS[i] ?? "#6366f1",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
