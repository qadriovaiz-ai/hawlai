"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Megaphone, Inbox, ArrowDownToLine, X, Check } from "lucide-react";

export default function CollabBoardManager() {
  const [listings, setListings] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [compensationType, setCompensationType] = useState("product");
  const [compensationDetails, setCompensationDetails] = useState("");
  const [converting, setConverting] = useState<string | null>(null);

  function load() {
    Promise.all([
      fetch("/api/collab-listings").then((r) => r.json()),
      fetch("/api/collab-listings/applications").then((r) => r.json()),
    ]).then(([l, a]) => {
      setListings(l.listings ?? []);
      setApplications(a.applications ?? []);
    }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createListing() {
    if (!title.trim()) return;
    await fetch("/api/collab-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, compensationType, compensationDetails }),
    });
    setTitle(""); setDescription(""); setCompensationDetails(""); setShowForm(false);
    load();
  }

  async function togglePublic(id: string, isPublic: boolean) {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, is_public: isPublic } : l)));
    await fetch("/api/collab-listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isPublic }) });
  }

  async function toggleStatus(id: string, status: string) {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    await fetch("/api/collab-listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
  }

  async function convertApplication(id: string) {
    setConverting(id);
    try {
      await fetch("/api/collab-listings/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "convert" }) });
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: "converted" } : a)));
    } finally {
      setConverting(null);
    }
  }

  async function declineApplication(id: string) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: "declined" } : a)));
    await fetch("/api/collab-listings/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "declined" }) });
  }

  const newApplications = applications.filter((a) => a.status === "new");

  if (loading) return <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>;

  return (
    <div className="space-y-5">
      {/* Applications inbox */}
      {newApplications.length > 0 && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Inbox className="w-4 h-4" /> New applications <span className="text-xs bg-brand-500/20 text-brand-600 px-1.5 py-0.5 rounded-full">{newApplications.length}</span>
          </p>
          <div className="space-y-2">
            {newApplications.map((a) => (
              <div key={a.id} className="bg-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{a.influencer_name} <span className="text-xs text-slate-400 font-normal">{a.handle} · {a.platform}{a.followers_estimate ? ` · ~${a.followers_estimate.toLocaleString("en-IN")} followers` : ""}</span></p>
                </div>
                <p className="text-xs text-slate-500">Applied for: {a.collab_listings?.title ?? "a listing"}</p>
                {a.message && <p className="text-xs text-slate-600 italic">"{a.message}"</p>}
                <p className="text-xs text-slate-500">Contact: {a.contact_info}</p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => convertApplication(a.id)}
                    disabled={converting === a.id}
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50"
                  >
                    {converting === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />} Add to pipeline
                  </button>
                  <button onClick={() => declineApplication(a.id)} className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1.5">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Listings */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Megaphone className="w-4 h-4" /> Open Collabs board</p>
          <div className="flex items-center gap-3">
            <a href="/collabs" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300">View public board ↗</a>
            <button onClick={() => setShowForm(!showForm)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Post</button>
          </div>
        </div>
        <p className="text-xs text-slate-400">Public opportunities influencers can find and apply to directly, without you having to search for them first.</p>

        {showForm && (
          <div className="space-y-2 bg-slate-200 rounded-lg p-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. 'Diwali collection creators wanted'" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What you're looking for (optional)" rows={2} className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <div className="flex gap-2">
              <select value={compensationType} onChange={(e) => setCompensationType(e.target.value)} className="text-sm bg-slate-100 border border-slate-200 rounded-lg px-2 py-2">
                <option value="product">Product only</option>
                <option value="paid">Paid only</option>
                <option value="both">Product + Paid</option>
              </select>
              <input value={compensationDetails} onChange={(e) => setCompensationDetails(e.target.value)} placeholder="e.g. Free candle set + ₹500" className="flex-1 text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <button onClick={createListing} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg">Post to board</button>
          </div>
        )}

        {listings.length === 0 ? (
          <p className="text-xs text-slate-400">No open collabs posted yet.</p>
        ) : (
          <div className="space-y-2">
            {listings.map((l) => (
              <div key={l.id} className="bg-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{l.title}</p>
                  <p className="text-xs text-slate-400">{l.status === "open" ? (l.is_public ? "Live on public board" : "Open, but hidden from board") : "Closed"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => togglePublic(l.id, !l.is_public)} className="text-xs text-slate-500 hover:text-slate-700">
                    {l.is_public ? "Hide" : "Show"}
                  </button>
                  <button onClick={() => toggleStatus(l.id, l.status === "open" ? "closed" : "open")} className="text-xs text-slate-500 hover:text-slate-700">
                    {l.status === "open" ? "Close" : "Reopen"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
