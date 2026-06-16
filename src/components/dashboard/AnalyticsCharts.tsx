"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from "recharts";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

export default function AnalyticsCharts({
  scoreBuckets,
  sourceData,
  monthlyTrend,
}: {
  scoreBuckets: { range: string; count: number }[];
  sourceData: { source: string; count: number }[];
  monthlyTrend: { month: string; leads: number; calls: number; appointments: number }[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* AI Score Distribution */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">AI Score Distribution</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={scoreBuckets} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="range" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Leads" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Lead Source */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Lead Sources</h3>
        {sourceData.length === 0 ? (
          <div className="h-52 flex items-center justify-center">
            <p className="text-slate-400 text-sm">No data available</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" outerRadius={70} dataKey="count" nameKey="source" paddingAngle={3}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {sourceData.map((s, i) => (
                <div key={s.source} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-slate-600 capitalize">{s.source} ({s.count})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Monthly Trend - full width */}
      <div className="card p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">6-Month Activity Trend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={monthlyTrend} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Line type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Leads" />
            <Line type="monotone" dataKey="calls" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} name="Calls" />
            <Line type="monotone" dataKey="appointments" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Appointments" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
