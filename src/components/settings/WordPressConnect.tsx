"use client";

import { useState, useEffect } from "react";
import { Loader2, Check } from "lucide-react";

export default function WordPressConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/wordpress")
      .then((res) => res.json())
      .then((data) => setConnected(data.connected))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setError(null);
    if (!siteUrl.trim() || !username.trim() || !appPassword.trim()) return setError("All fields are required");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_url: siteUrl.trim(), username: username.trim(), app_password: appPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConnected(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    await fetch("/api/integrations/wordpress", { method: "DELETE" });
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
      <p className="text-xs text-slate-400">
        In wp-admin: Users → Profile → Application Passwords → create a new one, name it "Hawlai", copy it.
      </p>
      <input
        value={siteUrl}
        onChange={(e) => setSiteUrl(e.target.value)}
        placeholder="yourblog.com"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="WordPress username"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <input
        value={appPassword}
        onChange={(e) => setAppPassword(e.target.value)}
        placeholder="Application Password"
        type="password"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={handleConnect} disabled={saving} className="btn-secondary text-xs w-full justify-center">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
      </button>
    </div>
  );
}
