"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ArrowUp, Check, ArrowRight } from "lucide-react";

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

  async function handleSkip() {
    await fetch("/api/dealership", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    router.refresh();
  }

  function handleContinue() {
    router.refresh();
  }

  if (profile) {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Check className="w-7 h-7 text-green-400" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center leading-tight">
          Got it — here's what I set up
        </h1>
        <p className="text-slate-500 text-center mt-2">{profile.summary}</p>

        <div className="bg-slate-100 rounded-2xl border border-slate-200 p-5 space-y-3 shadow-sm mt-6">
          {profile.business_category && (
            <div>
              <p className="text-xs text-slate-400">Business Type</p>
              <p className="text-sm font-medium text-slate-800">{profile.business_category}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Tone of Voice</p>
            <p className="text-sm font-medium text-slate-800">{profile.tone_of_voice}</p>
          </div>
          {profile.messaging_pillars?.length > 0 && (
            <div>
              <p className="text-xs text-slate-400">Key Points</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {profile.messaging_pillars.map((p: string, i: number) => (
                  <span key={i} className="text-xs bg-purple-500/10 text-purple-300 px-2 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 text-center mt-3">You can fine-tune all of this anytime in Settings → Brand Voice.</p>
        <button
          onClick={handleContinue}
          className="w-full mt-5 bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-brand-600/30"
        >
          Continue to Dashboard <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl text-center">
      <div className="w-14 h-14 rounded-2xl overflow-hidden mx-auto mb-6 shadow-lg shadow-brand-600/30">
        <Image src="/logo-icon.png" alt="Hawlai" width={56} height={56} className="w-full h-full object-cover" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
        {ownerName ? `Welcome, ${ownerName}. ` : "Welcome. "}Tell me about {dealershipName}.
      </h1>
      <p className="text-slate-500 mt-3 max-w-md mx-auto">
        A couple of sentences is enough — what you sell, who your customers are, what makes you different. I'll set up your Brand Voice from it.
      </p>

      <div className="mt-8 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Hum ek jewelry business hain, affordable fashion jewelry banate hain, young customers ke liye..."
          disabled={loading}
          autoFocus
          className="w-full h-28 p-5 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 resize-none focus:outline-none disabled:opacity-60 rounded-t-2xl"
        />
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <button onClick={handleSkip} className="text-xs text-slate-400 hover:text-slate-600">
            Skip for now
          </button>
          <button
            onClick={handleDescribe}
            disabled={loading || description.trim().length < 10}
            className="w-9 h-9 shrink-0 flex items-center justify-center bg-gradient-to-b from-brand-600 to-brand-700 text-white rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
    </div>
  );
}
