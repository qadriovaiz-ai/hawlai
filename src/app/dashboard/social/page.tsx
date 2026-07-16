"use client";

import { useState, useRef } from "react";
import { Share2, Loader2, AlertCircle, CheckCircle, ImagePlus, Sparkles, CalendarClock } from "lucide-react";
import InfluencerOutreach from "@/components/social/InfluencerOutreach";
import SocialManagement from "@/components/social/SocialManagement";
import AutoReplySettings from "@/components/social/AutoReplySettings";

export default function SocialPostPage() {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBase64(reader.result as string);
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerateCaption() {
    setError(null);
    if (prompt.trim().length < 3) return setError("Describe the post in a few words");
    setGenerating(true);
    try {
      const res = await fetch("/api/social/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setCaption(data.caption);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePost() {
    setError(null);
    setPosted(false);
    if (!photoBase64) return setError("Upload a photo first");
    if (!caption.trim()) return setError("Generate or write a caption first");
    setPosting(true);
    try {
      const res = await fetch("/api/social/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_base64: photoBase64, caption, scheduled_time: scheduledTime || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setPosted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Share2 className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Social Post</h1>
          <p className="text-sm text-slate-500">Organic Facebook post — free, no ad spend</p>
        </div>
      </div>

      <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">1. Photo</p>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-slate-100 text-slate-900 w-full border-2 border-dashed border-slate-200 rounded-lg py-6 flex flex-col items-center gap-2 hover:border-purple-300 transition-colors"
        >
          {photoPreview ? (
            <img src={photoPreview} alt="Preview" className="max-h-40 rounded-lg" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6 text-slate-400" />
              <span className="text-sm font-medium">Select Photo</span>
            </>
          )}
        </button>
      </div>

      <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">2. What's the post about?</p>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. New Swift arrivals this week"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={handleGenerateCaption} disabled={generating} className="btn-secondary text-sm">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Caption
        </button>
        {caption && (
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="bg-slate-100 text-slate-900 w-full h-24 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        )}
      </div>

      <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">3. Schedule (optional)</p>
        <p className="text-xs text-slate-400">Leave blank to post now. Facebook needs at least 10 minutes and at most 6 months notice for scheduled posts.</p>
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="bg-slate-100 text-slate-900 flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-700/40 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {posted && (
        <div className="flex items-center gap-2 text-sm text-green-300 bg-green-500/10 border border-green-700/40 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {scheduledTime ? "Scheduled! It'll go live automatically at the chosen time." : "Posted to your Facebook Page!"}
        </div>
      )}

      <button
        onClick={handlePost}
        disabled={posting}
        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
        {posting ? "Posting..." : scheduledTime ? "Schedule Post" : "Post to Facebook"}
      </button>

      <InfluencerOutreach />
      <AutoReplySettings />
      <SocialManagement />
    </div>
  );
}
