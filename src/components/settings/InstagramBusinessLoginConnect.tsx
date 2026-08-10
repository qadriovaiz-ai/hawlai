"use client";

import { useState, useEffect } from "react";
import { Instagram, CheckCircle, Trash2, XCircle } from "lucide-react";

export default function InstagramBusinessLoginConnect() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/instagram-business-login").then((r) => r.json()).then((d) => setConnected(d.connected)).finally(() => setLoading(false));

    // Feedback after the OAuth redirect brings the person back here.
    const params = new URLSearchParams(window.location.search);
    const connectedUsername = params.get("instagram_connected");
    const errorMsg = params.get("instagram_error");
    if (connectedUsername) {
      setNotice({ type: "success", text: `Connected @${connectedUsername}` });
      setConnected(true);
    } else if (errorMsg) {
      setNotice({ type: "error", text: errorMsg });
    }
    if (connectedUsername || errorMsg) {
      const url = new URL(window.location.href);
      url.searchParams.delete("instagram_connected");
      url.searchParams.delete("instagram_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function disconnect() {
    await fetch("/api/settings/instagram-business-login", { method: "DELETE" });
    setConnected(false);
    setNotice(null);
  }

  if (loading) return null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Instagram className="w-4 h-4 text-pink-500" /> Instagram DM Auto-Reply</span>
        {connected ? (
          <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
        ) : (
          <a href="/api/auth/instagram/start" className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg">Connect with Instagram</a>
        )}
      </div>
      <p className="text-xs text-slate-400">Log in with your Instagram account to let Hawlai auto-reply to DMs — separate from a Facebook Page connection, and no technical setup needed on your end.</p>

      {notice && (
        <p className={`text-xs flex items-center gap-1.5 ${notice.type === "success" ? "text-green-500" : "text-red-400"}`}>
          {notice.type === "success" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {notice.text}
        </p>
      )}

      {connected && (
        <button onClick={disconnect} className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Disconnect</button>
      )}
    </div>
  );
}
