"use client";

import { useState, useEffect } from "react";
import { Loader2, Copy, Check, CalendarDays, Sparkles } from "lucide-react";

export default function CalendarSyncCard() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/automation/calendar-token").then((r) => r.json()).then((d) => setToken(d.token)).finally(() => setLoading(false));
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/automation/calendar-token", { method: "POST" });
      const data = await res.json();
      if (data.token) setToken(data.token);
    } finally {
      setGenerating(false);
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/api/calendar/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Calendar Sync</p>
      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : token ? (
        <>
          <p className="text-xs text-slate-400">Subscribe to this link in Google Calendar, Outlook, or Apple Calendar ("Add calendar by URL") to see your booked appointments automatically — updates live, no manual export needed.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 text-slate-600 truncate">/api/calendar/{token}</code>
            <button onClick={copyUrl} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy link
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400">Generate a private calendar feed of your appointments to subscribe to in your own calendar app.</p>
          <button onClick={generate} disabled={generating} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate calendar link
          </button>
        </>
      )}
    </div>
  );
}
