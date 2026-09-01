"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ArrowUp, Check, ArrowRight } from "lucide-react";
import IntentStep from "@/components/onboarding/IntentStep";
import { MODE_LABELS, type ProductMode } from "@/lib/onboarding/intentRouter";

interface BrandVoiceDraft {
  personality_traits: string[];
  vocabulary_preferences: { favor: string[]; avoid: string[] };
  sentence_rhythm: string;
  formality_level: "casual" | "conversational" | "professional" | "formal";
  hinglish_ok: boolean;
  punctuation_emoji_style: { emoji_usage: string; exclamation_marks: string };
}

interface AnalyzeResult {
  summary: string;
  business_category: string;
  tone_of_voice: string;
  target_persona: any;
  messaging_pillars: string[];
  brand_voice_draft: BrandVoiceDraft;
}

// Multi-step conversational onboarding: the free-text business
// description (unchanged) drafts a full brand profile including a
// best-effort structured Brand Voice, then 3 short follow-up questions
// let the owner's own words override the parts a description alone
// can't reliably infer (formality, language mixing, personality words,
// words to avoid) — all part of the SAME flow, one combined save at
// the end, not a disconnected second form.
// "intent" is the new first step (UX Transformation piece 4): ask what
// the customer WANTS before asking who they are. The brand-voice steps
// that follow are unchanged — they were always good, they just
// answered the second question first.
type Step = "intent" | "describe" | "formality" | "language" | "language_notes" | "personality" | "avoid_words" | "done";

const FORMALITY_CHOICES: { label: string; value: BrandVoiceDraft["formality_level"] }[] = [
  { label: "Formal", value: "formal" },
  { label: "Somewhere in between", value: "conversational" },
  { label: "Casual", value: "casual" },
];

