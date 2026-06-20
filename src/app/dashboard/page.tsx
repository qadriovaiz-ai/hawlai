"use client";

import { useState, useRef } from "react";
import { Megaphone, Sparkles, CheckCircle, AlertCircle, Loader2, Upload, X, Image, Video } from "lucide-react";

const EXAMPLE_PROMPTS = [
  "Maruti Swift ke liye leads chahiye, budget ₹8 lakh tak, Lucknow area mein",
  "Honda City second hand car buyers, Delhi NCR, ₹10-15 lakh range",
  "Tata Nexon SUV interested buyers, Kanpur city, daily budget ₹500",
];

export default function LaunchAdPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const newFiles = [...mediaFiles, ...files].slice(0, 5);
    setMediaFiles(newFiles);
    newFiles.forEach((file, i) => {
      if (mediaPreviews[i]) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMediaPreviews((prev) => {
          const updated = [...prev];
          updated[i] = ev.target?.result as string;
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function removeFile(index: number) {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleLaunch() {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          has_media: mediaFiles.length > 0,
          media_count: mediaFiles.length,
          media_types: mediaFiles.map((f) => f.type),
        }),
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Launch Ad</h1>
          <p className="text-sm text-slate-500">AI se ad banao ek prompt mein</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Image className="w-4 h-4 text-purple-500" />
            <p className="text-sm font-semibold text-slate-700">Car ki photos/videos daalo (optional)</p>
          </div>
          {mediaPreviews.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {mediaPreviews.map((preview, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                  {mediaFiles[i]?.type.startsWith("video/") ? (
                    <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center">
                      <Video className="w-6 h-6 text-slate-400" />
                      <span className="text-xs text-slate-500 mt-1">Video</span>
                    </div>
                  ) : (
                    <img src={preview} alt="" className="w-full h-full object-cover" />
                  )}
                  <button onClick={() => removeFile(i)} className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={mediaFiles.length >= 5} className="w-full border-2 border-dashed border-slate-200 hover:border-purple-300 rounded-lg p-4 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-purple-600 transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" />
            {mediaFiles.length === 0 ? "Photos ya videos upload karo (max 5)" : `${mediaFiles.length} file(s) — aur add karo`}
          </button>
        </div>

        <hr className="border-slate-100" />

        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <p className="text-sm font-semibold text-slate-700">Apni requirement likhein</p>
        </div>

        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Jaise: Maruti Swift ke liye leads chahiye, budget ₹8 lakh tak, Lucknow area mein..." className="w-full h-28 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />

        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-medium">Examples:</p>
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} className="block w-full text-left text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 transition-colors">{ex}</button>
          ))}
        </div>

        <button onClick={handleLaunch} disabled={loading || prompt.trim().length < 10} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
          {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />AI Ad bana raha hai...</>) : (<><Megaphone className="w-4 h-4" />Ad Launch Karo</>)}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Error aaya</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm font-semibold text-green-700">Ad Successfully Create Ho Gaya!</p>
          </div>
          <div className="bg-white rounded-lg border border-green-100 p-4 space-y-3">
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase">Headline</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{result.ad?.headline ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase">Ad Copy</p>
              <p className="text-sm text-slate-700 mt-0.5">{result.ad?.body ?? "—"}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">Daily Budget</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">₹{result.ad?.budget_per_day ?? result.ad?.daily_budget ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">City</p>
                <p className="text-sm text-slate-700 mt-0.5">{result.ad?.targeting_city ?? "India"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">Status</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full mt-0.5">⏸ {result.ad?.status ?? "Paused"}</span>
              </div>
            </div>
            {result.ad?.campaign_id && (
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">Campaign ID</p>
                <p className="text-xs font-mono text-slate-600 mt-0.5">{result.ad.campaign_id}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-green-600">✅ {result.message}</p>
          {mediaFiles.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs text-blue-700 font-medium">📸 {mediaFiles.length} media file(s) ready</p>
              <p className="text-xs text-blue-600 mt-0.5">In photos/videos ko Meta Ads Manager mein campaign ke Creative section mein upload karo.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
