"use client";

import { useState } from "react";
import { Search, Loader2, AlertCircle, Building2, Clock } from "lucide-react";

const EXAMPLES = ["Maruti Suzuki Lucknow", "Hyundai offers", "second hand cars Lucknow"];

export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(q?: string) {
    const term = q ?? query;
    if (term.trim().length < 2) return setError("Type at least 2 characters");
    setQuery(term);
    setError(null);
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/research/competitor-ads?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setAds(data.ads);
    } catch (err: any) {
      setError(err.message);
      setAds(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Search className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Research</h1>
          <p className="text-sm text-slate-500">See what other dealerships are currently advertising on Meta</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. Maruti Suzuki Lucknow"
            className="flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={() => handleSearch()} disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => handleSearch(ex)}
              className="text-xs text-slate-500 hover:text-purple-600 bg-slate-50 hover:bg-purple-50 px-2.5 py-1 rounded-full transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {searched && !loading && !error && ads && ads.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-slate-500 text-sm">No active ads found for "{query}"</p>
        </div>
      )}

      {ads && ads.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{ads.length} ad{ads.length > 1 ? "s" : ""} found</p>
          {ads.map((ad, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" /> {ad.page_name}
                </div>
                <span className={`badge ${ad.is_active ? "bg-green-50 text-green-700 border border-green-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                  {ad.is_active ? "Active" : "Ended"}
                </span>
              </div>
              {ad.title && <p className="text-sm font-medium text-slate-700">{ad.title}</p>}
              {ad.body && <p className="text-sm text-slate-500">{ad.body}</p>}
              {ad.started_running && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Running since {new Date(ad.started_running).toLocaleDateString("en-IN")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
