"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ImagePlus, Sparkles, Palette, Loader2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";

const BACKGROUND_STYLES = [
  { id: "studio_white", label: "Studio White" },
  { id: "showroom", label: "Dark Showroom" },
  { id: "road", label: "Open Road" },
  { id: "sunset", label: "Sunset" },
];

const AI_PROMPT_EXAMPLES = [
  "sunset highway, dramatic orange lighting",
  "modern showroom with spotlight on the car",
  "city street at night, neon lights in background",
];

export default function AdCreativePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"template" | "ai_generate">("template");
  const [backgroundStyle, setBackgroundStyle] = useState("studio_white");
  const [prompt, setPrompt] = useState("");
  const [headline, setHeadline] = useState("");
  const [bodyCopy, setBodyCopy] = useState("");
  const [priceText, setPriceText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoBase64(dataUrl);
      setPhotoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    setError(null);
    setResult(null);

    if (!photoBase64) return setError("Pehle car ki photo upload karo");
    if (!headline.trim()) return setError("Headline daalo");
    if (!bodyCopy.trim()) return setError("Ad body text daalo");
    if (mode === "ai_generate" && prompt.trim().length < 5) return setError("AI mode ke liye prompt likho (kam se kam 5 characters)");

    setLoading(true);
    try {
      const res = await fetch("/api/ads/generate-creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_base64: photoBase64,
          mode,
          prompt: mode === "ai_generate" ? prompt : undefined,
          background_style: mode === "template" ? backgroundStyle : undefined,
          headline,
          body_copy: bodyCopy,
          price_text: priceText || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kuch gadbad ho gaya");
      setResult(data.creative);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/ads" className="btn-secondary px-2 py-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <ImagePlus className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ad Creative Banao</h1>
          <p className="text-sm text-slate-500">Photo upload karo, ready-to-launch ad image banao</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">1. Car ki photo upload karo</p>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="Uploaded car" className="w-full h-56 object-cover rounded-lg" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 btn-secondary text-xs"
            >
              Change Photo
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-40 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-purple-400 hover:text-purple-500 transition-colors"
          >
            <ImagePlus className="w-8 h-8" />
            <span className="text-sm font-medium">Photo select karo</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">2. Background style choose karo</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("template")}
            className={`p-3 rounded-lg border-2 text-left transition-colors ${
              mode === "template" ? "border-purple-500 bg-purple-50" : "border-slate-200"
            }`}
          >
            <Palette className="w-4 h-4 text-purple-600 mb-1" />
            <p className="text-sm font-semibold text-slate-800">Quick Template</p>
            <p className="text-xs text-slate-500">Fast, free, preset backgrounds</p>
          </button>
          <button
            onClick={() => setMode("ai_generate")}
            className={`p-3 rounded-lg border-2 text-left transition-colors ${
              mode === "ai_generate" ? "border-purple-500 bg-purple-50" : "border-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-600 mb-1" />
            <p className="text-sm font-semibold text-slate-800">AI Studio</p>
            <p className="text-xs text-slate-500">Custom scene from a prompt</p>
          </button>
        </div>

        {mode === "template" ? (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {BACKGROUND_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setBackgroundStyle(s.id)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  backgroundStyle === s.id ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="pt-2 space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Jaise: sunset highway, dramatic lighting"
              className="w-full h-20 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex flex-wrap gap-2">
              {AI_PROMPT_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(ex)}
                  className="text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-full px-3 py-1 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">3. Ad ka text likho</p>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Headline — jaise: Swift Chahiye? Ab Milegi!"
          className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={bodyCopy}
          onChange={(e) => setBodyCopy(e.target.value)}
          placeholder="Body — jaise: Lucknow mein best deals. Free test drive!"
          className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder="Price (optional) — jaise: ₹8L se shuru"
          className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Creative bana raha hai...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" /> Ad Creative Banao
          </>
        )}
      </button>

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
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm font-semibold text-green-700">Creative Ready Hai!</p>
          </div>
          {result.generated_image_url && (
            <img src={result.generated_image_url} alt="Generated ad creative" className="w-full rounded-lg border border-green-100" />
          )}
          
            <a href={result.generated_image_url}
            download
            className="btn-secondary w-full justify-center"
          >
            Download Image
          </a>
        </div>
      )}
    </div>
  );
}
