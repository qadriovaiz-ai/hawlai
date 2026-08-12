"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Wand2, Image as ImageIcon, Download, PenTool, Plus } from "lucide-react";
import { GRAPHIC_TYPES } from "@/lib/agents/graphicDesignAgent";

interface CanvasDesign {
  id: string;
  name: string;
  thumbnail_url: string | null;
  updated_at: string;
}

export default function GraphicDesignView() {
  const [selectedType, setSelectedType] = useState(GRAPHIC_TYPES[0].key);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [canvasDesigns, setCanvasDesigns] = useState<CanvasDesign[]>([]);

  useEffect(() => {
    fetch("/api/canvas-designs").then((r) => r.json()).then((d) => setCanvasDesigns(d.designs ?? []));
  }, []);

  const [gallery, setGallery] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/graphic-design/generate").then((r) => r.json()).then((d) => setGallery(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/graphic-design/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designType: selectedType, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setResult(data.url);
      fetch("/api/graphic-design/generate").then((r) => r.json()).then((d) => setGallery(d.items ?? []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const currentMeta = GRAPHIC_TYPES.find((t) => t.key === selectedType);

  return (
    <div className="space-y-5">
      {/* Advanced canvas editor entry point */}
      <div className="card p-5 flex items-center justify-between bg-gradient-to-br from-purple-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
            <PenTool className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Advanced Editor</p>
            <p className="text-xs text-slate-500">Full control — text, shapes, images, layers, stock photos</p>
          </div>
        </div>
        <Link href="/design-editor" className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> New Design
        </Link>
      </div>

      {canvasDesigns.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Your saved designs</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {canvasDesigns.map((d) => (
              <Link key={d.id} href={`/design-editor?id=${d.id}`} className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                {d.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumbnail_url} alt={d.name} className="w-full h-full object-cover" />
                ) : (
                  <PenTool className="w-5 h-5 text-slate-300" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Type picker */}
      <div className="card p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Design type</p>
        <div className="flex flex-wrap gap-1.5">
          {GRAPHIC_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedType(t.key); setResult(null); setError(null); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedType === t.key
                  ? "bg-purple-600 border-purple-600 text-white"
                  : "bg-slate-200 border-slate-300 text-slate-600 hover:border-purple-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generator */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Generate: {currentMeta?.label}</p>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want (optional — leave blank for a general on-brand design)"
          className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          Generate
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Result</p>
            <a href={result} download target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result} alt="Generated design" className="w-full rounded-lg border border-slate-200" />
        </div>
      )}

      {/* Gallery */}
      {gallery.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> Recent designs</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {gallery.map((g) => (
              <button key={g.id} onClick={() => setResult(g.image_url)} className="aspect-square rounded-lg overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.image_url} alt={g.design_type} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
