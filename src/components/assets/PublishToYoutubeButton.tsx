"use client";

import { useState } from "react";
import { Loader2, Youtube, ExternalLink } from "lucide-react";

export default function PublishToYoutubeButton({ videoId, prompt, existingUrl }: { videoId: string; prompt: string; existingUrl?: string | null }) {
  const [publishing, setPublishing] = useState(false);
  const [url, setUrl] = useState(existingUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/publish-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: prompt.slice(0, 90), description: prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't publish to YouTube");
      setUrl(data.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-red-600 flex items-center gap-1 px-2">
        <Youtube className="w-3.5 h-3.5" /> View on YouTube <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  return (
    <div className="px-2 pb-2">
      <button onClick={publish} disabled={publishing} className="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50">
        {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Youtube className="w-3.5 h-3.5" />}
        {publishing ? "Publishing..." : "Publish to YouTube"}
      </button>
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}
