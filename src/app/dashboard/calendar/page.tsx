"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Plus, Loader2, Trash2, X, Megaphone, Share2, Mail, TrendingUp, MoreHorizontal } from "lucide-react";

const CHANNEL_META: Record<string, { label: string; icon: any; className: string }> = {
  paid_ads: { label: "Paid Ads", icon: Megaphone, className: "bg-purple-50 text-purple-700 border-purple-200" },
  social: { label: "Social", icon: Share2, className: "bg-blue-50 text-blue-700 border-blue-200" },
  email_whatsapp: { label: "Email/WhatsApp", icon: Mail, className: "bg-green-50 text-green-700 border-green-200" },
  seo: { label: "SEO", icon: TrendingUp, className: "bg-amber-50 text-amber-700 border-amber-200" },
  other: { label: "Other", icon: MoreHorizontal, className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600 border border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-green-50 text-green-700 border border-green-200",
  cancelled: "bg-red-50 text-red-500 border border-red-200 line-through",
};

export default function CalendarPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("other");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function handleAdd() {
    setError(null);
    if (title.trim().length < 2) return setError("Title is too short");
    if (!date) return setError("Pick a date");
    setSaving(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, channel, scheduled_date: date, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setTitle("");
      setDate("");
      setNotes("");
      setShowForm(false);
      loadItems();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/calendar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadItems();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    loadItems();
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((i) => i.scheduled_date >= today);
  const past = items.filter((i) => i.scheduled_date < today);

  function renderItem(item: any) {
    const meta = CHANNEL_META[item.channel] ?? CHANNEL_META.other;
    const Icon = meta.icon;
    return (
      <div key={item.id} className="card p-4 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${meta.className}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            {item.is_auto && <span className="text-[10px] text-slate-400">(auto — from Campaigns)</span>}
          </div>
          <p className="text-xs text-slate-400">
            {new Date(item.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            {item.notes && ` — ${item.notes}`}
          </p>
        </div>
        {item.is_auto ? (
          <span className={`badge ${STATUS_BADGE[item.status]}`}>{item.status.replaceAll("_", " ")}</span>
        ) : (
          <select
            value={item.status}
            onChange={(e) => handleStatusChange(item.id, e.target.value)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1.5"
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
        {!item.is_auto && (
          <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Marketing Calendar</h1>
            <p className="text-sm text-slate-500">Everything planned or launching, in one place</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Add Calendar Item</p>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Diwali sale social post"
              className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {Object.entries(CHANNEL_META).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full h-16 p-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button onClick={handleAdd} disabled={saving} className="btn-primary w-full justify-center text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">Nothing planned yet</p>
          <p className="text-slate-400 text-sm mt-1">Add your first item, or schedule an ad launch from the Launch Ad page</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-600">Upcoming</p>
              {upcoming.map(renderItem)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-400">Past</p>
              {past.map(renderItem)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
