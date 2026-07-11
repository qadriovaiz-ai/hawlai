"use client";

import { useState } from "react";
import { TrendingUp, Loader2, AlertCircle, Search, Lightbulb, FileText, Copy, Check } from "lucide-react";

export default function SeoPage() {
  const [topic, setTopic] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ keywords: string[]; contentIdeas: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [blogLoading, setBlogLoading] = useState(false);
  const [blogPost, setBlogPost] = useState<{ title: string; content: string } | null>(null);
  const [blogError, setBlogError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setError(null);
    if (topic.trim().length < 2) return setError("Type a car model or topic");
    setLoading(true);
    try {
      const res = await fetch("/api/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, city }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateBlogPost() {
    setBlogError(null);
    if (topic.trim().length < 2) return setBlogError("Type a car model or topic first");
    setBlogLoading(true);
    try {
      const res = await fetch("/api/seo/blog-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, city }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setBlogPost(data);
    } catch (err: any) {
      setBlogError(err.message);
    } finally {
      setBlogLoading(false);
    }
  }

  function copyBlogPost() {
    if (!blogPost) return;
    navigator.clipboard.writeText(`${blogPost.title}\n\n${blogPost.content}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">SEO & Content</h1>
          <p className="text-sm text-slate-500">Keywords, content ideas, and full blog posts</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Maruti Swift"
            className="p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (optional)"
            className="p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleGenerate} disabled={loading} className="btn-primary text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Generate Keyword Ideas
          </button>
          <button onClick={handleGenerateBlogPost} disabled={blogLoading} className="btn-secondary text-sm">
            {blogLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Write Full Blog Post
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3">Keywords</p>
            <div className="flex flex-wrap gap-2">
              {result.keywords.map((k, i) => (
                <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full">
                  {k}
                </span>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" /> Content Ideas
            </p>
            <ul className="space-y-2">
              {result.contentIdeas.map((idea, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span> {idea}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {blogError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {blogError}
        </div>
      )}

      {blogPost && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">{blogPost.title}</p>
            <button onClick={copyBlogPost} className="text-slate-400 hover:text-purple-600 shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{blogPost.content}</p>
        </div>
      )}
    </div>
  );
}
