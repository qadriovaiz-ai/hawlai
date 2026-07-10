"use client";

import { useState, useEffect, useRef } from "react";
import { Globe, Loader2, Sparkles, ImagePlus, Check, ExternalLink, AlertCircle } from "lucide-react";

export default function WebsitePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [offerText, setOfferText] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [published, setPublished] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/website")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setSlug(data.slug ?? "");
          setHeadline(data.headline ?? "");
          setSubheadline(data.subheadline ?? "");
          setOfferText(data.offer_text ?? "");
          setHeroImageUrl(data.hero_image_url ?? "");
          setPublished(data.published ?? false);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/website/generate-copy", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setHeadline(data.headline);
      setSubheadline(data.subheadline);
      setOfferText(data.offer_text);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try {
        const res = await fetch("/api/website/upload-hero", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo_base64: reader.result }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setHeroImageUrl(data.url);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(publishOverride?: boolean) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/website", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          headline,
          subheadline,
          offer_text: offerText,
          hero_image_url: heroImageUrl,
          published: publishOverride ?? published,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (publishOverride !== undefined) setPublished(publishOverride);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }

  const publicUrl = slug ? `/p/${slug}` : null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Globe className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Website</h1>
          <p className="text-sm text-slate-500">A public landing page for your dealership</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Page URL</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 shrink-0">/p/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="your-dealership-name"
            className="flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1">
            Preview page <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">Content</label>
          <button onClick={handleGenerate} disabled={generating} className="btn-secondary text-xs">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate with AI
          </button>
        </div>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Headline"
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={subheadline}
          onChange={(e) => setSubheadline(e.target.value)}
          placeholder="Subheadline"
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          placeholder="Offer / call to action"
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Hero Image (optional)</label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-slate-200 rounded-lg py-4 flex flex-col items-center gap-2 hover:border-purple-300 transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : heroImageUrl ? (
            <img src={heroImageUrl} alt="" className="max-h-32 rounded-lg" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-slate-400" />
              <span className="text-xs text-slate-500">Upload an image</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => handleSave()} disabled={saving} className="btn-secondary flex-1 justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? "Saved" : "Save Draft"}
        </button>
        <button
          onClick={() => handleSave(!published)}
          disabled={saving || !slug}
          className={published ? "btn-secondary flex-1 justify-center text-amber-600" : "btn-primary flex-1 justify-center"}
        >
          {published ? "Unpublish" : "Publish Page"}
        </button>
      </div>
      {published && <p className="text-xs text-green-600 text-center">✅ Live — accepting leads from the public</p>}
    </div>
  );
}
