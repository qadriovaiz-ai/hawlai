"use client";

import { useState, useEffect } from "react";
import { Instagram, Loader2, CheckCircle, Trash2 } from "lucide-react";

export default function InstagramBusinessLoginConnect() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [businessId, setBusinessId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/instagram-business-login").then((r) => r.json()).then((d) => setConnected(d.connected)).finally(() => setLoading(false));
  }, []);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/instagram-business-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramBusinessId: businessId, accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConnected(true);
      setShowForm(false);
      setBusinessId("");
      setAccessToken("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch("/api/settings/instagram-business-login", { method: "DELETE" });
    setConnected(false);
  }

  if (loading) return null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Instagram className="w-4 h-4 text-pink-500" /> Instagram Business Login</span>
        {connected ? (
          <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
        ) : (
          <button onClick={() => setShowForm(!showForm)} className="text-xs text-purple-500 hover:underline">Connect</button>
        )}
      </div>
      <p className="text-xs text-slate-400">For DM auto-reply directly on Instagram (separate from a Facebook Page connection) — paste the Instagram Business ID and access token from Meta's "API setup with Instagram login" page.</p>

      {connected && (
        <button onClick={disconnect} className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Disconnect</button>
      )}

      {showForm && !connected && (
        <div className="space-y-2 bg-slate-100 rounded-lg p-3">
          <input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="Instagram Business ID (e.g. 17841432344301688)" className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2" />
          <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} type="password" placeholder="Access token" className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={save} disabled={saving || !businessId || !accessToken} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
          </button>
        </div>
      )}
    </div>
  );
}