export default function WelcomeChatCard({ dealershipName, ownerName }: { dealershipName: string; ownerName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intent");
  const [productMode, setProductMode] = useState<ProductMode | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [draft, setDraft] = useState<AnalyzeResult | null>(null);

  const [formality, setFormality] = useState<BrandVoiceDraft["formality_level"] | null>(null);
  const [hinglishOk, setHinglishOk] = useState<boolean | null>(null);
  const [regionalNotes, setRegionalNotes] = useState("");
  const [personalityInput, setPersonalityInput] = useState("");
  const [avoidWordsInput, setAvoidWordsInput] = useState("");

  // Saved as soon as it's known rather than batched into the final
  // submit: if someone abandons onboarding after this step, knowing
  // what they came for is still worth having.
  async function handleIntentResolved(mode: ProductMode, intentText: string) {
    setProductMode(mode);
    try {
      await fetch("/api/dealership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_mode: mode, onboarding_intent_text: intentText }),
      });
    } catch {
      // Best-effort — a failed save here shouldn't trap someone on the
      // first screen of their first session. They continue in the mode
      // they picked; only the persisted record is lost.
    }
    setStep("describe");
  }

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
      setDraft(data);
      setStep("formality");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function chooseFormality(value: BrandVoiceDraft["formality_level"]) {
    setFormality(value);
    setStep("language");
  }

  function chooseHinglish(value: boolean) {
    setHinglishOk(value);
    setStep(value ? "language_notes" : "personality");
  }

  async function finalizeAndSave() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const personality_traits = personalityInput.trim()
        ? personalityInput.split(",").map((s) => s.trim()).filter(Boolean)
        : draft.brand_voice_draft.personality_traits;
      const avoid = avoidWordsInput.trim()
        ? avoidWordsInput.split(",").map((s) => s.trim()).filter(Boolean)
        : draft.brand_voice_draft.vocabulary_preferences.avoid;

      const brand_voice = {
        personality_traits,
        vocabulary_preferences: { favor: draft.brand_voice_draft.vocabulary_preferences.favor, avoid },
        sentence_rhythm: draft.brand_voice_draft.sentence_rhythm,
        formality_level: formality ?? draft.brand_voice_draft.formality_level,
        hinglish_ok: hinglishOk ?? draft.brand_voice_draft.hinglish_ok,
        regional_language_notes: regionalNotes.trim() || null,
        punctuation_emoji_style: { ...draft.brand_voice_draft.punctuation_emoji_style, notes: null },
        source: "conversational_extraction" as const,
      };

      await Promise.all([
        fetch("/api/brand-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tone_of_voice: draft.tone_of_voice,
            target_persona: draft.target_persona,
            messaging_pillars: draft.messaging_pillars,
            preferred_language: "hinglish",
            brand_voice,
            // The owner's own words, kept as the source the voice came
            // from (migration 159). Saved here rather than at the
            // describe step so nothing persists until they confirm —
            // the derived profile is a proposal until this point.
            business_description: description.trim(),
          }),
        }),
        draft.business_category
          ? fetch("/api/dealership", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ business_category: draft.business_category }),
            })
          : Promise.resolve(),
        fetch("/api/dealership", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboarding_completed: true }),
        }),
      ]);

      setProfile({ ...draft, brand_voice });
      setStep("done");
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

  const SkipForNow = () => (
    <button onClick={handleSkip} className="text-xs text-slate-400 hover:text-slate-600">
      Skip for now
    </button>
  );

  if (step === "intent") {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <IntentStep ownerName={ownerName} onResolved={handleIntentResolved} />
      </div>
    );
  }

  if (step === "done" && profile) {
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
          {profile.brand_voice?.personality_traits?.length > 0 && (
            <div>
              <p className="text-xs text-slate-400">Personality</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {profile.brand_voice.personality_traits.map((p: string, i: number) => (
                  <span key={i} className="text-xs bg-brand-500/10 text-brand-600 px-2 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Formality &amp; Language</p>
            <p className="text-sm font-medium text-slate-800 capitalize">
              {profile.brand_voice?.formality_level} · {profile.brand_voice?.hinglish_ok ? "Hindi/English mixing okay" : "One language at a time"}
            </p>
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

  if (step === "formality") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">How do you usually talk to customers?</h1>
        <p className="text-slate-500 mt-2">Formal, casual, or somewhere in between?</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          {FORMALITY_CHOICES.map((c) => (
            <button
              key={c.value}
              onClick={() => chooseFormality(c.value)}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-slate-100 hover:border-brand-500 hover:bg-brand-500/5 text-sm font-medium text-slate-800 transition-colors"
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="mt-6"><SkipForNow /></div>
      </div>
    );
  }

  if (step === "language") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">Do you mix Hindi and English with customers?</h1>
        <p className="text-slate-500 mt-2">Or do you keep it strictly one language?</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => chooseHinglish(true)}
            className="px-5 py-3 rounded-xl border border-slate-200 bg-slate-100 hover:border-brand-500 hover:bg-brand-500/5 text-sm font-medium text-slate-800 transition-colors"
          >
            Yes, we mix languages
          </button>
          <button
            onClick={() => chooseHinglish(false)}
            className="px-5 py-3 rounded-xl border border-slate-200 bg-slate-100 hover:border-brand-500 hover:bg-brand-500/5 text-sm font-medium text-slate-800 transition-colors"
          >
            No, one language
          </button>
        </div>
        <div className="mt-6"><SkipForNow /></div>
      </div>
    );
  }

  if (step === "language_notes") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">Anything else about language?</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">Optional — e.g. a regional language your customers respond well to.</p>
        <div className="mt-6 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left max-w-md mx-auto">
          <textarea
            value={regionalNotes}
            onChange={(e) => setRegionalNotes(e.target.value)}
            placeholder="e.g. Customers respond well to a Marathi greeting"
            autoFocus
            className="w-full h-20 p-4 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 resize-none focus:outline-none rounded-2xl"
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={() => setStep("personality")} className="text-xs text-slate-400 hover:text-slate-600">Skip</button>
          <button
            onClick={() => setStep("personality")}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white text-sm font-semibold transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "personality") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">3-4 words for your brand's personality?</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">e.g. confident, warm, direct — separate with commas</p>
        <div className="mt-6 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left max-w-md mx-auto">
          <input
            value={personalityInput}
            onChange={(e) => setPersonalityInput(e.target.value)}
            placeholder={draft?.brand_voice_draft.personality_traits.join(", ") || "confident, warm, direct"}
            autoFocus
            className="w-full p-4 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 focus:outline-none rounded-2xl"
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={() => setStep("avoid_words")} className="text-xs text-slate-400 hover:text-slate-600">Skip — use what I inferred</button>
          <button
            onClick={() => setStep("avoid_words")}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white text-sm font-semibold transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "avoid_words") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">Any words you'd never want us to use?</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">Optional — separate with commas. Last question, then you're set.</p>
        <div className="mt-6 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left max-w-md mx-auto">
          <input
            value={avoidWordsInput}
            onChange={(e) => setAvoidWordsInput(e.target.value)}
            placeholder="e.g. cheap, discount, hurry"
            autoFocus
            disabled={loading}
            className="w-full p-4 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 focus:outline-none rounded-2xl disabled:opacity-60"
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={finalizeAndSave} disabled={loading} className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40">Skip</button>
          <button
            onClick={finalizeAndSave}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Finish"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl text-center">
      <div className="w-14 h-14 rounded-2xl overflow-hidden mx-auto mb-6 shadow-lg shadow-brand-600/30">
        <Image src="/logo-icon.png" alt="Hawlai" width={56} height={56} className="w-full h-full object-cover" />
      </div>
      {/* Acknowledges what they just asked for, so this reads as the
          next step in one conversation rather than a second, unrelated
          form. The greeting moves to the intent step when one ran. */}
      {productMode && (
        <p className="text-xs font-medium text-brand-500 mb-2">
          Setting up {MODE_LABELS[productMode]}
        </p>
      )}
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
        {productMode ? "" : ownerName ? `Welcome, ${ownerName}. ` : "Welcome. "}
        Tell me about {dealershipName}.
      </h1>
      <p className="text-slate-500 mt-3 max-w-md mx-auto">
        {productMode
          ? "First, a couple of sentences about your business — what you sell, who your customers are, what makes you different. Everything Hawlai does for you uses this."
          : "A couple of sentences is enough — what you sell, who your customers are, what makes you different. I'll set up your Brand Voice from it, then ask a couple of quick follow-ups."}
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
          <SkipForNow />
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
