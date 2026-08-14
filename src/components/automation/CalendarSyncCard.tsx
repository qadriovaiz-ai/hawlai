"use client";

import { useState, useEffect } from "react";
import { Loader2, Copy, Check, CalendarDays, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    const url = `${window.location.origin}/api/ics-feed/${token}`;
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
            <code className="flex-1 text-xs bg-slate-200 rounded-lg px-3 py-2 text-slate-600 truncate">/api/ics-feed/{token}</code>
            <Button onClick={copyUrl} size="sm" className="shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy link
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400">Generate a private calendar feed of your appointments to subscribe to in your own calendar app.</p>
          <Button onClick={generate} loading={generating} size="sm">
            {!generating && <Sparkles className="w-3.5 h-3.5" />} Generate calendar link
          </Button>
        </>
      )}
    </div>
  );
}
