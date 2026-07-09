"use client";

import { useState } from "react";
import { Clapperboard, Loader2, AlertCircle, Film, Copy, Check, Layers } from "lucide-react";

export default function CreativeStudioPage() {
  const [topic, setTopic] = useState("");

  const [scriptLoading, setScriptLoading] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variations, setVariations] = useState<any[] | null>(null);
  const [variationsError, setVariationsError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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

  function copyVariation(v: any, i: number) {
    navigator.clipboard.writeText(`${v.headline}\n\n${v.body}`);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Creative Studio</h1>
          <p className="text-sm text-slate-500">Video scripts and ad copy variations for A/B testing</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">What's this about?</p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Diwali offer on Maruti Swift"
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={handleGenerateScript} disabled={scriptLoading} className="btn-secondary text-sm">
            {scriptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            Generate Video Script
          </button>
          <button onClick={handleGenerateVariations} disabled={variationsLoading} className="btn-secondary text-sm">
            {variationsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            Generate Copy Variations
          </button>
        </div>
      </div>

      {scriptError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
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
                <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
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
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {variationsError}
        </div>
      )}

      {variations && (
        <div className="space-y-3">
          {variations.map((v, i) => (
            <div key={i} className="card p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="badge bg-purple-50 text-purple-700 border border-purple-200">{v.angle}</span>
                <button onClick={() => copyVariation(v, i)} className="text-slate-400 hover:text-purple-600">
                  {copiedIndex === i ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-sm font-semibold text-slate-900">{v.headline}</p>
              <p className="text-sm text-slate-500">{v.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
