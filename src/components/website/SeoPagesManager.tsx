"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, ExternalLink, Trash2, FileText } from "lucide-react";

export default function SeoPagesManager() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadPages() {
    fetch("/api/seo-pages").then((r) => r.json()).then((d) => setPages(d.pages ?? [])).finally(() => setLoading(false));
  }
  useEffect(loadPages, []);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/seo-pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTopic("");
      loadPages();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function togglePublish(id: string, published: boolean) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, published } : p)));
    await fetch("/api/seo-pages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, published }) });
  }

  async function deletePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
    await fetch("/api/seo-pages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><FileText className="w-4 h-4" /> SEO Pages</p>
      <p className="text-xs text-slate-400">Create extra content pages targeting specific services, products, or locations — each one can rank for its own keywords, beyond your main landing page.</p>

      <div className="flex items-center gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. '2BHK flats in Andheri'" className="flex-1 text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
        <button onClick={handleGenerate} disabled={generating || !topic.trim()} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 shrink-0">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading pages...</p>
      ) : pages.length === 0 ? (
        <p className="text-xs text-slate-400">No SEO pages yet — generate one above.</p>
      ) : (
        <div className="space-y-1.5">
          {pages.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-slate-100 rounded-lg p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{p.title}</p>
                <p className="text-xs text-slate-400">/seo/{p.slug} {p.published && <span className="text-green-500">· Live</span>}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.published && (
                  <a href={`/seo/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-purple-500"><ExternalLink className="w-4 h-4" /></a>
                )}
                <input type="checkbox" checked={p.published} onChange={(e) => togglePublish(p.id, e.target.checked)} className="w-4 h-4 accent-purple-600" />
                <button onClick={() => deletePage(p.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
