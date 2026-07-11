"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle, Plus, X, Wand2, ChevronDown, ChevronUp, MessageSquare, Globe } from "lucide-react";

interface BrandProfileFormProps {
  initial: {
    tone_of_voice: string | null;
    target_persona: { age_range?: string; income?: string; concerns?: string[] } | null;
    messaging_pillars: string[] | null;
    preferred_language: string | null;
  } | null;
}

export default function BrandProfileForm({ initial }: BrandProfileFormProps) {
  const router = useRouter();
  const [tone, setTone] = useState(initial?.tone_of_voice ?? "");
  const [ageRange, setAgeRange] = useState(initial?.target_persona?.age_range ?? "");
  const [income, setIncome] = useState(initial?.target_persona?.income ?? "");
  const [concerns, setConcerns] = useState((initial?.target_persona?.concerns ?? []).join(", "));
  const [pillars, setPillars] = useState<string[]>(initial?.messaging_pillars?.length ? initial.messaging_pillars : [""]);
  const [language, setLanguage] = useState(initial?.preferred_language ?? "hinglish");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAnalyzer, setShowAnalyzer] = useState(!initial?.tone_of_voice);
  const [analyzeMode, setAnalyzeMode] = useState<"describe" | "website">("describe");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);

  async function applyExtractedProfile(data: any) {
    setTone(data.tone_of_voice ?? tone);
    setAgeRange(data.target_persona?.age_range ?? ageRange);
    setIncome(data.target_persona?.income ?? income);
    setConcerns((data.target_persona?.concerns ?? []).join(", "));
    if (data.messaging_pillars?.length) setPillars(data.messaging_pillars);
    setAnalysisSummary(data.summary);

    // Also save the detected business type directly (separate table),
    // so "Business Type" above updates without a second manual step.
    if (data.business_category) {
      try {
        await fetch("/api/dealership", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business_category: data.business_category }),
        });
        router.refresh();
      } catch {
        // Non-fatal — the dealer can still set Business Type manually above.
      }
    }
  }

  async function handleAnalyze() {
    setAnalyzeError(null);
    setAnalysisSummary(null);

    if (analyzeMode === "describe") {
      if (description.trim().length < 10) return setAnalyzeError("Tell me a bit more — a couple of sentences is enough");
    } else {
      if (!websiteUrl.trim()) return setAnalyzeError("Enter your website URL first");
    }

    setAnalyzing(true);
    try {
      const endpoint = analyzeMode === "describe" ? "/api/brand-profile/analyze-description" : "/api/brand-profile/analyze-website";
      const body = analyzeMode === "describe" ? { description } : { url: websiteUrl.trim() };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      await applyExtractedProfile(data);
    } catch (err: any) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function updatePillar(i: number, value: string) {
    setPillars((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }
  function addPillar() {
    setPillars((prev) => [...prev, ""]);
  }
  function removePillar(i: number) {
    setPillars((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/brand-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone_of_voice: tone,
          target_persona: {
            age_range: ageRange,
            income,
            concerns: concerns.split(",").map((c) => c.trim()).filter(Boolean),
          },
          messaging_pillars: pillars.map((p) => p.trim()).filter(Boolean),
          preferred_language: language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSaved(true);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3 bg-purple-50/50 border-purple-100">
        <button onClick={() => setShowAnalyzer(!showAnalyzer)} className="w-full flex items-center justify-between text-left">
          <span className="text-sm font-semibold text-purple-900 flex items-center gap-2">
            <Wand2 className="w-4 h-4" /> Let AI fill this in for you
          </span>
          {showAnalyzer ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
        </button>
        {showAnalyzer && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 bg-white rounded-lg p-1 border border-purple-100 w-fit">
              <button
                onClick={() => setAnalyzeMode("describe")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  analyzeMode === "describe" ? "bg-purple-600 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Describe it
              </button>
              <button
                onClick={() => setAnalyzeMode("website")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  analyzeMode === "website" ? "bg-purple-600 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> From my website
              </button>
            </div>

            {analyzeMode === "describe" ? (
              <>
                <p className="text-xs text-purple-600">Tell me about your business in your own words — what you sell, who your customers are, what makes you different. AI will turn this into your brand profile below.</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Hum ek car dealership hain Lucknow mein, 20 saal se. Family-friendly hain, honest dealings pe focus karte hain, EMI options bhi dete hain..."
                  className="w-full h-24 p-2.5 text-sm border border-purple-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                />
              </>
            ) : (
              <>
                <p className="text-xs text-purple-600">Paste your website URL — AI will read it and draft your profile below.</p>
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourbusiness.com"
                  className="w-full p-2.5 text-sm border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                />
              </>
            )}

            <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary text-sm">
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Analyze
            </button>
            {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}
            {analysisSummary && (
              <p className="text-xs text-purple-700 bg-white rounded-lg p-2.5 border border-purple-100">{analysisSummary}</p>
            )}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Tone of Voice</label>
        <p className="text-xs text-slate-400">How should your ads sound? This is fed directly into every ad Claude writes for you.</p>
        <textarea
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g. Trustworthy, family-friendly, no hard-sell. Confident but warm."
          className="w-full h-20 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Target Customer</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Age range</label>
            <input
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              placeholder="e.g. 30-45"
              className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Income level</label>
            <input
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="e.g. Middle class"
              className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Main concerns (comma-separated)</label>
          <input
            value={concerns}
            onChange={(e) => setConcerns(e.target.value)}
            placeholder="e.g. EMI affordability, resale value, service cost"
            className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Messaging Pillars</label>
        <p className="text-xs text-slate-400">Key points you always want represented, if relevant to the ad.</p>
        {pillars.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={p}
              onChange={(e) => updatePillar(i, e.target.value)}
              placeholder="e.g. 0% down payment available"
              className="flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={() => removePillar(i)} className="btn-secondary px-2 py-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button onClick={addPillar} className="btn-secondary text-xs">
          <Plus className="w-3.5 h-3.5" /> Add another
        </button>
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Preferred Ad Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="hinglish">Hinglish</option>
          <option value="hindi">Hindi</option>
          <option value="english">English</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {saving ? "Saving..." : saved ? "Saved!" : "Save Brand Profile"}
      </button>
    </div>
  );
}
