"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowRight, Check } from "lucide-react";

export default function WelcomeChatCard({ dealershipName, ownerName }: { dealershipName: string; ownerName: string | null }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);

  async function handleDescribe() {
    setError(null);
    if (description.trim().length < 10) return setError("Tell me a bit more — a couple of sentences is enough");
    setLoading(true);
    try {
      const res = await fetch("/api/brand-profile/analyze-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");

      await Promise.all([
        fetch("/api/brand-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tone_of_voice: data.tone_of_voice,
            target_persona: data.target_persona,
            messaging_pillars: data.messaging_pillars,
            preferred_language: "hinglish",
          }),
        }),
        data.business_category
          ? fetch("/api/dealership", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ business_category: data.business_category }),
            })
          : Promise.resolve(),
        fetch("/api/dealership", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboarding_completed: true }),
        }),
      ]);

      setProfile(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    router.refresh(); // reveals the normal Dashboard (Opportunity Feed, KPIs) now that onboarding_completed is true
  }

  async function handleSkip() {
    await fetch("/api/dealership", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    router.refresh();
  }

  if (profile) {
    return (
      <div className="card p-6 space-y-4 bg-gradient-to-br from-purple-50 to-white border-purple-100 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Got it — here's what I set up</p>
            <p className="text-sm text-slate-500">{profile.summary}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {profile.business_category && (
            <span className="badge bg-white text-slate-600 border-slate-200">{profile.business_category}</span>
          )}
          {profile.messaging_pillars?.slice(0, 3).map((p: string, i: number) => (
            <span key={i} className="badge bg-purple-50 text-purple-700 border-purple-100">{p}</span>
          ))}
        </div>
        <p className="text-xs text-slate-400">You can fine-tune all of this anytime in Settings → Brand Voice.</p>
        <button onClick={handleContinue} className="btn-primary text-sm">
          Continue to Dashboard <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4 bg-gradient-to-br from-purple-50 to-white border-purple-100">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-brand-600/30">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">
            {ownerName ? `Welcome, ${ownerName}! ` : "Welcome! "}Tell me about {dealershipName}.
          </p>
          <p className="text-sm text-slate-500">A couple of sentences — what you sell, who your customers are. I'll set up your Brand Voice from it.</p>
        </div>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Hum ek jewelry business hain, affordable fashion jewelry banate hain, young customers ke liye..."
        disabled={loading}
        autoFocus
        className="w-full h-24 p-4 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-60"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={handleDescribe} disabled={loading} className="btn-primary text-sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {loading ? "Setting up..." : "Get Started"}
        </button>
        <button onClick={handleSkip} className="text-xs text-slate-400 hover:text-slate-600">
          Skip for now
        </button>
      </div>
    </div>
  );
}
