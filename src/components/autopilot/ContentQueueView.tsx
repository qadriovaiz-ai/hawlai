"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Trash2, Calendar, Pencil, Save, X, CheckCircle2, XCircle } from "lucide-react";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ContentQueueView() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingWeek, setGeneratingWeek] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function load() {
    fetch("/api/autopilot/content-queue").then((r) => r.json()).then((d) => setItems(d.items ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  // Generates 7 posts in one go, one per day starting tomorrow — the
  // exact "here's my week, now follow it" workflow, instead of adding
  // one day at a time.
  async function generateWeek() {
    setGeneratingWeek(true);
    setProgress(0);
    try {
      for (let i = 1; i <= 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        await fetch("/api/autopilot/content-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledFor: toDateStr(date) }),
        });
        setProgress(i);
      }
      load();
    } finally {
      setGeneratingWeek(false);
    }
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch("/api/autopilot/content-queue", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  async function saveEdit(id: string) {
    await fetch("/api/autopilot/content-queue", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, caption: editText }) });
    setEditingId(null);
    load();
  }

  const queued = items.filter((i) => i.status === "queued");
  const past = items.filter((i) => i.status !== "queued").slice(0, 5);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Approved Content Queue</p>
          <p className="text-xs text-slate-400 mt-0.5">Review a batch once — autopilot posts exactly these, on their date, without generating anything new.</p>
        </div>
        <button
          onClick={generateWeek}
          disabled={generatingWeek}
          className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          {generatingWeek ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generatingWeek ? `Generating ${progress}/7...` : "Generate a week"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : queued.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing queued — autopilot will keep generating fresh content on its normal schedule until you add some here.</p>
      ) : (
        <div className="space-y-2">
          {queued.map((item) => (
            <div key={item.id} className="flex items-start gap-3 bg-slate-200 rounded-lg p-3">
              <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-purple-500 mb-0.5">{new Date(item.scheduled_for + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
                {editingId === item.id ? (
                  <div className="space-y-1.5">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveEdit(item.id)} className="text-xs bg-purple-600 text-white px-2 py-1 rounded flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 line-clamp-2">{item.caption}</p>
                )}
              </div>
              {editingId !== item.id && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => { setEditingId(item.id); setEditText(item.caption); }} className="text-slate-400 hover:text-purple-500"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="pt-2 border-t border-slate-200 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400">Recently posted from queue</p>
          {past.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-slate-500">
              {item.status === "posted" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              {new Date(item.scheduled_for + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {item.caption.slice(0, 60)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
