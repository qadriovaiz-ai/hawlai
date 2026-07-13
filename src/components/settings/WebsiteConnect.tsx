"use client";

import { useState, useEffect } from "react";
import { Loader2, Check } from "lucide-react";

export default function WebsiteConnect() {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/website")
      .then((res) => res.json())
      .then((data) => setUrl(data?.externalWebsiteUrl ?? ""))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/website", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_website_url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Already have a website (any platform — WordPress, Wix, custom-built)? Add it here so ads and Master Brain can point to it. No API/approval needed, just the link.
      </p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://yourbusiness.com"
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={handleSave} disabled={saving} className="btn-secondary text-xs w-full justify-center">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : "Save"}
      </button>
    </div>
  );
}
