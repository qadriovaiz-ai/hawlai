"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Loader2, ArrowRight, Facebook, Rocket, Globe, Brain, Check, SkipForward } from "lucide-react";

type Stage = "welcome" | "extracting" | "profile-ready" | "next-steps";

export default function OnboardingChat({ dealershipName, ownerName }: { dealershipName: string; ownerName: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("welcome");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);

  async function handleDescribe() {
    setError(null);
    if (description.trim().length < 10) return setError("Tell me a bit more — a couple of sentences is enough");
    setStage("extracting");
    try {
      const res = await fetch("/api/brand-profile/analyze-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setProfile(data);

      // Save it right away — dealer can still refine in Brand Voice later.
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
      ]);

      setStage("profile-ready");
    } catch (err: any) {
      setError(err.message);
      setStage("welcome");
    }
  }

  async function handleFinish() {
    await fetch("/api/dealership", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <button
          onClick={handleFinish}
          className="fixed top-5 right-5 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1.5"
        >
          Skip onboarding <SkipForward className="w-3.5 h-3.5" />
        </button>

        {stage === "welcome" && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-600/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {ownerName ? `Welcome, ${ownerName}! ` : "Welcome! "}Tell me about {dealershipName}.
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">
                A couple of sentences is enough — what you sell, who your customers are, what makes you different. I'll set up everything else from here.
              </p>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Hum ek jewelry business hain, affordable fashion jewelry banate hain, young customers ke liye..."
              autoFocus
              className="w-full h-28 p-4 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={handleDescribe}
              className="w-full bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-brand-600/30"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {stage === "extracting" && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 animate-fade-in-up">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            <p className="text-sm text-slate-500">Setting up your brand profile...</p>
          </div>
        )}

        {stage === "profile-ready" && profile && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Got it — here's what I set up</h1>
              <p className="text-sm text-slate-500 mt-1.5">{profile.summary}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
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
                      <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">You can fine-tune all of this anytime in Settings → Brand Voice.</p>
            <button
              onClick={() => setStage("next-steps")}
              className="w-full bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-brand-600/30"
            >
              What's next? <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {stage === "next-steps" && (
          <div className="space-y-5 animate-fade-in-up">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">You're all set. Here's what to do next.</h1>
              <p className="text-sm text-slate-500 mt-1.5">Do these in order for the smoothest start.</p>
            </div>
            <div className="space-y-3">
              <NextStepCard
                icon={<Facebook className="w-5 h-5 text-blue-600" />}
                title="1. Connect Facebook"
                description="Link your Page and Ad Account so ads can launch from your own account."
                href="/dashboard/settings/connect-facebook"
              />
              <NextStepCard
                icon={<Rocket className="w-5 h-5 text-purple-600" />}
                title="2. Launch your first ad"
                description="Upload a photo, describe what you're promoting — the rest is automatic."
                href="/dashboard/marketing"
              />
              <NextStepCard
                icon={<Globe className="w-5 h-5 text-indigo-600" />}
                title="3. Set up your Website"
                description="A public page with a lead form — optional, but a good extra lead source."
                href="/dashboard/marketing"
              />
              <NextStepCard
                icon={<Brain className="w-5 h-5 text-brand-600" />}
                title="Ask Master Brain anytime"
                description="The chat button in the corner — describe what you want, it figures out the rest."
              />
            </div>
            <button
              onClick={handleFinish}
              className="w-full btn-secondary justify-center py-3"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NextStepCard({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href?: string }) {
  const content = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 hover:border-purple-300 hover:shadow-sm transition-all">
      <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
