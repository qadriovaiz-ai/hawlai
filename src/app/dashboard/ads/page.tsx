"use client";

import { useState } from "react";
import { Megaphone, Sparkles, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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

  async function handleLaunch() {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
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
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <p className="text-sm font-semibold text-slate-700">Apni requirement likhein</p>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Jaise: Maruti Swift ke liye leads chahiye, budget ₹8 lakh tak, Lucknow area mein..."
          className="w-full h-32 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />

        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-medium">Examples:</p>
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              className="block w-full text-left text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>

        <button
          onClick={handleLaunch}
          disabled={loading || prompt.trim().length < 10}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AI Ad bana raha hai...
            </>
          ) : (
            <>
              <Megaphone className="w-4 h-4" />
              Ad Launch Karo
            </>
          )}
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
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{result.ad.headline}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase">Ad Copy</p>
              <p className="text-sm text-slate-700 mt-0.5">{result.ad.body}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">Daily Budget</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">₹{result.ad.daily_budget}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">Status</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full mt-0.5">
                  ⏸ Paused
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase">Campaign ID</p>
              <p className="text-xs font-mono text-slate-600 mt-0.5">{result.ad.campaign_id}</p>
            </div>
          </div>
          <p className="text-xs text-green-600">
            ✅ Ad paused mode mein create hua hai — Meta Ads Manager se review karke activate karo.
          </p>
        </div>
      )}
    </div>
  );
}
