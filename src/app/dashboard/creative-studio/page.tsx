"use client";

import { useState } from "react";
import { Clapperboard, Loader2, AlertCircle, Film, Copy, Check, Layers, Car, Sparkles, Palette, Video, Mic, Play } from "lucide-react";
import ScoreBadge from "@/components/shared/ScoreBadge";

export default function CreativeStudioPage() {
  const [topic, setTopic] = useState("");

  const [scriptLoading, setScriptLoading] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variations, setVariations] = useState<any[] | null>(null);
  const [variationsError, setVariationsError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [carModel, setCarModel] = useState("");
  const [carDetails, setCarDetails] = useState("");
  const [listingLoading, setListingLoading] = useState(false);
  const [listing, setListing] = useState<any>(null);
  const [listingError, setListingError] = useState<string | null>(null);

  const [logoLoading, setLogoLoading] = useState(false);
  const [logos, setLogos] = useState<string[]>([]);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoStarting, setVideoStarting] = useState(false);
  const [videoPolling, setVideoPolling] = useState(false);
  const [videoResult, setVideoResult] = useState<any>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [voiceoverText, setVoiceoverText] = useState("");
  const [voiceoverLoading, setVoiceoverLoading] = useState(false);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceoverError, setVoiceoverError] = useState<string | null>(null);

  async function handleGenerateScript() {
    setScriptError(null);
    if (topic.trim().length < 2) return setScriptError("Type a topic first");
    setScriptLoading(true);
    try {
      const res = await fetch("/api/creative/video-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setScript(data);
    } catch (err: any) {
      setScriptError(err.message);
    } finally {
      setScriptLoading(false);
    }
  }

  async function handleGenerateVariations() {
    setVariationsError(null);
    if (topic.trim().length < 2) return setVariationsError("Type a topic first");
    setVariationsLoading(true);
    try {
      const res = await fetch("/api/creative/copy-variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setVariations(data.variations);
    } catch (err: any) {
      setVariationsError(err.message);
    } finally {
      setVariationsLoading(false);
    }
  }

  async function handleGenerateListing() {
    setListingError(null);
    if (carModel.trim().length < 2) return setListingError("Enter a car model");
    setListingLoading(true);
    try {
      const res = await fetch("/api/creative/product-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carModel, details: carDetails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setListing(data);
    } catch (err: any) {
      setListingError(err.message);
    } finally {
      setListingLoading(false);
    }
  }

  async function handleGenerateLogo() {
    setLogoError(null);
    setLogoLoading(true);
    try {
      const res = await fetch("/api/brand-kit/logo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setLogos((prev) => [data.url, ...prev]);
    } catch (err: any) {
      setLogoError(err.message);
    } finally {
      setLogoLoading(false);
    }
  }

  async function handleGenerateVideo() {
    setVideoError(null);
    setVideoResult(null);
    if (videoPrompt.trim().length < 5) return setVideoError("Describe the video in a bit more detail");
    setVideoStarting(true);
    try {
      const res = await fetch("/api/creative/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: videoPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setVideoStarting(false);
      setVideoPolling(true);
      pollVideoStatus(data.id);
    } catch (err: any) {
      setVideoError(err.message);
      setVideoStarting(false);
    }
  }

  function pollVideoStatus(id: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/creative/video/${id}/status`);
        const data = await res.json();
        if (data.status === "ready" || data.status === "failed") {
          clearInterval(interval);
          setVideoPolling(false);
          if (data.status === "failed") {
            setVideoError(data.error_message ?? "Video generation failed");
          } else {
            setVideoResult(data);
          }
        }
      } catch {
        clearInterval(interval);
        setVideoPolling(false);
        setVideoError("Lost connection while checking video status");
      }
    }, 8000);
  }

  async function handleGenerateVoiceover() {
    setVoiceoverError(null);
    setVoiceoverUrl(null);
    if (voiceoverText.trim().length < 1) return setVoiceoverError("Enter some text to read");
    setVoiceoverLoading(true);
    try {
      const res = await fetch("/api/creative/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: voiceoverText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setVoiceoverUrl(data.url);
    } catch (err: any) {
      setVoiceoverError(err.message);
    } finally {
      setVoiceoverLoading(false);
    }
  }

  function copyVariation(v: any, i: number) {
    navigator.clipboard.writeText(`${v.headline}\n\n${v.body}`);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Creative Studio</h1>
          <p className="text-sm text-slate-500">Video scripts, copy variations, and product listings</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">What's this about?</p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Diwali offer on Maruti Swift"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={handleGenerateScript} disabled={scriptLoading} className="btn-secondary text-sm">
            {scriptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            Video Script
          </button>
          <button onClick={handleGenerateVariations} disabled={variationsLoading} className="btn-secondary text-sm">
            {variationsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            Copy Variations
          </button>
        </div>
      </div>

      {scriptError && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-700/40 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {scriptError}
        </div>
      )}

      {script && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">{script.title}</p>
            <span className="text-xs text-slate-400">~{script.total_duration_seconds}s</span>
          </div>
          <div className="space-y-3">
            {script.scenes?.map((scene: any, i: number) => (
              <div key={i} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center shrink-0">
                  {scene.scene_number}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-800"><span className="text-slate-400">Visual:</span> {scene.visual}</p>
                  <p className="text-sm text-slate-600 mt-0.5"><span className="text-slate-400">Voiceover/Caption:</span> {scene.voiceover_or_caption}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{scene.duration_seconds}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {variationsError && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-700/40 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {variationsError}
        </div>
      )}

      {variations && (
        <div className="space-y-3">
          {[...variations].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((v, i) => (
            <div key={i} className={`card p-4 space-y-1.5 ${i === 0 ? "ring-2 ring-green-500/30" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="badge bg-purple-500/10 text-purple-300 border border-purple-700/50">{v.angle}</span>
                  <ScoreBadge score={v.score} />
                  {i === 0 && <span className="text-xs font-semibold text-green-400">Best pick</span>}
                </div>
                <button onClick={() => copyVariation(v, i)} className="text-slate-400 hover:text-purple-400">
                  {copiedIndex === i ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-sm font-semibold text-slate-900">{v.headline}</p>
              <p className="text-sm text-slate-500">{v.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Car className="w-4 h-4 text-slate-400" /> Product Listing</p>
        <input
          value={carModel}
          onChange={(e) => setCarModel(e.target.value)}
          placeholder="Car model, e.g. 2022 Hyundai Creta SX"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={carDetails}
          onChange={(e) => setCarDetails(e.target.value)}
          placeholder="Details — km driven, price, features (optional)"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={handleGenerateListing} disabled={listingLoading} className="btn-secondary text-sm">
          {listingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Listing
        </button>
        {listingError && <p className="text-xs text-red-400">{listingError}</p>}
        {listing && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1.5">
            <p className="text-sm font-semibold text-slate-900">{listing.title}</p>
            <p className="text-sm text-slate-600">{listing.description}</p>
            {listing.highlights?.length > 0 && (
              <ul className="text-xs text-slate-500 space-y-0.5 pt-1">
                {listing.highlights.map((h: string, i: number) => <li key={i}>• {h}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Palette className="w-4 h-4 text-slate-400" /> Logo Concepts</p>
          <button onClick={handleGenerateLogo} disabled={logoLoading} className="btn-secondary text-sm">
            {logoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate
          </button>
        </div>
        <p className="text-xs text-slate-400">Uses your dealership name and brand tone. Generate a few and pick your favorite — treat these as starting concepts, not final production files.</p>
        {logoError && <p className="text-xs text-red-400">{logoError}</p>}
        {logos.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {logos.map((url, i) => (
              <img key={i} src={url} alt={`Logo concept ${i + 1}`} className="w-full aspect-square object-contain bg-slate-100 border border-slate-200 rounded-lg" />
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Video className="w-4 h-4 text-slate-400" /> AI Video</p>
        <p className="text-xs text-slate-400">Describe a short video (5-8 seconds). Takes 1-3 minutes to generate — feel free to keep working elsewhere while it renders.</p>
        <input
          value={videoPrompt}
          onChange={(e) => setVideoPrompt(e.target.value)}
          placeholder="e.g. A red Swift driving down a sunny highway, cinematic, upbeat"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={handleGenerateVideo} disabled={videoStarting || videoPolling} className="btn-secondary text-sm">
          {videoStarting || videoPolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {videoPolling ? "Rendering..." : "Generate Video"}
        </button>
        {videoError && <p className="text-xs text-red-400">{videoError}</p>}
        {videoResult?.video_url && (
          <video src={videoResult.video_url} controls className="bg-slate-100 text-slate-900 w-full rounded-lg border border-slate-200" />
        )}
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Mic className="w-4 h-4 text-slate-400" /> AI Voiceover</p>
        <textarea
          value={voiceoverText}
          onChange={(e) => setVoiceoverText(e.target.value)}
          placeholder="Paste the script you want read out loud..."
          className="bg-slate-100 text-slate-900 w-full h-20 p-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={handleGenerateVoiceover} disabled={voiceoverLoading} className="btn-secondary text-sm">
          {voiceoverLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          Generate Voiceover
        </button>
        {voiceoverError && <p className="text-xs text-red-400">{voiceoverError}</p>}
        {voiceoverUrl && <audio src={voiceoverUrl} controls className="w-full" />}
      </div>
    </div>
  );
}
