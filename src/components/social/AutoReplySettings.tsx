"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Zap } from "lucide-react";

export default function AutoReplySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [commentEnabled, setCommentEnabled] = useState(false);
  const [connected, setConnected] = useState(true);
  const [log, setLog] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/social/auto-reply-settings").then((r) => r.json()).then((d) => {
      setDmEnabled(d.dmEnabled);
      setCommentEnabled(d.commentEnabled);
      setConnected(d.connected);
      setLog(d.log ?? []);
    }).finally(() => setLoading(false));
  }, []);

  async function toggle(field: "dmEnabled" | "commentEnabled", value: boolean) {
    setSaving(true);
    if (field === "dmEnabled") setDmEnabled(value); else setCommentEnabled(value);
    try {
      await fetch("/api/social/auto-reply-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading auto-reply settings...</div>;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Real Auto-Reply (live, no review)</p>

      <div className="bg-amber-500/10 border border-amber-700/40 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          When ON, AI-generated replies are sent to real customers automatically — nobody reviews them first. Turning this ON is your approval for every message it sends. You can turn it off anytime; existing conversations aren't affected.
        </p>
      </div>

      {!connected && (
        <p className="text-xs text-red-400">Connect your Facebook Page first (Settings → Connect Facebook) before enabling auto-reply.</p>
      )}

      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">DM Auto-Reply</p>
            <p className="text-xs text-slate-400">Automatically reply to Messenger/Instagram DMs</p>
          </div>
          <input type="checkbox" checked={dmEnabled} disabled={saving || !connected} onChange={(e) => toggle("dmEnabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Comment Auto-Reply</p>
            <p className="text-xs text-slate-400">Automatically reply to public comments on your posts</p>
          </div>
          <input type="checkbox" checked={commentEnabled} disabled={saving || !connected} onChange={(e) => toggle("commentEnabled", e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </label>
      </div>

      {log.length > 0 && (
        <div className="pt-2 border-t border-slate-200 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400">Recent auto-sent replies</p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {log.map((l) => (
              <div key={l.id} className={`text-xs rounded-lg p-2 ${l.success ? "bg-slate-100" : "bg-red-500/10"}`}>
                <span className="font-medium text-slate-600">{l.channel === "dm" ? "DM" : "Comment"}:</span>{" "}
                {l.success ? <span className="text-slate-700">{l.reply_text}</span> : <span className="text-red-400">Failed — {l.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
