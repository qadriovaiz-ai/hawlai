"use client";

import { useState, useRef } from "react";
import { Rocket, Loader2, AlertCircle, CheckCircle, ImagePlus } from "lucide-react";

const EXAMPLES = [
  "Swift chahiye, Lucknow, budget 8 lakh tak, daily spend 500",
  "Honda City second hand buyers, Delhi NCR, 10-15 lakh range",
  "Tata Nexon SUV interested buyers, Kanpur city, daily budget 500",
];

export default function FullLaunchPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function handleLaunch() {
    setError(null);
    setResult(null);
    if (!photoBase64) return setError("Pehle car ki photo upload karo");
    if (prompt.trim().length < 10) return setError("Requirement thodi detail mein likho");

    setLoading(true);
    try {
      const res = await fetch("/api/ads/adlaunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_base64: photoBase64, prompt, image_mode: "template" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kuch gadbad ho gaya");
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
          <Rocket className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ad Launch Karo — Full Auto</h1>
          <p className="text-sm text-slate-500">Photo + requirement do, poora ad ready ho jayega</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">1. Car ki photo</p>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="" className="w-full h-56 object-cover rounded-lg" />
            <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2 btn-secondary text-xs">
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
        <p className="text-sm font-semibold text-slate-700">2. Requirement ek line mein likho</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Jaise: Swift chahiye, Lucknow, budget 8 lakh tak, daily spend 500"
          className="w-full h-24 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              className="block w-full text-left text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleLaunch}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Ad banake Meta pe launch kar raha hai...
          </>
        ) : (
          <>
            <Rocket className="w-4 h-4" /> Ad Launch Karo
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
            <p className="text-sm font-semibold text-green-700">Ad Ready Hai — Meta Ads Manager mein Paused pada hai</p>
          </div>
          {result.creative?.generated_image_url && (
            <img src={result.creative.generated_image_url} alt="" className="w-full rounded-lg border border-green-100" />
          )}
          <div className="bg-white rounded-lg border border-green-100 p-4 space-y-2 text-sm">
            <p><span className="text-slate-400">Headline:</span> <span className="font-semibold">{result.plan?.headline}</span></p>
            <p><span className="text-slate-400">Body:</span> {result.plan?.body}</p>
            <p><span className="text-slate-400">Daily Budget:</span> ₹{result.plan?.daily_budget}</p>
            <p><span className="text-slate-400">City:</span> {result.plan?.targeting_city}</p>
            <p className="text-xs font-mono text-slate-500 pt-2 border-t border-slate-100">Ad ID: {result.meta?.ad_id}</p>
          </div>
          <p className="text-xs text-green-600">
            ✅ Meta Ads Manager mein jaake review karo, sab sahi lage to Active kar do.
          </p>
        </div>
      )}
    </div>
  );
}
