"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, X, ExternalLink } from "lucide-react";

export default function SlackConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/slack")
      .then((res) => res.json())
      .then((data) => setConnected(data.connected))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setError(null);
    if (!webhookUrl.trim()) return setError("Paste your webhook URL first");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: webhookUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConnected(true);
      setWebhookUrl("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    await fetch("/api/integrations/slack", { method: "DELETE" });
    setConnected(false);
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;

  if (connected) {
    return (
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-green-400"><Check className="w-3.5 h-3.5" /> Connected</span>
        <button onClick={handleDisconnect} className="text-xs text-slate-400 hover:text-red-400">Disconnect</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <a
        href="https://api.slack.com/messaging/webhooks"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1"
      >
        Get a free Incoming Webhook URL from Slack <ExternalLink className="w-3 h-3" />
      </a>
      <input
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
        placeholder="https://hooks.slack.com/services/..."
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={handleConnect} disabled={saving} className="btn-secondary text-xs w-full justify-center">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
      </button>
    </div>
  );
}
