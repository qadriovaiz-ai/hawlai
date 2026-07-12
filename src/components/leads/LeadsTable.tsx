"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Search, ChevronLeft, ChevronRight, Eye, Trash2,
  PhoneCall, ArrowUpDown
} from "lucide-react";
import type { Lead } from "@/types";
import {
  cn, formatCurrency, getTemperatureColor, getTemperatureIcon,
  getStatusColor, getStatusLabel
} from "@/lib/utils";

interface Props {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  filters: { q?: string; temp?: string; status?: string };
}

export default function LeadsTable({ leads, total, page, pageSize, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [queuing, setQueuing] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q ?? "");
  const totalPages = Math.ceil(total / pageSize);

  function updateUrl(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.temp) params.set("temp", filters.temp);
    if (filters.status) params.set("status", filters.status);
    params.set("page", "1");
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v); else params.delete(k);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead?")) return;
    setDeleting(id);
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setDeleting(null);
    router.refresh();
  }

  async function handleAddToQueue(id: string) {
    setQueuing(id);
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_call" }),
    });
    setQueuing(null);
    router.refresh();
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateUrl({ q: search });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-48">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="input pl-9"
            />
          </div>
          <button type="submit" className="btn-secondary px-3">Search</button>
        </form>

        <select
          value={filters.temp ?? "all"}
          onChange={(e) => updateUrl({ temp: e.target.value === "all" ? "" : e.target.value })}
          className="input w-auto"
        >
          <option value="all">All Temperatures</option>
          <option value="hot">🔥 Hot</option>
          <option value="warm">⚡ Warm</option>
          <option value="cold">❄️ Cold</option>
        </select>

        <select
          value={filters.status ?? "all"}
          onChange={(e) => updateUrl({ status: e.target.value === "all" ? "" : e.target.value })}
          className="input w-auto"
        >
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="ready_to_call">Ready to Call</option>
          <option value="called">Called</option>
          <option value="appointment_set">Appointment Set</option>
          <option value="converted">Converted</option>
        </select>

        <span className="text-sm text-slate-500">{total} leads</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">No leads found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or upload a CSV file</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Vehicle</th>
                  <th className="table-header">Year</th>
                  <th className="table-header">Budget</th>
                  <th className="table-header">
                    <span className="flex items-center gap-1">
                      AI Score <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="table-header">Temperature</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-200 transition-colors">
                    <td className="table-cell font-medium text-slate-900">{lead.name}</td>
                    <td className="table-cell text-slate-600">{lead.phone ?? "—"}</td>
                    <td className="table-cell text-slate-600 max-w-32 truncate">{lead.vehicle ?? "—"}</td>
                    <td className="table-cell text-slate-600">{lead.purchase_year ?? "—"}</td>
                    <td className="table-cell text-slate-600">
                      {lead.budget ? formatCurrency(lead.budget) : "—"}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full">
                          <div
                            className={cn(
                              "h-1.5 rounded-full",
                              lead.ai_score >= 70 ? "bg-red-500" : lead.ai_score >= 40 ? "bg-amber-500" : "bg-blue-400"
                            )}
                            style={{ width: `${lead.ai_score}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{lead.ai_score}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${getTemperatureColor(lead.lead_temperature)}`}>
                        {getTemperatureIcon(lead.lead_temperature)} {lead.lead_temperature}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${getStatusColor(lead.status)}`}>
                        {getStatusLabel(lead.status)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {lead.status !== "ready_to_call" && lead.status !== "called" && (
                          <button
                            onClick={() => handleAddToQueue(lead.id)}
                            disabled={queuing === lead.id}
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-500/10 rounded transition-colors"
                            title="Add to Call Queue"
                          >
                            <PhoneCall className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(lead.id)}
                          disabled={deleting === lead.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateUrl({ page: String(page - 1) })}
                disabled={page <= 1}
                className="btn-secondary px-2 py-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-700 font-medium">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => updateUrl({ page: String(page + 1) })}
                disabled={page >= totalPages}
                className="btn-secondary px-2 py-1.5 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
